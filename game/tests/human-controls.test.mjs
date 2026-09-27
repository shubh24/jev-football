import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,autoSwitchPlayer,switchPlayer,humanPass,humanShoot,stepMatch,DT} from '../src/match/engine.mjs';
import {screenMovement,cameraFrame} from '../src/match/camera.mjs';
function setup(){const s=createMatch();s.phase='playing';s.time=2;for(const p of s.players){p.x=30;p.z=45;p.cooldown=0;}const p=s.players.find(p=>p.id===s.selected);p.x=0;p.z=0;p.heading=Math.PI;Object.assign(s.ball,{owner:p.id,x:0,z:0,y:.11,lockUntil:0});return {s,p};}
function incoming(){const {s}=setup();s.players.find(p=>p.id==='h10').x=-4;s.players.find(p=>p.id==='h7').x=0;s.players.find(p=>p.id==='h7').z=5;Object.assign(s.ball,{owner:null,x:0,z:0,vx:0,vz:10,vy:0,y:.11});return s;}
test('an incoming low ball selects its receiver before contact',()=>{const s=incoming();autoSwitchPlayer(s);assert.equal(s.selected,'h7');assert.equal(s.ball.owner,null);});
test('balls going away, high balls and an earlier opponent do not trigger a switch',()=>{
 for(const kind of ['away','high','opponent']){const s=incoming();if(kind==='away')s.ball.vz=-10;if(kind==='high'){s.ball.y=5;s.ball.vy=3;}if(kind==='opponent')Object.assign(s.players.find(p=>p.id==='j7'),{x:0,z:2});autoSwitchPlayer(s);assert.equal(s.selected,'h10',kind);}
});
test('new human possession selects the owner; opponent possession does not',()=>{const {s}=setup();s.ball.owner='h8';autoSwitchPlayer(s);assert.equal(s.selected,'h8');s.ball.owner='j8';autoSwitchPlayer(s);assert.equal(s.selected,'h8');});
test('manual switching is retained during flight, but receipt selects the new owner',()=>{const s=incoming();switchPlayer(s);const manual=s.selected;autoSwitchPlayer(s);assert.equal(s.selected,manual);s.ball.owner='h7';autoSwitchPlayer(s);assert.equal(s.selected,'h7');});
test('automatic switching runs inside the simulation before the selected player moves',()=>{const s=incoming(),receiver=s.players.find(p=>p.id==='h7');stepMatch(s,DT,{x:1});assert.equal(s.selected,'h7');assert(receiver.vx>0);});
test('a directional pass selects a teammate in front even if another is behind',()=>{const {s}=setup();Object.assign(s.players.find(p=>p.id==='h2'),{x:-10,z:0});Object.assign(s.players.find(p=>p.id==='h7'),{x:10,z:0});assert(humanPass(s,{x:-1,z:0}));assert.equal(s.ball.receiver,'h2');assert.equal(s.selected,'h2');assert(s.ball.vx<0);assert.equal(s.ball.vz,0);});
test('with no teammate in the direction, the pass travels into space',()=>{const {s}=setup();assert(humanPass(s,{x:-1,z:-1}));assert.equal(s.ball.receiver,null);assert(s.ball.vx<0&&s.ball.vz<0);assert.equal(s.stats[0].passes,1);});
test('no directional input uses facing; opposite input can shoot away from goal',()=>{const {s,p}=setup();p.heading=Math.PI/2;assert(humanShoot(s,{x:0,z:0}));assert(s.ball.vx>20);const t=setup().s;assert(humanShoot(t,{x:0,z:1}));assert(t.ball.vz>20);});
for(const mode of ['broadcast','wide','end'])test(`${mode}: all eight key directions control pass and shot velocity`,()=>{
 for(const [h,v]of [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]]){
  for(const kick of [humanPass,humanShoot]){const {s,p}=setup(),cam=cameraFrame(s,mode),d=screenMovement(h,v,cam.position,cam.target),len=Math.hypot(d.x,d.z);for(const q of s.players)if(q!==p){q.x=-d.x/len*20;q.z=-d.z/len*20;}
   assert(kick(s,d));const speed=Math.hypot(s.ball.vx,s.ball.vz);assert(Math.abs(s.ball.vx/speed-d.x/len)<1e-10);assert(Math.abs(s.ball.vz/speed-d.z/len)<1e-10);
  }
 }
});
test('pass power selects a short or long teammate in the same direction',()=>{
  const results=[];
  for(const power of [0,1]){
    const {s}=setup();Object.assign(s.players.find(p=>p.id==='h2'),{x:-7,z:0});Object.assign(s.players.find(p=>p.id==='h7'),{x:-34,z:0});
    assert(humanPass(s,{x:-1,z:0},power));results.push({receiver:s.ball.receiver,speed:Math.hypot(s.ball.vx,s.ball.vz)});
  }
  assert.equal(results[0].receiver,'h2');assert.equal(results[1].receiver,'h7');assert(results[1].speed>results[0].speed*2);
});
test('power changes free pass and shot speed without changing aim',()=>{
  for(const kick of [humanPass,humanShoot]){
    const speeds=[0,.5,1].map(power=>{const {s}=setup();assert(kick(s,{x:-1,z:0},power));assert(s.ball.vx<0);assert.equal(s.ball.vz,0);return Math.hypot(s.ball.vx,s.ball.vz);});
    assert(speeds[0]<speeds[1]);assert(speeds[1]<speeds[2]);
  }
});

test('each manual switch selects the nearest other outfield teammate and remains selected',()=>{
 const {s}=setup();Object.assign(s.players.find(p=>p.id==='h7'),{x:2,z:0});Object.assign(s.players.find(p=>p.id==='h8'),{x:4,z:0});
 Object.assign(s.players.find(p=>p.id==='h1'),{x:0,z:0});Object.assign(s.players.find(p=>p.id==='j7'),{x:0,z:0});
 assert.equal(switchPlayer(s).id,'h7');autoSwitchPlayer(s);assert.equal(s.selected,'h7');
 assert.equal(switchPlayer(s).id,'h10');assert.equal(switchPlayer(s).id,'h7');
 s.ball.x=4;assert.equal(switchPlayer(s).id,'h8');
});
