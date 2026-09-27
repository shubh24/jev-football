import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,stepMatch,updateBall,DT,kickoff,passBall,shootBall,tackle,switchPlayer,changeStrategy,keeperMatchPose} from '../src/match/engine.mjs';
import {teamPlan,actionOptions,direction} from '../src/match/strategy.mjs';
import {sanitizeTeamState,buildTeamRequest,validateTeamDecision} from '../src/match/decision.mjs';
const snapshot=s=>({...s,requestId:1});
test('a match has 11 players per side and starts with a human kick-off',()=>{const s=createMatch();assert.equal(s.players.filter(p=>p.team===0).length,11);assert.equal(s.players.filter(p=>p.team===1).length,11);assert.equal(s.ball.owner,s.selected);assert.equal(s.phase,'ready');});
test('Attack assigns two pressers; other plans assign one and retain different shapes',()=>{
  const s=createMatch();const possession=teamPlan(s,1);assert.equal(possession.pressers.length,1);
  changeStrategy(s,1,'attack');const attack=teamPlan(s,1);assert.equal(attack.pressers.length,2);
  changeStrategy(s,1,'defend');const defend=teamPlan(s,1);assert.equal(defend.pressers.length,1);assert(attack.targets.j2.z>defend.targets.j2.z+10);
  for(const id of ['j3','j4'])assert(attack.targets[id].z<s.ball.z);
});
for(const sign of [-1,1])test(`whole-ball crossing at goal ${sign} scores once and restarts for the conceding team`,()=>{
  const s=createMatch('practice');s.phase='playing';for(const p of s.players){p.x=25;p.z=0;}
  Object.assign(s.ball,{owner:null,x:0,y:1,z:sign*52.55,vx:0,vy:0,vz:sign*10});
  updateBall(s,.001);assert.deepEqual(s.scores,[0,0]);
  for(let i=0;i<5&&s.phase==='playing';i++)updateBall(s,DT);
  const team=sign===-1?0:1;assert.equal(s.scores[team],1);assert.equal(s.phase,'goal');
  for(let i=0;i<50;i++)stepMatch(s,DT);assert.equal(s.scores[team],1);
  for(let i=0;i<300&&s.phase==='goal';i++)stepMatch(s,DT);
  assert.equal(s.phase,'playing');assert.equal(s.players.find(p=>p.id===s.ball.owner).team,1-team);
});
test('wide shots and high shots rebound without a corner or a goal',()=>{
  for(const [x,y]of [[7,1],[0,3]]){const s=createMatch();for(const p of s.players){p.x=25;p.z=0;}Object.assign(s.ball,{owner:null,x,y,z:52,vx:0,vy:0,vz:30});for(let i=0;i<10;i++)updateBall(s,DT);assert.deepEqual(s.scores,[0,0]);assert(s.ball.vz<0);assert(s.ball.z<52.5);}
});
test('a fast ball rebounds from the goal post',()=>{const s=createMatch();for(const p of s.players){p.x=25;p.z=0;}Object.assign(s.ball,{owner:null,x:3.66,y:1,z:51,vx:0,vy:0,vz:150});updateBall(s,.02);assert(s.ball.vz<0);assert.deepEqual(s.scores,[0,0]);});
for(const team of [0,1])test(`keeper ${team} faces the field and blocks a central incoming shot`,()=>{
  const s=createMatch(),keeper=s.players.find(p=>p.team===team&&p.role==='GK'),dir=direction(team);const pose=keeperMatchPose(keeper,0);assert.equal(pose.front,dir);assert((pose.joints.handL[2]-keeper.z)*dir>0);
  for(const p of s.players)if(p!==keeper){p.x=25;p.z=0;}
  Object.assign(s.ball,{owner:null,x:0,y:1.1,z:keeper.z+dir*3,vx:0,vy:0,vz:-dir*28});for(let i=0;i<35;i++)updateBall(s,DT);assert.deepEqual(s.scores,[0,0]);assert(s.ball.vz*dir>0);
});
test('pass and shot controls release the ball and update separate counters',()=>{
  const s=createMatch(),p=s.players.find(p=>p.id===s.selected);assert(passBall(s,p,'h7'));assert.equal(s.ball.owner,null);assert.equal(s.stats[0].passes,1);assert(!shootBall(s,p));kickoff(s,0);assert(shootBall(s,p,2));assert.equal(s.stats[0].shots,1);assert(s.ball.vz<0);
});
test('a tackle cannot be reversed immediately by the dispossessed player',()=>{
  const s=createMatch();s.time=2;const owner=s.players.find(p=>p.id===s.ball.owner),opponent=s.players.find(p=>p.id==='j10');opponent.x=owner.x+.8;opponent.z=owner.z;assert(tackle(s,opponent));assert.equal(s.ball.owner,opponent.id);assert.equal(tackle(s,owner),false);
});
test('switch selects the nearest human outfield player',()=>{const s=createMatch();s.ball.x=s.players[5].x;s.ball.z=s.players[5].z;assert.equal(switchPlayer(s).id,'h6');});
test('dribbling towards a boundary keeps the whole ball inside the pitch',()=>{const s=createMatch(),p=s.players.find(p=>p.id===s.ball.owner);p.x=33.4;p.heading=Math.PI/2;updateBall(s,DT);assert(s.ball.x<=34-.11);});
test('halftime and full time stop play; a strategy change invalidates old orders',()=>{
  const s=createMatch();s.phase='playing';s.time=89.999;stepMatch(s,DT);assert.equal(s.phase,'halftime');assert.equal(s.half,2);assert.equal(s.ball.owner,'j10');const time=s.time;stepMatch(s,DT);assert.equal(s.time,time);
  s.orders={j1:{command:{type:'hold'},expires:200}};changeStrategy(s,1,'attack');assert.deepEqual(s.orders,{});assert.equal(s.planVersion,1);
  s.phase='playing';s.time=179.999;stepMatch(s,DT);assert.equal(s.phase,'finished');
});
test('practice teams pass the ball and remain inside the pitch over 30 seconds',()=>{
  const s=createMatch('practice');s.phase='playing';for(let i=0;i<30/DT;i++)stepMatch(s,DT,{autoHuman:true});assert(s.stats[0].passes+s.stats[1].passes>3);
  assert(s.players.every(p=>Number.isFinite(p.x)&&Math.abs(p.x)<=34&&Math.abs(p.z)<=52.5));assert(Number.isFinite(s.ball.y));
});
test('the team API uses 10 bounded outfield choices and excludes private human input',()=>{
  const raw=createMatch();raw.aim={x:3,z:52};raw.keys=['w'];const s=sanitizeTeamState(snapshot(raw)),built=buildTeamRequest(s);
  assert.equal(Object.keys(built.body.questions).length,10);assert(!('aim'in s));assert(!('keys'in s));
  const answers={};for(const [id,choices]of Object.entries(built.choices)){const action=Object.keys(choices)[0];answers[`player_${id}`]={type:'choice',choice:action,probabilities:Object.fromEntries(Object.keys(choices).map(k=>[k,k===action?1:0])),confidence:1};}
  assert.equal(Object.keys(validateTeamDecision({answers},built.choices)).length,10);
  answers.player_j2.choice='teleport';assert.throws(()=>validateTeamDecision({answers},built.choices));
  raw.players[0].x=NaN;assert.throws(()=>sanitizeTeamState(snapshot(raw)));
});
