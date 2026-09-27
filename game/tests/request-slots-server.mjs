import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createMatch} from '../src/match/engine.mjs';
const port=4321,base=`http://127.0.0.1:${port}`,report={errors:[]};
const server=spawn(process.execPath,['--import','./tests/fixtures/jev-upstream.mjs','server.mjs'],{env:{...process.env,PORT:String(port),JEV_API_KEY:'isolated-test-key'},stdio:['ignore','pipe','pipe']});
let output='';server.stderr.on('data',d=>output+=d);
try{
 await Promise.race([once(server.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Test server did not start: '+output)),4000))]);
 const state=createMatch();state.requestId=1;
 const request=(id,signal)=>fetch(base+'/api/team-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...state,requestId:id}),signal});
 const responses=await Promise.all([1,2,3,4].map(id=>request(id)));report.overlapStatuses=responses.map(r=>r.status);assert.deepEqual(report.overlapStatuses,[200,200,200,200]);
 const controller=new AbortController();const cancelled=request(5,controller.signal).catch(e=>e.name),other=[request(6),request(7)];
 await new Promise(r=>setTimeout(r,40));controller.abort();const replacement=request(8);await cancelled;
 report.replacementStatuses=(await Promise.all([...other,replacement])).map(r=>r.status);assert.deepEqual(report.replacementStatuses,[200,200,200]);
 report.diagnostics=await (await fetch(base+'/api/diagnostics')).json();assert.equal(report.diagnostics.active,0);assert.equal(report.diagnostics.waiting,0);assert(report.diagnostics.recent.some(r=>r.code==='CLIENT_CANCELLED'));
}catch(e){report.errors.push(e.stack);process.exitCode=1;}
finally{server.kill();await once(server,'exit');await writeFile('artifacts/request-slots-server.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
