import {poseCapsules,firstContact,BALL_RADIUS as R} from '../physics.mjs';
import {HOMES,ROLES,clamp,direction,distance,teamPlan,practiceAction} from './strategy.mjs';
import {commandReason} from './control.mjs';
import {KEEPER_LABELS,resetMatchKeeper,matchKeeperPose,performKeeperCommand,advanceMatchKeeper,practiceKeeperAction} from './keepers.mjs';
import {playerIdentity} from './teams.mjs';
import {soundEvent} from './sound-director.mjs';
export const FIELD={halfWidth:34,halfLength:52.5,goalWidth:7.32,goalHeight:2.44};
export const DT=1/120;
export const BALL_CONTROL={radius:3,height:1.05,maxSpeed:28,shotRadius:.72,shotSpeed:19};
export function createMatch(mode='live'){
  const players=[];
  for(const team of [0,1])for(let i=0;i<11;i++)players.push({id:`${team?'j':'h'}${i+1}`,team,index:i,role:ROLES[i],x:HOMES[i][0],z:HOMES[i][1]*direction(team),vx:0,vz:0,heading:team?0:Math.PI,cooldown:0,kickUntil:0,dive:null});
  for(const p of players)Object.assign(p,playerIdentity(p.team,p.index));
  const state={players,ball:{x:0,y:R,z:0,vx:0,vy:0,vz:0,owner:null,lastTouch:0,ownedAt:0,lockUntil:0},selected:'h10',selectionVersion:0,strategies:['possession','possession'],scores:[0,0],time:0,half:1,phase:'ready',mode,sequence:0,planVersion:0,orders:{},events:[],stats:[{passes:0,shots:0,tackles:0},{passes:0,shots:0,tackles:0}],restartIn:0,conceding:0};
  kickoff(state,0);state.phase='ready';return state;
}
export function event(state,text){state.events.push({time:state.time,text});if(state.events.length>40)state.events.shift();}
export function kickoff(state,team){
  for(const p of state.players){p.x=HOMES[p.index][0];p.z=HOMES[p.index][1]*direction(p.team);if(p.index>=9)p.z=-direction(p.team)*3;p.vx=0;p.vz=0;p.dive=null;p.cooldown=0;}
  for(const p of state.players)if(p.role==='GK'){p.z=-direction(p.team)*51.5;resetMatchKeeper(p);}
  for(const p of state.players)if(p.team!==team&&Math.hypot(p.x,p.z)<9.15)p.z=-direction(p.team)*10;
  const taker=state.players.find(p=>p.team===team&&p.index===9);taker.x=0;taker.z=-direction(team)*.8;
  Object.assign(state.ball,{x:0,y:R,z:0,vx:0,vy:0,vz:0,owner:taker.id,lastTouch:team,ownedAt:state.time,lockUntil:state.time+.5,receiver:null,passTarget:null,lastPassFrom:null,lastPassTo:null,lastPassAt:0,shot:null,version:(state.ball.version||0)+1});state.orders={};state.sequence++;selectHumanPlayer(state,'h10');state.controlOwner=state.ball.owner;state.incomingPlayer=null;state.manualSwitchUntil=0;
}
export function changeStrategy(state,team,strategy){state.strategies[team]=strategy;state.planVersion++;state.orders={};event(state,`${team?'JEV':'You'}: ${strategy}`);}
export function selectHumanPlayer(state,id){if(state.selected!==id){delete state.orders[state.selected];delete state.orders[id];state.selected=id;state.selectionVersion=(state.selectionVersion||0)+1;}return state.players.find(p=>p.id===id);}
export function switchPlayer(state){
  const p=state.players.filter(p=>p.team===0&&p.role!=='GK'&&p.id!==state.selected).sort((a,b)=>distance(a,state.ball)-distance(b,state.ball))[0];
  if(!p)return;
  selectHumanPlayer(state,p.id);state.controlOwner=state.ball.owner;state.manualSwitchUntil=state.time+.8;return p;
}
// Select a new owner immediately. For a free ball, select an approaching
// receiver only when the flight path reaches that player soon.
export function autoSwitchPlayer(state){
  const b=state.ball,owner=state.players.find(p=>p.id===b.owner);
  if(state.players.find(p=>p.id===state.selected)?.role==='GK')switchPlayer(state);
  if(owner){
    if(state.controlOwner!==owner.id&&owner.team===0&&owner.role!=='GK')selectHumanPlayer(state,owner.id);
    state.controlOwner=owner.id;state.incomingPlayer=null;return;
  }
  state.controlOwner=null;
  if(state.time<(state.manualSwitchUntil||0))return;
  const speed2=b.vx*b.vx+b.vz*b.vz;if(speed2<1)return;
  const arrivals=state.players.filter(p=>!p.dive&&p.cooldown<=0).map(p=>{
    const dx=p.x-b.x,dz=p.z-b.z,t=(dx*b.vx+dz*b.vz)/speed2;
    const miss=Math.hypot(dx-b.vx*t,dz-b.vz*t),height=Math.max(R,b.y+b.vy*t-4.905*t*t);
    return {p,t,miss,height};
  }).filter(a=>a.t>0&&a.t<.8&&a.miss<1.35&&a.height<1.2).sort((a,b)=>a.t-b.t);
  const arrival=arrivals[0];
  if(!arrival||arrival.p.team!==0||arrival.p.role==='GK')return;
  if(state.incomingPlayer!==arrival.p.id){selectHumanPlayer(state,arrival.p.id);state.incomingPlayer=arrival.p.id;}
}
function release(state,p,vx,vy,vz,type,flight=type){
  if(state.ball.owner!==p.id||p.cooldown>0)return false;
  const length=Math.hypot(vx,vz)||1;
  Object.assign(state.ball,{x:p.x+vx/length*.85,z:p.z+vz/length*.85,y:R+.03,vx,vy,vz,kickStyle:flight,owner:null,lastTouch:p.team,lockUntil:state.time+.12,receiver:null,passTarget:null,shot:null,version:(state.ball.version||0)+1});p.cooldown=.45;p.kickUntil=state.time+.3;p.heading=Math.atan2(vx,vz);
  if(type==='pass'){state.stats[p.team].passes++;state.ball.lastPassFrom=p.id;state.ball.lastPassTo=null;state.ball.lastPassAt=state.time;}if(type==='shoot')state.stats[p.team].shots++;
  state.ball.shot=type==='shoot'?{team:p.team,player:p.id,time:state.time}:null;
  soundEvent(state,type==='shoot'?'shot':'kick',{player:p.id,team:p.team,x:p.x,z:p.z});
  event(state,`${p.id.toUpperCase()} ${flight==='chip'?'chips a shot':flight==='lob'?'lobs the ball':type==='shoot'?'shoots':type==='pass'?'passes':'clears'}`);return true;
}
export function passBall(state,p,targetId,lead=0,power=null,loft=false){const target=state.players.find(q=>q.id===targetId&&q.team===p.team);if(!target||target.id===p.id)return false;const point={x:clamp(target.x+target.vx*.25,-32,32),z:clamp(target.z+target.vz*.25+direction(p.team)*lead,-49,49)},dx=point.x-p.x,dz=point.z-p.z,length=Math.hypot(dx,dz)||1,speed=power===null?clamp(length*1.1+lead,12,26):10+clamp(power,0,1)*22;const angle=40*Math.PI/180,lobSpeed=power===null?Math.sqrt(Math.max(3,length-.85)*9.81/Math.sin(2*angle)):10+clamp(power,0,1)*16;const horizontal=loft?lobSpeed*Math.cos(angle):speed;const ok=release(state,p,dx/length*horizontal,loft?lobSpeed*Math.sin(angle):.5,dz/length*horizontal,'pass',loft?'lob':'pass');if(ok){state.ball.receiver=target.id;state.ball.passTarget=point;state.ball.lastPassFrom=p.id;state.ball.lastPassTo=target.id;state.ball.lastPassAt=state.time;}return ok;}
export function shootBall(state,p,x=0,power=.65,height=.65){const goal=direction(p.team)*52.5,dx=clamp(x,-3.2,3.2)-p.x,dz=goal-p.z,speed=20+clamp(power,0,1)*13,length=Math.hypot(dx,dz)||1,t=length/speed;return release(state,p,dx/length*speed,clamp((height-R+4.905*t*t)/t,1.4,12),dz/length*speed,'shoot');}
// Model controls launch physics directly. No automatic pass lead or goal correction.
export function modelKick(state,p,command){
  const aim=command.aimPoint,d=aim?{x:aim.x-p.x,z:aim.z-p.z}:command.direction;
  if(!d||![d.x,d.z,command.kickSpeed,command.elevationDegrees].every(Number.isFinite)||!['pass','shoot','clear'].includes(command.type))return false;
  const length=Math.hypot(d.x,d.z);if(length<.001)return false;
  const speed=clamp(command.kickSpeed,0,33),angle=clamp(command.elevationDegrees,0,55)*Math.PI/180,horizontal=speed*Math.cos(angle);
  const ok=release(state,p,d.x/length*horizontal,speed*Math.sin(angle),d.z/length*horizontal,command.type,command.flight||command.type);
  if(ok&&command.type==='pass'){
    const receiver=state.players.find(q=>q.id===command.target&&q.team===p.team&&q.id!==p.id);
    state.ball.receiver=receiver?.id||null;state.ball.passTarget=aim?{...aim}:null;
    state.ball.lastPassFrom=p.id;state.ball.lastPassTo=receiver?.id||null;state.ball.lastPassAt=state.time;
  }
  return ok;
}
export function tackle(state,p){
  if(p.cooldown>0||state.time<state.ball.lockUntil)return false;p.cooldown=.7;
  const owner=state.players.find(q=>q.id===state.ball.owner);
  if(owner&&owner.team!==p.team&&distance(p,owner)<1.65){owner.cooldown=1.25;state.ball.owner=p.id;state.ball.version=(state.ball.version||0)+1;state.ball.ownedAt=state.time;state.ball.lastTouch=p.team;state.ball.lockUntil=state.time+.45;state.stats[p.team].tackles++;state.ball.shot=null;soundEvent(state,'tackle',{player:p.id,team:p.team,x:p.x});event(state,`${p.id.toUpperCase()} wins the ball`);return true;}return false;
}
export const keeperMatchPose=matchKeeperPose;

