import {createMatch,stepMatch,DT,updateBall} from '../src/match/engine.mjs';
import {applyTeamResponse} from '../src/match/control.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const report={fixtures:[],sequence:[]};let requestId=0;
async function ask(state){const input={...structuredClone(state),requestId:++requestId};const started=performance.now(),response=await fetch('http://127.0.0.1:4317/api/team-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),data=await response.json();assert(response.ok,JSON.stringify(data));return {input,data,roundTripMs:Math.round(performance.now()-started)};}
for(const [name,z]of [['open-space',12],['shooting-position',34],['under-pressure',12]]){
 const s=createMatch();s.time=1;const p=s.players[20];p.x=0;p.z=z;for(const q of s.players.filter(p=>p.team===0&&p.role!=='GK')){q.x=q.x<0?-25:25;q.z=10;}
 s.ball.owner=p.id;s.ball.x=0;s.ball.z=z;
 if(name==='under-pressure'){Object.assign(s.players[6],{x:0,z:14});Object.assign(s.players[21],{x:8,z:21});}
 const r=await ask(s),d=r.data.decisions[p.id];report.fixtures.push({name,action:d.action,roundTripMs:r.roundTripMs,decisions:r.data.decisions});console.log(JSON.stringify({name,action:d.action,runners:Object.entries(r.data.decisions).filter(([id,d])=>d.action==='run_attack').map(([id])=>id)}));
 assert(name==='open-space'?['drive_goal','sprint','carry_forward'].includes(d.action):name==='under-pressure'?d.command.type==='pass':d.action.startsWith('shoot'));
}
// Follow a bounded attack in the real engine. Argentina outfield players use
// local rules; both keepers stay on their physical standing poses in this
// test so this run measures outfield attacking behaviour, not keeper skill.
const s=createMatch();s.time=1;s.phase='playing';s.ball.owner='j10';s.ball.x=0;s.ball.z=12;s.players[20].x=0;s.players[20].z=12;
for(const q of s.players.filter(p=>p.team===0&&p.role!=='GK')){q.x=q.x<0?-25:25;}
const start=structuredClone(s);
for(let n=0;n<65&&s.phase==='playing'&&s.stats[1].shots===0;n++){
 const r=await ask(s);for(let i=0;i<Math.ceil(r.roundTripMs/1000/DT)&&s.phase==='playing';i++)stepMatch(s,DT,{autoHuman:true});
 const applied=applyTeamResponse(s,r.data.decisions,r.input,r.roundTripMs);report.sequence.push({time:s.time,owner:r.input.ball.owner,ballZ:s.ball.z,roundTripMs:r.roundTripMs,decisions:applied});
 for(let i=0;i<6&&s.phase==='playing';i++)stepMatch(s,DT,{autoHuman:true});
}
report.start=start;report.end=s;await writeFile('artifacts/attack-live-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({responses:report.sequence.length,stats:s.stats,scores:s.scores,ball:s.ball,events:s.events}));assert(s.stats[1].shots>0,'The bounded attack did not produce a shot.');
