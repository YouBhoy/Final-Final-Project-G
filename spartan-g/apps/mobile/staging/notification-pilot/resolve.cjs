'use strict';
// Only the reviewed local public plan can change this opt-in. No ambient flag or URL override.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require(require.resolve('typescript',{paths:[path.resolve(__dirname,'../..')]})),m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'policy.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,URL});
function pilot(profile,plan=require('./approved.json')) { return m.exports.validatePilot(plan,profile); }
module.exports={pilot};
