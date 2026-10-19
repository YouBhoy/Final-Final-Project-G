const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const zlib=require('node:zlib');const {tlsServer,bridge,transport,randomUUID,state,root,load,ExternalGardenClient}=require('./native-fixture.cjs');
let endpoint,native,mode,received,handler;
const body={ok:true,data:{status:'synthetic'}};
beforeEach(async()=>{received=[];mode='normal';handler=(_q,r)=>r.end(JSON.stringify(body));
 endpoint=await tlsServer((q,r)=>{received.push({url:q.url,authorization:q.headers.authorization});handler(q,r);});native=await bridge(endpoint.origin);});
afterEach(async()=>{if(native)await native.close();if(endpoint)await endpoint.close();});
const request=(action='waterGarden',id=randomUUID(),timeout=75000)=>native.request(randomUUID(),action,id,'synthetic.jwt.value',timeout);

test('real cached OkHttp sends same-origin HTTPS with the exact identity-only body and no secret logs',async()=>{
 let sent='';handler=(q,r)=>{q.on('data',b=>sent+=b);q.on('end',()=>r.end(JSON.stringify(body)));};
 const id=randomUUID(),reply=await request('waterGarden',id);assert.equal(reply.status,200);assert.deepEqual(JSON.parse(sent),{requestId:id});
 assert.deepEqual(received,[{url:'/v1/watering',authorization:'Bearer synthetic.jwt.value'}]);assert.ok(!native.diagnostics().includes('synthetic.jwt.value'));
});

test('all 300-399 statuses are rejected with zero requests/Authorization at the redirect destination',async()=>{
 let targetRequests=0;const target=await tlsServer((_q,r)=>{targetRequests++;r.end('{}');});
 try{for(let status=300;status<=399;status++){
  handler=(_q,r)=>{r.writeHead(status,{Location:target.origin+'/steal'});r.end('{}');};
  await assert.rejects(()=>request(),e=>e.userInfo?.reason==='redirect_rejected'&&e.userInfo.outcomeUnknown===true);
 }assert.equal(targetRequests,0);}finally{await target.close();}
});

test('same-origin and HTTPS-to-cleartext redirects are refused too',async()=>{
 let hits=0;const target=http.createServer((_q,r)=>{hits++;r.end('{}');});await new Promise(r=>target.listen(0,'127.0.0.1',r));
 try{for(const destination of [endpoint.origin+'/other',`http://127.0.0.1:${target.address().port}/`]){
  handler=(_q,r)=>{r.writeHead(307,{Location:destination});r.end();};await assert.rejects(()=>request(),e=>e.userInfo?.reason==='redirect_rejected');
 }assert.equal(hits,0);assert.equal(received.length,2);}finally{await new Promise(r=>target.close(r));}
});

test('arbitrary operation URLs and URL-shaped identities cannot change the destination',async()=>{
 for(const [action,id]of [['https://other.invalid/water',randomUUID()],['waterGarden','https://other.invalid/'],['finalizeAssessment','//other.invalid/id']]){
  await assert.rejects(()=>request(action,id),e=>['invalid_operation','invalid_identity'].includes(e.userInfo?.reason));
 }assert.equal(received.length,0);
});

test('native origin parser rejects malformed, cleartext, path, credential, query, fragment and ambiguous origins',()=>{
 const invalid=['http://127.0.0.1:18090','http://garden.invalid','https://user:secret@garden.invalid','https://garden.invalid/path',
  'https://garden.invalid/?x=1','https://garden.invalid/#x','https://garden.invalid\\@other.invalid','https:///garden.invalid','https://garden.invalid:0',
  'https://garden.invalid:65536','https://garden.invalid.','https://%67arden.invalid',' https://garden.invalid','https://garden.invalid\n'];
 for(const origin of invalid){const result=cp.spawnSync(state.java,['-cp',state.classpath,state.entry,'--origin',origin],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0);assert.equal(result.stdout.trim(),'invalid_origin',origin);}
 for(const origin of ['https://garden.invalid','https://garden.invalid:4443','https://127.0.0.1:12345']){
  const result=cp.spawnSync(state.java,['-cp',state.classpath,state.entry,'--origin',origin],{encoding:'utf8',windowsHide:true});assert.equal(result.stdout.trim(),'VALID');
 }
});

