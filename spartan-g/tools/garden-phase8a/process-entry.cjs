// Windows-friendly test IPC for the existing exported graceful stop. Not a hosting entry.
const {startExternalGarden}=require(process.env.SPARTAN_TEST_ENTRY);
startExternalGarden().then(api=>{if(process.send)process.send({ready:true,address:api.server.address()});process.on('message',async m=>{if(m!=='synthetic-stop')return;try{await api.stop();if(process.send)process.send({stopped:true});process.disconnect();}catch{process.exitCode=1;process.disconnect();}});}).catch(()=>{console.error('Synthetic hosting startup failed');process.exitCode=1;if(process.connected)process.disconnect();});
