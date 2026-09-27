import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createMatch} from '../src/match/engine.mjs';
const report=[];
for(const name of ['clear-shot','end-line','tackle']){
 const state=createMatch();state.requestId=1;state.time=10;
 const p=state.players.find(p=>p.id==='j10');
 for(const q of state.players.filter(q=>q.team===0&&q.role!=='GK')){q.x=27;q.z=-25;}
 if(name==='clear-shot')Object.assign(p,{x:0,z:37});
 if(name==='end-line'){Object.assign(p,{x:20,z:49.5});Object.assign(state.players.find(q=>q.id==='j11'),{x:5,z:44});}
 if(name==='tackle'){Object.assign(p,{x:.8,z:0});Object.assign(state.players.find(q=>q.id==='h10'),{x:0,z:0});}
 Object.assign(state.ball,{owner:name==='tackle'?'h10':'j10',x:name==='tackle'?0:p.x,z:p.z,lastTouch:name==='tackle'?0:1});
 const start=performance.now(),r=await fetch('http://127.0.0.1:4317/api/team-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)}),d=await r.json();assert(r.ok,JSON.stringify(d));
 const chosen=d.decisions.j10;report.push({name,roundTripMs:Math.round(performance.now()-start),...d});
 console.log(JSON.stringify({name,action:chosen.action,latencyMs:d.latencyMs,choices:Object.keys(chosen.options)}));
 assert.equal(Object.keys(d.decisions).length,10);
 if(name==='clear-shot')assert(chosen.action.startsWith('shoot'));
 if(name==='end-line')assert(!('carry_forward' in chosen.options));
 if(name==='tackle'){assert('tackle' in chosen.options);assert.equal(chosen.action,'tackle');}
}
await writeFile('artifacts/team-action-check.json',JSON.stringify(report,null,2));
