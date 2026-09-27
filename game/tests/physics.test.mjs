import test from 'node:test';
import assert from 'node:assert/strict';
import {createBall,launchBall,stepBall,STEP,keeperPose,poseCapsules} from '../src/physics.mjs';
import {sanitizeObservation,buildDecisionRequest,validateDecision,ACTIONS} from '../src/decision.mjs';

function simulate(x,y,power,capsules=[]) {
  const ball=createBall();launchBall(ball,x,y,power);
  const events=[];
  for(let i=0;i<500;i++) events.push(...stepBall(ball,STEP,capsules));
  return {ball,events};
}
test('an unobstructed shot inside the goal scores and reaches the net',()=>{
  const {ball,events}=simulate(2,1.4,.75);
  assert.equal(ball.goal,true);assert(events.some(e=>e.type==='net'));
});
test('shots outside and above the frame do not score',()=>{
  assert.equal(simulate(4.4,1.2,.8).ball.goal,false);
  assert.equal(simulate(0,3.2,.8).ball.goal,false);
});
test('a post hit changes ball velocity through contact',()=>{
  const {events}=simulate(3.66,1,.8);
  assert(events.some(e=>e.type==='post'));
});
test('a standing keeper blocks a central body shot',()=>{
  const {ball,events}=simulate(0,1.2,.7,poseCapsules(keeperPose('center',.3,0)));
  assert(events.some(e=>e.type==='save'));assert.equal(ball.goal,false);
});
test('a keeper on the wrong side cannot stop a corner shot',()=>{
  assert.equal(simulate(2.9,.5,.85,poseCapsules(keeperPose('left_low',.4,0))).ball.goal,true);
});
test('a high-speed ball does not pass through a post between steps',()=>{
  const ball=createBall();ball.active=true;ball.position=[3.66,1,1];ball.velocity=[0,0,-150];
  assert(stepBall(ball,.02).some(e=>e.type==='post'));
});
for(const side of [-1,1])for(const height of ['low','high']){
  test(`a ${side<0?'left':'right'} ${height} dive reaches the correct ball height after a 200 ms response`,()=>{
    const ball=createBall();launchBall(ball,side*2.1,height==='low'?.45:1.85,.6);
    const action=`${side<0?'left':'right'}_${height}`;
    for(let i=0;i<500;i++){
      const pose=keeperPose(ball.age>.2?action:'wait',Math.max(0,ball.age-.2),ball.age);
      stepBall(ball,STEP,poseCapsules(pose));
    }
    assert.equal(ball.touched,true);assert.equal(ball.goal,false);
  });
}
test('low and high dives place the gloves at different heights',()=>{
  const low=keeperPose('right_low',.23,0),high=keeperPose('right_high',.23,0);
  assert(Math.max(low.joints.handL[1],low.joints.handR[1])<.85);
  assert(Math.max(high.joints.handL[1],high.joints.handR[1])>1.75);
});
test('the whole ball must cross the goal line and the goal event occurs once',()=>{
  const ball=createBall();ball.active=true;ball.position=[2,1,-.05];ball.velocity=[0,0,-2];
  assert(!stepBall(ball,.01).some(e=>e.type==='goal'));assert.equal(ball.goal,false);
  let goals=0;for(let i=0;i<150;i++)goals+=stepBall(ball,STEP).filter(e=>e.type==='goal').length;
  assert.equal(goals,1);assert.equal(ball.goal,true);
});
test('a ball can rebound off the post and still count as a goal',()=>{
  const {ball,events}=simulate(3.49,1.2,.7);
  assert.equal(ball.post,true);assert.equal(ball.goal,true);
  assert.equal(events.filter(e=>e.type==='goal').length,1);
});
test('goalkeeper contact does not cancel a ball that subsequently enters the goal',()=>{
  const {ball,events}=simulate(.22,1.2,.7,poseCapsules(keeperPose('center',.3,0)));
  assert.equal(ball.touched,true);assert.equal(ball.goal,true);
  assert.equal(events.filter(e=>e.type==='goal').length,1);
});
test('the crossbar has a working collision shape',()=>{
  const {events}=simulate(0,2.44,.7);
  assert(events.some(e=>e.type==='post'));
});
test('the JEV observation removes private aim and calculates flight cues in code',()=>{
  const input={requestId:1,shotId:1,phase:'flight',elapsed:.1,keeperX:0,visibleLean:'balanced',history:[],ballPosition:[.2,.5,8],ballVelocity:[5,3,-25],aim:[3,2],power:.9};
  const observation=sanitizeObservation(input);
  assert(!('aim' in observation));assert(!('power' in observation));
  assert.equal(observation.observedTrajectory.lane,'right');
  assert(!JSON.stringify(buildDecisionRequest(observation)).includes('"aim"'));
});
test('invalid observations and model responses are rejected',()=>{
  assert.throws(()=>sanitizeObservation({phase:'flight',requestId:NaN}));
  assert.throws(()=>validateDecision({answers:{response:{type:'choice',choice:'teleport'}}}));
  const probabilities=Object.fromEntries(Object.keys(ACTIONS).map(k=>[k,k==='wait'?1:0]));
  assert.equal(validateDecision({answers:{response:{type:'choice',choice:'wait',probabilities,confidence:1}}}).action,'wait');
});
