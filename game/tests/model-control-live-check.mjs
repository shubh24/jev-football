import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createMatch} from '../src/match/engine.mjs';
const base=process.env.JEV_TEST_URL||'http://127.0.0.1:4318',report=[];
for(const scenario of ['open run','shooting position','pressure','keeper movement','keeper shot']){
 const s=createMatch();s.time=1;s.requestId=1;s.phase='playing';const p=s.players[20];p.x=0;p.z=scenario==='shooting position'?38:12;s.ball.owner=p.id;s.ball.x=p.x;s.ball.z=p.z;
 for(const q of s.players.filter(q=>q.team===0&&q.role!=='GK')){q.x=q.x<0?-26:26;q.z=-10;}
 if(scenario==='pressure'){s.players[7].x=0;s.players[7].z=13;s.players[21].x=8;s.players[21].z=20;}
 if(scenario==='keeper movement'){s.ball.x=20;p.x=20;const k=s.players[0];k.x=-2;k.keeper.x=k.keeper.targetX=-2;}
 if(scenario==='keeper shot')Object.assign(s.ball,{owner:null,x:0,z:40,y:.2,vx:-3,vz:22,vy:1.2,version:s.ball.version+1});
 const keeper=scenario.startsWith('keeper'),start=performance.now(),res=await fetch(base+`/api/${keeper?'keeper':'team'}-decision`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)}),data=await res.json();
 const row={scenario,roundTripMs:Math.round(performance.now()-start),status:res.status,...data};report.push(row);await writeFile('artifacts/model-control-live-check.json',JSON.stringify(report,null,2));
 assert(res.ok,JSON.stringify(data));assert.equal(data.controlVersion,2);assert(Object.values(data.decisions).every(d=>d.command.parameterized));
 console.log(JSON.stringify({scenario,roundTripMs:row.roundTripMs,stages:data.stages,decisions:Object.fromEntries(Object.entries(data.decisions).filter(([id])=>keeper||id==='j10').map(([id,d])=>[id,{action:d.action,parameters:Object.fromEntries(Object.entries(d.parameters).map(([k,a])=>[k,a.label]))}]))}));
}
