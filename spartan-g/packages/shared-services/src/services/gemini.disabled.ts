// Type-only contracts preserve API compatibility without collecting the client implementation.
import type { geminiService as SummaryClient, assistantGeminiClient as AssistantClient } from './gemini.service';
export type { AssistantChatMessage, AssistantChatResult } from './gemini.service';

export const geminiService: Pick<typeof SummaryClient, 'generateSummary' | 'getCachedSummary' | 'cacheSummary'> = {
  async generateSummary() { return null; },
  async getCachedSummary() { return null; },
  async cacheSummary() { /* Disabled: do not write summary documents. */ },
};

export const assistantGeminiClient: Pick<typeof AssistantClient, 'getRemaining' | 'chatWithAssistant'> = {
  async getRemaining() { return 0; },
  async chatWithAssistant() { return { status: 'unconfigured' }; },
};
