// Safe release default: no environment reads and no network or persistence access.
export const AI_UNAVAILABLE_MESSAGE = 'AI features are unavailable in this version. You can still use Messages and Appointments.';
export function isSummaryAiAvailable(): boolean { return false; }
export function isAssistantAiAvailable(): boolean { return false; }
