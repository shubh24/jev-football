import {STRATEGIES,ROLES,teamPlan,actionOptions,distance,shootingCues,attackingCues} from './strategy.mjs';
const number=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error('Invalid match number');return v;};
export function sanitizeTeamState(data){
  if(!Array.isArray(data.players)||data.players.length!==22)throw new Error('Expected 22 players');
  const players=data.players.map((p,i)=>{
    const team=i<11?0:1,index=i%11,id=`${team?'j':'h'}${index+1}`;
    if(p.id!==id)throw new Error('Invalid player order');
    const c=p.currentCommand;const currentCommand=c?{type:['move','press','hold','pass','shoot','clear','keeper','tackle'].includes(c.type)?c.type:'hold',assignment:['press','carry','cover','support','wide','depth','overlap','recover','receive'].includes(c.assignment)?c.assignment:'',x:number(c.x,-36,36),z:number(c.z,-54,54),speed:number(c.speed,0,12),angleDegrees:number(c.angleDegrees,0,360),remaining:number(c.remaining,0,2)}:undefined;
    return {id,team,index,role:ROLES[index],...(currentCommand?{currentCommand}:{}),x:number(p.x,-36,36),z:number(p.z,-54,54),vx:number(p.vx,-12,12),vz:number(p.vz,-12,12),cooldown:number(p.cooldown??0,0,3),...(index===0?{keeper:{x:number(p.x,-4,4),targetX:number(p.keeper?.targetX??p.x,-4,4),velocity:number(p.keeper?.velocity??0,-4,4),committed:p.keeper?.committed===true}}:{})};
  });
  if(!Array.isArray(data.strategies)||data.strategies.length!==2||data.strategies.some(s=>!Object.hasOwn(STRATEGIES,s)))throw new Error('Invalid strategy');
  const selected=data.selected??'h10';if(!players.some(p=>p.id===selected&&p.team===0&&p.role!=='GK'))throw new Error('Invalid human selection');
  const b=data.ball;if(!b||(b.owner!==null&&!players.some(p=>p.id===b.owner)))throw new Error('Invalid ball owner');
  const receiver=players.some(p=>p.id===b.receiver)?b.receiver:null,passTarget=receiver&&b.passTarget?{x:number(b.passTarget.x,-34,34),z:number(b.passTarget.z,-52,52)}:null;
  return {selected,selectionVersion:number(data.selectionVersion??0,0,1e9),requestId:number(data.requestId,0,1e9),sequence:number(data.sequence,0,1e9),planVersion:number(data.planVersion,0,1e9),time:number(data.time,0,180),strategies:[...data.strategies],players,ball:{kickStyle:['pass','lob','shoot','chip','clear'].includes(b.kickStyle)?b.kickStyle:null,lastPassFrom:players.some(p=>p.id===b.lastPassFrom)?b.lastPassFrom:null,lastPassTo:players.some(p=>p.id===b.lastPassTo)?b.lastPassTo:null,lastPassAt:number(b.lastPassAt??0,0,180),version:number(b.version??0,0,1e9),x:number(b.x,-38,38),y:number(b.y,0,40),z:number(b.z,-57,57),vx:number(b.vx,-70,70),vy:number(b.vy,-70,70),vz:number(b.vz,-70,70),owner:b.owner,lastTouch:b.lastTouch===1?1:0,receiver,passTarget}};
}
// Legacy fixed-command request retained for earlier benchmark fixtures.
// The live match endpoints use model-control.mjs.
export function buildTeamRequest(state){
  const plan=teamPlan(state,1),choices={},questions={},players={};
  for(const p of state.players.filter(p=>p.team===1&&p.role!=='GK')){
    const options=actionOptions(state,p,plan);choices[p.id]=options;
    const nearest=Math.min(...state.players.filter(q=>q.team!==p.team).map(q=>distance(p,q)));
    players[p.id]={role:p.role,position:[p.x,p.z],velocity:[p.vx,p.vz],job:plan.targets[p.id].job,target:[plan.targets[p.id].x,plan.targets[p.id].z],ownsBall:state.ball.owner===p.id,pressure:nearest<3?'close':nearest<7?'near':'low',shooting:shootingCues(state,p),attacking:attackingCues(state,p),options};
    questions[`player_${p.id}`]={type:'choice',instructions:`Control ${p.id} for the next short action, not a whole play. If this player owns the ball and shooting.clearShot is true, prefer an available shot with a clear lane now, including under Possession. Near the end line, pass, cut inside or shoot; do not keep carrying forwards. The objective in every plan is to score, not to maximise passes. Possession means controlled forward progress. If attacking.canAdvance is true and there is no clear shot, prefer drive_goal or sprint; only pass instead if a clear forward pass gains at least 8 metres or creates an immediate shot. Do not pass sideways or backwards in open space. Under close pressure, use a clear pass or a short evasive touch. Avoid a returnPass to the last passer unless pressure requires it or it gains ground. Defend permits safer releases under pressure. Dribble and sprint choices maintain a direction and speed for up to 650 ms after receipt. Each fresh response replaces the command without resetting velocity. Repeat a run to continue it, or choose a different action to change it. Compare pass clearances. Through passes lead a runner; ordinary passes go to their current position. Off the ball, if run_attack is available, prefer it: run towards the assigned attacking target to open a forward passing option. Otherwise run towards the assigned target, mark an opponent, or block a passing lane. Position and chase runs continue towards the actual target until replaced or expired. Only the assigned presser can close the ball. Closing does not tackle. If tackle is available and you are an assigned presser, prefer tackle over press or jockey to win the ball now. Keepers track the shot line or choose the correct dive. Wait only when already well placed or shielding briefly.`,criteria:Object.fromEntries(Object.entries(options).map(([key,c])=>[key,`${c.label}; ${c.type}; valid ${Math.round(c.duration*1000)} ms${c.speed?`; movement speed ${c.speed} m/s`:''}${c.clearance!==undefined?`; lane clearance ${c.clearance} m`:''}${c.progress!==undefined?`; forward progress ${c.progress} m`:''}${c.returnPass?'; returns to the last passer':''}`]))};
  }
  return {choices,body:{model:'jev-1.13.0',state:{game:'Simple 11 vs 11 football. JEV attacks towards z = +52.5. x is left/right across the pitch. No offside, corners or fouls. Boundary rebounds keep the ball in play. Code handles exact movement, physics, and formation targets. Coordinate by obeying your assigned role and the shared plan. Each question is one player decision.',teamPlan:{name:STRATEGIES[state.strategies[1]].name,instruction:STRATEGIES[state.strategies[1]].description,pressers:plan.pressers,runners:plan.runners},ball:state.ball,players,opponents:state.players.filter(p=>p.team===0).map(p=>({id:p.id,x:p.x,z:p.z})),time:state.time},questions}};
}
export function validateTeamDecision(data,choices){
  const decisions={};
  for(const [id,options]of Object.entries(choices)){
    const a=data?.answers?.[`player_${id}`];if(a?.type!=='choice'||!Object.hasOwn(options,a.choice))throw new Error('Invalid team answer');
    const probabilities=Object.fromEntries(Object.keys(options).map(key=>[key,number(a.probabilities?.[key],0,1)]));
    if(Math.abs(Object.values(probabilities).reduce((a,b)=>a+b,0)-1)>.025)throw new Error('Invalid distribution');
    decisions[id]={action:a.choice,label:options[a.choice].label,command:options[a.choice],options,probabilities,labels:Object.fromEntries(Object.entries(options).map(([key,c])=>[key,c.label])),confidence:number(a.confidence,0,1)};
  }
  return decisions;
}
