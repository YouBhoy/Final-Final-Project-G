// Fixed synthetic fault injection only; never evaluates user-supplied code or reads tokens.
const fs = require('node:fs');
const path = require('node:path');
const firewall = require('./device-firewall.cjs');
(async () => {
  if (!firewall.status().isolated) throw new Error('Verified Phase 4 isolation is required.');
  const health = await fetch('http://127.0.0.1:19098/health').then(r => r.json());
  if (!health.ready || health.projectId !== 'demo-spartan-g-garden-phase2') throw new Error('Synthetic environment required.');
  const pages = await fetch('http://127.0.0.1:8083/json/list').then(r => r.json());
  const page = pages.find(p => p.appId === 'com.spartang.mobile');
  if (!page || !page.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:8083/inspector/debug?')) throw new Error('Expected local Hermes inspector.');
  const expressions = {
    'drop-water-response': `(() => {
      if (globalThis.__phase4WaterDropArmed) throw Error('Already armed');
      globalThis.__phase4WaterDropArmed = true; globalThis.__phase4WaterDropped = false;
      const previous = globalThis.fetch;
      globalThis.fetch = function(input, init) {
        const url = typeof input === 'string' ? input : input.url;
        return previous(input, init).then(function(response) {
        if (url === 'http://10.0.2.2:15001/demo-spartan-g-garden-phase2/us-central1/waterGarden'
            && !globalThis.__phase4WaterDropped && response.ok) {
          globalThis.__phase4WaterDropped = true;
          throw new TypeError('Synthetic local response loss after commit');
        }
        return response;
        });
      };
      return 'One local watering response loss armed';
    })()`,
    status: `({waterDropArmed: !!globalThis.__phase4WaterDropArmed, waterResponseDropped: !!globalThis.__phase4WaterDropped})`,
  };
  const action = process.argv[2]; if (!Object.hasOwn(expressions, action)) throw new Error('Use drop-water-response or status.');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const timer = setTimeout(() => { socket.close(); console.error('Inspector timeout'); process.exitCode = 1; }, 10000);
  socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.enable' })));
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id === 1) {
      socket.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: expressions[action], returnByValue: true } }));
      return;
    }
    if (message.id !== 2) return;
    clearTimeout(timer); socket.close();
    if (message.error || message.result?.exceptionDetails) {
      console.error(JSON.stringify({ error: message.error?.message, exception: message.result?.exceptionDetails?.text,
        description: message.result?.exceptionDetails?.exception?.description })); process.exitCode = 1; return;
    }
    const result = { at: new Date().toISOString(), action, result: message.result?.result?.value };
    fs.appendFileSync(path.resolve(__dirname, '../../docs/garden-mobile-phase4/inspector-tests.jsonl'), JSON.stringify(result) + '\n');
    console.log(JSON.stringify(result));
  });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
