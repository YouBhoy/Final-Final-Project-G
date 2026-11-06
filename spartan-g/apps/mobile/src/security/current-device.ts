export interface LocalActor { uid: string; role: string }
export interface DeviceDescription { model: unknown; os: unknown; version: unknown; platform: unknown; isDevice: boolean }
const safe = (value: unknown) => typeof value === 'string' && value.trim() && value.length <= 100 ? value.trim() : 'Not available';
/** Description only; never a trust decision, device identifier or server session list. */
export function currentDeviceDescription(actor: LocalActor | null, firebaseUid: string | null, device: DeviceDescription) {
  if (!actor || !['student', 'facilitator'].includes(actor.role) || actor.uid !== firebaseUid || !firebaseUid) return null;
  return { model: safe(device.model), operatingSystem: [safe(device.os), safe(device.version)].join(' '), platform: safe(device.platform), physicalDevice: device.isDevice,
    localSession: 'Firebase sign-in is present in this app', trust: 'Not enrolled as a trusted device', verifiedActivity: 'Unavailable: no authoritative session-activity service',
    otherDevices: 'Unavailable: no verified cross-device list', revocation: 'Not connected: selective revocation and sign-out-all are unavailable' };
}
