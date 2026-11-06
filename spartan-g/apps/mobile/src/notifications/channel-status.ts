import { NOTIFICATION_CHANNELS } from './channel-core';

export type ChannelStatus = {
  id: string; name: string; state: 'enabled' | 'blocked' | 'missing' | 'unknown';
  importance: 'Off' | 'Minimum' | 'Low' | 'Default' | 'High' | 'Maximum' | 'Unknown';
  sound: string; visibility: string;
};
export type ChannelOverview = { status: 'ready' | 'unavailable' | 'not-required'; channels: ChannelStatus[] };
type NativeChannel = { id: string; importance: number; sound: string | null; lockscreenVisibility: number };

/** Read only this app's known channels; no registration, deletion or OS changes. */
export async function inspectPhoneChannels(ports: {
  sdk: number; read(): Promise<NativeChannel[] | null>;
  importance: { NONE: number; MIN: number; LOW: number; DEFAULT: number; HIGH: number; MAX: number };
  visibility: { PRIVATE: number; PUBLIC: number; SECRET: number };
}): Promise<ChannelOverview> {
  if (ports.sdk < 26) return { status: 'not-required', channels: [] };
  const all = await ports.read();
  if (!Array.isArray(all) || all.some(c => !c || typeof c.id !== 'string') || new Set(all.map(c => c.id)).size !== all.length) throw Error('Channel status unavailable');
  const known: { id: string; name: string }[] = [...NOTIFICATION_CHANNELS];
  for (const [id, name] of [['default', 'Earlier app notifications'], ['fcm_fallback_notification_channel', 'Firebase default notifications']]) if (all.some(c => c.id === id)) known.push({ id, name });
  const labels = new Map([[ports.importance.NONE, 'Off'], [ports.importance.MIN, 'Minimum'], [ports.importance.LOW, 'Low'], [ports.importance.DEFAULT, 'Default'], [ports.importance.HIGH, 'High'], [ports.importance.MAX, 'Maximum']] as const);
  const channels = known.map(({ id, name }): ChannelStatus => {
    const found = all.find(c => c.id === id);
    if (!found) return { id, name, state: 'missing', importance: 'Unknown', sound: 'Not created', visibility: 'Not created' };
    const importance = labels.get(found.importance) ?? 'Unknown';
    return { id, name, state: importance === 'Unknown' ? 'unknown' : found.importance === ports.importance.NONE ? 'blocked' : 'enabled', importance,
      sound: found.sound === null ? 'Silent' : found.sound === 'default' ? 'Default sound' : found.sound === 'custom' ? 'Custom sound' : 'Unknown',
      visibility: found.lockscreenVisibility === ports.visibility.PRIVATE ? 'Sensitive content hidden' : found.lockscreenVisibility === ports.visibility.SECRET ? 'Hidden on lock screen' : found.lockscreenVisibility === ports.visibility.PUBLIC ? 'System channel allows previews' : 'Unknown' };
  });
  return { status: 'ready', channels };
}
