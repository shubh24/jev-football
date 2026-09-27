import {World} from './world.mjs';
import {StadiumAudio} from './audio.mjs';
import {createBall,launchBall,stepBall,shooterPose,poseCapsules,STEP} from './physics.mjs';
import {ACTIONS} from './decision.mjs';
import {initDecisionPanel,resetDecisionPanel,renderDecisionPanel} from './decision-panel.mjs';
import {createKeeper,applyKeeperAction,updateKeeper,controlledKeeperPose,isStepping} from './keeper-control.mjs';

const $=id=>document.getElementById(id);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const state={phase:'intro',mode:'live',round:1,goals:0,saves:0,results:[],shotId:0,requestId:0,clock:0,phaseTime:0,aim:{x:-1.5,y:1.55},power:0,chargeTime:0,ball:createBall(),keeperAction:'wait',keeperActionAt:0,committed:false,history:[],lastDecision:null,ready:false,flightClock:0,requests:0,lastRequestAt:-10,pending:0,recording:[],replayTime:0,shotSpeed:0,outcome:null,outcomeAt:0,liveError:false,lastResult:null};
const keys=new Set();const sound=new StadiumAudio();let world;let accumulator=0;let lastFrame=performance.now();let toastTimer;let aborts=new Set();let renderFrames=0;let telemetry=0;
let keeper=createKeeper();
function setPhase(phase){state.phase=phase;state.phaseTime=0;document.body.dataset.phase=phase;$('result').classList.toggle('hidden',phase!=='result');$('replay-label').classList.toggle('hidden',phase!=='replay');renderDecisionPanel(state.decisionHistory||[],state);}
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5000);}
function connection(label,ready=true){$('connection').className=`connection ${ready?'ready':'offline'}`;$('connection').lastElementChild.textContent=label;}
function keeperStatus(title,description){$('keeper-state').textContent=title;$('keeper-description').textContent=description;}
function updateReads(decision){
  $('latency').textContent=`${decision.latencyMs} ms`;$('decision-label').textContent=decision.source==='jev'?'JEV · LAST USED RESPONSE':'PRACTICE · LAST USED';
  const descriptions={wait:'Watching your next move.',center:'Holding the centre.',left_low:'Going low to the left.',left_high:'Reaching high to the left.',right_low:'Going low to the right.',right_high:'Reaching high to the right.'};
  const labels={left_low:'DIVING LEFT · LOW',left_high:'DIVING LEFT · HIGH',right_low:'DIVING RIGHT · LOW',right_high:'DIVING RIGHT · HIGH',center:'HOLDING CENTRE',wait:'READING THE PLAY'};
  for(const side of ['left','right'])for(const [size,distance]of[['25','0.25'],['50','0.50']]){labels[`step_${side}_${size}`]=`STEP ${side.toUpperCase()} · ${distance} M`;descriptions[`step_${side}_${size}`]=`Moving ${distance} m ${side}. Ready to react again.`;}
  descriptions.center='Blocking from the current position.';labels.center='HOLDING POSITION';
  keeperStatus(labels[decision.action],descriptions[decision.action]);
}
function updateScore(){
  $('goals').textContent=String(state.goals).padStart(2,'0');$('saves').textContent=String(state.saves).padStart(2,'0');$('round').textContent=`PENALTY ${String(state.round).padStart(2,'0')} / 05`;
  [...$('shot-dots').children].forEach((dot,i)=>dot.className=state.results[i]?.outcome|| (i===state.round-1?'current':''));
}
function clearRequests(){for(const c of aborts)c.abort();aborts.clear();state.pending=0;}
function newShot(){
  clearRequests();state.shotId++;state.ball=createBall();state.keeperAction='wait';state.committed=false;state.lastDecision=null;state.power=0;state.chargeTime=0;state.flightClock=0;state.lastRequestAt=-10;state.requests=0;state.outcome=null;state.outcomeAt=0;state.recording=[];state.liveError=false;state.aim={x:-1.5,y:1.55};
  keeper=createKeeper();state.decisionHistory=[];resetDecisionPanel();
  world.trailPositions=[];world.netHit=null;$('power-fill').style.width='0%';$('power-value').innerHTML='0<span>%</span>';$('shoot').classList.remove('charging');$('shoot-label').textContent='HOLD TO SHOOT';$('floating-hint').textContent='PICK YOUR CORNER';
  keeperStatus(state.mode==='live'?'WATCHING THE BALL':'PRACTICE KEEPER',state.mode==='live'?'Find the space. Make it count.':'Local rules. No model calls.');
  $('latency').textContent='— ms';$('decision-label').textContent=state.mode==='live'?'LIVE DECISION':'PRACTICE';
  setPhase('ready');updateScore();sound.whistle();
}
function start(){if(!world)return;if(state.mode==='live'&&!state.ready){toast('JEV is not connected. Select Practice in settings, or configure the key and reload.');$('settings').showModal();return;}newShot();}
function restart(){state.goals=0;state.saves=0;state.round=1;state.results=[];state.history=[];state.lastResult=null;$('settings').close();start();}
function beginCharge(){if(state.phase!=='ready'||$('settings').open)return;setPhase('charging');state.chargeTime=0;state.power=.12;$('shoot').classList.add('charging');$('shoot-label').textContent='RELEASE TO STRIKE';$('floating-hint').textContent='MAKE IT COUNT';}
function releaseCharge(){if(state.phase!=='charging')return;state.power=clamp(state.power,.12,1);setPhase('runup');state.lastRequestAt=-10;$('shoot').classList.remove('charging');keeperStatus('READING YOUR RUN-UP','The keeper is watching your movement.');}
function cancelCharge(){if(state.phase==='charging'){setPhase('ready');state.power=0;$('shoot').classList.remove('charging');$('shoot-label').textContent='HOLD TO SHOOT';}}
function kick(){
  const error=Math.max(0,state.power-.88)*3.1;
  const targetX=state.aim.x+Math.sin(state.clock*7.3)*error;
  const targetY=state.aim.y+Math.cos(state.clock*5.7)*error*.7;
  state.shotSpeed=launchBall(state.ball,targetX,targetY,state.power)*3.6;
  setPhase('flight');state.flightClock=0;state.lastRequestAt=-10;state.recording=[];
  $('shot-speed').innerHTML=`${Math.round(state.shotSpeed)} KM/H <i>/</i> RIGHT FOOT`;
  sound.kick();
}
function observation(){
  const o={requestId:++state.requestId,shotId:state.shotId,phase:state.phase==='runup'?'approach':'flight',elapsed:state.phaseTime,keeperX:currentKeeperPose().origin[0],keeperTargetX:keeper.targetX,keeperMoving:isStepping(keeper),visibleLean:state.aim.x<-.8?'left':state.aim.x>.8?'right':'balanced',history:state.history};
  if(o.phase==='flight'){o.ballPosition=[...state.ball.position];o.ballVelocity=[...state.ball.velocity];}
  return o;
}
async function requestDecision(){
  if(state.committed||state.pending>0||state.requests>=7||state.liveError)return;
  const input=observation(),shot=state.shotId,started=performance.now();state.pending++;state.requests++;state.lastRequestAt=state.phaseTime;
  const controller=new AbortController();aborts.add(controller);
  try{
    let decision;
    if(state.mode==='practice'){
      await new Promise(resolve=>setTimeout(resolve,150));
      let action='wait';if(input.phase==='flight'){
        const t=input.ballPosition[2]/-input.ballVelocity[2],x=input.ballPosition[0]+input.ballVelocity[0]*t,y=input.ballPosition[1]+input.ballVelocity[1]*t-4.905*t*t;
        const offset=x-input.keeperX,side=offset<0?'left':'right';
        action=Math.abs(offset)<.28?'center':y>=.65&&y<=1.8&&Math.abs(offset)<=.85?(input.keeperMoving?'wait':`step_${side}_${Math.abs(offset)<=.52?'25':'50'}`):`${side}_${y>1.2?'high':'low'}`;
      }
      const probabilities=Object.fromEntries(Object.keys(ACTIONS).map(a=>[a,a===action?1:0]));decision={action,probabilities,confidence:1,latencyMs:150,source:'practice'};
    }else{
      const timeout=setTimeout(()=>controller.abort(),2200);
      try{
        const response=await fetch('/api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:controller.signal});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'JEV is unavailable.');decision=data;
      }finally{clearTimeout(timeout);}
    }
    if(controller.signal.aborted||shot!==state.shotId)return;
    const roundTripMs=Math.round(performance.now()-started);
    // Keep rejected responses visible, but do not use them to move the keeper.
    let reason=(!['runup','flight'].includes(state.phase)||state.outcome)?'Shot already decided.':input.phase==='approach'&&state.phase==='flight'&&state.phaseTime>.06?'Run-up response arrived after the kick.':roundTripMs>700?'Response exceeded the 700 ms limit.':null;
    const applied=!reason&&applyKeeperAction(keeper,decision.action,state.clock);
    if(!applied&&!reason)reason=keeper.committed?'Dive already started.':'Current step is still in progress.';
    state.committed=keeper.committed;
    if(applied){state.lastDecision=decision;state.keeperAction=decision.action;state.keeperActionAt=state.clock;updateReads(decision);}
    state.decisionHistory.push({action:decision.action,applied,reason,probabilities:{...decision.probabilities},confidence:decision.confidence,time:state.phaseTime,phase:state.phase,observedPhase:input.phase,observedTime:input.elapsed,keeperX:keeper.x,targetX:keeper.targetX,latencyMs:decision.latencyMs,roundTripMs,source:decision.source});
    renderDecisionPanel(state.decisionHistory,state);
    if(state.mode==='live')connection('JEV LIVE');
  }catch(error){
    if(shot!==state.shotId||controller.signal.aborted&&state.phase!=='flight'&&state.phase!=='runup')return;
    if(state.mode==='live'){state.liveError=true;state.decisionHistory.push({action:null,applied:false,reason:error.name==='AbortError'?'Request timed out.':'Request failed.',phase:state.phase,time:state.phaseTime,roundTripMs:Math.round(performance.now()-started),source:'jev'});renderDecisionPanel(state.decisionHistory,state);keeperStatus('NO JEV RESPONSE','The keeper has no new command.');connection('JEV OFFLINE',false);toast(error.name==='AbortError'?'JEV timed out. Try the next shot or select Practice.':error.message);}
  }finally{aborts.delete(controller);if(shot===state.shotId)state.pending=Math.max(0,state.pending-1);}
}
function currentKeeperPose(){return controlledKeeperPose(keeper,state.clock);}
function currentShooterPose(){return shooterPose(state.phase,state.phaseTime,state.clock,clamp(state.aim.x/4,-1,1));}
function setOutcome(outcome){
  if(state.outcome==='goal')return;
  if(!state.outcome||outcome==='goal'){state.outcome=outcome;state.outcomeAt=state.ball.age;sound.cheer(outcome==='goal');}
}
function finish(){
  clearRequests();const outcome=state.outcome||'miss';if(outcome==='goal')state.goals++;if(outcome==='save')state.saves++;
  const placement=state.aim.x<-.7?'LEFT':state.aim.x>.7?'RIGHT':'CENTRE';
  state.history.push(placement.toLowerCase()==='centre'?'center':placement.toLowerCase());
  state.lastResult={outcome,speed:Math.round(state.shotSpeed),latency:state.lastDecision?.latencyMs||null,placement,post:state.ball.post,mode:state.mode,liveError:state.liveError};state.results.push(state.lastResult);
  setPhase('result');showResult();updateScore();
}
function showResult(){
  const r=state.lastResult;if(!r)return;
  const completed=state.round===5;
  $('result-kicker').textContent=completed?'FULL TIME · FIVE PENALTIES':`PENALTY ${String(state.round).padStart(2,'0')} · ${r.mode==='live'?'YOU vs JEV':'PRACTICE'}`;
  $('result-title').textContent=completed?`${state.goals} out of 5.`:r.outcome==='goal'?'Clinical.':r.outcome==='save'?'Denied.':r.post?'Off the woodwork.':'Just wide.';
  if(!completed&&r.post&&r.outcome!=='goal'&&r.outcome!=='save')$('result-title').style.fontSize=innerWidth<700?'49px':'64px';else $('result-title').style.fontSize='';
  $('result-description').textContent=completed?(state.goals>=4?'A finish to remember. The keeper had no answer.':state.goals>=2?'Fine margins. Take another five and find your rhythm.':'The keeper wins this round. Take a breath. Go again.'):
    r.outcome==='goal'?(r.post?'Off the post and over the line. Every angle counts.':'Past the keeper. Over the line. That moment is yours.'):
    r.outcome==='save'?'The keeper made contact. Find a different corner.':r.post?'A few centimetres made the difference.':'The goal was there. Bring the next one inside the frame.';
  if(r.liveError)$('result-description').textContent+=' JEV was unavailable for this shot.';
  $('result-speed').textContent=r.speed;$('result-time').textContent=r.latency?`${r.latency} ms`:'—';$('result-place').textContent=r.placement;
  $('next').innerHTML=completed?'PLAY AGAIN <span>↗</span>':'NEXT PENALTY <span>→</span>';
  $('replay').disabled=state.recording.length<2;
}
function next(){if(state.phase!=='result')return;if(state.round===5){restart();return;}state.round++;newShot();}
function replay(){if(!['result','replay'].includes(state.phase)||state.recording.length<2)return;clearRequests();state.replayTime=0;world.trailPositions=[];const actions=state.decisionHistory.filter(d=>d.applied&&d.action!=='wait').map(d=>d.action.replace(/^step_(left|right)_(25|50)$/,(_,side,size)=>`STEP ${side} 0.${size} M`).replaceAll('_',' ').toUpperCase());$('replay-action').textContent=`${state.lastResult?.mode==='live'?'JEV':'PRACTICE'} · ${[...new Set(actions)].join(' → ')||'WAIT'}`;setPhase('replay');}
function exitReplay(){if(state.phase!=='replay')return;setPhase('result');showResult();}
function interpolatePose(a,b,t){const joints={};for(const k of Object.keys(a.joints))joints[k]=a.joints[k].map((v,i)=>v+(b.joints[k][i]-v)*t);return {joints,origin:a.origin.map((v,i)=>v+(b.origin[i]-v)*t),tilt:a.tilt+(b.tilt-a.tilt)*t,front:a.front};}
function replayFrame(){
  const f=state.recording;const duration=f.at(-1).time;const time=Math.min(state.replayTime,duration);
  let i=Math.min(f.length-2,Math.floor(time*60));while(i>0&&f[i].time>time)i--;while(i<f.length-2&&f[i+1].time<time)i++;
  const a=f[i],b=f[i+1],alpha=clamp((time-a.time)/(b.time-a.time),0,1);
  return {position:a.position.map((v,i)=>v+(b.position[i]-v)*alpha),velocity:a.velocity,keeper:interpolatePose(a.keeper,b.keeper,alpha),shooter:interpolatePose(a.shooter,b.shooter,alpha),duration};
}
function fixedUpdate(){
  state.clock+=STEP;state.phaseTime+=STEP;
  if(['runup','flight'].includes(state.phase))updateKeeper(keeper,STEP);
  if(state.phase==='flight'){
    state.flightClock+=STEP;const pose=currentKeeperPose();
    const events=stepBall(state.ball,STEP,poseCapsules(pose));
    for(const event of events){
      if(event.type==='post')sound.post();if(event.type==='save')sound.save();
      if(event.type==='goal')setOutcome('goal');if(event.type==='wide')setOutcome(state.ball.touched?'save':'miss');
      if(event.type==='net')world.pulseNet(event.position);
    }
    if(!state.outcome&&state.ball.touched&&state.ball.velocity[2]>0&&state.ball.position[2]>1.1)setOutcome('save');
    if(!state.outcome&&state.ball.age>2.2)setOutcome(state.ball.touched?'save':'miss');
    if(renderFrames++%3===0)state.recording.push({time:state.flightClock,position:[...state.ball.position],velocity:[...state.ball.velocity],keeper:pose,shooter:currentShooterPose()});
    if(state.outcome&&state.ball.age-state.outcomeAt>1.2)finish();
  }
}
function frame(now){
  const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
  if(!world)return;
  // The settings menu stops input. A ball already in flight continues normally.
  if(['ready','charging'].includes(state.phase)&&!$('settings').open){
    const horizontal=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    const vertical=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
    state.aim.x=clamp(state.aim.x+horizontal*dt*3.1,-4.6,4.6);state.aim.y=clamp(state.aim.y+vertical*dt*1.7,.16,3.2);
    if(state.phase==='charging'){state.chargeTime+=dt;state.power=clamp(.12+state.chargeTime*.64,0,1);if(state.chargeTime>1.5)releaseCharge();}
    const percent=Math.round(state.power*100);$('power-value').innerHTML=`${percent}<span>%</span>`;$('power-fill').style.width=`${percent}%`;$('power-fill').style.background=percent>90?'#dd7756':'#e7a66e';
  }
  accumulator+=dt;while(accumulator>=STEP){fixedUpdate();accumulator-=STEP;}
  if(state.phase==='runup'){
    if(state.phaseTime>.06&&state.requests===0)requestDecision();
    if(state.phaseTime>=.55)kick();
  }else if(state.phase==='flight'&&!state.outcome&&state.phaseTime>.055&&state.phaseTime-state.lastRequestAt>=.1)requestDecision();
  let ball=state.ball.position,velocity=state.ball.velocity,kp=currentKeeperPose(),sp=currentShooterPose();
  if(state.phase==='replay'){
    state.replayTime+=dt*.35;const recorded=replayFrame();ball=recorded.position;velocity=recorded.velocity;kp=recorded.keeper;sp=recorded.shooter;
    if(state.replayTime>recorded.duration+.55)state.replayTime=0;
  }
  world.keeper.update(kp);world.shooter.update(sp);world.updateBall(ball,velocity,dt*(state.phase==='replay'?.35:1),state.phase==='flight'||state.phase==='replay');
  world.updateCamera(state.phase,dt,ball,state.replayTime);
  const aiming=['ready','charging'].includes(state.phase);$('aim-reticle').style.display=aiming?'block':'none';
  if(aiming){const p=world.project(state.aim.x,state.aim.y);$('aim-reticle').style.left=`${p.x}px`;$('aim-reticle').style.top=`${p.y}px`;}
  world.render(dt);telemetry+=dt;if(telemetry>1){telemetry=0;fetch('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase:state.phase,round:state.round,goals:state.goals,saves:state.saves,mode:state.mode,lastResult:state.lastResult?.outcome})}).catch(()=>{});}
  requestAnimationFrame(frame);
}

function setupControls(){
  initDecisionPanel();
  $('start').addEventListener('click',start);$('next').addEventListener('click',next);$('replay').addEventListener('click',replay);$('exit-replay').addEventListener('click',exitReplay);$('restart').addEventListener('click',restart);
  $('shoot').addEventListener('pointerdown',e=>{e.preventDefault();$('shoot').setPointerCapture(e.pointerId);beginCharge();});
  $('shoot').addEventListener('pointerup',e=>{e.preventDefault();releaseCharge();});$('shoot').addEventListener('pointercancel',cancelCharge);
  $('pitch').addEventListener('pointermove',e=>{if(!['ready','charging'].includes(state.phase)||$('settings').open)return;const p=world.aimFromPointer(e.clientX,e.clientY);if(p)state.aim=p;});
  $('pitch').addEventListener('pointerdown',e=>{if(!['ready','charging'].includes(state.phase))return;const p=world.aimFromPointer(e.clientX,e.clientY);if(p)state.aim=p;});
  window.addEventListener('keydown',e=>{
    if($('settings').open)return;const key=e.key.toLowerCase();
    if(e.target.closest('#keeper-card')&&key!=='escape')return;
    if([' ','arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key))e.preventDefault();keys.add(key);
    if(e.repeat)return;if(key===' ')beginCharge();if(key==='enter'){if(state.phase==='intro')start();else if(state.phase==='result')next();}if(key==='r')replay();if(key==='escape')exitReplay();
  });
  window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key===' '){e.preventDefault();releaseCharge();}});
  window.addEventListener('blur',()=>{keys.clear();cancelCharge();});
  $('settings-button').addEventListener('click',()=>{cancelCharge();keys.clear();$('settings').showModal();});
  $('settings').addEventListener('click',e=>{if(e.target===$('settings')){const r=$('settings').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('settings').close();}});
  $('mode').addEventListener('change',e=>{
    if(['runup','flight','charging','replay'].includes(state.phase)){e.target.value=state.mode;toast('Change the keeper before the next shot.');return;}
    state.mode=e.target.value;connection(state.mode==='practice'?'PRACTICE':state.ready?'JEV READY':'JEV OFFLINE',state.mode==='practice'||state.ready);keeperStatus(state.mode==='practice'?'PRACTICE KEEPER':'WAITING FOR YOU',state.mode==='practice'?'Local rules. No model calls.':'Every shot is a new decision.');
  });
  $('quality').addEventListener('change',e=>world.setQuality(e.target.value));
  $('sound').addEventListener('click',async()=>{try{const on=await sound.toggle();$('sound').ariaLabel=on?'Mute sound':'Enable sound';$('sound').innerHTML=on?'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg>':'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/></svg>';}catch{toast('Sound is not available in this browser.');}});
  window.addEventListener('resize',()=>world.resize());
  const events=new EventSource('/api/events');events.onmessage=e=>{const {command}=JSON.parse(e.data);if(command==='start'&&state.phase==='intro')start();if(command==='restart')restart();if(command==='replay')replay();if(command==='next')next();};
}

async function boot(){
  try{world=new World($('pitch'));setupControls();world.keeper.update(currentKeeperPose());world.shooter.update(currentShooterPose());world.render(0);
    $('loading').style.opacity='0';setTimeout(()=>$('loading').classList.add('hidden'),650);requestAnimationFrame(frame);
  }catch(error){console.error(error);$('loading').classList.add('hidden');$('webgl-error').classList.remove('hidden');return;}
  try{const response=await fetch('/api/health');const data=await response.json();state.ready=data.ready;connection(data.ready?'JEV READY':'JEV OFFLINE',data.ready);if(!data.ready)keeperStatus('KEY NOT CONFIGURED','Select Practice to play offline.');}catch{connection('SERVER OFFLINE',false);}
  window.__ELEVEN__={world,getState:()=>({phase:state.phase,round:state.round,goals:state.goals,saves:state.saves,mode:state.mode,aim:{...state.aim},power:state.power,ball:structuredClone(state.ball),keeperAction:state.keeperAction,keeper:{...keeper},decisionHistory:structuredClone(state.decisionHistory||[]),decision:state.lastDecision,lastResult:state.lastResult,recordedFrames:state.recording.length,requests:state.requests,sceneObjects:world.scene.children.length}),project:(x,y)=>world.project(x,y)};
}
boot();
