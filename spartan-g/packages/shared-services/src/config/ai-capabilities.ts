// Web defaults and explicitly opted-in Metro development builds only.
// Metro replaces this module with ai-capabilities.disabled.ts for release builds.
export const AI_UNAVAILABLE_MESSAGE = 'AI features are unavailable in this version. You can still use Messages and Appointments.';

export function isSummaryAiAvailable(): boolean {
  try { return !!process.env.EXPO_PUBLIC_GEMINI_API_KEY; } catch { return false; }
}

export function isAssistantAiAvailable(): boolean {
  try { return !!process.env.EXPO_PUBLIC_GEMINI_ASSISTANT_API_KEY; } catch { return false; }
}
