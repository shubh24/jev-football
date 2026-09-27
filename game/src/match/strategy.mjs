export const STRATEGIES={
  possession:{name:'Possession',description:'Keep the ball while moving towards goal. Run into open space, use useful forward passes, and shoot from clear positions. Keep two defenders behind the ball.',depth:0,width:1,press:1,passRange:25},
  attack:{name:'Attack',description:'Move forward quickly. Use wide players. Take clear shots. Keep two defenders back.',depth:9,width:1.12,press:2,passRange:35},
  defend:{name:'Defend',description:'Stay compact. Protect the centre. Use safe passes and clear danger near goal.',depth:-9,width:.76,press:1,passRange:32},
};
export const ROLES=['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'];
export const HOMES=[[0,-49],[-24,-31],[-9,-36],[9,-36],[24,-31],[-23,-9],[-8,-13],[8,-13],[23,-9],[-8,10],[8,10]];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const direction=team=>team===0?-1:1;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function laneClearance(state,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
  return Math.min(12,...state.players.filter(p=>p.team!==a.team).map(p=>{
    const t=((p.x-a.x)*dx+(p.z-a.z)*dz)/(length2||1);
    if(t<=.05||t>=1)return 12;
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
  }));
}
export function passOptions(state,player){
  const plan=STRATEGIES[state.strategies[player.team]],dir=direction(player.team);
  return state.players.filter(p=>p.team===player.team&&p.id!==player.id&&distance(player,p)>2&&distance(player,p)<plan.passRange)
    .map(p=>({id:p.id,x:p.x,z:p.z,distance:distance(player,p),clearance:laneClearance(state,player,p),progress:(p.z-player.z)*dir}))
    .sort((a,b)=>(b.clearance*2+b.progress*(plan.name==='Attack'?.8:.35)-b.distance*.1)-(a.clearance*2+a.progress*(plan.name==='Attack'?.8:.35)-a.distance*.1)).slice(0,4);
}
export function teamPlan(state,team){
  const teammates=state.players.filter(p=>p.team===team),dir=direction(team),strategy=STRATEGIES[state.strategies[team]];
  const owner=state.players.find(p=>p.id===state.ball.owner),hasBall=owner?.team===team||(!owner&&state.ball.receiver&&state.ball.lastTouch===team);
  const ranked=teammates.filter(p=>p.role!=='GK').sort((a,b)=>distance(a,state.ball)-distance(b,state.ball));
  const pressers=hasBall?[]:ranked.slice(0,strategy.press).map(p=>p.id);
  const targets={},runners=[];
  for(const p of teammates){
    if(p.role==='GK'){
      const ownGoal=-dir*52.5,t=state.ball.vz*dir<-.1?(ownGoal-state.ball.z)/state.ball.vz:0;
      const projected=t>0&&t<2?state.ball.x+state.ball.vx*t:state.ball.x*.32;
      targets[p.id]={x:clamp(projected,-2.8,2.8),z:ownGoal+dir*1.7,job:'Protect the goal'};continue;
    }
    const home=HOMES[p.index],ballProgress=state.ball.z*dir;
    let z=home[1]+strategy.depth+clamp(ballProgress*.35,-14,19)+(hasBall?7:-3);
    let x=home[0]*strategy.width+state.ball.x*.13;
    if(p.role==='CB')z=Math.min(z,ballProgress-9,4);
    if(!hasBall&&state.strategies[team]==='defend')z=Math.min(z,ballProgress-5);
    if(hasBall&&owner&&owner.id!==p.id&&['CM','LM','RM'].includes(p.role)&&distance(p,owner)<25){z=owner.z*dir+(p.role==='CM'?-5:5);x=owner.x+(home[0]<0?-1:1)*(p.role==='CM'?8:13);}
    let job=hasBall?'Offer a pass and keep formation':'Cover space';
    if(hasBall&&p.id!==owner?.id&&p.id!==state.ball.receiver){
      if(p.role==='ST'){z=Math.max(z,ballProgress+(strategy.name==='Attack'?17:12));x=(home[0]<0?-8:8)+state.ball.x*.18;job='Run towards goal between defenders';runners.push(p.id);}
      else if(['LM','RM'].includes(p.role)){z=Math.max(z,ballProgress+9);x=(home[0]<0?-1:1)*(ballProgress>25?13:24);job=ballProgress>25?'Run into the box':'Run into the wide channel';runners.push(p.id);}
      else if(p.role==='CM'&&p.index===7){z=Math.max(z,ballProgress+6);job='Move ahead to support the attack';runners.push(p.id);}
    }
    targets[p.id]={x:clamp(x,-30,30),z:clamp(z,-46,45)*dir,job};
    if(pressers.includes(p.id))targets[p.id]={x:state.ball.x,z:state.ball.z,job:p.id===pressers[0]?'Press the ball':'Cover behind the press'};
    if(p.id===pressers[1])targets[p.id].z-=dir*5;
    if(!owner&&state.ball.receiver===p.id&&state.ball.passTarget)targets[p.id]={...state.ball.passTarget,job:'Meet the pass'};
  }
  return {targets,pressers,hasBall,runners};
}

