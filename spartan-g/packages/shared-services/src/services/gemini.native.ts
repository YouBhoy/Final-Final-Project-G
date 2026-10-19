import { geminiService as disabledSummary, assistantGeminiClient as disabledAssistant } from './gemini.disabled';
import type { SummaryFacade } from './firebase-ai-facade';
import { isAiLogicReleaseEnabled } from '../config/firebase-ai-release';

// Separate source approval and Metro gates remain closed. Never select the direct-key client here.
// The single source-controlled enabled:false gate also controls native UI availability.
const clients: typeof import('./firebase-ai-logic.native') = isAiLogicReleaseEnabled()
  ? require('./firebase-ai-logic.native') as typeof import('./firebase-ai-logic.native')
  : { geminiService: disabledSummary, assistantGeminiClient: disabledAssistant };
export const geminiService: SummaryFacade = clients.geminiService;
export const assistantGeminiClient = clients.assistantGeminiClient;
export type { AssistantChatMessage, AssistantChatResult } from './gemini.service';
