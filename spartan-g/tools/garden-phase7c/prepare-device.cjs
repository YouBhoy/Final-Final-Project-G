// Copy existing tested local-only tooling; keep earlier phase evidence unchanged.
const fs=require('node:fs'),path=require('node:path');
for(const n of ['device-firewall.cjs','device-checks.cjs','start.cjs']){
 let s=fs.readFileSync(path.join(__dirname,'../garden-mobile-phase4',n),'utf8')
  .replaceAll('docs/garden-mobile-phase4','docs/garden-phase7c')
  .replaceAll('spartan-g-garden-mobile-phase4','spartan-g-garden-phase7c-device')
  .replaceAll('spartan-phase4-garden-firewall.json','spartan-phase7c-garden-firewall.json');
 if(n==='start.cjs')s=s.replace("path.join(__dirname, 'firebase.json')","path.join(__dirname, 'device-firebase.json')")
  .replace('PATH: `C:', 'PATH: `${path.dirname(process.execPath)};C:');
 fs.writeFileSync(path.join(__dirname,n),s,{flag:'wx'});
}
fs.copyFileSync(path.join(__dirname,'../garden-mobile-phase4/firebase.json'),path.join(__dirname,'device-firebase.json'),fs.constants.COPYFILE_EXCL);
console.log('Four local-only device tooling files prepared; no Android operation performed.');
