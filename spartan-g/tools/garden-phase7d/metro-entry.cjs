// Only this owned Expo process: pass the existing server's host option explicitly.
// No installed package, global socket API, Android setting or other process is changed.
const path=require('node:path');const root=path.resolve(__dirname,'../..');
const file=path.join(root,'node_modules/@expo/cli/build/src/start/server/metro/runServer-fork.js');
const original=require(file);require.cache[file].exports={...original,runServer(...args){args[2]={...args[2],host:'127.0.0.1'};return original.runServer(...args);}};
process.argv=[process.execPath,path.join(root,'node_modules/expo/bin/cli'),'start','--dev-client','--localhost','--port','8083'];
require(path.join(root,'node_modules/expo/bin/cli'));
