import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,shootBall,passBall,tackle,updateBall,stepMatch,DT} from '../src/match/engine.mjs';
import {SoundDirector,dangerLevel} from '../src/match/sound-director.mjs';

test('sound reports a completed shot once and does not change match state',()=>{
  const s=createMatch();s.phase='playing';const director=new SoundDirector();director.update(s);
  assert(shootBall(s,s.players.find(p=>p.id===s.selected)));
  const before=structuredClone(s),frame=director.update(s);
  assert.equal(frame.cues.filter(c=>c.type==='shot').length,1);assert.deepEqual(s,before);
  assert.equal(director.update(s).cues.length,0);
});
test('a teammate receiving a pass does not count as a change of team possession',()=>{
  const s=createMatch();s.phase='playing';const director=new SoundDirector();director.update(s);
  passBall(s,s.players.find(p=>p.id===s.selected),'h7');director.update(s);
  s.ball.owner='h7';assert(!director.update(s).cues.some(c=>c.type==='possession'));
  s.time=4;s.ball.owner='j7';assert.equal(director.update(s).cues.filter(c=>c.type==='possession').length,1);
});
test('a successful tackle has one reaction, with no duplicate possession reaction',()=>{
  const s=createMatch();s.phase='playing';s.time=2;const director=new SoundDirector();director.update(s);
  const owner=s.players.find(p=>p.id===s.ball.owner),other=s.players.find(p=>p.id==='j10');other.x=owner.x+.8;other.z=owner.z;
  assert(tackle(s,other));const cues=director.update(s).cues;assert.equal(cues.filter(c=>c.type==='tackle').length,1);assert(!cues.some(c=>c.type==='possession'));
});
test('danger rises near the correct goal and resets outside active play',()=>{
  const s=createMatch();s.phase='playing';const far=dangerLevel(s);s.ball.x=0;s.ball.z=-43;assert(dangerLevel(s)>far+.7);
  s.ball.z=43;assert.equal(dangerLevel(s),0);s.ball.z=-43;s.phase='paused';assert.equal(dangerLevel(s),0);
});
test('only a goal-line crossing causes a goal sound, once across the restart delay',()=>{
  const s=createMatch();s.phase='playing';for(const p of s.players){p.x=25;p.z=0;}
  const director=new SoundDirector();director.update(s);
  Object.assign(s.ball,{owner:null,x:0,y:1,z:-52.55,vx:0,vy:0,vz:-10});updateBall(s,.001);
  assert(!director.update(s).cues.some(c=>c.type==='goal'));
  let count=0;for(let i=0;i<100;i++){stepMatch(s,DT);count+=director.update(s).cues.filter(c=>c.type==='goal').length;}
  assert.equal(count,1);assert.equal(s.scores[0],1);
});
test('a real post collision produces a post sound; goalkeeper movement alone is silent',()=>{
  const s=createMatch();s.phase='playing';for(const p of s.players){p.x=25;p.z=0;}
  const director=new SoundDirector();director.update(s);
  Object.assign(s.ball,{owner:null,x:3.66,y:1,z:51,vx:0,vy:0,vz:150});updateBall(s,.02);
  assert(director.update(s).cues.some(c=>c.type==='post'));assert(!director.update(s).cues.some(c=>c.type==='save'));
});
test('a keeper touching an incoming shot emits one contact reaction',()=>{
  const s=createMatch();s.phase='playing';const keeper=s.players.find(p=>p.id==='j1');for(const p of s.players)if(p!==keeper){p.x=25;p.z=0;}
  Object.assign(s.ball,{owner:null,x:0,y:1.1,z:keeper.z+3,vx:0,vy:0,vz:-28,shot:{team:0,player:'h10'}});
  const director=new SoundDirector();director.update(s);let count=0;
  for(let i=0;i<35;i++){updateBall(s,DT);count+=director.update(s).cues.filter(c=>c.type==='save').length;}
  assert.equal(count,1);
});
test('pause and resume do not repeat whistle or old event sounds',()=>{
  const s=createMatch();s.phase='playing';const director=new SoundDirector();assert(director.update(s).cues.some(c=>c.type==='whistle'));
  s.phase='paused';assert.equal(director.update(s).active,false);s.phase='playing';assert.equal(director.update(s).cues.length,0);
  s.phase='halftime';assert.equal(director.update(s).cues.filter(c=>c.type==='whistle').length,1);assert.equal(director.update(s).cues.length,0);
});
