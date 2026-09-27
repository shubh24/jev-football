import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,stepMatch,DT,autoSwitchPlayer,humanPass,humanShoot,switchPlayer,keeperMatchPose} from '../src/match/engine.mjs';
import {direction} from '../src/match/strategy.mjs';
import {keeperObservation,keeperOptions,buildKeeperRequest} from '../src/match/keepers.mjs';
import {applyTeamResponse} from '../src/match/control.mjs';
import {sanitizeTeamState,buildTeamRequest} from '../src/match/decision.mjs';
export function keeperFixture(team,x,height=1.2){
 const s=createMatch();s.phase='playing';s.requestId=1;s.time=1;
 for(const p of s.players)if(p.role!=='GK'){p.x=25;p.z=0;}
 const p=s.players.find(p=>p.team===team&&p.role==='GK'),dir=direction(team),t=.5;
 Object.assign(s.ball,{owner:null,version:s.ball.version+1,x:0,z:p.z+dir*11,y:.11,vx:x/t,vz:-dir*22,vy:(height-.11+4.905*t*t)/t,lockUntil:0,lastTouch:1-team});return {s,p};
}
for(const team of [0,1])for(const side of [-1,1])for(const height of ['low','high'])test(`keeper ${team} saves a ${side<0?'−x':'+x'} ${height} shot with a delayed dive`,()=>{
 const {s,p}=keeperFixture(team,side*2.1,height==='low'?.45:1.85),input=structuredClone(s),action=`${side<0?'left':'right'}_${height}`,command=keeperOptions(s,p)[action];
 const o=keeperObservation(s,p);assert(o.threat);assert.equal(o.observedTrajectory.relativeSide,side<0?'left':'right');assert.equal(o.observedTrajectory.height,height);
 for(let i=0;i<24;i++)stepMatch(s,DT);applyTeamResponse(s,{[p.id]:{action,command}},input,200);
 for(let i=0;i<100&&s.phase==='playing';i++)stepMatch(s,DT);
 assert(s.events.some(e=>e.text===`${p.id.toUpperCase()} contacts the ball`));assert.deepEqual(s.scores,[0,0]);
});
test('both keeper questions contain trajectory cues and outfield questions exclude keepers',()=>{const {s}=keeperFixture(0,.7);const clean=sanitizeTeamState(s),request=buildKeeperRequest(clean);assert.deepEqual(Object.keys(request.choices),['h1','j1']);assert.equal(Object.keys(buildTeamRequest(clean).choices).length,10);assert.equal(request.body.state.keepers.h1.observation.observedTrajectory.lateralReach,'half_metre_step');assert(!request.body.state.keepers.j1.observation.threat);});
test('keeper steps retain the penalty distance limit and cannot accumulate',()=>{const {s,p}=keeperFixture(1,0);Object.assign(s.ball,{owner:null,x:0,z:0,vx:0,vz:0,vy:0});const command=keeperOptions(s,p).step_right_50;applyTeamResponse(s,{[p.id]:{action:'step_right_50',command}},structuredClone(s),100);for(let i=0;i<90;i++)stepMatch(s,DT);assert(Math.abs(p.x-.5)<.001);assert(Math.abs(keeperMatchPose(p,s.time).origin[0]-.5)<.001);});
test('manual switching, receipt and human kick functions cannot control a keeper',()=>{const {s,p}=keeperFixture(0,0);s.ball.owner=p.id;autoSwitchPlayer(s);assert.notEqual(s.selected,p.id);s.selected=p.id;assert(!humanPass(s,{x:1,z:0}));assert(!humanShoot(s,{x:1,z:0}));switchPlayer(s);assert.notEqual(s.selected,p.id);});
test('a back pass can reach the human keeper without selecting it',()=>{const s=createMatch();const owner=s.players.find(p=>p.id===s.selected),gk=s.players[0];owner.x=0;owner.z=gk.z-8;for(const p of s.players)if(p.team===0&&p!==owner&&p!==gk){p.x=25;p.z=-30;}assert(humanPass(s,{x:0,z:1}));assert.equal(s.ball.receiver,gk.id);assert.notEqual(s.selected,gk.id);});
test('a changed ball flight rejects a late keeper action',()=>{const {s,p}=keeperFixture(1,2);const observation=structuredClone(s),command=keeperOptions(s,p).right_low;s.ball.version++;assert.equal(applyTeamResponse(s,{[p.id]:{command}},observation,120)[p.id].applied,false);});
test('keeper possession offers distribution rather than a shot or dribble',()=>{const {s,p}=keeperFixture(0,0);s.ball.owner=p.id;const options=keeperOptions(s,p);assert(options.clear);assert(!options.right_low);assert(!options.carry_forward);});
