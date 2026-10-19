import type { AssistantChatMessage, AssistantChatResult } from './gemini.service';
import type { AssessmentScores } from './firebase-ai-contracts';
import type { createAiLogicClient } from './firebase-ai-logic.client';
import type { SummaryAvailability } from './firebase-ai-summary-policy';

export interface SummaryFacade {
  generateSummary(scores: AssessmentScores, attemptId?: string): Promise<string | null>;
  getCachedSummary(attemptId: string): Promise<string | null>;
  cacheSummary(attemptId: string, summary: string): Promise<void>;
  getSummaryAvailability?(attemptId: string): Promise<SummaryAvailability>;
}

// Match existing UI outcomes. No fallback to the original key-bearing implementation.
export function createAiLogicFacade(resolveClient: () => ReturnType<typeof createAiLogicClient> | undefined) {
  const geminiService: SummaryFacade = {
    async getSummaryAvailability(attemptId) {
      try { return await resolveClient()?.getSummaryAvailability(attemptId) ?? 'unavailable'; }
      catch (error) {
        return error && typeof error === 'object' && 'reason' in error && error.reason === 'risk_metadata_unavailable'
          ? 'risk_unavailable' : 'unavailable';
      }
    },
    async generateSummary(scores, attemptId) {
      if (!attemptId) return null; // Bind every summary to an authorized canonical attempt.
      try { return await resolveClient()?.generateSummary(attemptId, scores) ?? null; }
      catch { return null; }
    },
    async getCachedSummary(attemptId) {
      try { return await resolveClient()?.getCachedSummary(attemptId) ?? null; }
      catch { return null; }
    },
    async cacheSummary(attemptId, summary) {
      try { await resolveClient()?.cacheSummary(attemptId, summary); }
      catch { /* Original best-effort cache contract; never claim a durable write. */ }
    },
  };
  const assistantGeminiClient = {
    async getRemaining(studentId: string): Promise<number> {
      try { return await resolveClient()?.getRemaining(studentId) ?? 0; }
      catch { return 0; }
    },
    async chatWithAssistant(message: string, studentId: string, history: AssistantChatMessage[] = []): Promise<AssistantChatResult> {
      try {
        const client = resolveClient();
        if (!client) return { status: 'unconfigured' };
        return await client.chatWithAssistant(message, studentId, history);
      } catch {
        return { status: 'error', message: 'Sparty is unavailable right now. Please try again later.' };
      }
    },
  };
  return { geminiService, assistantGeminiClient };
}
