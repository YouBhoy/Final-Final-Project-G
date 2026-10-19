// Preserve the existing web instance; optional attempt context is used by native AI Logic.
import { geminiService as legacySummary } from './gemini.service';
import type { SummaryFacade } from './firebase-ai-facade';
export const geminiService: SummaryFacade = legacySummary;
export { assistantGeminiClient } from './gemini.service';
export type { AssistantChatMessage, AssistantChatResult } from './gemini.service';
