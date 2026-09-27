import {direction,distance,clamp,laneClearance} from './strategy.mjs';
import {possessionTeam} from './team-structure.mjs';
// Space measurements are observations, not assigned movement targets.
export function supportObservation(state,team){
 const own=state.players.filter(p=>p.team===team),opponents=state.players.filter(p=>p.team!==team),carrier=state.players.find(p=>p.id===state.ball.owner),dir=direction(team);
 const attacking=possessionTeam(state)===team;
 const anchor=carrier?.team===team?carrier:state.ball,players={};
 for(const p of own.filter(p=>p.role!=='GK')){
  const marker=opponents.reduce((best,q)=>!best||distance(p,q)<distance(p,best)?q:best,null);
  const candidates=[];
  if(attacking&&p.id!==carrier?.id){
   for(const dx of [-8,0,8])for(const dz of [-7,2,11]){
    const point={x:clamp(p.x+dx,-30,30),z:clamp(p.z+dz*dir,-48,48)};
    const openness=Math.min(...opponents.map(q=>distance(q,point))),separation=Math.min(...own.filter(q=>q.id!==p.id).map(q=>distance(q,point))),range=distance(point,anchor);
    const lane=laneClearance(state,{...anchor,team},point);
    const score=Math.min(openness,9)+Math.min(lane,6)*1.4+Math.min(separation,7)*.7-Math.abs(range-13)*.25-distance(p,point)*.12;
    candidates.push({...point,nearestOpponentM:+openness.toFixed(1),nearestTeammateM:+separation.toFixed(1),groundPassClearanceM:+lane.toFixed(1),distanceFromBallM:+range.toFixed(1),score});
   }
  }
  players[p.id]={nearestOpponent:marker?{id:marker.id,distanceM:+distance(p,marker).toFixed(1),x:marker.x,z:marker.z}:null,currentPassClearanceM:+laneClearance(state,{...anchor,team},p).toFixed(1),openSpaces:candidates.sort((a,b)=>b.score-a.score).slice(0,3).map(({score,...point})=>point)};
 }
 return {team,attacking:Boolean(attacking),humanControlled:team===0?state.selected:null,ballCarrier:carrier?{id:carrier.id,team:carrier.team,x:carrier.x,z:carrier.z,vx:carrier.vx,vz:carrier.vz}:null,players,
  principles:'When our carrier advances, move with the attack. Offer a short diagonal outlet, a wide outlet and a forward run at different depths. Move away from your nearest marker and out of a blocked passing lane. Avoid the carrier path and keep roughly 5 metres from other support players. Keep both centre backs and one midfielder behind the ball when possible. Strikers stagger their depth; one comes short while the other runs behind. Wide midfielders stretch the defence; a ball-side fullback can overlap if cover remains. After passing, move again to offer a return pass. When possession is lost, the closest available player presses while others recover, mark and cover. Space samples are optional measurements; select your own route, distance and speed.'};
}
