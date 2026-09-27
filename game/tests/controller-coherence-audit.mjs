// Diagnostic only: measure current controls without changing the live policy.
import {writeFile} from 'node:fs/promises';
import {createMatch,stepMatch,DT} from '../src/match/engine.mjs';
import {buildIntentRequest,buildParameterRequest,readIntents,compileModelCommands} from '../src/match/model-control.mjs';
import {applyTeamResponse} from '../src/match/control.mjs';
const report={at:new Date().toISOString(),scenarios:[]};
const answers=(questions,selected={})=>({answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const choice=selected[id]||Object.keys(q.criteria)[0];return [id,{type:'choice',choice,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))});
function fixture(name){
 const s=createMatch();s.phase='playing';s.time=2;s.requestId=1;
 const p=s.players.find(p=>p.id==='j10');p.x=name==='wide attack'?26:0;p.z=name==='clear shooting position'?38:12;
 Object.assign(s.ball,{owner:p.id,x:p.x,z:p.z,lockUntil:0});
 if(name==='open attack'||name==='clear shooting position')for(const q of s.players.filter(p=>p.team===0&&p.role!=='GK')){q.x=q.x<0?-26:26;q.z=-10;}
 if(name==='defend wide carrier'){const q=s.players.find(p=>p.id==='h10');q.x=24;q.z=-10;Object.assign(s.ball,{owner:q.id,x:q.x,z:q.z});}
 if(name==='loose forward pass')Object.assign(s.ball,{owner:null,lastTouch:1,receiver:null,x:0,z:12,vx:0,vz:14});
 return s;
}
for(const scenario of ['open attack','wide attack','clear shooting position','defend wide carrier','loose forward pass']){
 const state=fixture(scenario),request=buildIntentRequest(state),start=performance.now();
 const response=await fetch('http://127.0.0.1:4318/api/team-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)}),data=await response.json();
 const row={scenario,status:response.status,elapsedMs:Math.round(performance.now()-start),state,observation:request.body.state,decisions:data.decisions,error:data.error};report.scenarios.push(row);
 console.log(JSON.stringify({scenario,status:row.status,elapsedMs:row.elapsedMs,players:Object.fromEntries(Object.entries(data.decisions||{}).map(([id,d])=>[id,{action:d.action,angle:d.command.angleDegrees,metres:d.command.distance,speed:d.command.speed,aim:d.command.aimPoint,power:d.command.kickSpeed,elevation:d.command.elevationDegrees}]))}));
 if(!response.ok)break;
}
const s=fixture('open attack'),p=s.players.find(p=>p.id==='j10');p.x=0;p.z=0;s.ball.x=0;s.ball.z=0;
const observation=structuredClone(s),first=buildIntentRequest(observation),intents=readIntents(answers(first.body.questions,{intent_j10:'run'}),first),second=buildParameterRequest(observation,intents),d=compileModelCommands(observation,intents,second,answers(second.body.questions,{j10_direction:'dir_0',j10_distance:'metres_2',j10_speed:'speed_6'})).j10;
s.orders.j10={command:{type:'move',x:0,z:16,speed:6,continuous:true,controlVersion:2,requiresBall:true},expires:s.time+1.2,used:false,source:'JEV'};
for(let i=0;i<72;i++)stepMatch(s,DT);
const before={z:p.z,vz:p.vz};const accepted=applyTeamResponse(s,{j10:d},observation,600).j10;
for(let i=0;i<24;i++)stepMatch(s,DT);
report.delayedForwardRun={delayMs:600,selectedBearing:d.command.angleDegrees,selectedDistance:d.command.distance,targetZ:d.command.z,before,after:{z:p.z,vz:p.vz},accepted:accepted.applied,reversed:p.vz<0};
console.log(JSON.stringify({delayedForwardRun:report.delayedForwardRun}));
await writeFile('artifacts/controller-coherence-audit.json',JSON.stringify(report,null,2));
