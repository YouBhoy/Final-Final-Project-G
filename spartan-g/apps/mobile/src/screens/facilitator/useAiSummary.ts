import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geminiService, isSummaryAiAvailable, isSummaryRiskAvailable, useAuthStore } from '@spartan-g/shared-services';
import type { AssessmentAttemptDocument } from '@spartan-g/shared-types';
import type { AssessmentScores } from '../../../../../packages/shared-services/src/services/firebase-ai-contracts';

/** AI-card loading only; original assessment calculations and screen layout stay in their callers. */
export function useAiSummary(attempt: AssessmentAttemptDocument & { id: string }, scores: AssessmentScores) {
  const session = useAuthStore(s => s.session), uid = session?.uid;
  const sessionIdentity = useRef({ value: session, epoch: 0 });
  if (sessionIdentity.current.value !== session) {
    sessionIdentity.current = { value: session, epoch: sessionIdentity.current.epoch + 1 };
  }
  const riskAvailable = isSummaryRiskAvailable(attempt), enabled = isSummaryAiAvailable();
  const boundScores = useMemo(() => ({ ...scores }), [scores.phqScore, scores.phqSeverity, scores.gadScore, scores.gadSeverity,
    scores.dassDepressionScore, scores.dassDepressionSeverity, scores.dassAnxietyScore, scores.dassAnxietySeverity,
    scores.dassStressScore, scores.dassStressSeverity, scores.overallRiskLevel, scores.overallRiskScore]);
  const context = JSON.stringify([uid, session?.role, sessionIdentity.current.epoch, attempt.id, riskAvailable, boundScores]);
  const epoch = useRef(0), visibleContext = useRef(context);
  visibleContext.current = context;
  const [state, setState] = useState<{ context: string; summary: string | null; isLoading: boolean; hasError: boolean;
    errorMessage: string | null; riskUnavailable: boolean }>({ context, summary: null, isLoading: true, hasError: false, errorMessage: null, riskUnavailable: !riskAvailable });
  const loadSummary = useCallback(async (skipCache = false) => {
    const version = ++epoch.current, current = () => epoch.current === version && visibleContext.current === context;
    const base = { context, summary: null, isLoading: false, hasError: false, errorMessage: null, riskUnavailable: !riskAvailable };
    if (!riskAvailable || !enabled || !uid) { setState(base); return; }
    setState({ ...base, isLoading: true });
    try {
      const availability = await geminiService.getSummaryAvailability?.(attempt.id);
      if (!current()) return;
      if (availability === 'risk_unavailable') { setState({ ...base, riskUnavailable: true }); return; }
      if (availability === 'unavailable') throw Error('unavailable');
      let text = skipCache ? null : await geminiService.getCachedSummary(attempt.id);
      if (!current()) return;
      if (!text) {
        text = await geminiService.generateSummary(boundScores, attempt.id);
        if (!current()) return;
        if (text) void geminiService.cacheSummary(attempt.id, text).catch(() => {});
      }
      if (!current()) return;
      if (text) { setState({ ...base, summary: text }); return; }
      const after = await geminiService.getSummaryAvailability?.(attempt.id);
      if (current()) setState({ ...base, riskUnavailable: after === 'risk_unavailable', hasError: after !== 'risk_unavailable',
        errorMessage: after === 'risk_unavailable' ? null : 'Failed to generate summary. The AI service did not return a response.' });
    } catch {
      if (current()) setState({ ...base, hasError: true, errorMessage: 'AI summary is unavailable right now.' });
    }
  }, [attempt.id, boundScores, context, enabled, riskAvailable, uid]);
  useEffect(() => { void loadSummary(false); return () => { epoch.current++; }; }, [loadSummary]);
  // Never render the previous account/attempt's text during the render before effect cleanup.
  const result = state.context === context ? state : { context, summary: null, isLoading: enabled && riskAvailable && !!uid,
    hasError: false, errorMessage: null, riskUnavailable: !riskAvailable };
  return { ...result, loadSummary };
}
