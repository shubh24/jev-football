import {clamp} from './strategy.mjs';
import {possessionTeam} from './team-structure.mjs';
import {isStepping,FOOTWORK} from '../keeper-control.mjs';
export const PRACTICE_INTERVAL=.2;
export const MAX_RESPONSE_AGE_MS=700;
export function commandReason(state,player,command){
  if(!player)return 'Unknown player';
  if(player.team===0&&player.role!=='GK'&&player.id===state.selected)return 'Human-controlled player';
  if(command.controlVersion===3&&command.teamPhase){const team=possessionTeam(state),phase=team===null?'loose':team===player.team?'attack':'defend';if(phase!==command.teamPhase)return 'Team possession changed';}
  if(command.type==='keeper'&&player.keeper&&isStepping(player.keeper)&&(command.action==='track'||Object.hasOwn(FOOTWORK,command.action)))return 'Step still in progress';
  if(command.ballVersion!==undefined&&command.ballVersion!==(state.ball.version||0))return 'Ball flight or possession changed';
  if(command.type==='keeper'&&player.keeper?.committed&&command.action!=='wait')return 'Dive already started';
  if(command.requiresBall===true&&state.ball.owner!==player.id)return 'Player no longer has the ball';
  if(command.requiresBall===false&&state.ball.owner===player.id)return 'Player has received the ball';
  if((command.type==='tackle'||command.tackleOnReach)&&state.ball.owner!==command.target)return 'Ball carrier changed';
  return null;
}
export function applyTeamResponse(state,decisions,observation,roundTripMs){
  const accepted={};
  for(const [id,d]of Object.entries(decisions)){
    const p=state.players.find(p=>p.id===id),c=d.command;
    const maxAge=c.controlVersion>=2?1200:MAX_RESPONSE_AGE_MS;
    const reason=p?.team===0&&p.role!=='GK'&&observation.selectionVersion!==undefined&&observation.selectionVersion!==(state.selectionVersion||0)?'Human selection changed':Math.max(roundTripMs,(state.time-observation.time)*1000)>maxAge?'Response too old':state.sequence!==observation.sequence?'Play restarted':state.planVersion!==observation.planVersion?'Plan changed':commandReason(state,p,c);
    const running=c.continuous===true&&['move','press'].includes(c.type);
    const expires=(running||c.controlVersion>=2?state.time:observation.time)+(c.duration??.6);
    const rejected=reason||(expires<=state.time?'Command expired in transit':null);
    const command=running&&c.runDirection?{...c,x:clamp(p.x+c.runDirection.x*c.lookAhead,-32.8,32.8),z:clamp(p.z+c.runDirection.z*c.lookAhead,-51.1,51.1)}:c;
    accepted[id]={...d,command,applied:!rejected,reason:rejected,observedAt:observation.time,receivedAt:state.time,expires};
    if(!rejected)state.orders[id]={command,expires,issuedAt:observation.time,used:false,source:'JEV'};
  }
  return accepted;
}
