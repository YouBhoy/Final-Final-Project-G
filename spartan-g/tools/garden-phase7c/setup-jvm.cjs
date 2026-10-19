// Offline Kotlin compilation and disposable localhost TLS fixture. No Gradle/APK/package operation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7c'),stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),`spartan-g-phase7c-native-${stamp}-`));
fs.writeFileSync(path.join(docs,`jvm-attempt-${stamp}.json`),JSON.stringify({at:new Date().toISOString(),runtime,localOnly:true},null,2)+'\n',{flag:'wx'});
const cache=path.join(os.homedir(),'.gradle/caches/modules-2/files-2.1');
const jdk='C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.101-hotspot',java=path.join(jdk,'bin/java.exe');
function artifact(group,name,version,suffix='.jar',filename=`${name}-${version}${suffix}`){
 const base=path.join(cache,group,name,version);let matches=[];
 for(const folder of fs.readdirSync(base))for(const file of fs.readdirSync(path.join(base,folder)))if(file===filename)matches.push(path.join(base,folder,file));
 if(matches.length!==1)throw Error(`Approved cached artifact missing/ambiguous: ${name} ${version}`);return matches[0];
}
const libraries={stdlib:artifact('org.jetbrains.kotlin','kotlin-stdlib','2.0.21'),okhttp:artifact('com.squareup.okhttp3','okhttp','4.9.2'),
 okhttpNewer:artifact('com.squareup.okhttp3','okhttp','4.12.0'),okio:artifact('com.squareup.okio','okio','2.9.0','.jar','okio-jvm-2.9.0.jar'),
 okioNewer:artifact('com.squareup.okio','okio-jvm','3.6.0'),annotations:artifact('org.jetbrains','annotations','13.0'),
 react:artifact('com.facebook.react','react-android','0.79.6','-debug.aar')};
const compiler=[artifact('org.jetbrains.kotlin','kotlin-compiler-embeddable','2.0.21'),libraries.stdlib,
 artifact('org.jetbrains.kotlin','kotlin-reflect','2.0.21'),artifact('org.jetbrains.kotlin','kotlin-script-runtime','2.0.21'),
 artifact('org.jetbrains.intellij.deps','trove4j','1.0.20200330'),artifact('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm','1.6.4'),libraries.annotations];
const androidJar=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platforms/android-35/android.jar');
for(const file of [java,androidJar,...Object.values(libraries),...compiler])if(!fs.existsSync(file))throw Error('Missing cached prerequisite; no install/download authorized');
function run(exe,args,name,cwd=root){const result=cp.spawnSync(exe,args,{cwd,windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join(docs,`${name}-${stamp}.log`),(result.stdout??'')+(result.stderr??''),{flag:'wx'});
 if(result.status!==0)throw Error(`${name} failed; inspect phase log`);console.log(`${name}: PASS`);}
run(path.join(jdk,'bin/jar.exe'),['xf',libraries.react,'classes.jar'],'extract-cached-react',runtime);
const core=path.join(root,'apps/mobile/android/app/src/main/java/com/spartang/mobile/garden');
const coreCp=[libraries.stdlib,libraries.okhttp,libraries.okio,libraries.annotations].join(path.delimiter);
const compile=(sources,classpath,out,name,extra=[])=>run(java,['-cp',compiler.join(path.delimiter),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
 '-no-stdlib','-no-reflect','-jvm-target','17','-classpath',classpath,'-d',out,...extra,...sources],name);
const coreClasses=path.join(runtime,'core-classes'),bridgeClasses=path.join(runtime,'bridge-classes');
compile([path.join(core,'GardenHttpClient.kt'),path.join(core,'GardenHttpSettings.kt'),path.join(__dirname,'GardenJvmHarness.kt')],coreCp,coreClasses,'kotlin-core');
compile(fs.readdirSync(core).filter(n=>n.endsWith('.kt')).map(n=>path.join(core,n)),
 [coreCp,androidJar,path.join(runtime,'classes.jar')].join(path.delimiter),bridgeClasses,'kotlin-android-bridge',['-no-jdk']);
const keystore=path.join(runtime,'test-tls.p12');
run(path.join(jdk,'bin/keytool.exe'),['-genkeypair','-alias','local','-keyalg','RSA','-keysize','2048','-validity','2','-storetype','PKCS12',
 '-keystore',keystore,'-storepass','synthetic-local-only','-keypass','synthetic-local-only','-dname','CN=localhost','-ext','SAN=IP:127.0.0.1,DNS:localhost','-noprompt'],'synthetic-tls');
const classpath=[coreClasses,coreCp].join(path.delimiter),entry='com.spartang.mobile.garden.GardenJvmHarnessKt';
run(java,['-cp',classpath,entry,'--export-test-tls',keystore,runtime],'export-synthetic-tls');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const result={at:new Date().toISOString(),node:process.version,java,jdk,classpath,classpathNewer:[coreClasses,libraries.stdlib,libraries.okhttpNewer,libraries.okioNewer,libraries.annotations].join(path.delimiter),
 runtime,entry,keystore,bridgeClasses,androidJar,libraries:Object.fromEntries(Object.entries(libraries).map(([key,file])=>[key,{file,sha256:hash(file)}])),
 passed:true,apkBuilt:false,gradleInvoked:false,dependenciesInstalled:false};
fs.writeFileSync(path.join(docs,'jvm-runtime.json'),JSON.stringify(result,null,2)+'\n');console.log('Offline JVM core and real RN/Android bridge compilation complete.');