export function shortMove(p,target,label,{reach=2,speed=5.5,duration=.65,requiresBall=false,type='move'}={}){
  const dx=target.x-p.x,dz=target.z-p.z,length=Math.hypot(dx,dz),scale=Math.min(1,reach/(length||1));
  const x=clamp(p.x+dx*scale,-32.8,32.8),z=clamp(p.z+dz*scale,-51.1,51.1),metres=distance(p,{x,z});
  return {label:`${label} · ${metres.toFixed(1)} m`,type,x,z,distance:Number(metres.toFixed(2)),speed,duration,requiresBall,origin:{x:p.x,z:p.z}};
}
function runningMove(p,target,label,{speed=7.5,requiresBall=false,directional=false,type='move'}={}){
  // A run has a speed and a time limit. Its target is not a short waypoint
  // that forces the player to brake before the next model response.
  const dx=target.x-p.x,dz=target.z-p.z,length=Math.hypot(dx,dz)||1;
  const destination=directional?{x:p.x+dx/length*(speed*.65+2),z:p.z+dz/length*(speed*.65+2)}:target;
  const command=shortMove(p,destination,label,{reach:Infinity,speed,duration:.65,requiresBall,type});
  return {...command,continuous:true,...(directional?{runDirection:{x:dx/length,z:dz/length},lookAhead:speed*.65+2}:{}),label:`${label} · ${speed} m/s`};
}
export function shootingCues(state,p){
  const goalZ=direction(p.team)*52.5,dz=Math.abs(goalZ-p.z),range=Math.hypot(p.x,dz);
  const angle=Math.abs(Math.atan2(3.66-p.x,dz)-Math.atan2(-3.66-p.x,dz))*180/Math.PI;
  const clearances=[-2.6,2.6].map(x=>laneClearance(state,p,{x,z:goalZ}));
  return {rangeM:Number(range.toFixed(1)),angleDegrees:Math.round(angle),leftClearanceM:Number(clearances[0].toFixed(1)),rightClearanceM:Number(clearances[1].toFixed(1)),clearShot:range<26&&angle>12&&Math.max(...clearances)>1,nearEndLine:Math.abs(p.z)>47};
}
export function attackingCues(state,p){
  const dir=direction(p.team),goal={x:clamp(p.x*.45,-12,12),z:dir*52.5},dx=goal.x-p.x,dz=goal.z-p.z,len=Math.hypot(dx,dz)||1;
  const point={x:p.x+dx/len*6,z:p.z+dz/len*6},vx=point.x-p.x,vz=point.z-p.z,length2=vx*vx+vz*vz;
  const opponents=state.players.filter(q=>q.team!==p.team);
  const pressure=Math.min(...opponents.map(q=>distance(p,q)));
  const clearance=Math.min(12,...opponents.map(q=>{const t=clamp(((q.x-p.x)*vx+(q.z-p.z)*vz)/(length2||1),0,1);return Math.hypot(q.x-p.x-vx*t,q.z-p.z-vz*t);}));
  return {spaceAheadM:Number(clearance.toFixed(1)),nearestDefenderM:Number(pressure.toFixed(1)),canAdvance:clearance>2.3&&pressure>2.8&&p.z*dir<46,driveTarget:point};
}
export function actionOptions(state,player,plan=teamPlan(state,player.team)){
  const target=plan.targets[player.id],dir=direction(player.team),owner=state.ball.owner===player.id;
  const options={hold:{label:owner?'Shield ball · 0.25 s':'Wait · 0.25 s',type:'hold',duration:.25,requiresBall:owner}};
  if(owner){
    const moves=[['forward',0,dir*1.5,'Touch towards goal'],['left',-1.5,0,'Touch towards far sideline'],['right',1.5,0,'Touch towards near sideline'],['back',0,-dir*1.5,'Turn back'],['inside',-Math.sign(player.x||1)*1.1,dir*.8,'Cut inside']];
    for(const [name,dx,dz,label]of moves){
      if((name==='forward'||name==='inside')&&player.z*dir>48)continue;
      const c=runningMove(player,{x:player.x+dx,z:clamp(player.z+dz,-49,49)},label.replace('Touch','Dribble'),{speed:4.8,requiresBall:true,directional:true});
      if(c.distance>.4)options[`carry_${name}`]=c;
    }
    const attack=attackingCues(state,player);
    if(attack.canAdvance)options.drive_goal=runningMove(player,attack.driveTarget,'Drive towards goal',{speed:7.5,requiresBall:true,directional:true});
    const forward={x:player.x,z:player.z+dir*3};
    if(player.z*dir<43&&Math.abs(player.x)<30&&laneClearance(state,player,forward)>2)options.sprint=runningMove(player,forward,'Sprint towards goal',{speed:8,requiresBall:true,directional:true});
    for(const p of passOptions(state,player)){
      const c={label:`Pass ${p.id.toUpperCase()} · ${p.distance.toFixed(0)} m`,type:'pass',target:p.id,x:p.x,z:p.z,clearance:Number(p.clearance.toFixed(1)),distance:Number(p.distance.toFixed(1)),progress:Number(p.progress.toFixed(1)),returnPass:p.id===state.ball.lastPassFrom&&state.ball.lastPassTo===player.id&&state.time-(state.ball.lastPassAt||0)<4,duration:.6,requiresBall:true};
      options[`pass_${p.id}`]=c;
      if(p.progress>3&&p.clearance>1.5)options[`through_${p.id}`]={...c,label:`Lead ${p.id.toUpperCase()} · 3 m ahead`,lead:3,z:clamp(p.z+dir*3,-49,49)};
    }
    const cues=shootingCues(state,player);
    if(cues.rangeM<35&&cues.angleDegrees>6)for(const side of [-1,1])for(const high of [false,true]){
      const name=side<0?'left':'right';options[`shoot_${name}${high?'_high':''}`]={label:`Shoot ${name} · ${high?'high':'low'}`,type:'shoot',x:side*2.6,z:dir*52.5,height:high?1.7:.45,power:high?.8:.65,clearance:side<0?cues.leftClearanceM:cues.rightClearanceM,distance:cues.rangeM,duration:.6,requiresBall:true};
    }
    options.clear={label:'Clear upfield',type:'clear',duration:.6,requiresBall:true};
  }else if(player.role==='GK'){
    options.shape=shortMove(player,target,'Track shot line',{reach:.8,speed:3.5});
    for(const sign of [-1,1])options[sign<0?'step_left':'step_right']=shortMove(player,{x:clamp(player.x+sign*.5,-3,3),z:player.z},`Step ${sign<0?'left':'right'}`,{reach:.5,speed:3});
    const t=state.ball.vz?(-dir*52.5-state.ball.z)/state.ball.vz:0;
    if(!state.ball.owner&&t>0&&t<1.3)for(const side of ['left','right'])for(const height of ['low','high'])options[`dive_${side}_${height}`]={label:`Dive ${side} ${height}`,type:'dive',action:`${side}_${height}`,duration:.55,requiresBall:false};
  }else{
    options.shape=runningMove(player,target,state.ball.receiver===player.id?'Meet the pass':plan.hasBall?target.job:'Recover position',{speed:5.5});
    if(plan.runners?.includes(player.id)&&distance(player,target)>1)options.run_attack=runningMove(player,target,target.job,{speed:7.5});
    for(const sign of [-1,1])options[sign<0?'step_left':'step_right']=shortMove(player,{x:player.x+sign*1.2,z:player.z},`Adjust ${sign<0?'far side':'near side'}`,{reach:1.2,speed:4});
    const opponent=state.players.filter(p=>p.team!==player.team&&p.role!=='GK').sort((a,b)=>distance(a,player)-distance(b,player))[0];
    if(!plan.hasBall&&opponent&&distance(opponent,player)<18){
      options.mark=runningMove(player,{x:opponent.x,z:opponent.z-dir*1.8},`Mark ${opponent.id.toUpperCase()}`,{speed:5.5});
      options.mark.target=opponent.id;
      options.block=runningMove(player,{x:(state.ball.x+opponent.x)*.5,z:(state.ball.z+opponent.z)*.5},`Block pass to ${opponent.id.toUpperCase()}`,{speed:5.5});
    }
    if(plan.pressers[0]===player.id){
      options.press=runningMove(player,state.ball,'Close the ball',{speed:7,type:'press'});
      options.jockey=shortMove(player,{x:state.ball.x,z:state.ball.z-dir*1.8},'Stay goal-side',{reach:1,speed:3.5});
      const carrier=state.players.find(p=>p.id===state.ball.owner);
      if(carrier&&carrier.team!==player.team&&distance(carrier,player)<1.65)options.tackle={label:`Tackle ${carrier.id.toUpperCase()}`,type:'tackle',target:carrier.id,duration:.35,requiresBall:false};
    }
  }
  return options;
}
export function practiceAction(state,p,plan){
  const options=actionOptions(state,p,plan);
  if(state.ball.owner===p.id){
    const dir=direction(p.team),toGoal=Math.hypot(p.x,dir*52.5-p.z),age=state.time-state.ball.ownedAt;
    if(shootingCues(state,p).clearShot&&options.shoot_left)return {key:p.x>0?'shoot_left':'shoot_right',command:options[p.x>0?'shoot_left':'shoot_right']};
    const pressure=Math.min(...state.players.filter(q=>q.team!==p.team).map(q=>distance(p,q)));
    const passes=Object.entries(options).filter(([,v])=>v.type==='pass'&&v.clearance>.8);
    const choice=passes.find(([,v])=>v.progress>3)||((state.strategies[p.team]==='possession'||pressure<6)?passes[0]:null);
    if(options.drive_goal&&pressure>4&&!passes.some(([,v])=>v.progress>9&&v.clearance>2))return {key:'drive_goal',command:options.drive_goal};
    if(choice&&age>(pressure<5?.2:.85))return {key:choice[0],command:choice[1]};
    if(state.strategies[p.team]==='defend'&&toGoal>82&&age>.7)return {key:'clear',command:options.clear};
    if(pressure<4){const defender=state.players.filter(q=>q.team!==p.team).sort((a,b)=>distance(p,a)-distance(p,b))[0],key=defender.x>p.x?'carry_left':'carry_right';return {key,command:options[key]||options.carry_back||options.hold};}
    const key=options.carry_forward?'carry_forward':options.carry_left?'carry_left':'carry_back';return {key,command:options[key]||options.hold};
  }
  if(options.run_attack)return {key:'run_attack',command:options.run_attack};
  if(options.tackle)return {key:'tackle',command:options.tackle};
  if(options.press)return {key:'press',command:options.press};
  const dives=Object.keys(options).filter(k=>k.startsWith('dive_'));
  if(dives.length){
    const t=(-direction(p.team)*52.5-state.ball.z)/state.ball.vz,x=state.ball.x+state.ball.vx*t,y=state.ball.y+state.ball.vy*t-4.905*t*t;
    if(t<.5&&Math.abs(x-p.x)>.55){const key=`dive_${x<p.x?'left':'right'}_${y>1.2?'high':'low'}`;return {key,command:options[key]};}
  }
  return {key:'shape',command:options.shape};
}
