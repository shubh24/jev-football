import {clamp,direction,distance,laneClearance,STRATEGIES} from './strategy.mjs';
import {teamStructure,possessionTeam,zoneGap,playerCues} from './team-structure.mjs';
import {readChoice,decideModelControl} from './model-control.mjs';
const round=n=>Math.round(n*100)/100;
const option=(label,value)=>({label,value});
const criteria=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v.label]));
const actors=(s,t)=>s.players.filter(p=>p.team===t&&p.role!=='GK'&&(t!==0||p.id!==s.selected));
function observation(s,team,plan){return {
 game:'Football in metres. x is across the pitch. Team 0 attacks -z, team 1 attacks +z. Goals at z=±52.5. No offside. Select complete controls; the engine applies the chosen values exactly. Run vectors start at receipt, not at the old observation position.',
 team,humanControlled:s.selected,time:s.time,plan:STRATEGIES[s.strategies[team]].description,structure:plan,ball:s.ball,
 players:s.players.map(p=>({id:p.id,team:p.team,role:p.role,x:round(p.x),z:round(p.z),vx:round(p.vx),vz:round(p.vz),currentCommand:p.currentCommand})),
 continuity:'Keep a useful run and assigned lane. Change only for new pressure, possession or space. The previous command continues while this call runs. Short routes stop sooner. The run watchdog is 1.2 seconds.'};}
