// Key-free native capability path; disabled/default Metro builds use the disabled module.
import { aiLogicReleaseConfig, isAiLogicReleaseEnabled } from './firebase-ai-release';
export { AI_UNAVAILABLE_MESSAGE } from './ai-capabilities.disabled';
export function isAssistantAiAvailable(): boolean { return isAiLogicReleaseEnabled(); }
export function isSummaryAiAvailable(): boolean {
  return isAiLogicReleaseEnabled() && aiLogicReleaseConfig.syntheticAttemptIds.length > 0;
}