test('native rejects CRLF token injection, reused call keys, invalid UUIDs and timeouts before dispatch',async()=>{
 await assert.rejects(()=>native.request(randomUUID(),'waterGarden',randomUUID(),'token\r\nInjected: value',1000),e=>e.userInfo?.reason==='invalid_token');
 await assert.rejects(()=>native.request(randomUUID(),'waterGarden','not-a-uuid','synthetic',1000),e=>e.userInfo?.reason==='invalid_identity');
 await assert.rejects(()=>request('waterGarden',randomUUID(),999),e=>e.userInfo?.reason==='invalid_timeout');assert.equal(received.length,0);
 handler=(_q,r)=>setTimeout(()=>r.end(JSON.stringify(body)),200);const key=randomUUID(),first=native.request(key,'waterGarden',randomUUID(),'synthetic',1000);
 await assert.rejects(()=>native.request(key,'waterGarden',randomUUID(),'synthetic',1000),e=>e.userInfo?.reason==='request_key_in_use');await first;
});

test('content-length, chunked, and transparently decompressed oversized responses are bounded',async()=>{
 for(const kind of ['length','chunked','gzip']){
  handler=(_q,r)=>{if(kind==='length')r.setHeader('Content-Length',17000);
   if(kind==='gzip'){r.setHeader('Content-Encoding','gzip');r.end(zlib.gzipSync(Buffer.alloc(20000,'x')));}
   else{r.write('x'.repeat(9000));r.end('x'.repeat(8000));}};
  await assert.rejects(()=>request(),e=>e.userInfo?.reason==='response_too_large'&&e.userInfo.outcomeUnknown);
 }
});

test('exact response-size boundary and Retry-After survive without arbitrary headers',async()=>{
 handler=(_q,r)=>{r.setHeader('Retry-After','60');r.setHeader('X-Secret','not-forwarded');r.end('x'.repeat(16384));};
 const reply=await request();assert.equal(reply.body.length,16384);assert.equal(reply.retryAfterSeconds,60);assert.deepEqual(Object.keys(reply).sort(),['body','retryAfterSeconds','status']);
});

test('TLS-handshake stall ends within the call deadline with a sanitized unknown outcome',async()=>{
 const sockets=new Set(),stall=net.createServer(s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});await new Promise(r=>stall.listen(0,'127.0.0.1',r));
 const stalled=await bridge(`https://127.0.0.1:${stall.address().port}`),began=Date.now();
 try{await assert.rejects(()=>stalled.request(randomUUID(),'waterGarden',randomUUID(),'synthetic',1000),e=>e.userInfo?.reason==='outcome_unknown');assert.ok(Date.now()-began<5000);}
 finally{await stalled.close();for(const s of sockets)s.destroy();await new Promise(r=>stall.close(r));}
});

test('a lost TLS connection is not automatically retried',async()=>{
 handler=(q,_r)=>q.socket.destroy();await assert.rejects(()=>request(),e=>e.userInfo?.reason==='outcome_unknown');assert.equal(received.length,1);
});

test('cancellation targets one flight and concurrent unaffected operations finish',async()=>{
 handler=(_q,r)=>setTimeout(()=>r.end(JSON.stringify(body)),400);const key=randomUUID();
 const first=native.request(key,'waterGarden',randomUUID(),'synthetic',1000),caught=assert.rejects(()=>first,e=>e.userInfo?.reason==='cancelled'&&e.userInfo.outcomeUnknown);
 const second=request();await native.cancel(key);await caught;assert.equal((await second).status,200);
});

test('Garden capacity is bounded at eight flights',async()=>{
 handler=(_q,r)=>setTimeout(()=>r.end(JSON.stringify(body)),800);const work=Array.from({length:8},()=>request());
 await assert.rejects(()=>request(),e=>e.userInfo?.reason==='client_busy');await Promise.all(work);assert.equal(received.length,8);
});

test('cached OkHttp 4.12/Okio 3.6 also executes the same production client safely',async()=>{
 const newer=await bridge(endpoint.origin,true);try{assert.equal((await newer.request(randomUUID(),'waterGarden',randomUUID(),'synthetic',1000)).status,200);
 handler=(_q,r)=>{r.writeHead(302,{Location:endpoint.origin+'/forbidden'});r.end();};await assert.rejects(()=>newer.request(randomUUID(),'waterGarden',randomUUID(),'synthetic',1000),e=>e.userInfo?.reason==='redirect_rejected');
 const before=received.length;handler=(_q,r)=>{r.writeHead(503,{'Retry-After':'0'});r.end('{}');};
 assert.equal((await newer.request(randomUUID(),'waterGarden',randomUUID(),'synthetic',1000)).status,503);assert.equal(received.length,before+1);
 }finally{await newer.close();}
});

