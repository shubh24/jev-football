import {clamp,direction,distance,shootingCues,attackingCues,laneClearance,STRATEGIES} from './strategy.mjs';
export function possessionTeam(state){
 const owner=state.players.find(p=>p.id===state.ball.owner);if(owner)return owner.team;
 const b=state.ball,passer=state.players.find(p=>p.id===b.lastPassFrom);
 if(!['shoot','chip','clear'].includes(b.kickStyle)&&(b.receiver||passer?.team===b.lastTouch&&state.time-(b.lastPassAt||0)<2.5))return b.lastTouch;
 return null;
}
export const zoneGap=(p,z)=>Math.hypot(Math.max(0,z.minX-p.x,p.x-z.maxX),Math.max(0,z.minZ-p.z,p.z-z.maxZ));
export function teamStructure(state,team){
 const dir=direction(team),possession=possessionTeam(state),attacking=possession===team,phase=possession===null?'loose':attacking?'attack':'defend';
 const own=state.players.filter(p=>p.team===team&&p.role!=='GK'),eligible=own.filter(p=>team!==0||p.id!==state.selected),carrier=state.players.find(p=>p.id===state.ball.owner);
 const ranked=[...eligible].sort((a,b)=>distance(a,state.ball)-distance(b,state.ball));
 const previous=eligible.find(p=>p.currentCommand?.assignment==='press'&&p.currentCommand.remaining>0);
 const presser=!attacking?(previous&&distance(previous,state.ball)<=distance(ranked[0]||previous,state.ball)+4?previous:ranked[0]):null;
 // Stable role lanes; the formation follows the ball in six-metre bands.
 const strategy=STRATEGIES[state.strategies[team]];
 const progress=clamp(Math.round(state.ball.z*dir/6)*6,-42,42),side=state.ball.x<0?-1:1,shift=clamp(Math.round(state.ball.x/8)*2,-6,6),assignments={};
 for(const p of own){
  const index=p.index,s=index===1||index===2||index===5||index===6||index===9?-1:1;
  let duty,x,z,halfX=5,halfZ=5;
  if(p.id===state.ball.owner){duty='carry';x=p.x;z=p.z*dir+8;halfX=9;halfZ=8;}
  else if(!state.ball.owner&&state.ball.receiver===p.id){duty='receive';const point=state.ball.passTarget||{x:state.ball.x+state.ball.vx*.4,z:state.ball.z+state.ball.vz*.4};x=point.x;z=point.z*dir;halfX=1.5;halfZ=1.5;}
  else if(p.id===presser?.id){duty='press';const target=carrier||state.ball;x=clamp(target.x+(target.vx||0)*.15,-33.4,33.4);z=clamp((target.z+(target.vz||0)*.15)*dir,-51.8,51.8);halfX=.35;halfZ=.35;}
  else if(attacking){
   if(p.role==='CB'){duty='cover';x=s*9+shift;z=Math.min(progress-16,12);halfX=4;halfZ=4;}
   else if(p.role==='LB'||p.role==='RB'){const overlap=s===side&&progress>0;duty=overlap?'overlap':'cover';x=s*25;z=progress+(overlap?6:-12);}
   else if(p.role==='LM'||p.role==='RM'){duty='wide';x=s*(progress>24?19:25);z=progress+9;halfX=4;}
   else if(index===6){duty='cover';x=-6+shift;z=progress-9;halfX=4;halfZ=4;}
   else if(p.role==='CM'){duty='support';x=7+shift;z=progress-3;}
   else {const deep=index===9||carrier?.index===9;duty=deep?'depth':'support';x=s*8+shift;z=progress+(deep?15:5);halfX=5;halfZ=4;}
  }else{
   duty='recover';
   if(p.role==='CB'){x=s*8+shift;z=Math.min(progress-13,-15);halfX=4;halfZ=3;}
   else if(p.role==='LB'||p.role==='RB'){x=s*22+shift;z=Math.min(progress-9,-11);}
   else if(p.role==='CM'){x=s*7+shift;z=progress-7;}
   else if(p.role==='LM'||p.role==='RM'){x=s*21+shift;z=progress-2;}
   else {x=s*9;z=progress+10;}
  }
  if(!['carry','press','receive'].includes(duty)){x*=strategy.width;z+=strategy.depth*.45;}
  const chasing=duty==='press'||duty==='receive';
  x=clamp(x,chasing?-33.4:-28,chasing?33.4:28);z=clamp(z,chasing?-51.8:-45,chasing?51.8:46)*dir;
  const boundX=chasing?33.4:31,boundZ=chasing?51.8:49;
  const zone={minX:clamp(x-halfX,-boundX,boundX),maxX:clamp(x+halfX,-boundX,boundX),minZ:clamp(z-halfZ,-boundZ,boundZ),maxZ:clamp(z+halfZ,-boundZ,boundZ)};
  assignments[p.id]={duty,lane:p.role+(s<0?' left':' right'),zone,centre:{x,z},gapM:+zoneGap(p,zone).toFixed(1)};
 }
 return {team,phase,formation:'4-4-2',attackDirection:dir,presser:presser?.id||null,assignments,
  instruction:'Keep the assigned lane and duty across replies. Centre backs and the holding midfielder provide cover. Only the named presser closes the ball. Support players keep width and different depths. JEV chooses exact routes and controls within these responsibilities.'};
}
export function playerCues(state,p){
 const shooting=shootingCues(state,p),attack=attackingCues(state,p);
 return {shooting,spaceAheadM:attack.spaceAheadM,nearestDefenderM:attack.nearestDefenderM,canAdvance:attack.canAdvance,
  passes:state.players.filter(q=>q.team===p.team&&q.id!==p.id&&distance(p,q)>3).map(q=>({id:q.id,distanceM:+distance(p,q).toFixed(1),progressM:+((q.z-p.z)*direction(p.team)).toFixed(1),clearanceM:+laneClearance(state,p,q).toFixed(1)}))};
}
