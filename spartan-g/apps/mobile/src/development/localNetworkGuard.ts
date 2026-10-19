import { assertLocalUrl } from '@spartan-g/shared-services/src/config/local-emulator-contract';
let installed = false;

/** Defense in depth; the local launcher also requires a per-app emulator firewall. */
export function installLocalNetworkGuard(): void {
  if (installed) return;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    assertLocalUrl(url);
    return originalFetch(input, init);
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string, async: boolean = true) {
    assertLocalUrl(url);
    return originalOpen.call(this, method, url, async);
  };
  const OriginalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends OriginalWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      assertLocalUrl(String(url));
      super(url, protocols);
    }
  };
  installed = true;
  console.info('[LocalFirebase] Local-only network guard installed.');
}
