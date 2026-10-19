// Local-only negative probes while app is foreground; no production destination is probed.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {run,identity}=require('./device.cjs'),fw=require('./device-firewall.cjs');const docs=path.resolve(__dirname,'../../docs/garden-phase7d');
async function main(){identity();if(!fw.status().isolated)throw Error('Exact isolation required');let connections=0;const server=net.createServer(s=>{connections++;s.destroy();});await new Promise((r,j)=>{server.once('error',j);server.listen(19097,'127.0.0.1',r);});
try {const before4=run(['shell','su','0','iptables','-nvxL','SG_LGARDEN4']).stdout,before6=run(['shell','su','0','ip6tables','-nvxL','SG_LGARDEN6']).stdout;
const v4=run(['shell','run-as','com.spartang.mobile','/system/bin/toybox','nc','-z','-w','2','10.0.2.2','19097'],true),v6=run(['shell','run-as','com.spartang.mobile','/system/bin/toybox','nc','-6','-z','-w','2','::1','19097'],true);
const after4=run(['shell','su','0','iptables','-nvxL','SG_LGARDEN4']).stdout,after6=run(['shell','su','0','ip6tables','-nvxL','SG_LGARDEN6']).stdout;
const count=s=>Number(s.split(/\r?\n/).find(l=>/\bREJECT\b/.test(l))?.trim().split(/\s+/)[0]);
const result={at:new Date().toISOString(),uid:10207,ipv4Denied:v4.status!==0,ipv6Denied:v6.status!==0,deniedListenerConnections:connections,ipv4RejectPacketsBefore:count(before4),ipv4RejectPacketsAfter:count(after4),ipv6RejectPacketsBefore:count(before6),ipv6RejectPacketsAfter:count(after6),productionDestinationProbed:false};result.passed=result.ipv4Denied&&result.ipv6Denied&&connections===0&&result.ipv4RejectPacketsAfter>result.ipv4RejectPacketsBefore&&result.ipv6RejectPacketsAfter>result.ipv6RejectPacketsBefore;
fs.writeFileSync(path.join(docs,'isolation-connectivity.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.passed)throw Error('Isolation counter check failed');}finally{await new Promise(r=>server.close(r));}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