test('JS adapter uses the real native client and forwards HTTP admission/retry semantics',async()=>{
 const value=await transport(native).invoke('waterGarden',{requestId:randomUUID()});assert.equal(value.status,'synthetic');
 handler=(_q,r)=>{r.writeHead(429,{'Retry-After':'12'});r.end(JSON.stringify({ok:false,error:{code:'resource-exhausted',reason:'rate_limited',retryable:true}}));};
 await assert.rejects(()=>transport(native).invoke('waterGarden',{requestId:randomUUID()}),e=>e.status===429&&e.retryable&&e.retryAfterSeconds===12);
});

test('JS default disabled/missing-native configuration fails before token retrieval or network',async()=>{
 let reads=0;const dependencies={enabled:false,bridge:native,currentUser:()=>({uid:'a',getIdToken:async()=>{reads++;return 'synthetic';}}),requestKey:randomUUID,terminals:{read:async()=>false,write:async()=>{}}};
 await assert.rejects(()=>new ExternalGardenClient(dependencies).invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='configuration_disabled');
 const bad={...native,getConfiguration:async()=>({version:1,enabled:false,origin:null})};await assert.rejects(()=>new ExternalGardenClient({...dependencies,enabled:true,bridge:bad}).invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='configuration_disabled');
 assert.equal(reads,0);assert.equal(received.length,0);
});

test('JS preserves session checks, cancellation and identity-only schemas without fetch',async()=>{
 let user='a';const changed=transport(native,{currentUser:()=>({uid:user,getIdToken:async()=>{user='b';return 'synthetic';}})});
 await assert.rejects(()=>changed.invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='session_changed');
 const controller=new AbortController();controller.abort();await assert.rejects(()=>transport(native).invoke('waterGarden',{requestId:randomUUID()},controller.signal),e=>e.reason==='cancelled');
 await assert.rejects(()=>transport(native).invoke('waterGarden',{requestId:randomUUID(),studentId:'forged'}),e=>e.reason==='invalid_identity');assert.equal(received.length,0);
});

test('JS live AbortSignal cancels a native flight and returns unknown without an automatic retry',async()=>{
 handler=(_q,r)=>setTimeout(()=>r.end(JSON.stringify(body)),500);const controller=new AbortController();
 const response=transport(native).invoke('waterGarden',{requestId:randomUUID()},controller.signal);const caught=assert.rejects(()=>response,e=>e.reason==='cancelled'&&e.outcomeUnknown);
 setTimeout(()=>controller.abort(),100);await caught;assert.ok(received.length<=1);
});

test('terminal invalid assessment response persists across JS client instances',async()=>{
 handler=(_q,r)=>{r.writeHead(409);r.end(JSON.stringify({ok:false,error:{code:'failed-precondition',reason:'assessment_incomplete',retryable:false}}));};
 const terminals=new Map();await assert.rejects(()=>transport(native,{terminals}).invoke('finalizeAssessment',{attemptId:'lesson_synthetic_1'}),e=>e.reason==='assessment_incomplete');
 await assert.rejects(()=>transport(native,{terminals}).invoke('finalizeAssessment',{attemptId:'lesson_synthetic_1'}),e=>e.reason==='review_required');assert.equal(received.length,1);
});

test('unparseable and oversized JS mock replies cannot acknowledge a reward',async()=>{
 for(const result of [{status:200,body:'{'},{status:200,body:'x'.repeat(17000)},{status:302,body:'{}'}]){
  const fake={...native,request:async()=>result};await assert.rejects(()=>transport(fake).invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='invalid_response'&&e.outcomeUnknown);
 }
});

