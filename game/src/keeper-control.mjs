import {keeperPose} from './physics.mjs';

export const FOOTWORK = {step_left_25:-.25,step_left_50:-.5,step_right_25:.25,step_right_50:.5};
export const DIVES = new Set(['left_low','left_high','right_low','right_high']);
export const KEEPER_SPEED = 3;
export const KEEPER_ACCELERATION = 22;
export const KEEPER_LIMIT = 3;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function createKeeper(){return {x:0,targetX:0,velocity:0,action:'wait',actionAt:0,stepAt:0,committed:false};}
export function isStepping(keeper){return Math.abs(keeper.targetX-keeper.x)>.005||Math.abs(keeper.velocity)>.02;}
export function applyKeeperAction(keeper,action,clock){
  if(keeper.committed)return false;
  if(Object.hasOwn(FOOTWORK,action)){
    // Finish a step before accepting another relative step. This prevents
    // overlapping responses from accumulating unintended displacement.
    if(isStepping(keeper))return false;
    keeper.targetX=clamp(keeper.x+FOOTWORK[action],-KEEPER_LIMIT,KEEPER_LIMIT);
    keeper.stepAt=clock;keeper.action='wait';keeper.actionAt=clock;return true;
  }
  if(DIVES.has(action)){
    keeper.targetX=keeper.x;keeper.velocity=0;keeper.action=action;keeper.actionAt=clock;keeper.committed=true;return true;
  }
  if(action==='wait'||action==='center'){
    if(keeper.action!==action){keeper.action=action;keeper.actionAt=clock;}
    return true;
  }
  return false;
}
export function updateKeeper(keeper,dt){
  if(keeper.committed)return;
  const distance=keeper.targetX-keeper.x;
  if(Math.abs(distance)<.00001){keeper.x=keeper.targetX;keeper.velocity=0;return;}
  const desired=Math.sign(distance)*Math.min(clamp(keeper.speedLimit??KEEPER_SPEED,.1,KEEPER_SPEED),Math.sqrt(2*KEEPER_ACCELERATION*Math.abs(distance)));
  keeper.velocity+=clamp(desired-keeper.velocity,-KEEPER_ACCELERATION*dt,KEEPER_ACCELERATION*dt);
  const move=keeper.velocity*dt;
  if(Math.abs(move)>=Math.abs(distance)&&Math.sign(move)===Math.sign(distance)){keeper.x=keeper.targetX;keeper.velocity=0;}
  else keeper.x=clamp(keeper.x+move,-KEEPER_LIMIT,KEEPER_LIMIT);
}
export function controlledKeeperPose(keeper,clock){
  const pose=keeperPose(keeper.action,Math.max(0,clock-keeper.actionAt),clock);
  // Breathing rotates the body. Its root stays at the commanded position.
  const offset=keeper.committed?keeper.x:keeper.x-pose.origin[0];
  pose.origin[0]+=offset;
  for(const joint of Object.values(pose.joints))joint[0]+=offset;
  if(isStepping(keeper)&&!keeper.committed){
    const gait=Math.sin((clock-keeper.stepAt)*22),strength=Math.min(1,Math.abs(keeper.velocity)/KEEPER_SPEED);
    for(const [side,sign]of[['L',1],['R',-1]]){
      const lift=Math.max(0,gait*sign)*.055*strength;
      pose.joints[`ankle${side}`][1]+=lift;pose.joints[`knee${side}`][1]+=lift*.7;
    }
  }
  return pose;
}
