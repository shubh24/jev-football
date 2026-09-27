import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createMatch,stepMatch,DT} from '../src/match/engine.mjs';
import {direction} from '../src/match/strategy.mjs';
import {applyTeamResponse} from '../src/match/control.mjs';
const report=[];
for(const team of [0,1])for(const [x,height,expected]of [[-2.1,.45,'left_low'],[2.1,.45,'right_low'],[-2.1,1.85,'left_high'],[2.1,1.85,'right_high'],[-.45,1.2,'step_left_25'],[.75,1.2,'step_right_50']]){
 const s=createMatch();s.phase='playing';s.requestId=1;s.time=1;for(const p of s.players)if(p.role!=='GK'){p.x=25;p.z=0;}
 const p=s.players.find(p=>p.team===team&&p.role==='GK'),dir=direction(team),t=.5;
 Object.assign(s.ball,{owner:null,version:s.ball.version+1,x:0,z:p.z+dir*11,y:.11,vx:x/t,vz:-dir*22,vy:(height-.11+4.905*t*t)/t,lockUntil:0,lastTouch:1-team});
 const observation=structuredClone(s),started=performance.now(),response=await fetch('http://127.0.0.1:4317/api/keeper-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)}),data=await response.json(),roundTripMs=performance.now()-started;
 assert(response.ok,JSON.stringify(data));assert.equal(Object.keys(data.decisions).length,2);
 for(let i=0;i<Math.ceil(roundTripMs/1000/DT)&&s.phase==='playing';i++)stepMatch(s,DT);
 const applied=s.phase==='playing'?applyTeamResponse(s,data.decisions,observation,roundTripMs):{};
 for(let i=0;i<150&&s.phase==='playing';i++)stepMatch(s,DT);
 const row={team,expected,actual:data.decisions[p.id].action,roundTripMs:Math.round(roundTripMs),applied:applied[p.id]?.applied,reason:applied[p.id]?.reason,scores:s.scores,contact:s.events.some(e=>e.text===`${p.id.toUpperCase()} contacts the ball`||e.text===`${p.id.toUpperCase()} receives`),keeperX:p.x,decisions:data.decisions};report.push(row);console.log(JSON.stringify({...row,decisions:undefined}));
}
await writeFile('artifacts/keeper-live-check.json',JSON.stringify(report,null,2));assert(report.every(r=>r.actual===r.expected),'Some choices differ from the test expectation.');
