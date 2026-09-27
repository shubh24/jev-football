import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,stepMatch,DT} from '../src/match/engine.mjs';
import {actionOptions} from '../src/match/strategy.mjs';
import {applyTeamResponse} from '../src/match/control.mjs';
function fixture(){const s=createMatch();s.phase='playing';s.time=1;for(const p of s.players)if(p.role!=='GK'){p.x=25;p.z=-40;}const p=s.players.find(p=>p.id==='j10');p.x=0;p.z=-20;s.ball.owner=p.id;s.ball.x=0;s.ball.z=p.z;return {s,p};}
function apply(s,p,key,observation=structuredClone(s),ms=0){const command=actionOptions(observation,observation.players.find(q=>q.id===p.id))[key];return applyTeamResponse(s,{[p.id]:{action:key,command}},observation,ms)[p.id];}
for(const latency of [150,300,550])test(`repeated runs keep speed through ${latency} ms response handoffs`,()=>{
 const {s,p}=fixture();let first,minimum=Infinity;
 for(let n=0;n<8;n++){
  const observation=structuredClone(s);
  for(let i=0;i<Math.ceil(latency/1000/DT);i++){stepMatch(s,DT);if(first&&s.time>first+.5)minimum=Math.min(minimum,Math.hypot(p.vx,p.vz));}
  const before=p.vz,result=apply(s,p,'carry_forward',observation,latency);assert(result.applied);assert.equal(p.vz,before);assert(result.command.z>p.z+3);first??=s.time;
 }
 assert(minimum>4.6,`Unexpected speed dip: ${minimum}`);
});
test('a hold replaces a run, while loss of response stops it at its time limit',()=>{
 for(const stop of ['hold','timeout']){const {s,p}=fixture();apply(s,p,'carry_forward');for(let i=0;i<50;i++)stepMatch(s,DT);assert(p.vz>4.6);if(stop==='hold')apply(s,p,'hold');for(let i=0;i<130;i++)stepMatch(s,DT);assert(Math.hypot(p.vx,p.vz)<.02,stop);}
});
test('a delayed run is rebased, but stale shots are still rejected',()=>{
 const {s,p}=fixture();const observation=structuredClone(s);s.time+=.5;p.z+=2;const result=apply(s,p,'carry_forward',observation,500);assert(result.applied);assert(result.expires>s.time+.6);assert(result.command.z>p.z+4);
 const old=structuredClone(s),command={type:'shoot',requiresBall:true,x:0,power:.6,height:.5,duration:.3};s.time+=.4;assert.equal(applyTeamResponse(s,{[p.id]:{command}},old,400)[p.id].applied,false);
});
test('chase commands keep speed towards the ball instead of stopping at short waypoints',()=>{
 const {s,p}=fixture();s.ball.owner='h10';const carrier=s.players.find(q=>q.id==='h10');carrier.x=0;carrier.z=10;s.ball.x=0;s.ball.z=10;
 let minimum=Infinity;
 for(let n=0;n<8;n++){
  const observation=structuredClone(s),command=actionOptions(observation,observation.players.find(q=>q.id===p.id)).press;
  assert(command?.continuous);assert(Math.abs(command.z-observation.ball.z)<1e-10);
  for(let i=0;i<36;i++){stepMatch(s,DT);if(s.time>2)minimum=Math.min(minimum,Math.hypot(p.vx,p.vz));}
  const before=p.vz;assert(applyTeamResponse(s,{[p.id]:{action:'press',command}},observation,300)[p.id].applied);assert.equal(p.vz,before);
 }
 assert(minimum>6.9,`Unexpected chase speed dip: ${minimum}`);
});
