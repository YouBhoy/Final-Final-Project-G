export function assertLocalEmulatorsReady(): void { /* Normal Firebase has no emulator readiness dependency. */ }
export function setLocalEmulatorsReady(ready: boolean): void {
  if (ready) throw new Error('Emulator readiness cannot be enabled in this build.');
}
