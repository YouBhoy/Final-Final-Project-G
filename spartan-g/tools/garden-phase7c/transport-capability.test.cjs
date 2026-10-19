// Dependency inspection only: no network, Firebase, Android or application changes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../apps/mobile/node_modules/typescript');

test('installed RN fetch polyfill does not enforce redirect:error against an XHR redirect result', async () => {
  const exports = {};
  let initialUrl;
  class SyntheticXHR {
    open(_method, url) { initialUrl = url; }
    setRequestHeader() {}
    getAllResponseHeaders() { return 'Content-Type: application/json\r\n'; }
    send() {
      this.status = 200; this.statusText = 'OK';
      this.responseURL = 'https://redirect-result.invalid/'; this.responseText = '{}';
      queueMicrotask(() => this.onload());
    }
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('whatwg-fetch/dist/fetch.umd.js'), 'utf8'), {
    exports, module: { exports }, XMLHttpRequest: SyntheticXHR, setTimeout,
    AbortController, DOMException, console: { warn() {} },
  });
  const request = new exports.Request('https://approved-origin.invalid/v1/watering', { redirect: 'error' });
  assert.equal(request.redirect, undefined);
  const response = await exports.fetch(request.url, { redirect: 'error' });
  assert.equal(initialUrl, request.url);
  assert.equal(response.url, 'https://redirect-result.invalid/');
  // This proves the JS option is ignored, not that a native client leaks credentials.
});

test('installed Expo fetch drops redirect:error before calling the native request', async () => {
  const filename = 'node_modules/expo/src/winter/fetch/fetch.ts';
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let nativeInit;
  class SyntheticRequest { async start(_url, init) { nativeInit = init; } }
  const module = { exports: {} };
  const imports = {
    './ExpoFetchModule': { ExpoFetchModule: { NativeRequest: SyntheticRequest } },
    './FetchErrors': { FetchError: class extends Error {} },
    './FetchResponse': { FetchResponse: class {} },
    './RequestUtils': { normalizeBodyInitAsync: async () => ({}), normalizeHeadersInit: headers => headers ?? [], overrideHeaders: headers => headers },
  };
  vm.runInNewContext(code, { module, exports: module.exports,
    require(name) { assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`); return imports[name]; },
  });
  await module.exports.fetch('https://approved-origin.invalid/v1/watering', { method: 'POST', redirect: 'error' });
  assert.deepEqual(Object.keys(nativeInit).sort(), ['credentials', 'headers', 'method']);
  assert.equal(nativeInit.redirect, undefined);
});
