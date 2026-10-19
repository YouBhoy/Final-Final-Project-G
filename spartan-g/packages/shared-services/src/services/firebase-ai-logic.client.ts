// Key-free protocol promoted from the tested prototype; native/release gates stay disabled.
import type { FirebaseApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema, SchemaType, HarmCategory, HarmBlockThreshold,
  type Content, type GenerateContentResponse } from 'firebase/ai';
import { buildPrompt, ASSISTANT_SYSTEM_PROMPT, ASSISTANT_TOOLS, SUMMARY_MODEL, ASSISTANT_MODEL,
  type AssessmentScores, type AssistantChatMessage } from './firebase-ai-contracts';
import { isSummaryRiskAvailable, SUMMARY_RISK_POLICY_VERSION } from './firebase-ai-summary-policy';
import { createSummaryMemoryCache, type SummaryCacheTicket } from './firebase-ai-summary-memory';

export interface Actor { uid: string; role: 'student' | 'facilitator' | 'super_admin'; active: boolean }
export interface Attempt { studentId: string; scores: AssessmentScores; riskMetadataAvailable: boolean }
export interface Config { projectId: string; androidAppId: string; aiLogicConfigured: true; appCheckConfigured: true }
export type DateLike = { toDate(): Date } | Date | string | number;
export interface Ports {
  // Ports do not replace server Auth/App Check enforcement or trustworthy daily quotas.
  assertRequestAllowed(): void;
  actor(): Promise<Actor | null>;
  attested(): Promise<boolean>;
  authorizedAttempt(actor: Actor, attemptId: string): Promise<Attempt | null>;
  summarySession: {
    current(): { userId: string; id: string } | null;
    subscribe(onChange: () => void): () => void;
  };
  // Mirror assessment_ai_summaries/{attemptId}: attemptId, summary, generatedAt server timestamp.
  // The synthetic test store implements this shape; no production store is wired here.
  cache: { read(attemptId: string): Promise<string | null>; write(attemptId: string, summary: string): Promise<void> };
  reserveTurn(uid: string, localDay: string, limit: number): Promise<{ allowed: boolean; remaining: number }>;
  remaining(uid: string, localDay: string, limit: number): Promise<number>;
  appointments(uid: string): Promise<Array<{ scheduledAt: DateLike; status: string; notes?: string | null }>>;
  pendingAssessments(uid: string): Promise<Array<{ assessmentId: string }>>;
  conversations(uid: string): Promise<Array<{ unreadCount?: Record<string, number> }>>;
  garden(uid: string): Promise<{ level: number; xp: number; seeds: number; streakCount: number; lastCheckInDate: string | null } | null>;
}
export class AiLogicError extends Error {
  constructor(public readonly reason: string) { super('AI operation unavailable: ' + reason); }
}
export interface InferenceRequestControl { beforeRequest(kind: 'chat' | 'summary'): Promise<void> }
export function createAiLogicClient(app: FirebaseApp, config: Config | undefined, ports: Ports, requestControl?: InferenceRequestControl) {
  ports.assertRequestAllowed();
  if (!config || config.aiLogicConfigured !== true || config.appCheckConfigured !== true
      || app.options.projectId !== config.projectId || app.options.appId !== config.androidAppId
      || app.name !== '[DEFAULT]') throw new AiLogicError('configuration_missing');
  // The live project is currently authorized only for a strictly bounded synthetic test.
  if (app.options.projectId === 'spartan-g-a2d80' && !requestControl) throw new AiLogicError('request_control_missing');
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const summaryModel = getGenerativeModel(ai, { model: SUMMARY_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    safetySettings: [HarmCategory.HARM_CATEGORY_HARASSMENT, HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT]
      .map(category => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE })),
  }, { timeout: 30000 });
  // 1.4.1's ObjectSchema declaration widens its discriminant to SchemaType.
  // Preserve the SDK class/serialization and explicitly narrow its known object type.
  const emptyToolParameters = Object.assign(Schema.object({ properties: {} }), { type: SchemaType.OBJECT as const });
  const chatModel = getGenerativeModel(ai, { model: ASSISTANT_MODEL,
    systemInstruction: ASSISTANT_SYSTEM_PROMPT,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    tools: [{ functionDeclarations: ASSISTANT_TOOLS.map(tool => ({ name: tool.name,
      description: tool.description, parameters: emptyToolParameters })) }],
  }, { timeout: 30000 });
  const summaryMemory = createSummaryMemoryCache();
  const stopSessionObserver = ports.summarySession?.subscribe(() => summaryMemory.clear());
  async function guard(): Promise<Actor> {
    ports.assertRequestAllowed();
    if (!await ports.attested()) throw new AiLogicError('app_check_missing');
    const actor = await ports.actor();
    if (!actor || !actor.active || !actor.uid) throw new AiLogicError('unauthorized');
    return actor;
  }
  async function sameActor(actor: Actor) {
    const current = await guard();
    if (current.uid !== actor.uid || current.role !== actor.role) throw new AiLogicError('session_changed');
  }
  async function attemptForStaff(attemptId: string): Promise<{actor: Actor; attempt: Attempt}> {
    const actor = await guard();
    if (!['facilitator', 'super_admin'].includes(actor.role) || !attemptId || attemptId.includes('/')) throw new AiLogicError('unauthorized');
    const attempt = await ports.authorizedAttempt(actor, attemptId);
    if (!attempt || !attempt.studentId) throw new AiLogicError('unauthorized');
    await sameActor(actor);
    return { actor, attempt };
  }
  function requireRisk(attempt: Attempt) {
    if (attempt.riskMetadataAvailable !== true || !isSummaryRiskAvailable(attempt.scores)) {
      summaryMemory.clear();
      throw new AiLogicError('risk_metadata_unavailable');
    }
  }
  function summaryScope(actor: Actor): SummaryCacheTicket {
    const session = ports.summarySession?.current();
    if (!session || session.userId !== actor.uid || !session.id) {
      summaryMemory.clear(); throw new AiLogicError('session_unavailable');
    }
    return summaryMemory.enter(JSON.stringify([app.options.appId, actor.uid, actor.role, session.id]));
  }
  function summaryKey(attemptId: string, attempt: Attempt) {
    const keys = Object.keys(attempt.scores).sort() as Array<keyof AssessmentScores>;
    return JSON.stringify([SUMMARY_MODEL, SUMMARY_RISK_POLICY_VERSION, attemptId, attempt.studentId,
      keys.map(key => [key, attempt.scores[key]])]);
  }
  async function sameSummary(attemptId: string, actor: Actor, ticket: SummaryCacheTicket, key: string) {
    await sameActor(actor);
    const updated = await ports.authorizedAttempt(actor, attemptId);
    if (!updated) { summaryMemory.clear(); throw new AiLogicError('unauthorized'); }
    requireRisk(updated);
    const current = summaryScope(actor);
    if (!summaryMemory.current(ticket) || current.epoch !== ticket.epoch || summaryKey(attemptId, updated) !== key) {
      throw new AiLogicError('summary_context_changed');
    }
    await sameActor(actor);
    if (!summaryMemory.current(ticket)) throw new AiLogicError('session_changed');
  }
  const safeError = () => new AiLogicError('service_or_quota_unavailable');
  function candidate(response: GenerateContentResponse) {
    const first = response.candidates?.[0];
    if (!first?.content?.parts?.length || first.finishReason === 'SAFETY' || first.finishReason === 'BLOCKLIST') throw safeError();
    return first;
  }
  async function toolResult(name: string, actor: Actor): Promise<string> {
    await sameActor(actor);
    let result: unknown;
    try {
    switch (name) {
      case 'getAppointmentsThisWeek': {
        const now = Date.now(), end = now + 7 * 24 * 60 * 60 * 1000;
        const time = (value: DateLike) => typeof value === 'object' && 'toDate' in value
          ? value.toDate().getTime() : value instanceof Date ? value.getTime() : new Date(value).getTime();
        const upcoming = (await ports.appointments(actor.uid)).filter(a => {
          const ms = time(a.scheduledAt); return ms >= now && ms <= end;
        });
        result = { count: upcoming.length, appointments: upcoming.map(a => ({ scheduledAt: new Date(time(a.scheduledAt)).toISOString(), status: a.status, notes: a.notes ?? null })) };
        break;
      }
      case 'getPendingAssessments': {
        const attempts = await ports.pendingAssessments(actor.uid);
        result = { count: attempts.length, assessmentIds: attempts.map(a => a.assessmentId) }; break;
      }
      case 'getUnreadMessages': {
        const conversations = await ports.conversations(actor.uid);
        result = { totalUnread: conversations.reduce((sum, c) => sum + (c.unreadCount?.[actor.uid] ?? 0), 0) }; break;
      }
      case 'getGardenStatus': {
        const garden = await ports.garden(actor.uid);
        result = garden ? { exists: true, level:garden.level, xp:garden.xp, seeds:garden.seeds,
          streakCount:garden.streakCount, lastCheckInDate:garden.lastCheckInDate } : { exists: false }; break;
      }
      default: result = { error: 'Unknown tool: ' + name };
    }
    } catch { result = { error: 'Data unavailable.' }; }
    await sameActor(actor);
    return JSON.stringify(result);
  }
  function dayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  return {
    dispose() { stopSessionObserver?.(); summaryMemory.clear(); },
    async getSummaryAvailability(attemptId: string): Promise<'available'> {
      const { actor, attempt } = await attemptForStaff(attemptId);
      requireRisk(attempt); summaryScope(actor); return 'available';
    },
    async getRemaining(studentId: string): Promise<number> {
      const actor = await guard();
      if (actor.role !== 'student' || actor.uid !== studentId) throw new AiLogicError('unauthorized');
      const remaining = await ports.remaining(actor.uid, dayKey(), 40);
      await sameActor(actor); return remaining;
    },
    async generateSummary(attemptId: string, expectedScores?: AssessmentScores): Promise<string> {
      const {actor, attempt} = await attemptForStaff(attemptId);
      requireRisk(attempt);
      if (expectedScores && (Object.keys(attempt.scores) as Array<keyof AssessmentScores>).some(key => expectedScores[key] !== attempt.scores[key])) throw new AiLogicError('score_mismatch');
      const ticket = summaryScope(actor), key = summaryKey(attemptId, attempt);
      const existing = summaryMemory.flight(ticket, key);
      if (existing) { const text = await existing; await sameSummary(attemptId, actor, ticket, key); return text; }
      const work = (async () => { try {
        await requestControl?.beforeRequest('summary');
        await sameSummary(attemptId, actor, ticket, key);
        const {response} = await summaryModel.generateContent(buildPrompt(attempt.scores));
        await sameSummary(attemptId, actor, ticket, key);
        const first = candidate(response), part = first.content.parts[0];
        let text = ('text' in part ? part.text : undefined)?.trim();
        if (!text) throw safeError();
        if (first.finishReason === 'MAX_TOKENS' && text.lastIndexOf('.') > 0) text = text.slice(0, text.lastIndexOf('.') + 1);
        summaryMemory.write(ticket, key, text);
        return text;
      } catch (error) {
        if (error instanceof AiLogicError && error.reason === 'risk_metadata_unavailable') throw error;
        throw safeError();
      } })();
      summaryMemory.track(ticket, key, work);
      try { return await work; } finally { summaryMemory.untrack(ticket, key, work); }
    },
    async getCachedSummary(attemptId: string): Promise<string | null> {
      const {actor, attempt} = await attemptForStaff(attemptId);
      requireRisk(attempt);
      const ticket = summaryScope(actor), key = summaryKey(attemptId, attempt);
      const value = summaryMemory.read(ticket, key);
      if (value !== null) await sameSummary(attemptId, actor, ticket, key);
      return value;
    },
    async cacheSummary(attemptId: string, summary: string): Promise<void> {
      const {actor, attempt} = await attemptForStaff(attemptId);
      requireRisk(attempt);
      const ticket = summaryScope(actor), key = summaryKey(attemptId, attempt);
      // Compatibility API: only validated generation populates memory. Never persist
      // arbitrary caller text or rebind a stale result to changed canonical inputs.
      if (summaryMemory.read(ticket, key) === summary) await sameSummary(attemptId, actor, ticket, key);
    },
    async chatWithAssistant(message: string, studentId: string, history: AssistantChatMessage[] = []) {
      const actor = await guard();
      if (actor.role !== 'student' || studentId !== actor.uid) throw new AiLogicError('unauthorized');
      const localDay = dayKey();
      let grant: {allowed: boolean; remaining: number};
      try { grant = await ports.reserveTurn(actor.uid, localDay, 40); } catch { throw new AiLogicError('usage_unavailable'); }
      if (!grant.allowed) return { status: 'daily_limit' as const, remaining: 0 };
      // Preserve the existing caller-history convention; no implicit extra history changes.
      const contents: Content[] = [...history, {role:'user' as const,text:message}].map(m => ({role:m.role,parts:[{text:m.text}]}));
      try {
        for (let iteration = 0; iteration < 6; iteration++) {
          await sameActor(actor);
          await requestControl?.beforeRequest('chat');
          await sameActor(actor);
          const {response} = await chatModel.generateContent({contents});
          await sameActor(actor);
          const modelContent = candidate(response).content, parts = modelContent.parts;
          const calls = parts.flatMap(p => 'functionCall' in p && p.functionCall ? [p.functionCall] : []);
          if (calls.length) {
            // Preserve the full provider content, including opaque thought signatures.
            // This is protocol state, not authority to access a different student's records.
            contents.push(modelContent);
            for (const call of calls) contents.push({role:'user',parts:[{functionResponse:{name:call.name,response:{name:call.name,content:await toolResult(call.name, actor)}}}]});
          } else {
            const text = parts.flatMap(p => 'text' in p && p.text ? [p.text] : []).join('\n').trim();
            if (!text) throw safeError();
            return { status:'ok' as const, text, remaining:grant.remaining };
          }
        }
      } catch { throw safeError(); }
      throw new AiLogicError('tool_iteration_limit');
    },
  };
}
