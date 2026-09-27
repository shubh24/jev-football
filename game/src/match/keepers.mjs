import {ACTIONS,buildDecisionRequest,sanitizeObservation} from '../decision.mjs';
import {createKeeper,applyKeeperAction,updateKeeper,controlledKeeperPose,isStepping} from '../keeper-control.mjs';
import {clamp,direction,passOptions} from './strategy.mjs';
export const KEEPER_LABELS={wait:'Wait / finish step',center:'Block here',step_left_25:'Step left (−x) · 0.25 m',step_left_50:'Step left (−x) · 0.50 m',step_right_25:'Step right (+x) · 0.25 m',step_right_50:'Step right (+x) · 0.50 m',left_low:'Dive left (−x) · low',left_high:'Dive left (−x) · high',right_low:'Dive right (+x) · low',right_high:'Dive right (+x) · high',track:'Track the ball'};
export function resetMatchKeeper(p){p.keeper=createKeeper();p.keeper.x=p.x;p.keeper.targetX=p.x;p.dive=null;}
export function matchKeeperPose(p,time){
  const k=p.keeper||{...createKeeper(),x:p.x,targetX:p.x,action:p.dive?.action||'center',actionAt:p.dive?.time??time-.3,committed:Boolean(p.dive)};
  const pose=controlledKeeperPose(k,time),localZ=pose.origin[2];
  for(const j of Object.values(pose.joints))j[2]=p.z+(j[2]-localZ)*direction(p.team);
  pose.origin[2]=p.z;pose.front=direction(p.team);return pose;
}
export function keeperObservation(state,p){
  const b=state.ball,dir=direction(p.team),vz=b.vz*dir,z=(b.z-p.z)*dir;
  const t=vz<-.1?z/-vz:0,projectedX=b.x+b.vx*t;
  const threat=!b.owner&&t>0&&t<1.6&&Math.abs(projectedX)<5;
  const k=p.keeper,observation=sanitizeObservation({requestId:state.requestId||0,shotId:state.ball.version||0,phase:threat?'flight':'approach',elapsed:0,keeperX:p.x,keeperTargetX:k?.targetX??p.x,keeperMoving:k?isStepping(k):false,visibleLean:'balanced',history:[],...(threat?{ballPosition:[b.x,b.y,z],ballVelocity:[b.vx,b.vy,vz]}:{})});
  if(threat){observation.observedTrajectory.heightM=Math.max(.11,observation.observedTrajectory.heightM);}
  return {...observation,threat,committed:k?.committed===true,ownsBall:b.owner===p.id,trackingTargetX:clamp(b.x*.18,-2.6,2.6)};
}
export function keeperOptions(state,p){
  const o=keeperObservation(state,p),base={duration:.7,requiresBall:o.ownsBall,ballVersion:state.ball.version||0};
  if(o.ownsBall){const options={wait:{...base,type:'keeper',action:'wait',label:'Hold the ball'}};
    for(const q of passOptions(state,p))options[`pass_${q.id}`]={...base,type:'pass',target:q.id,x:q.x,z:q.z,distance:q.distance,clearance:q.clearance,label:`Pass ${q.id.toUpperCase()} · ${q.distance.toFixed(0)} m`,duration:.7};
    options.clear={...base,type:'clear',label:'Clear upfield'};return options;
  }
  const options=Object.fromEntries(Object.keys(ACTIONS).map(action=>[action,{...base,type:'keeper',action,label:KEEPER_LABELS[action]}]));
  options.track={...base,type:'keeper',action:'track',x:o.trackingTargetX,label:`Track ball · x ${o.trackingTargetX.toFixed(1)} m`};return options;
}
export function buildKeeperRequest(state){
  const choices={},keepers={},questions={},instructions=buildDecisionRequest({}).questions.response.instructions;
  for(const p of state.players.filter(p=>p.role==='GK')){
    const observation=keeperObservation(state,p),options=keeperOptions(state,p);choices[p.id]=options;keepers[p.id]={team:p.team,position:{x:p.x,z:p.z},observation,options};
    questions[`player_${p.id}`]={type:'choice',instructions:`You control only ${p.id}. Use keepers.${p.id}.observation. ${instructions} In this match, left means negative world x and right means positive world x at BOTH goals, independent of the camera. If committed is true, wait for the dive to finish. If ownsBall is true, pass to an available teammate or clear; do not hold indefinitely. If threat is false and you do not own the ball, track the ball unless already moving or aligned with trackingTargetX. If threat is true, prefer the appropriate block, step or dive immediately, not track.`,criteria:Object.fromEntries(Object.entries(options).map(([key,c])=>[key,ACTIONS[key]||c.label]))};
  }
  return {choices,body:{model:'jev-1.13.0',state:{game:'Two independent football goalkeepers, one per team. Use only the observation for the keeper named in the question. No private shot target is given. Ball position and velocity are observed. Directions are world x, not camera directions.',keepers},questions}};
}
export function practiceKeeperAction(state,p){
  const o=keeperObservation(state,p),options=keeperOptions(state,p);let action='wait';
  if(o.ownsBall)action=Object.keys(options).find(k=>k.startsWith('pass_'))||'clear';
  else if(!o.committed&&o.threat){const t=o.observedTrajectory,side=t.horizontalOffsetM<0?'left':'right',offset=Math.abs(t.horizontalOffsetM);
    action=offset<.28?'center':t.heightM>=.65&&t.heightM<=1.8&&offset<=.85?(o.keeperMoving?'wait':`step_${side}_${offset<=.52?'25':'50'}`):`${side}_${t.heightM>1.2?'high':'low'}`;
  }else if(!o.committed&&!o.keeperMoving)action='track';
  return {action,command:options[action],label:options[action].label,options,labels:Object.fromEntries(Object.entries(options).map(([k,c])=>[k,c.label])),probabilities:Object.fromEntries(Object.keys(options).map(k=>[k,k===action?1:0]))};
}
export function performKeeperCommand(p,command,time){
  if(!p.keeper)resetMatchKeeper(p);const k=p.keeper;
  if(command.action==='position'){
    if(k.committed)return false;
    if(!isStepping(k))k.stepAt=time;
    k.targetX=clamp(command.x,-3,3);k.speedLimit=clamp(command.speed,.1,3);k.moveExpires=time+command.duration;k.action='wait';k.actionAt=time;return true;
  }
  if(command.action==='stop_position'){
    if(k.committed)return false;
    k.targetX=k.x;k.velocity=0;k.moveExpires=0;k.action='wait';k.actionAt=time;return true;
  }
  if(command.controlVersion!==2){delete k.speedLimit;delete k.moveExpires;}
  if(command.action==='track'){
    if(k.committed||isStepping(k))return false;
    k.targetX=clamp(command.x,-3,3);k.stepAt=time;k.action='wait';k.actionAt=time;return true;
  }
  const applied=applyKeeperAction(k,command.action,time);
  if(applied&&k.committed)p.dive={action:k.action,time:k.actionAt};return applied;
}
export function advanceMatchKeeper(p,dt,time){
  if(!p.keeper)resetMatchKeeper(p);let k=p.keeper;
  if(k.committed&&time-k.actionAt>1.15){const landing=clamp(controlledKeeperPose(k,time).origin[0],-3,3);resetMatchKeeper(p);k=p.keeper;k.x=k.targetX=landing;}
  if(k.moveExpires&&time>=k.moveExpires&&!k.committed){k.targetX=k.x;k.moveExpires=0;}
  updateKeeper(k,dt);p.x=k.x;p.vx=k.velocity;p.vz=0;
}