test('bridge wrapper rejects missing/iOS modules and current backend factory stays uninstalled/disabled',()=>{
 const client=load('apps/mobile/src/garden/externalGardenClient.ts');
 for(const react of [{Platform:{OS:'ios'},NativeModules:{SpartanGardenHttp:native}},{Platform:{OS:'android'},NativeModules:{}}]){
  const wrapper=load('apps/mobile/src/garden/nativeGardenTransport.ts',{'react-native':react,'./externalGardenClient':client});assert.throws(()=>wrapper.getNativeGardenBridge(),e=>e.reason==='native_transport_unavailable');
 }
 const factory=load('apps/mobile/src/garden/externalGardenBackend.ts',{'expo-file-system':{},'expo-modules-core':{},
  '@spartan-g/shared-services/src/config/garden-backend':{},'@spartan-g/shared-services/src/firebase/auth':{getFirebaseAuth(){throw Error('Firebase must not initialize');}},
  '@spartan-g/shared-services/src/services/garden-operations.client':{},'./externalGardenClient':client,'./nativeGardenTransport':{getNativeGardenBridge(){throw Error('Bridge must not load');}}});
 assert.equal(factory.EXTERNAL_GARDEN_ROUTING_ENABLED,false);assert.throws(()=>factory.createExternalGardenBackend(),e=>e.reason==='configuration_disabled');
});

test('source audit confirms no global HTTP hooks, cleartext mode, client URLs or activation',()=>{
 const directory=path.join(root,'apps/mobile/android/app/src/main/java/com/spartang/mobile/garden');
 const source=fs.readdirSync(directory).map(n=>fs.readFileSync(path.join(directory,n),'utf8')).join('\n');
 for(const pattern of [/OkHttpClientProvider/,/setOkHttpClientFactory/,/setDefault(?:SSL|Hostname)/,/HttpLoggingInterceptor/,/System\.setProperty/,/http:\/\//,/Log\.[a-z]/,/println\(/])assert.ok(!pattern.test(source),String(pattern));
 assert.match(source,/ENABLED = false/);assert.match(source,/APPROVED_ORIGIN: String\? = null/);
 const wrapper=fs.readFileSync(path.join(root,'apps/mobile/src/garden/externalGardenClient.ts'),'utf8');assert.ok(!/\bfetch\s*\(|XMLHttpRequest/.test(wrapper));
});

test('ordinary TLS verification rejects an untrusted endpoint before any Authorization is sent',async()=>{
 const untrusted=await bridge(endpoint.origin,false,false);
 try{await assert.rejects(()=>untrusted.request(randomUUID(),'waterGarden',randomUUID(),'synthetic.jwt.value',1000),e=>e.userInfo?.reason==='outcome_unknown');assert.equal(received.length,0);}
 finally{await untrusted.close();}
});

test('native JSON encoding preserves Unicode and escaped identifier characters without URL interpretation',async()=>{
 let captured;handler=(q,r)=>{let body='';q.on('data',c=>body+=c);q.on('end',()=>{captured=JSON.parse(body);r.end(JSON.stringify({ok:true,data:{}}));});};
 const id='lesson_synthetic_"quoted"_\\_é_1';assert.equal((await request('finalizeAssessment',id)).status,200);assert.deepEqual(captured,{attemptId:id});assert.equal(received[0].url,'/v1/assessments/finalize');
});

test('Firebase token-provider failures are sanitized and never invoke native HTTP',async()=>{
 const client=transport(native,{currentUser:()=>({uid:'synthetic',getIdToken:async()=>{throw Error('PRIVATE TOKEN PROVIDER DETAIL');}})});
 await assert.rejects(()=>client.invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='token_unavailable'&&!e.message.includes('PRIVATE')&&e.retryable);assert.equal(received.length,0);
});

test('Retry-After zero on 503 cannot cause an automatic second POST',async()=>{
 handler=(_q,r)=>{if(received.length===1){r.writeHead(503,{'Retry-After':'0'});r.end(JSON.stringify({ok:false,error:{code:'unavailable',reason:'backend_unavailable',retryable:true}}));}
  else r.end(JSON.stringify(body));};
 const response=await request();assert.equal(response.status,503);assert.equal(received.length,1);
});

test('closing the private client cancels active Garden work and settles its pending call',async()=>{
 handler=()=>{};const work=request();const caught=assert.rejects(()=>work,e=>e.userInfo?.reason==='cancelled');
 for(let n=0;n<100&&received.length===0;n++)await new Promise(r=>setTimeout(r,10));assert.equal(received.length,1);
 await native.close();await caught;
});
