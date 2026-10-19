import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { ExternalAction, GardenHttpService } from './service';
import { HttpFailure, safeFailure } from './errors';

export const HTTP_LIMITS = Object.freeze({ bodyBytes:4096, responseBytes:16384, headersBytes:16384,
  headersMs:5000, bodyMs:10000, operationMs:30000, active:16, connections:64 });
export function createGardenServer(service: GardenHttpService, authenticate: (request: IncomingMessage) => Promise<string>,
  operationMs = HTTP_LIMITS.operationMs) {
  if (!Number.isSafeInteger(operationMs) || operationMs < 10 || operationMs > 60000) throw Error('Invalid HTTP operation timeout');
  let active = 0, closing = false, readiness: {until:number; ready:boolean} | undefined;
  const routes: Record<string, ExternalAction> = { '/v1/assessments/finalize':'finalize', '/v1/assessments/recover':'recover', '/v1/watering':'water' };
  function send(response: ServerResponse, status: number, body: unknown): void {
    if (response.destroyed || response.writableEnded) return;
    const encoded = JSON.stringify(body);
    if (Buffer.byteLength(encoded) > HTTP_LIMITS.responseBytes) {
      send(response, 503, {ok:false, error:{code:'unavailable', reason:'response_unavailable', retryable:true}}); return;
    }
    response.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff', 'Connection':'close'}); response.end(encoded);
  }
  function fail(response: ServerResponse, error: unknown, correlation: string): void {
    const value = safeFailure(error);
    if (value.retryAfterSeconds && !response.headersSent) response.setHeader('Retry-After', String(value.retryAfterSeconds));
    send(response, value.status, {ok:false, requestId:correlation, error:{code:value.code, reason:value.reason,
      retryable:value.retryable, retryAfterSeconds:value.retryAfterSeconds, message:'Garden request could not be confirmed.'}});
  }
  async function readBody(request: IncomingMessage): Promise<unknown> {
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')
        || request.headers['content-encoding']) throw new HttpFailure(415, 'invalid-argument', 'unsupported_content_type');
    const length = request.headers['content-length'];
    if (length && (!/^\d+$/.test(length) || Number(length) > HTTP_LIMITS.bodyBytes)) throw new HttpFailure(413, 'invalid-argument', 'body_too_large');
    return new Promise((resolve,reject) => {
      let size=0, settled=false;const chunks:Buffer[]=[];
      const finish=(error?:HttpFailure) => {
        if(settled)return;settled=true;clearTimeout(timeout);
        request.removeListener('data',data);request.removeListener('end',end);request.removeListener('aborted',aborted);
        if(error){request.pause();reject(error);return;}
        try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);}
        catch{reject(new HttpFailure(400,'invalid-argument','invalid_json'));}
      };
      const data=(chunk:Buffer)=>{size+=chunk.length;if(size>HTTP_LIMITS.bodyBytes)finish(new HttpFailure(413,'invalid-argument','body_too_large'));else chunks.push(chunk);};
      const end=()=>finish(),aborted=()=>finish(new HttpFailure(400,'invalid-argument','request_aborted'));
      const timeout=setTimeout(()=>finish(new HttpFailure(408,'unavailable','request_timeout',true)),HTTP_LIMITS.bodyMs);
      request.on('data',data);request.once('end',end);request.once('aborted',aborted);
      request.once('error',()=>finish(new HttpFailure(400,'invalid-argument','request_aborted')));
    });
  }
  const server = createServer({maxHeaderSize:HTTP_LIMITS.headersBytes}, (request, response) => {
    const correlation = randomUUID();
    if (closing || active >= HTTP_LIMITS.active) { fail(response, new HttpFailure(503,'unavailable','server_busy',true,2),correlation); return; }
    active++;
    // A timed-out request may still commit. Keep its slot until the work settles.
    const timeout = setTimeout(() => fail(response, new HttpFailure(504,'unavailable','outcome_unknown',true),correlation), operationMs);
    void (async () => {
      if (request.headers.origin) throw new HttpFailure(403, 'permission-denied', 'origin_not_allowed');
      const path = request.url ?? '';
      if ((path === '/healthz' || path === '/readyz') && request.method === 'GET') {
        if (path === '/readyz') {
          if (!readiness || readiness.until <= Date.now()) {
            try { await service.ready(); readiness = {until:Date.now()+5000,ready:true}; }
            catch { readiness = {until:Date.now()+5000,ready:false}; }
          }
          if (!readiness.ready) throw new HttpFailure(503,'unavailable','not_ready',true);
        }
        send(response,200,{ok:true}); return;
      }
      if (!Object.hasOwn(routes,path)) throw new HttpFailure(404,'not-found','route_not_found');
      if (request.method !== 'POST') throw new HttpFailure(405,'invalid-argument','method_not_allowed');
      const uid = await authenticate(request);
      const body = await readBody(request);
      if (response.writableEnded || response.destroyed) return; // No new mutation after a pre-dispatch timeout.
      const result = await service.execute(routes[path]!,uid,body);
      const pending = result !== null && typeof result === 'object' && 'status' in result && result.status === 'pending';
      send(response,pending?202:200,{ok:true,requestId:correlation,data:result});
    })().catch(error => fail(response,error,correlation)).finally(() => { clearTimeout(timeout); active--; });
  });
  server.headersTimeout = HTTP_LIMITS.headersMs; server.requestTimeout = HTTP_LIMITS.bodyMs;
  server.keepAliveTimeout = 1000; server.maxConnections = HTTP_LIMITS.connections; server.maxRequestsPerSocket = 50;
  server.on('checkContinue', (_request,response) => send(response,417,{ok:false,error:{code:'invalid-argument',reason:'expectation_not_supported',retryable:false}}));
  server.on('clientError', (_error,socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); });
  return {server,
    async close(graceMs = 30000): Promise<void> {
      closing = true;
      const deadline=Date.now()+graceMs;
      const timeout = setTimeout(() => server.closeAllConnections(),graceMs); timeout.unref();
      try { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
        while(active>0&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20)); }
      finally { clearTimeout(timeout); }
    },
  };
}
