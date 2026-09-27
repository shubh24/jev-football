import {STRATEGIES,clamp,direction,distance} from './strategy.mjs';
import {supportObservation} from './support.mjs';
import {keeperObservation} from './keepers.mjs';

// These are controller limits and resolution, not tactical action presets.
export const MODEL_CONTROL={version:2,maxAgeMs:1200,runLifetime:1.2,actionLifetime:.25};
const movementDistances=[.25,.5,1,2,4,8,16,24];
const runSpeeds=[1.5,3,4.5,6,7.5,8.5];
const kickSpeeds=[6,10,14,18,22,26,30,33];
const elevations=[0,2,5,10,15,20,30,40,55];
const rounded=n=>Math.round(n*1000)/1000;
const choice=(label,value)=>({label,value});
const criteria=options=>Object.fromEntries(Object.entries(options).map(([k,o])=>[k,o.label]));
const controls=(keepers,team)=>keepers?'Both goalkeepers, independently for their own team':team===0?'Team 0 teammates only. The selected player is controlled entirely by the human.':'Team 1 outfield players';
function observation(state,keepers,team=1){
  return {
    game:'Football. Metres and seconds. x is across the pitch; z is along it. Team 0 attacks z=-52.5; team 1 attacks z=+52.5. Goal posts x=-3.66 and +3.66; crossbar y=2.44. No offside, corners or fouls. Boundaries rebound. Gravity=9.81 m/s²; rolling drag=0.65/s. Code applies your controls; it does not choose run targets or correct kick aim, speed or elevation.',
    controls:controls(keepers,team),humanControlled:state.selected,bounds:{x:[-34,34],z:[-52.5,52.5]},time:state.time,
    timing:'The previous command continues while these decisions are prepared. A new command usually arrives after 0.4 to 1.2 seconds. A run target is an intended stopping point, not the distance for one animation frame. Short distances cause the player to stop early; choose a longer route when continued running is intended. Run commands have a 1.2 second watchdog and can be replaced sooner.',
    plans:state.strategies.map((s,team)=>({team,name:STRATEGIES[s].name,instruction:STRATEGIES[s].description})),
    ball:state.ball,players:state.players.map(p=>({id:p.id,team:p.team,role:p.role,x:p.x,z:p.z,vx:p.vx,vz:p.vz,cooldown:p.cooldown||0,...(p.role==='GK'?{keeper:p.keeper}: {})})),
    ...(!keepers?{support:supportObservation(state,team)}:{}),
    ...(keepers?{keeperObservations:Object.fromEntries(state.players.filter(p=>p.role==='GK').map(p=>{const o=keeperObservation(state,p);delete o.trackingTargetX;return [p.id,o];}))}:{}),
  };
}
export function buildIntentRequest(state,keepers=false,team=1){
  const choices={},questions={};
  for(const p of state.players.filter(p=>keepers?p.role==='GK':p.team===team&&p.role!=='GK'&&(team!==0||p.id!==state.selected))){
    const owns=state.ball.owner===p.id,options={hold:choice('Hold position / wait',{type:keepers?'keeper':'hold',action:'stop_position'})};
    if(keepers&&p.keeper?.committed){options.hold=choice('Finish the committed dive',{type:'keeper',action:'wait'});}
    else {
      options.run=choice(keepers?'Move along the goal line; select destination and speed next':'Run to a destination you select next; select speed next',{type:keepers?'keeper':'move',action:'position'});
      if(owns){
        for(const q of state.players.filter(q=>q.team===p.team&&q.id!==p.id))options[`pass_${q.id}`]=choice(`Pass to ${q.id} at (${q.x.toFixed(1)}, ${q.z.toFixed(1)}); choose lead, power and elevation next`,{type:'pass',target:q.id});
        options.pass_space=choice('Pass into open space; choose direction, power and elevation next',{type:'pass'});
        options.shoot=choice('Shoot; choose aim, power and elevation next',{type:'shoot'});
        options.clear=choice('Clear the ball; choose direction, power and elevation next',{type:'clear'});
        for(const q of state.players.filter(q=>q.team===p.team&&q.id!==p.id))options[`lob_${q.id}`]=choice(`Lob over pressure to ${q.id}; choose lead, power and loft next`,{type:'pass',target:q.id,flight:'lob'});
        options.lob_space=choice('Lob into open space above defenders',{type:'pass',flight:'lob'});
        options.chip=choice('Chip a shot over an advanced goalkeeper; select range and loft carefully',{type:'shoot',flight:'chip'});
      }else if(keepers){
        options.center=choice('Block at the current position',{type:'keeper',action:'center'});
        for(const side of ['left','right'])for(const height of ['low','high'])options[`${side}_${height}`]=choice(`Dive ${side} (${side==='left'?'negative':'positive'} x), ${height}`,{type:'keeper',action:`${side}_${height}`});
      }else{
        const ourBall=state.players.some(q=>q.id===state.ball.owner&&q.team===p.team)||(!state.ball.owner&&state.ball.lastTouch===p.team&&state.ball.receiver);
        if(ourBall){for(const [key,label]of Object.entries({support:'Offer a diagonal passing option while moving with our carrier',get_free:'Move away from a marker and open a receiving lane',overlap:'Run wide beyond a teammate while keeping the lane clear',run_behind:'Run into space behind defenders at a different depth from the other striker',cover:'Move into defensive cover behind our attack'}))options[key]=choice(label,{type:'move',purpose:key});}
        const carrier=state.players.find(q=>q.id===state.ball.owner);
        if(carrier&&carrier.team!==p.team&&distance(p,carrier)<1.65)options.tackle=choice(`Tackle ${carrier.id} within reach`,{type:'tackle',target:carrier.id});
      }
    }
    choices[p.id]=options;
    questions[`intent_${p.id}`]={type:'choice',instructions:`Select the next action for player ${p.id}, team ${p.team}, role ${p.role}. Follow that team's plan. The objective is to score and prevent goals. Decide whether to run, hold, pass, shoot or defend from the observed positions and velocities. Choose your own attacking space, marking and support. Use state.support principles and per-player space measurements. No movement target is imposed. If our carrier moves, keep useful passing distances and move into an open lane. Do not all chase the ball or run to the same place. Use get_free under close marking; support for a short triangle; overlap for a wide run; run_behind for depth; cover to protect a counterattack. Hold only when already well placed. When a low pass is blocked but the receiver has landing space, consider a lob. Use a chip mainly when the keeper is away from goal. A shot still must pass below the crossbar. Never issue a command for the human-controlled player. When passing, choose the receiver here. Another call will select execution parameters conditioned on this choice. A keeper already diving must finish the dive.`,criteria:criteria(options)};
  }
  return {choices,body:{model:'jev-1.13.0',state:observation(state,keepers,team),questions}};
}
export function readChoice(data,key,options){
  const a=data?.answers?.[key];
  if(a?.type!=='choice'||!Object.hasOwn(options,a.choice)||!Number.isFinite(a.confidence)||a.confidence<0||a.confidence>1)throw new Error(`Invalid model choice: ${key}`);
  const probabilities={};let sum=0;
  for(const k of Object.keys(options)){const n=a.probabilities?.[k];if(!Number.isFinite(n)||n<0||n>1)throw new Error(`Invalid probability: ${key}`);probabilities[k]=n;sum+=n;}
  if(Math.abs(sum-1)>.025)throw new Error(`Invalid distribution: ${key}`);
  return {choice:a.choice,label:options[a.choice].label,value:options[a.choice].value,probabilities,confidence:a.confidence,labels:criteria(options)};
}
export function readIntents(data,request){return Object.fromEntries(Object.entries(request.choices).map(([id,options])=>[id,readChoice(data,`intent_${id}`,options)]));}
function directionChoices(){
  return Object.fromEntries(Array.from({length:72},(_,i)=>{const degrees=i*5,angle=degrees*Math.PI/180;return [`angle_${degrees}`,choice(`${degrees}° clockwise from +z; direction (${Math.sin(angle).toFixed(3)}, ${Math.cos(angle).toFixed(3)})`,{direction:{x:Math.sin(angle),z:Math.cos(angle)},angleDegrees:degrees})];}));
}
export function buildParameterRequest(state,intents,keepers=false,team=1){
  const choices={},questions={};
  function add(id,name,title,options){
    (choices[id]??={})[name]=options;
    questions[`${id}_${name}`]={type:'choice',instructions:`For player ${id}, execute the selected intent in state.intents.${id}. ${title} Choose the physical control yourself. Other players' selected intents are visible for coordination. Every parameter question sees the same selected intents, but cannot see another parameter answer.`,criteria:criteria(options)};
  }
  for(const [id,intent]of Object.entries(intents)){
    const p=state.players.find(p=>p.id===id),c=intent.value;
    if(c.type==='move'){
      const options=Object.fromEntries(Array.from({length:16},(_,i)=>{const a=i*Math.PI/8;return [`dir_${i}`,choice(`Run towards world direction (${Math.sin(a).toFixed(3)}, ${Math.cos(a).toFixed(3)}); bearing ${i*22.5}° clockwise from +z`,{x:Math.sin(a),z:Math.cos(a),angleDegrees:i*22.5})];}));
      add(id,'direction','Choose the running direction for this purpose. Use open lanes, our carrier velocity and other players selected intents. Support the human carrier without crossing their path. Preserve team width, stagger forward runs and keep cover.',options);
      add(id,'distance','Choose how far the player intends to run before stopping. Select an actual stopping distance, not a per-frame step. A new response can change the route before it ends.',Object.fromEntries(movementDistances.map(metres=>[`metres_${metres}`,choice(`Travel ${metres} metres before stopping`,metres)])));
      add(id,'speed','Choose the running speed.',Object.fromEntries(runSpeeds.map(speed=>[`speed_${speed}`,choice(`Run at ${speed} m/s`,speed)])));
    }else if(c.type==='keeper'&&c.action==='position'){
      add(id,'destination','Choose an absolute goal-line position. Left and right mean world x.',Object.fromEntries(Array.from({length:25},(_,i)=>{const x=-3+i*.25;return [`x_${x}`,choice(`Move to x=${x} m; displacement ${rounded(x-p.x)} m`,{x})];})));
      add(id,'speed','Choose the lateral movement speed.',Object.fromEntries([.75,1.5,2.25,3].map(speed=>[`speed_${speed}`,choice(`Move at ${speed} m/s`,speed)])));
    }else if(['pass','shoot','clear'].includes(c.type)){
      const options=directionChoices();
      if(c.target){const target=state.players.find(q=>q.id===c.target);for(const dx of [-4,-2,0,2,4])for(const dz of [-4,-2,0,2,4]){const x=clamp(target.x+dx,-33,33),z=clamp(target.z+dz,-51.5,51.5);options[`lead_${dx}_${dz}`]=choice(`Aim at (${rounded(x)}, ${rounded(z)}), offset (${dx}, ${dz}) m from receiver ${target.id}`,{aimPoint:{x,z},lead:{x:dx,z:dz}});}}
      if(c.type==='shoot')for(let i=0;i<19;i++){const x=-4.5+i*.5,z=direction(p.team)*52.5;options[`goal_${x}`]=choice(`Aim at goal-line x=${x} m, z=${z} m; choose elevation and power separately`,{aimPoint:{x,z}});}
      add(id,'aim','Choose the horizontal aim. Aim points are converted to a direction only; there is no automatic aim correction or receiver lead.',options);
      add(id,'power','Choose launch speed (kick power). Use observed range, gravity and ground drag; no code will adjust your selection.',Object.fromEntries(kickSpeeds.map(speed=>[`speed_${speed}`,choice(`Launch at ${speed} m/s (${Math.round(speed/33*100)}% of maximum kick power)`,speed)])));
      add(id,'elevation','Choose the launch angle above the ground. Zero is a ground kick. A larger angle gives more loft. No code will calculate a target height.',Object.fromEntries((c.flight==='chip'?[30,40,55]:c.flight==='lob'?[20,30,40,55]:elevations).map(angle=>[`degrees_${angle}`,choice(`Launch ${angle}° above the ground`,angle)])));
    }
  }
  return {choices,body:{model:'jev-1.13.0',state:{...observation(state,keepers,team),intents:Object.fromEntries(Object.entries(intents).map(([id,d])=>[id,{...d.value,action:d.choice,...(d.value.type==='keeper'?{keeperAction:d.value.action}:{})}]))},questions}};
}
export function compileModelCommands(state,intents,request,data){
  const decisions={};
  for(const [id,intent]of Object.entries(intents)){
    const p=state.players.find(p=>p.id===id),parameters={};
    for(const [name,options]of Object.entries(request.choices[id]||{}))parameters[name]=readChoice(data,`${id}_${name}`,options);
    const c={...intent.value,parameterized:true,controlVersion:2,requiresBall:state.ball.owner===id,duration:MODEL_CONTROL.actionLifetime};
    if(p.role==='GK')c.ballVersion=state.ball.version||0;
    if(c.type==='move'){
      const d=parameters.direction.value,metres=parameters.distance.value;
      Object.assign(c,{x:clamp(p.x+d.x*metres,-32.8,32.8),z:clamp(p.z+d.z*metres,-51.1,51.1),distance:metres,angleDegrees:d.angleDegrees,speed:parameters.speed.value,continuous:true,duration:MODEL_CONTROL.runLifetime});
    }
    if(c.type==='keeper'&&c.action==='position')Object.assign(c,parameters.destination.value,{speed:parameters.speed.value,duration:MODEL_CONTROL.runLifetime});
    if(['pass','shoot','clear'].includes(c.type))Object.assign(c,parameters.aim.value,{kickSpeed:parameters.power.value,elevationDegrees:parameters.elevation.value,power:parameters.power.value/33});
    c.label=intent.label;
    if(c.type==='move')c.label=`Run ${c.distance} m · ${c.angleDegrees}° · ${c.speed} m/s`;
    if(c.type==='keeper'&&c.action==='position')c.label=`Move to x=${c.x} m · ${c.speed} m/s`;
    if(['pass','shoot','clear'].includes(c.type)){
      const aim=c.aimPoint?`aim (${rounded(c.aimPoint.x)}, ${rounded(c.aimPoint.z)}) m`:`bearing ${c.angleDegrees}°`;
      c.label=`${c.type==='pass'?'Pass':c.type==='shoot'?'Shoot':'Clear'}${c.target?' '+c.target.toUpperCase():''} · ${aim} · ${c.kickSpeed} m/s · ${c.elevationDegrees}° elevation`;
    }
    decisions[id]={action:intent.choice,label:c.label,command:c,probabilities:intent.probabilities,labels:intent.labels,confidence:intent.confidence,parameters,controller:'JEV action + JEV parameters'};
  }
  return decisions;
}
export async function decideModelControl(state,call,{keepers=false,team=1,now=()=>performance.now(),signal}={}){
  const start=now(),first=buildIntentRequest(state,keepers,team),intentData=await call(first.body,signal),intentMs=now()-start,intents=readIntents(intentData,first);
  if(signal?.aborted)throw new Error('Decision cancelled');
  const second=buildParameterRequest(state,intents,keepers,team),hasParameters=Object.keys(second.body.questions).length>0;
  const parametersData=hasParameters?await call(second.body,signal):{answers:{}};
  const stages={intentMs:Math.round(intentMs),parametersMs:Math.round(now()-start-intentMs),calls:hasParameters?2:1,intentQuestions:Object.keys(first.body.questions).length,parameterQuestions:Object.keys(second.body.questions).length};
  const decisions=compileModelCommands(state,intents,second,parametersData);
  for(const d of Object.values(decisions))d.stages=stages;
  return {decisions,stages,model:parametersData.model||intentData.model,controlVersion:2};
}
