// Audio observes completed game events. It never selects a player's action.
export function soundEvent(state,type,detail={}){
  state.soundSerial=(state.soundSerial||0)+1;
  (state.soundEvents??=[]).push({id:state.soundSerial,time:state.time,type,...detail});
  if(state.soundEvents.length>80)state.soundEvents.shift();
}
export function dangerLevel(state){
  if(state.phase!=='playing')return 0;
  const b=state.ball,owner=state.players.find(p=>p.id===b.owner);
  const team=owner?.team??b.shot?.team;
  if(team===undefined)return 0;
  const goal=team===0?-52.5:52.5,range=Math.hypot(b.x,goal-b.z);
  const central=Math.max(.15,1-Math.abs(b.x)/35);
  return Math.max(0,Math.min(1,(36-range)/25))*central;
}
export class SoundDirector{
  constructor(){this.reset();}
  reset(){this.lastId=0;this.phase='ready';this.sequence=null;this.ownerTeam=null;this.lastTurnover=-10;this.lastDanger=-15;this.previousDanger=0;}
  update(state){
    const active=['playing','goal'].includes(state.phase),cues=[];
    if(active){
      for(const e of state.soundEvents||[])if(e.id>this.lastId)cues.push(e);
      if(state.phase==='playing'&&(['ready','halftime'].includes(this.phase)||(this.phase==='goal'&&state.sequence!==this.sequence)))cues.push({type:'whistle',time:state.time});
    }
    this.lastId=state.soundSerial||0;
    if(['halftime','finished'].includes(state.phase)&&state.phase!==this.phase)cues.push({type:'whistle',time:state.time,break:state.phase});
    const owner=state.players.find(p=>p.id===state.ball.owner);
    if(state.sequence!==this.sequence)this.ownerTeam=owner?.team??null;
    if(owner&&state.phase==='playing'){
      if(this.ownerTeam!==null&&owner.team!==this.ownerTeam&&state.time-this.lastTurnover>3&&!cues.some(c=>c.type==='tackle'||c.type==='save')){
        cues.push({type:'possession',team:owner.team,player:owner.id,time:state.time});this.lastTurnover=state.time;
      }
      this.ownerTeam=owner.team;
    }
    const tension=dangerLevel(state);
    if(tension>.55&&this.previousDanger<=.55&&state.time-this.lastDanger>10){
      cues.push({type:'danger',player:owner?.id,time:state.time});this.lastDanger=state.time;
    }
    this.previousDanger=tension;this.phase=state.phase;this.sequence=state.sequence;
    return {active,tension,cues};
  }
}
