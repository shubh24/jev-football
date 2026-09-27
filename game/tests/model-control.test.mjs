import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,modelKick,stepMatch,DT} from '../src/match/engine.mjs';
import {buildIntentRequest,readIntents,buildParameterRequest,compileModelCommands,decideModelControl} from '../src/match/model-control.mjs';
import {applyTeamResponse} from '../src/match/control.mjs';
import {performKeeperCommand} from '../src/match/keepers.mjs';
function fixture(){const s=createMatch();s.phase='playing';s.time=1;s.requestId=1;for(const p of s.players)if(p.role!=='GK'){p.x=25;p.z=-40;}const p=s.players[20];p.x=0;p.z=-20;s.ball.owner=p.id;s.ball.x=0;s.ball.z=-20;s.ball.lockUntil=0;return {s,p};}
function answers(questions,select={}){return {model:'test',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const key=select[id]||Object.keys(q.criteria)[0];assert(Object.hasOwn(q.criteria,key),`${id}/${key}`);return [id,{type:'choice',choice:key,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===key?1:0]))}];}))};}
function command(s,p,action,select={},keepers=false){const first=buildIntentRequest(s,keepers),intents=readIntents(answers(first.body.questions,{[`intent_${p.id}`]:action}),first),second=buildParameterRequest(s,intents,keepers);return compileModelCommands(s,intents,second,answers(second.body.questions,select))[p.id];}
test('live intent requests contain state and strategy but no code-selected formation targets',()=>{
 const {s}=fixture(),r=buildIntentRequest(s);assert.equal(Object.keys(r.choices).length,10);assert(r.choices.j10.run);assert(r.choices.j10.pass_j2);assert(!r.choices.j10.drive_goal);assert(!('teamPlan' in r.body.state));assert(r.body.state.players.every(p=>!('target'in p)&&!('job'in p)));assert(!r.choices.j2.tackle);assert.equal(Object.keys(buildIntentRequest(s,true).choices).length,2);
});
test('model destination and speed are compiled exactly, independently of a tactical preset',()=>{
 const {s,p}=fixture(),d=command(s,p,'run',{j10_direction:'dir_4',j10_distance:'metres_8',j10_speed:'speed_3'});assert.equal(d.command.speed,3);assert.equal(d.command.x,8);assert(Math.abs(d.command.z+20)<1e-8);assert.equal(d.command.distance,8);assert.equal(d.command.continuous,true);assert(!d.command.runDirection);assert.equal(d.parameters.direction.choice,'dir_4');
});
test('movement controls cover all directions and short or long travel, with legal boundaries',()=>{
 const {s,p}=fixture();p.x=32.5;p.z=50;const first=buildIntentRequest(s),intents=readIntents(answers(first.body.questions,{intent_j10:'run'}),first),q=buildParameterRequest(s,intents).choices.j10;
 assert.equal(Object.keys(q.direction).length,16);assert.equal(Object.keys(q.distance).length,8);
 for(let i=0;i<16;i++){const d=command(s,p,'run',{j10_direction:`dir_${i}`,j10_distance:'metres_24'});assert(Math.abs(d.command.x)<=32.8&&Math.abs(d.command.z)<=51.1);}
});
test('a model shot uses selected horizontal direction, speed and elevation without goal correction',()=>{
 const {s,p}=fixture(),d=command(s,p,'shoot',{j10_aim:'angle_90',j10_power:'speed_22',j10_elevation:'degrees_20'});assert(modelKick(s,p,d.command));assert(Math.abs(s.ball.vx-22*Math.cos(20*Math.PI/180))<1e-9);assert(Math.abs(s.ball.vy-22*Math.sin(20*Math.PI/180))<1e-9);assert(Math.abs(s.ball.vz)<1e-9);assert.equal(s.stats[1].shots,1);
});
test('model pass lead is fixed by the selected aim point, not changed to follow the receiver',()=>{
 const {s,p}=fixture(),target=s.players[21];target.x=10;target.z=-10;target.vx=8;const d=command(s,p,'pass_j11',{j10_aim:'lead_-2_4',j10_power:'speed_14',j10_elevation:'degrees_5'});target.x=20;
 assert.deepEqual(d.command.aimPoint,{x:8,z:-6});assert(modelKick(s,p,d.command));assert.deepEqual(s.ball.passTarget,{x:8,z:-6});assert.equal(s.ball.receiver,'j11');assert(Math.abs(Math.hypot(s.ball.vx,s.ball.vy,s.ball.vz)-14)<1e-9);assert.equal(s.stats[1].passes,1);
});
test('two stages are sequential, batch players, and expose the selected intents to all parameter questions',async()=>{
 const {s}=fixture(),calls=[];const result=await decideModelControl(s,async body=>{calls.push(body);if(calls.length===1)return answers(body.questions,Object.fromEntries(Object.keys(body.questions).map(k=>[k,'run'])));assert.equal(body.state.intents.j10.action,'run');assert.equal(Object.keys(body.questions).length,30);return answers(body.questions);});
 assert.equal(calls.length,2);assert.equal(Object.keys(result.decisions).length,10);assert.equal(result.stages.calls,2);assert(result.decisions.j10.parameters.speed);assert.equal(result.decisions.j10.stages,result.stages);
});
test('missing, non-finite, or invalid parameter answers cannot produce a partial command batch',async()=>{
 const {s,p}=fixture(),first=buildIntentRequest(s),intents=readIntents(answers(first.body.questions,{intent_j10:'shoot'}),first),second=buildParameterRequest(s,intents);
 for(const fault of ['missing','choice','probability']){const d=answers(second.body.questions);if(fault==='missing')delete d.answers.j10_power;if(fault==='choice')d.answers.j10_power.choice='infinite_power';if(fault==='probability')d.answers.j10_power.probabilities.speed_6=NaN;assert.throws(()=>compileModelCommands(s,intents,second,d));}
 assert.deepEqual(s.orders,{});
});
test('cancel after intent prevents the parameter call',async()=>{
 const {s}=fixture(),controller=new AbortController();let count=0;
 await assert.rejects(decideModelControl(s,async body=>{count++;controller.abort();return answers(body.questions);},{signal:controller.signal}));assert.equal(count,1);
});
test('model runs keep speed during 900 ms decision cycles, and expire without fresh replies',()=>{
 const {s,p}=fixture();let minimum=Infinity;
 for(let n=0;n<5;n++){const d=command(s,p,'run',{j10_direction:'dir_0',j10_distance:'metres_16',j10_speed:'speed_4.5'});assert(applyTeamResponse(s,{[p.id]:d},structuredClone(s),900)[p.id].applied);for(let i=0;i<108;i++){stepMatch(s,DT);if(s.time>1.6)minimum=Math.min(minimum,Math.hypot(p.vx,p.vz));}}
 assert(minimum>4.49);for(let i=0;i<200;i++)stepMatch(s,DT);assert(Math.hypot(p.vx,p.vz)<.01);assert.equal(p.executing.source,'Waiting');
});
test('two-stage commands reject old observations and changed possession or play',()=>{
 for(const fault of ['age','possession','sequence','plan']){const {s,p}=fixture(),d=command(s,p,'shoot'),old=structuredClone(s);if(fault==='age')s.time+=1.3;if(fault==='possession')s.ball.owner='h10';if(fault==='sequence')s.sequence++;if(fault==='plan')s.planVersion++;assert.equal(applyTeamResponse(s,{[p.id]:d},old,400)[p.id].applied,false);}
});
test('model keeper destination and speed are applied without the former tracking formula',()=>{
 const {s}=fixture(),p=s.players[0],d=command(s,p,'run',{h1_destination:'x_1.25',h1_speed:'speed_0.75'},true);applyTeamResponse(s,{[p.id]:d},structuredClone(s),400);
 for(let i=0;i<90;i++)stepMatch(s,DT);assert(p.x>.4&&p.x<.65);assert(p.vx<=.75);assert.equal(p.keeper.targetX,1.25);
 const next=command(s,p,'run',{h1_destination:'x_2',h1_speed:'speed_0.75'},true),before=p.vx;applyTeamResponse(s,{[p.id]:next},structuredClone(s),400);stepMatch(s,DT);assert.equal(p.vx,before);assert.equal(p.keeper.targetX,2);
 for(let i=0;i<200;i++)stepMatch(s,DT);assert.equal(p.vx,0);assert(p.x<2);
});
test('live outfield players do not receive a local formation command while waiting',()=>{
 const {s,p}=fixture();s.ball.owner='h10';stepMatch(s,DT);assert.equal(p.executing.type,'hold');assert.equal(p.executing.source,'Waiting');assert.equal(p.vx,0);assert.equal(p.vz,0);
});
test('a model keeper hold stays visible as a JEV command until its deadline',()=>{
 const {s}=fixture(),p=s.players[0],d=command(s,p,'hold',{},true);applyTeamResponse(s,{[p.id]:d},structuredClone(s),200);for(let i=0;i<12;i++)stepMatch(s,DT);assert.equal(p.executing.source,'JEV');assert.equal(p.executing.label,d.label);
});
test('Practice keeper commands clear a previous model speed limit and watchdog',()=>{
 const {s}=fixture(),p=s.players[0];p.keeper.speedLimit=.75;p.keeper.moveExpires=10;performKeeperCommand(p,{type:'keeper',action:'track',x:1},s.time);assert.equal(p.keeper.speedLimit,undefined);assert.equal(p.keeper.moveExpires,undefined);
});