function perform(state,p,command){
  if(!command)return false;
  // Execute an explicit JEV challenge only after the selected route reaches the carrier.
  if(command.type==='move'&&command.tackleOnReach){const owner=state.players.find(q=>q.id===state.ball.owner);if(owner?.id===command.target&&owner.team!==p.team&&distance(p,owner)<1.65)return tackle(state,p);}
  if(command.controlVersion>=2&&['pass','shoot','clear'].includes(command.type))return modelKick(state,p,command);
  if(command.type==='keeper'&&p.role==='GK')return performKeeperCommand(p,command,state.time);
  if(command.type==='pass')return passBall(state,p,command.target,command.lead||0);
  if(command.type==='shoot')return shootBall(state,p,command.x,command.power,command.height);
  if(command.type==='clear')return release(state,p,clamp(-p.x,-12,12),7,direction(p.team)*25,'clear');
  if(command.type==='tackle')return tackle(state,p);
  if(command.type==='dive'&&!p.dive&&p.role==='GK'){p.dive={action:command.action,time:state.time};return true;}
  return false;
}
function movePlayer(p,x,z,dt,speed){
  const dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz),desiredX=d>.12?dx/d*Math.min(speed,d*5):0,desiredZ=d>.12?dz/d*Math.min(speed,d*5):0;
  const alpha=Math.min(1,dt*12);p.vx+=(desiredX-p.vx)*alpha;p.vz+=(desiredZ-p.vz)*alpha;
  p.x=clamp(p.x+p.vx*dt,-33.4,33.4);p.z=clamp(p.z+p.vz*dt,-51.8,51.8);
  if(Math.hypot(p.vx,p.vz)>.3)p.heading=Math.atan2(p.vx,p.vz);
}
const posts=[];
for(const z of [-52.5,52.5]){
  for(const x of [-3.66,3.66])posts.push({a:[x,0,z],b:[x,2.44,z],radius:.06,type:'post'});
  posts.push({a:[-3.66,2.44,z],b:[3.66,2.44,z],radius:.06,type:'post'});
}
function collectLooseBall(state){
  const b=state.ball;if(b.owner||state.time<=b.lockUntil||b.y>BALL_CONTROL.height||Math.abs(b.z)>52.5||Math.abs(b.x)>34)return false;
  const speed=Math.hypot(b.vx,b.vz),radius=b.shot?BALL_CONTROL.shotRadius:BALL_CONTROL.radius,maxSpeed=b.shot?BALL_CONTROL.shotSpeed:BALL_CONTROL.maxSpeed;
  if(speed>maxSpeed)return false;
  // The same control radius applies to both teams. Keepers retain physical
  // hand/body contact so this assistance cannot replace a goalkeeper save.
  const p=state.players.filter(p=>p.role!=='GK'&&!p.dive&&p.cooldown<=0&&distance(p,b)<=radius).sort((a,c)=>distance(a,b)-distance(c,b))[0];
  if(!p)return false;
  b.owner=p.id;b.version=(b.version||0)+1;b.ownedAt=state.time;b.lastTouch=p.team;b.vx=b.vy=b.vz=0;b.shot=null;b.receiver=null;b.passTarget=null;
  event(state,`${p.id.toUpperCase()} receives`);return true;
}
export function updateBall(state,dt){
  const b=state.ball,owner=state.players.find(p=>p.id===b.owner);
  if(owner){b.shot=null;b.receiver=null;b.passTarget=null;b.x=clamp(owner.x+Math.sin(owner.heading)*.64,-34+R,34-R);b.z=clamp(owner.z+Math.cos(owner.heading)*.64,-52.5+R,52.5-R);b.y=R;b.vx=owner.vx;b.vz=owner.vz;b.vy=0;return;}
  if(collectLooseBall(state))return;
  const start=[b.x,b.y,b.z];b.vy-=9.81*dt;const drag=Math.exp(-(b.y<=R+.015?.65:.025)*dt);b.vx*=drag;b.vz*=drag;
  let next=[b.x+b.vx*dt,b.y+b.vy*dt,b.z+b.vz*dt];
  const colliders=[...posts];
  for(const p of state.players){
    if(p.role==='GK')colliders.push(...poseCapsules(keeperMatchPose(p,state.time)).map(c=>({...c,player:p})));
    else colliders.push({a:[p.x,.16,p.z],b:[p.x,1.42,p.z],radius:.24,type:'player',player:p});
  }
  for(const c of colliders){
    if(c.player?.cooldown>.28&&c.player.team===b.lastTouch)continue;
    const hit=firstContact(start,next,c,R+c.radius);if(!hit)continue;
    const speed=Math.hypot(b.vx,b.vz);
    if(c.player&&state.time>b.lockUntil&&b.y<1.1&&speed<19&&!c.player.dive){if(c.player.role==='GK'&&b.shot&&c.player.team!==b.shot.team)soundEvent(state,'save',{player:c.player.id,team:c.player.team,x:c.player.x});b.shot=null;b.owner=c.player.id;b.version=(b.version||0)+1;b.ownedAt=state.time;b.lastTouch=c.player.team;b.vx=b.vy=b.vz=0;event(state,`${c.player.id.toUpperCase()} receives`);return;}
    let normal=hit.a.map((v,i)=>v-hit.b[i]),length=Math.hypot(...normal)||1;normal=normal.map(v=>v/length);const velocity=[b.vx,b.vy,b.vz],vn=velocity.reduce((s,v,i)=>s+v*normal[i],0);
    if(vn<0){if(c.type==='post')soundEvent(state,'post',{x:b.x});else if(c.player?.role==='GK'&&b.shot&&c.player.team!==b.shot.team){soundEvent(state,'save',{player:c.player.id,team:c.player.team,x:c.player.x});b.shot=null;}b.version=(b.version||0)+1;if(c.player?.role==='GK')event(state,`${c.player.id.toUpperCase()} contacts the ball`);const bounce=c.type==='post'?.74:.5;const v=velocity.map((v,i)=>v-(1+bounce)*vn*normal[i]);[b.vx,b.vy,b.vz]=v;next=hit.b.map((v,i)=>v+normal[i]*(R+c.radius+.004));if(c.player){if(c.player.team!==b.lastTouch){b.receiver=null;b.passTarget=null;}b.lastTouch=c.player.team;}break;}
  }
  if(next[1]<R){if(b.vy < -1.5)soundEvent(state,'bounce',{x:b.x,strength:Math.min(1,-b.vy/8)});next[1]=R;b.vy=Math.abs(b.vy)>.8?Math.abs(b.vy)*.4:0;}
  // Award a goal only when the whole ball crosses either line inside the frame.
  for(const sign of [-1,1])if(start[2]*sign<=52.5+R&&next[2]*sign>52.5+R){
    const t=(sign*(52.5+R)-start[2])/(next[2]-start[2]),x=start[0]+(next[0]-start[0])*t,y=start[1]+(next[1]-start[1])*t;
    if(Math.abs(x)<3.66-R&&y<2.44-R){const scoring=sign===-1?0:1;state.scores[scoring]++;state.phase='goal';state.restartIn=2.5;state.conceding=1-scoring;state.orders={};soundEvent(state,'goal',{team:scoring,player:b.shot?.player});event(state,`${scoring?'JEV':'You'} score`);b.x=next[0];b.y=next[1];b.z=next[2];return;}
  }
  if(Math.abs(next[0])>34-R){next[0]=Math.sign(next[0])*(34-R);b.vx*=-.72;b.version=(b.version||0)+1;}
  if(Math.abs(next[2])>52.5-R&&(Math.abs(next[0])>=3.66-R||next[1]>=2.44-R)){next[2]=Math.sign(next[2])*(52.5-R);b.vz*=-.72;b.version=(b.version||0)+1;}
  [b.x,b.y,b.z]=next;
  if(collectLooseBall(state))return;
  if(state.time>b.lockUntil&&b.y<.7){const near=state.players.filter(p=>!p.dive&&p.cooldown<=0&&distance(p,b)<.72).sort((a,c)=>distance(a,b)-distance(c,b))[0];if(near&&Math.hypot(b.vx,b.vz)<19){b.owner=near.id;b.version=(b.version||0)+1;b.lastTouch=near.team;b.ownedAt=state.time;}}
}
export function stepMatch(state,dt,input={}){
  if(state.phase==='goal'){state.restartIn-=dt;if(state.restartIn<=0){kickoff(state,state.conceding);state.phase='playing';}return;}
  if(state.phase!=='playing')return;
  state.time+=dt;
  if(state.time>=180){state.phase='finished';state.orders={};return;}
  if(state.time>=90&&state.half===1){state.half=2;state.phase='halftime';kickoff(state,1);return;}
  if(!input.autoHuman)autoSwitchPlayer(state);
  const plans=[teamPlan(state,0),teamPlan(state,1)];
  for(const p of state.players){
    p.cooldown=Math.max(0,p.cooldown-dt);
    if(p.role==='GK'){
      const packet=state.orders[p.id];let order,source='Waiting';
      if(state.mode==='practice'){order=practiceKeeperAction(state,p).command;source='Practice';}
      else if(packet?.expires>state.time&&!packet.used&&!commandReason(state,p,packet.command)){order=packet.command;source='JEV';}
      if(order){const used=perform(state,p,order);if(used){p.keeper.source=source;if(source==='JEV')packet.used=true;}p.executing={label:order.label,type:order.type,source,issuedAt:packet?.issuedAt,expires:packet?.expires};}
      else if(packet?.expires>state.time&&packet.used&&packet.command.controlVersion>=2&&!commandReason(state,p,packet.command))p.executing={label:packet.command.label,type:packet.command.type,source:'JEV',issuedAt:packet.issuedAt,expires:packet.expires};
      else if(!p.keeper?.committed&&!p.keeper?.velocity)p.executing={label:'Waiting for keeper decision',source};
      advanceMatchKeeper(p,dt,state.time);if(p.keeper.committed)p.executing={label:KEEPER_LABELS[p.keeper.action],type:'keeper',source:p.keeper.source||source};continue;
    }
    if(p.dive&&state.time-p.dive.time>1.15)p.dive=null;
    if(p.dive){p.vx=p.vz=0;continue;}
    if(p.id===state.selected&&!input.autoHuman){
      delete state.orders[p.id];p.executing={label:'Human control',source:'Human',type:'human'};
      const x=input.x||0,z=input.z||0,len=Math.hypot(x,z)||1;movePlayer(p,p.x+x/len*5,p.z+z/len*5,dt,input.sprint?8.5:5.8);
      if(input.tackle)tackle(state,p);continue;
    }
    let order,packet=state.orders[p.id],source='Practice';
    if(state.mode==='practice')order=practiceAction(state,p,plans[p.team]).command;
    else if(packet?.expires>state.time&&!packet.used&&!commandReason(state,p,packet.command)){order=packet.command;source='JEV';}
    else{source='Waiting';order={type:'hold',label:'Waiting for a JEV command'};}
    p.executing={label:order.label,type:order.type,source,x:order.x,z:order.z,issuedAt:packet?.issuedAt,expires:packet?.expires};
    const performed=perform(state,p,order);if(performed&&source==='JEV')packet.used=true;
    if(['move','press'].includes(order.type))movePlayer(p,order.x,order.z,dt,order.speed??6.1);
    else movePlayer(p,p.x,p.z,dt,0);
  }
  // Keep standing players apart without displacing a committed goalkeeper dive.
  for(let i=0;i<state.players.length;i++)for(let j=i+1;j<state.players.length;j++){
    const a=state.players[i],b=state.players[j],d=distance(a,b);if(d>.01&&d<.55&&!a.dive&&!b.dive){const push=(.55-d)*.5,dx=(a.x-b.x)/d*push,dz=(a.z-b.z)/d*push;a.x+=dx;a.z+=dz;b.x-=dx;b.z-=dz;}
  }
  updateBall(state,dt);
  if(!input.autoHuman&&state.phase==='playing')autoSwitchPlayer(state);
}
function kickDirection(player,vector){
  const length=vector&&Math.hypot(vector.x,vector.z);
  return length>.01?{x:vector.x/length,z:vector.z/length}:{x:Math.sin(player.heading),z:Math.cos(player.heading)};
}
export function humanPass(state,vector,power=null,loft=false){
  const p=state.players.find(p=>p.id===state.selected);if(!p||p.role==='GK'||state.ball.owner!==p.id)return false;
  const d=kickDirection(p,vector),strength=power===null?null:clamp(power,0,1);
  const maxRange=strength===null?35:10+strength*40,preferredRange=strength===null?null:6+strength*32;
  const rank=c=>(1-c.alignment)*25+(preferredRange===null?c.range*.02:Math.abs(c.range-preferredRange)*.35);
  // Search all teammates, rather than the four choices in the model request.
  const candidates=state.players.filter(q=>q.team===p.team&&q.id!==p.id).map(q=>{
    const range=distance(p,q),alignment=((q.x-p.x)*d.x+(q.z-p.z)*d.z)/(range||1);
    return {q,range,alignment};
  }).filter(c=>c.range>2&&c.range<maxRange&&c.alignment>=Math.cos(Math.PI/7))
    .sort((a,b)=>rank(a)-rank(b));
  const target=candidates[0]?.q;
  if(target){if(passBall(state,p,target.id,0,strength,loft)){if(target.role!=='GK')selectHumanPlayer(state,target.id);state.incomingPlayer=target.id;state.manualSwitchUntil=0;return true;}return false;}
  // With no teammate in the selected direction, pass into open space.
  const speed=strength===null?16:10+strength*22;
  if(loft){const launch=10+(strength??.5)*16,angle=40*Math.PI/180;return release(state,p,d.x*launch*Math.cos(angle),launch*Math.sin(angle),d.z*launch*Math.cos(angle),'pass','lob');}
  return release(state,p,d.x*speed,.5,d.z*speed,'pass');
}
export function humanShoot(state,vector,power=.65){
  const p=state.players.find(p=>p.id===state.selected);if(!p||p.role==='GK')return false;
  const d=kickDirection(p,vector),speed=20+clamp(power,0,1)*13;
  const goalDistance=(direction(p.team)*52.5-p.z)/(d.z||1e-9);
  const flight=clamp((goalDistance>0?goalDistance:18)/speed,.15,1.5);
  return release(state,p,d.x*speed,clamp((.65-R+4.905*flight*flight)/flight,1.4,12),d.z*speed,'shoot');
}

export function humanLob(state,vector,power=.5){return humanPass(state,vector,power,true);}
export function humanChip(state,vector,power=.5){const p=state.players.find(p=>p.id===state.selected);if(!p||p.role==='GK')return false;const d=kickDirection(p,vector),speed=9+clamp(power,0,1)*12,angle=50*Math.PI/180;return release(state,p,d.x*speed*Math.cos(angle),speed*Math.sin(angle),d.z*speed*Math.cos(angle),'shoot','chip');}
