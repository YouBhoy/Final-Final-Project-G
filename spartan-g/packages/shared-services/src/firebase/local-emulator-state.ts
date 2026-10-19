import { localEmulators } from '../config/local-emulators';
let checkedAt = 0;

export function setLocalEmulatorsReady(ready: boolean): void { checkedAt = ready ? Date.now() : 0; }

export function assertLocalEmulatorsReady(): void {
  // Local Functions workers can take several seconds to cold-start on Windows.
  // This covers one bounded 15s probe plus polling; network isolation is constant.
  if (localEmulators.enabled && (checkedAt === 0 || Date.now() - checkedAt > 25000)) {
    throw new Error('Local Firebase is unavailable; production fallback is disabled.');
  }
}
