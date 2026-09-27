import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,stepMatch,DT,passBall} from '../src/match/engine.mjs';
import {actionOptions,teamPlan,distance} from '../src/match/strategy.mjs';
import {applyTeamResponse} from '../src/match/control.mjs';
import {cameraFrame,screenMovement} from '../src/match/camera.mjs';
function owned(){const s=createMatch();s.phase='playing';s.time=1;const p=s.players.find(p=>p.id==='j10');p.x=0;p.z=20;Object.assign(s.ball,{owner:p.id,x:0,z:20,ownedAt:0,lockUntil:0});return {s,p};}
function decision(command){return {command,label:command.label,action:'test',probabilities:{test:1}};}
test('dribbles have continuous direction, speed and a bounded lifetime',()=>{
  const {s,p}=owned(),choices=actionOptions(s,p);assert(Object.keys(choices).filter(k=>k.startsWith('carry_')).length>=4);assert(!choices.shape);
  for(const [key,c]of Object.entries(choices).filter(([k])=>k.startsWith('carry_'))){assert(c.continuous,key);assert(c.runDirection);assert(c.duration<=.65);assert(c.speed>0);assert(c.requiresBall);}
});
test('the end line has no forward carry option and has a way back into play',()=>{
  const {s,p}=owned();p.x=20;p.z=49.5;s.ball.x=20;s.ball.z=49.5;const choices=actionOptions(s,p);assert(!choices.carry_forward);assert(choices.carry_back);assert(choices.carry_left.x<p.x);
});
test('closing down never automatically tackles; tackling is a separate action',()=>{
  const s=createMatch();s.phase='playing';s.time=1;s.ball.lockUntil=0;const human=s.players.find(p=>p.id===s.ball.owner),p=s.players.find(p=>p.id==='j10');p.x=human.x+.9;p.z=human.z;
  const choices=actionOptions(s,p);assert(choices.press);assert(choices.tackle);assert.notEqual(choices.press.type,choices.tackle.type);
  applyTeamResponse(s,{[p.id]:decision(choices.press)},structuredClone(s),80);stepMatch(s,DT);assert.equal(s.stats[1].tackles,0);assert.equal(s.ball.owner,human.id);
  applyTeamResponse(s,{[p.id]:decision(choices.tackle)},structuredClone(s),80);stepMatch(s,DT);assert.equal(s.ball.owner,p.id);
});
test('a new receiver does not carry on with an old positioning order',()=>{
  const {s,p}=owned();s.ball.owner='h10';const c=actionOptions(s,p).shape,observation=structuredClone(s);s.ball.owner=p.id;
  const result=applyTeamResponse(s,{[p.id]:decision(c)},observation,100);assert.equal(result[p.id].applied,false);assert.match(result[p.id].reason,/received/);assert(!s.orders[p.id]);
});
test('possession loss cancels a carry both on receipt and during movement',()=>{
  const {s,p}=owned(),c=actionOptions(s,p).carry_forward,observation=structuredClone(s);applyTeamResponse(s,{[p.id]:decision(c)},observation,100);s.ball.owner='h10';stepMatch(s,DT);assert.notEqual(p.executing.source,'JEV');
  assert.equal(applyTeamResponse(s,{[p.id]:decision(c)},observation,100)[p.id].applied,false);
});
test('old responses and commands that expired in transit cannot move players',()=>{
  const {s,p}=owned(),c=actionOptions(s,p).hold,observation=structuredClone(s);
  assert.equal(applyTeamResponse(s,{[p.id]:decision(c)},observation,850)[p.id].applied,false);
  s.time+=.7;assert.equal(applyTeamResponse(s,{[p.id]:decision(c)},observation,300)[p.id].applied,false);
});
test('a single carry expires without running to the end',()=>{
  const {s,p}=owned();for(const other of s.players)if(other!==p){other.x=25;other.z=-30;}
  const c=actionOptions(s,p).carry_forward,initial={x:p.x,z:p.z};applyTeamResponse(s,{[p.id]:decision(c)},structuredClone(s),100);
  for(let i=0;i<120;i++)stepMatch(s,DT);assert(distance(initial,p)<c.speed*c.duration+.5);assert.equal(p.executing.source,'Waiting');assert.equal(s.ball.owner,p.id);
});
test('a pass keeps a named receiver and a receiving point while the ball travels',()=>{
  const {s,p}=owned(),receiver=s.players.find(p=>p.id==='j7');receiver.x=8;receiver.z=25;assert(passBall(s,p,receiver.id,3));assert.equal(s.ball.receiver,receiver.id);assert.equal(s.ball.passTarget.z,28);const plan=teamPlan(s,1);assert(plan.hasBall);assert.equal(plan.targets[receiver.id].job,'Meet the pass');
});
test('broadcast controls are screen-relative and the wide camera offers more distance',()=>{
  const s=createMatch(),broadcast=cameraFrame(s),wide=cameraFrame(s,'wide'),end=cameraFrame(s,'end');assert(broadcast.position[0]>broadcast.target[0]);assert(wide.position[1]>broadcast.position[1]);assert(end.position[2]>end.target[2]);
  const right=screenMovement(1,0,broadcast.position,broadcast.target),up=screenMovement(0,-1,broadcast.position,broadcast.target);assert(right.z<-.99);assert(up.x<-.99);
  assert(screenMovement(0,-1,end.position,end.target).z<-.99);
});
test('camera target follows ball movement and remains bounded near both goals',()=>{
  const s=createMatch(),a=cameraFrame(s);s.ball.z=48;s.ball.x=31;s.ball.vz=30;const b=cameraFrame(s);assert(b.target[2]>a.target[2]+30);assert(b.target[2]<=49);assert(b.target[0]<=29);s.ball.z=-48;s.ball.vz=-30;assert(cameraFrame(s).target[2]>=-49);
});
