// TEST CHILD PROCESS ONLY. No OS, Android, production server or installed-package change.
// Block socket destinations other than this run's exact loopback fixture ports.
const net=require('node:net');const ports=new Set([1,10000,10001,10002,18088,19097]);const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){let value=Array.isArray(args[0])?args[0]:args;let options=value[0];if(typeof options==='number'||typeof options==='string')options={port:options,host:typeof value[1]==='string'?value[1]:'localhost'};
const host=options?.host||'localhost',port=Number(options?.port);if(!['localhost','127.0.0.1','::1'].includes(host)||!ports.has(port)||options?.path){const e=Error('Synthetic hosting test blocked a nonlocal destination');e.code='SPARTAN_TEST_NONLOCAL_BLOCKED';throw e;}return original.apply(this,args);};
