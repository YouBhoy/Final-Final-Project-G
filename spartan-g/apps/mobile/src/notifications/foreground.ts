import { categoryEnabled, safePushContent, type PhonePreferences } from '@spartan-g/shared-services/src/notifications/push-contract';
import type { TapContext } from './tap-coordinator';

export function foregroundPresentation(content: { title?: unknown; body?: unknown; data?: unknown }, context: TapContext,
  preferences: PhonePreferences | null, presentation: { messages: boolean; appointments: boolean; sound: boolean }, now: number) {
  const envelope = safePushContent(content, now);
  const visible = !!envelope && !!context.owner && context.ready && !!context.bindingId && envelope.bindingId === context.bindingId
    && categoryEnabled(preferences, envelope.category) && (envelope.category === 'message' ? presentation.messages : envelope.category === 'appointment' ? presentation.appointments : true);
  return { shouldShowAlert: visible, shouldShowBanner: visible, shouldShowList: visible, shouldPlaySound: visible && presentation.sound, shouldSetBadge: false };
}
