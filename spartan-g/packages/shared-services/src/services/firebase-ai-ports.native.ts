import { onAuthStateChanged, type Auth } from 'firebase/auth';
import { getToken, type AppCheck } from 'firebase/app-check';
import { getDocFromServer } from 'firebase/firestore';
import { COLLECTIONS, calculatePHQ9Score, calculateGAD7Score, calculateDASS21Score } from '@spartan-g/shared-types';
import { getFirestoreDb, doc } from '../firebase/firestore';
import { appointmentRepository } from '../repositories/appointment.repository';
import { gardenRepository } from '../repositories/garden.repository';
import { assistantUsageRepository } from '../repositories/assistant-usage.repository';
import { assessmentService } from './assessment.service';
import { messagingService } from './messaging.service';
import type { AiLogicReleaseConfig } from '../config/firebase-ai-release';
import { AiLogicError, type Actor, type Ports } from './firebase-ai-logic.client';
import { isSummaryRiskAvailable } from './firebase-ai-summary-policy';

/** Deferred application bindings; invoked only after the two independent disabled release gates. */
export function createNativeAiPorts(auth: Auth, appCheck: AppCheck, config: Readonly<AiLogicReleaseConfig>, assertRequestAllowed: () => void): Ports {
  let sessionUser = auth.currentUser, sessionEpoch = 0, stopAuth: (() => void) | undefined;
  const sessionListeners = new Set<() => void>();
  function synchronize(user: Auth['currentUser']) {
    if (user !== sessionUser) { sessionUser = user; sessionEpoch++; sessionListeners.forEach(listener => listener()); }
  }
  const fail = (): never => { throw new AiLogicError('unauthorized'); };
  function ownUid(uid: string) {
    assertRequestAllowed();
    if (auth.currentUser?.uid !== uid || !config.syntheticAccountUids.includes(uid)) fail();
  }
  function validUsage(count: number): number {
    if (!Number.isSafeInteger(count) || count < 0) throw new AiLogicError('usage_unavailable');
    return count;
  }
  return {
    assertRequestAllowed,
    summarySession: {
      current() { synchronize(auth.currentUser); return auth.currentUser ? { userId: auth.currentUser.uid, id: String(sessionEpoch) } : null; },
      subscribe(listener) {
        sessionListeners.add(listener);
        stopAuth ??= onAuthStateChanged(auth, synchronize);
        return () => { sessionListeners.delete(listener); if (!sessionListeners.size) { stopAuth?.(); stopAuth = undefined; } };
      },
    },
    async attested() {
      assertRequestAllowed();
      try { return !!(await getToken(appCheck)).token; } catch { return false; }
    },
    async actor() {
      assertRequestAllowed();
      const user = auth.currentUser;
      if (!user || !config.syntheticAccountUids.includes(user.uid)) return null;
      // Server reads avoid authorizing inference from a stale cached role/link.
      const profile = await getDocFromServer(doc(getFirestoreDb(), COLLECTIONS.USERS, user.uid));
      ownUid(user.uid);
      const data = profile.data();
      if (!data || data.isActive !== true
          || !['student', 'facilitator', 'super_admin'].includes(data.role)) return null;
      return { uid: user.uid, role: data.role as Actor['role'], active: true };
    },
    async authorizedAttempt(actor, attemptId) {
      ownUid(actor.uid);
      // Explicit fixture IDs prevent a synthetic facilitator from reading arbitrary student attempts.
      if (!config.syntheticAttemptIds.includes(attemptId) || !['facilitator', 'super_admin'].includes(actor.role)) return null;
      const snapshot = await getDocFromServer(doc(getFirestoreDb(), COLLECTIONS.ASSESSMENT_ATTEMPTS, attemptId));
      ownUid(actor.uid);
      const data = snapshot.data();
      if (!data || !config.syntheticAccountUids.includes(data.studentId)
          || !['submitted', 'graded'].includes(data.status) || !Array.isArray(data.answers) || !data.answers.length) return null;
      if (actor.role === 'facilitator') {
        const link = await getDocFromServer(doc(getFirestoreDb(), COLLECTIONS.FACILITATOR_STUDENT_LINKS, `${actor.uid}_${data.studentId}`));
        const binding = link.data();
        ownUid(actor.uid);
        if (!binding || binding.facilitatorId !== actor.uid || binding.studentId !== data.studentId || binding.status !== 'accepted') return null;
      }
      const answers: Record<string, string> = {};
      for (const answer of data.answers) {
        if (!answer || typeof answer.questionId !== 'string' || typeof answer.value !== 'string') return null;
        answers[answer.questionId] = answer.value;
      }
      // Exactly the existing UI scoring functions; no score or risk calculation is changed.
      const phq = calculatePHQ9Score(answers), gad = calculateGAD7Score(answers), dass = calculateDASS21Score(answers);
      return { studentId: data.studentId, riskMetadataAvailable: isSummaryRiskAvailable(data), scores: {
        phqScore: phq.score, phqSeverity: phq.severity, gadScore: gad.score, gadSeverity: gad.severity,
        dassDepressionScore: dass.depression.score, dassDepressionSeverity: dass.depression.severity,
        dassAnxietyScore: dass.anxiety.score, dassAnxietySeverity: dass.anxiety.severity,
        dassStressScore: dass.stress.score, dassStressSeverity: dass.stress.severity,
        overallRiskLevel: data.overallRiskLevel ?? 'unknown', overallRiskScore: data.overallRiskScore ?? 0,
      } };
    },
    cache: {
      async read(_attemptId) {
        assertRequestAllowed();
        return null;
      },
      async write(_attemptId, _summary) {
        assertRequestAllowed();
        // Retain the legacy port shape for future authorized integrations. Native
        // summaries use session memory only; never attempt denied Firestore writes.
      },
    },
    async remaining(uid, date, limit) {
      ownUid(uid);
      const usage = await assistantUsageRepository.getUsage(uid);
      ownUid(uid);
      return !usage || usage.date !== date ? limit : Math.max(0, limit - validUsage(usage.count));
    },
    async reserveTurn(uid, date, limit) {
      ownUid(uid);
      const usage = await assistantUsageRepository.getUsage(uid);
      ownUid(uid);
      if (!usage) { await assistantUsageRepository.createUsage(uid, date, 1); return { allowed: true, remaining: limit - 1 }; }
      if (usage.date !== date) {
        await assistantUsageRepository.resetUsage(uid, date);
        ownUid(uid);
        await assistantUsageRepository.incrementUsage(uid, 1);
        return { allowed: true, remaining: limit - 1 };
      }
      const count = validUsage(usage.count);
      if (count >= limit) return { allowed: false, remaining: 0 };
      await assistantUsageRepository.incrementUsage(uid, 1);
      return { allowed: true, remaining: Math.max(0, limit - count - 1) };
      // This preserves the advisory counter. It is NOT an atomic/server-enforced daily cap.
    },
    appointments(uid) { ownUid(uid); return appointmentRepository.getByStudent(uid); },
    pendingAssessments(uid) { ownUid(uid); return assessmentService.getInProgressAttemptsByStudent(uid); },
    conversations(uid) { ownUid(uid); return messagingService.getConversations(uid, 'student'); },
    garden(uid) { ownUid(uid); return gardenRepository.getGarden(uid); }, // Pure read; never initializes.
  };
}
