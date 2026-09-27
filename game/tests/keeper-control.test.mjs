import test from 'node:test';
import assert from 'node:assert/strict';
import {createKeeper,applyKeeperAction,updateKeeper,controlledKeeperPose,isStepping,FOOTWORK,KEEPER_SPEED} from '../src/keeper-control.mjs';
import {createBall,launchBall,stepBall,poseCapsules,STEP,keeperPose} from '../src/physics.mjs';
import {sanitizeObservation} from '../src/decision.mjs';

for(const [action,distance]of Object.entries(FOOTWORK))test(`${action} moves the correct distance without a teleport`,()=>{
  const k=createKeeper();assert(applyKeeperAction(k,action,0));assert.equal(k.x,0);
  let previous=0;
  for(let i=0;i<180;i++){updateKeeper(k,STEP);assert(Math.abs(k.x-previous)<=KEEPER_SPEED*STEP+1e-9);previous=k.x;}
  assert.equal(k.x,distance);assert.equal(isStepping(k),false);assert.equal(k.committed,false);
});
test('a repeated step cannot add distance while the keeper is moving',()=>{
  const k=createKeeper();applyKeeperAction(k,'step_right_50',0);updateKeeper(k,STEP);
  assert.equal(applyKeeperAction(k,'step_right_50',.1),false);assert.equal(k.targetX,.5);
  applyKeeperAction(k,'wait',.1);assert.equal(k.targetX,.5);
});
test('a dive can interrupt a step and starts from the current position',()=>{
  const k=createKeeper();applyKeeperAction(k,'step_right_50',0);
  for(let i=0;i<25;i++)updateKeeper(k,STEP);
  const start=k.x;assert(start>0&&start<.5);
  assert(applyKeeperAction(k,'left_low',.2));
  const actual=controlledKeeperPose(k,.4),base=keeperPose('left_low',.2,.4);
  for(const joint of Object.keys(base.joints))assert(Math.abs(actual.joints[joint][0]-base.joints[joint][0]-start)<1e-9);
  assert.equal(applyKeeperAction(k,'right_high',.4),false);
});
test('blocking allows another decision and the keeper stays inside the movement limits',()=>{
  const k=createKeeper();applyKeeperAction(k,'center',0);assert.equal(k.committed,false);
  for(let n=0;n<10;n++){applyKeeperAction(k,'step_right_50',n);for(let i=0;i<180;i++)updateKeeper(k,STEP);}
  assert.equal(k.x,3);assert.equal(createKeeper().x,0);
});
for(const side of [-1,1])test(`a short ${side<0?'left':'right'} step saves a shot which passes the stationary keeper`,()=>{
  function shoot(action){const b=createBall(),k=createKeeper();launchBall(b,side*.65,1.2,.6);let sent=false;
    for(let i=0;i<500;i++){if(b.age>=.18&&!sent){applyKeeperAction(k,action,b.age);sent=true;}updateKeeper(k,STEP);stepBall(b,STEP,poseCapsules(controlledKeeperPose(k,b.age)));}return b;}
  assert.equal(shoot('wait').goal,true);
  const saved=shoot(`step_${side<0?'left':'right'}_50`);assert.equal(saved.goal,false);assert.equal(saved.touched,true);
});
test('flight direction is relative to the keeper, not the goal centre',()=>{
  const o=sanitizeObservation({requestId:1,shotId:1,phase:'flight',elapsed:.1,keeperX:1.2,keeperTargetX:1.2,ballPosition:[.8,1.2,5],ballVelocity:[0,1,-20]});
  assert.equal(o.observedTrajectory.lane,'right');assert.equal(o.observedTrajectory.relativeSide,'left');assert.equal(o.observedTrajectory.lateralReach,'quarter_metre_step');
});
