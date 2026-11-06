import { PUSH_CHANNELS } from '@spartan-g/shared-services/src/notifications/push-contract';
export const NOTIFICATION_CHANNELS = [
  { id: PUSH_CHANNELS.appointment, name: 'Appointments and reminders', description: 'Generic appointment changes and authorized upcoming reminders.' },
  { id: PUSH_CHANNELS.message, name: 'New messages', description: 'Generic alerts for your authorized conversations; no message previews.' },
  { id: PUSH_CHANNELS.assessment, name: 'Assessment updates', description: 'Authorized assessment availability and reminders, without screening details.' },
  { id: 'spartan.general.v1', name: 'General application notifications', description: 'Non-sensitive Spartan-G service notifications.' },
] as const;
export interface ChannelState { importance: number; sound: string | null; enableVibrate: boolean }
/** Never re-create/delete an existing channel to override the user's OS choices. */
export async function ensureNotificationChannels(ports: {
  sdk: number; get(id: string): Promise<ChannelState | null>;
  importance: { none: number; normal: number };
  create(value: typeof NOTIFICATION_CHANNELS[number], settings: ChannelState): Promise<void>;
}) {
  if (ports.sdk < 26) return;
  if (!Number.isInteger(ports.importance.none) || !Number.isInteger(ports.importance.normal) || ports.importance.none < 0 || ports.importance.normal <= ports.importance.none) throw new Error('SDK channel importance unavailable');
  const legacy = await ports.get('default');
  for (const channel of NOTIFICATION_CHANNELS) {
    if (await ports.get(channel.id)) continue;
    if (legacy?.importance === ports.importance.none) throw new Error('Legacy channel blocked; open Android settings');
    if (legacy && (!Number.isInteger(legacy.importance) || legacy.importance < ports.importance.none)) throw new Error('Legacy channel importance unavailable');
    await ports.create(channel, { importance: legacy ? Math.min(legacy.importance, ports.importance.normal) : ports.importance.normal,
      sound: !legacy || legacy.sound === 'default' ? 'default' : null, enableVibrate: legacy?.enableVibrate ?? false });
  }
}