export function buildCoordinatedIntent(s,team=1){
 const plan=teamStructure(s,team),choices={},questions={};
 for(const p of actors(s,team)){
  const job=plan.assignments[p.id],owns=s.ball.owner===p.id,cues=owns?playerCues(s,p):null;
  const options={hold:option('Hold this position briefly',{type:'hold'})};
  options.run=option(owns?'Carry the ball into space':`Run for assigned duty: ${job.duty}`,{type:'move',purpose:owns?'carry':job.duty});
  if(owns){
   for(const q of cues.passes.filter(q=>q.distanceM<42)){
    options[`pass_${q.id}`]=option(`Pass to ${q.id}: ${q.distanceM} m away, ${q.progressM} m forward, lane clearance ${q.clearanceM} m`,{type:'pass',target:q.id});
    if(q.distanceM>8&&q.distanceM<36)options[`lob_${q.id}`]=option(`Lob to ${q.id}: ${q.distanceM} m away, ${q.progressM} m forward`,{type:'pass',target:q.id,flight:'lob'});
   }
   if(cues.shooting.rangeM<36){options.shoot=option(`Shoot now: goal ${cues.shooting.rangeM} m away; clear shot ${cues.shooting.clearShot}`,{type:'shoot'});options.chip=option('Chip over a goalkeeper who has left the goal',{type:'shoot',flight:'chip'});}
   options.clear=option('Clear danger towards the attacking half',{type:'clear'});
  }else{
   if(possessionTeam(s)===team){options.get_free=option(`Move away from a marker within your ${job.duty} area`,{type:'move',purpose:job.duty});}
   const owner=s.players.find(q=>q.id===s.ball.owner);
   if(owner&&owner.team!==team&&job.duty==='press'&&p.cooldown<=0)options.press_tackle=option(`Close down ${owner.id} and tackle on reaching 1.65 m; select approach direction and speed next`,{type:'move',purpose:'press',target:owner.id,tackleOnReach:true});
   if(owner&&owner.team!==team&&p.cooldown<=0&&distance(p,owner)<1.65)options.tackle=option(`Tackle ${owner.id}`,{type:'tackle',target:owner.id});
  }
  choices[p.id]=options;
  questions[`intent_${p.id}`]={type:'choice',instructions:`Player ${p.id}. Duty ${job.duty}. Distance outside assigned area ${job.gapM} m. ${owns?`Ball carrier facts: ${JSON.stringify(cues)}. Prefer shoot when clearShot is true. Choose a clear forward pass when it gains at least 8 metres or releases a runner. Otherwise carry if canAdvance is true. Pass to escape close pressure. Do not pass backwards in clear forward space or hold near goal without pressure.`:'Follow your named duty; do not independently switch to another role. Run to recover when outside your area. Hold only when already well placed. A pass in flight does not end our attack.'} If tackle is offered, prefer tackle now. Otherwise the named presser should prefer press_tackle to close down and win the ball; a plain run only approaches and will not tackle. Do not just follow beside the carrier. The next stage chooses complete physical controls.`,criteria:criteria(options)};
 }
 return {choices,plan,body:{model:'jev-1.13.0',state:observation(s,team,plan),questions}};
}
// Each route contains direction, travel distance and speed. The model selects all three together.
export function movementOptions(s,p,job,challenge=false){
 const owns=s.ball.owner===p.id,dir=direction(p.team),gap=zoneGap(p,job.zone),routes=[];
 const carrier=challenge?s.players.find(q=>q.id===s.ball.owner&&q.team!==p.team):null,pursuit=carrier&&Math.hypot(carrier.vx,carrier.vz)>1;
 const aim=pursuit?{x:carrier.x+carrier.vx*.5,z:carrier.z+carrier.vz*.5}:owns?{x:clamp(p.x*.6,-20,20),z:p.z+dir*10}:job.centre;
 const wanted=Math.atan2(aim.x-p.x,aim.z-p.z);
 for(let i=0;i<16;i++)for(const metres of (pursuit?[8,16]:job.duty==='press'?[.25,.5,1,2,4,8,16]:[2,4,8,16])){
  const a=i*Math.PI/8,dx=Math.sin(a),dz=Math.cos(a),end={x:p.x+dx*metres,z:p.z+dz*metres};
  if(Math.abs(end.x)>32.8||Math.abs(end.z)>51.1){if(!pursuit)continue;end.x=clamp(end.x,-32.8,32.8);end.z=clamp(end.z,-51.1,51.1);}
  const endGap=zoneGap(end,job.zone),progress=gap-endGap;
  if(pursuit){if(Math.cos(a-wanted)<.8)continue;}else if(!owns&&(gap>1?progress<Math.min(.5,gap*.2):endGap>.5))continue;
  if(owns&&dz*dir<-.4)continue;
  if(owns&&Math.abs(p.z)>46&&Math.abs(end.z)>Math.abs(p.z))continue;
  const separation=Math.min(...s.players.filter(q=>q.team===p.team&&q.id!==p.id).map(q=>distance(q,end)));
  if(separation<2)continue;
  const opponentGap=Math.min(...s.players.filter(q=>q.team!==p.team).map(q=>distance(q,end)));
  const error=Math.abs(Math.atan2(Math.sin(a-wanted),Math.cos(a-wanted)));
  routes.push({i,metres,dx,dz,end,rank:error+Math.abs(metres-Math.min(8,Math.max(2,distance(p,aim))))*.045,progress,separation,opponentGap});
 }
 routes.sort((a,b)=>a.rank-b.rank);
 const selected=[],bearings=new Map();for(const route of routes){if((bearings.get(route.i)||0)>=3)continue;selected.push(route);bearings.set(route.i,(bearings.get(route.i)||0)+1);if(selected.length>=10)break;}
 const options={};
 for(const r of selected)for(const speed of (!owns&&(gap>12||job.duty==='press'&&gap>3)?[5.5,7.5,8.5]:[3,5.5,7.5,8.5])){
  const angleDegrees=r.i*22.5;
  const reach=carrier?Math.hypot(carrier.x-p.x,carrier.z-p.z):1,nx=carrier?(carrier.x-p.x)/(reach||1):0,nz=carrier?(carrier.z-p.z)/(reach||1):0;
  const closing=carrier?speed*(r.dx*nx+r.dz*nz)-(carrier.vx*nx+carrier.vz*nz):0;
  if(pursuit&&closing<=.2&&speed<8.5)continue;
  options[`dir_${r.i}_m_${r.metres}_s_${speed}`]=option(`${angleDegrees}°: (${round(r.dx)}, ${round(r.dz)}) for ${r.metres} m at ${speed} m/s; towards (${round(r.end.x)}, ${round(r.end.z)}), ${challenge?'closing speed '+round(closing)+' m/s':'area gap '+round(zoneGap(r.end,job.zone))+' m'}; nearest opponent ${round(r.opponentGap)} m`,{runDirection:{x:r.dx,z:r.dz},lookAhead:r.metres,distance:r.metres,angleDegrees,speed});
 }
 options.hold=option('Stay in this area; no suitable run now',{hold:true});return options;
}
// Collision-free forecast uses the same drag, gravity and ground bounce as the match.
// It filters physically unsuitable options; it does not change the selected kick.
export function forecastKick(range,speed,elevation){
 const dt=1/120,a=elevation*Math.PI/180;let x=.85,y=.14,vx=speed*Math.cos(a),vy=speed*Math.sin(a),apex=y;
 for(let i=0;i<600;i++){
  const old={x,y};vy-=9.81*dt;vx*=Math.exp(-(y<=.125?.65:.025)*dt);x+=vx*dt;y+=vy*dt;
  if(y<.11){y=.11;vy=Math.abs(vy)>.8?Math.abs(vy)*.4:0;}apex=Math.max(apex,y);
  if(x>=range){const t=clamp((range-old.x)/(x-old.x||1),0,1);return {time:round((i+t)*dt),height:round(old.y+(y-old.y)*t),speed:round(vx),apex:round(apex)};}
 }return null;
}
export function kickOptions(s,p,intent){
 const target=s.players.find(q=>q.id===intent.target),points=[],goalZ=direction(p.team)*52.65;
 if(target)for(const lead of [0,.35,.7])points.push({x:clamp(target.x+target.vx*lead,-32,32),z:clamp(target.z+target.vz*lead,-49,49),lead});
 else if(intent.type==='shoot')for(const x of [-2.8,-1.4,0,1.4,2.8])points.push({x,z:goalZ});
 else for(const dx of [-12,0,12])points.push({x:clamp(p.x+dx,-30,30),z:clamp(p.z+direction(p.team)*28,-48,48)});
 const loft=intent.flight==='lob'||intent.flight==='chip',angles=loft?[20,30,40,55]:[0,5,10,15],candidates=[];
 for(const point of points)for(const speed of [10,14,18,22,26,30,33])for(const elevation of angles){
  const flight=forecastKick(distance(p,point),speed,elevation);if(!flight)continue;
  if(intent.type==='shoot'&&(flight.height>2.15||flight.time>2.2))continue;
  if(target&&(flight.height>1||flight.time>2.6||flight.speed>27))continue;
  if(loft&&flight.apex<1.6)continue;
  const clearance=laneClearance(s,p,point),rank=flight.time+(target?Math.abs(flight.speed-13)*.08:0)+(loft?0:elevation*.035);
  candidates.push({point,speed,elevation,flight,clearance,rank});
 }
 candidates.sort((a,b)=>a.rank-b.rank);
 const selected=[],counts=new Map();for(const c of candidates){const key=`${c.point.x},${c.point.z}`;if((counts.get(key)||0)>=6)continue;selected.push(c);counts.set(key,(counts.get(key)||0)+1);if(selected.length>=30)break;}
 return Object.fromEntries(selected.map((c,i)=>[`kick_${i}`,option(`Aim (${round(c.point.x)}, ${round(c.point.z)}); ${c.speed} m/s, ${c.elevation}°; arrives in ${c.flight.time}s at height ${c.flight.height}m; lane clearance ${round(c.clearance)}m`,{aimPoint:{x:c.point.x,z:c.point.z},kickSpeed:c.speed,elevationDegrees:c.elevation,power:c.speed/33,forecast:c.flight})]));
}
export function buildCoordinatedControls(s,intents,team=1,plan=teamStructure(s,team)){
 const choices={},questions={};
 for(const [id,d]of Object.entries(intents)){
  const p=s.players.find(p=>p.id===id),c=d.value;if(!['move','pass','shoot','clear'].includes(c.type))continue;
  const options=c.type==='move'?movementOptions(s,p,plan.assignments[id],Boolean(c.tackleOnReach)):kickOptions(s,p,c);
  // An empty physical menu permits a hold instead of an impossible kick.
  if(!Object.keys(options).length)options.hold=option('No physically suitable kick; hold briefly',{hold:true});
  choices[id]=options;questions[`control_${id}`]={type:'choice',instructions:`Execute ${d.choice} for ${id}. Duty ${plan.assignments[id].duty}. Select ONE complete control, not separate guesses. ${c.type==='move'?'Prefer a route into the assigned area. A presser must close to tackling range of the carrier, not move alongside. When chasing, select a speed greater than the carrier speed when possible. Use speed 5.5, 7.5 or 8.5 for a long recovery or forward run; 3 for a close adjustment. Preserve the current bearing if still useful. Do not hold outside the assigned area unless all routes are blocked.':'Use the stated flight time and height, lane clearance, and receiver velocity. These are forecasts without opponents; they do not guarantee a completed pass or goal.'}`,criteria:criteria(options)};
 }
 return {choices,body:{model:'jev-1.13.0',state:{...observation(s,team,plan),intents:Object.fromEntries(Object.entries(intents).map(([id,d])=>[id,{action:d.choice,...d.value}]))},questions}};
}
export function compileCoordinated(s,intents,request,data,plan){
 const decisions={};for(const [id,intent]of Object.entries(intents)){
  const p=s.players.find(p=>p.id===id),control=request.choices[id]?readChoice(data,`control_${id}`,request.choices[id]):null,job=plan.assignments[id];
  const c={...intent.value,...control?.value,controlVersion:3,parameterized:true,requiresBall:s.ball.owner===id,assignment:job.duty,teamPhase:plan.phase,duration:1.2};
  if(control?.value.hold)c.type='hold';
  if(c.type==='move'){c.continuous=true;c.x=clamp(p.x+c.runDirection.x*c.distance,-32.8,32.8);c.z=clamp(p.z+c.runDirection.z*c.distance,-51.1,51.1);}
  if(['pass','shoot','clear','tackle'].includes(c.type))c.duration=.25;
  c.label=c.type==='hold'?`${job.duty} · Hold position`:c.type==='move'?`${c.tackleOnReach?'Close + tackle '+c.target.toUpperCase():job.duty} · ${c.angleDegrees}° · ${c.distance} m · ${c.speed} m/s`:control&&!c.hold?`${intent.choice} · ${c.kickSpeed} m/s · ${c.elevationDegrees}°`:`${job.duty} · ${intent.label}`;
  decisions[id]={action:intent.choice,label:c.label,command:c,assignment:job,probabilities:intent.probabilities,labels:intent.labels,confidence:intent.confidence,parameters:control?{[intent.value.type==='move'?'movement':'kick']:control}:{},controller:'JEV coordinated controls'};
 }return decisions;
}
export async function decideCoordinated(s,call,{team=1,keepers=false,signal,now=()=>performance.now()}={}){
 if(keepers)return decideModelControl(s,call,{team,keepers,signal,now});
 const start=now(),first=buildCoordinatedIntent(s,team),a=await call(first.body,signal),intentMs=now()-start;
 const intents=Object.fromEntries(Object.entries(first.choices).map(([id,options])=>[id,readChoice(a,`intent_${id}`,options)]));
 if(signal?.aborted)throw signal.reason;
 const second=buildCoordinatedControls(s,intents,team,first.plan),has=Object.keys(second.body.questions).length>0,b=has?await call(second.body,signal):{answers:{}};
 const stages={intentMs:Math.round(intentMs),parametersMs:Math.round(now()-start-intentMs),calls:has?2:1,intentQuestions:Object.keys(first.body.questions).length,parameterQuestions:Object.keys(second.body.questions).length};
 const decisions=compileCoordinated(s,intents,second,b,first.plan);for(const d of Object.values(decisions))d.stages=stages;
 return {decisions,stages,model:b.model||a.model,controlVersion:3,structure:first.plan};
}
