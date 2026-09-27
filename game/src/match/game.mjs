import {MatchWorld} from './world.mjs';
import {createMatch,stepMatch,DT,switchPlayer,humanPass,humanShoot,humanLob,humanChip,changeStrategy,event} from './engine.mjs';
import {STRATEGIES,teamPlan,practiceAction,actionOptions,distance} from './strategy.mjs';
import {PRACTICE_INTERVAL,applyTeamResponse} from './control.mjs';
import {keeperObservation,practiceKeeperAction} from './keepers.mjs';
import {TEAMS,playerName,namedText} from './teams.mjs';
import {MatchAudio} from './match-audio.mjs';
const matchAudio=new MatchAudio();
const $=id=>document.getElementById(id),keys=new Set();
let state=createMatch(),world,ready=false,pending=null,generation=0,requestId=0,lastRequest=-10,responses=0,lastTime=performance.now(),accumulator=0,charge=null,chargingPlayer=null,chargeKind=null,uiTime=0,inspected='j10',lastDecisions={},lastBatchSource='',history=[];
let selectedSample=null,decisionTeam=1,supportPending=null,lastSupportRequest=-10,supportResponses=0,supportHistory=[],lastSupportSelection=-1;
const requestFailures=[];
function reportRequestFailure(error,input,loop,elapsed){
  const detail=error.name==='AbortError'?'The request exceeded 2.4 seconds.':error.message;
  const row={at:new Date().toISOString(),loop,requestId:input.requestId,sequence:input.sequence,time:state.time,scores:[...state.scores],status:error.status??null,code:error.code||(error.name==='AbortError'?'CLIENT_TIMEOUT':'CLIENT_ERROR'),detail,latencyMs:Math.round(elapsed)};
  requestFailures.push(row);if(requestFailures.length>60)requestFailures.shift();console.warn('JEV request failed',row);
  pause(loop==='keepers'?'Goalkeeper response failed':'JEV response failed',`${detail} Request ${input.requestId} (${loop}). Continue to retry.`);notify(detail);
}
const activeHistory=()=>decisionTeam===0?supportHistory:history;
function historyPicker(){selectedSample=null;$('decision-sample').replaceChildren(new Option('Latest response','latest'));activeHistory().forEach((h,i)=>$('decision-sample').append(new Option(`${i+1} · ${h.time.toFixed(2)} s · ${h.strategy}`,String(i))));}
let keeperPending=null,lastKeeperRequest=-10,lastKeeperVersion=-1,keeperHistory=[],keeperSample=null;
function cancelRequests(){generation++;supportPending?.abort('cancelled');supportPending=null;lastSupportRequest=-10;pending?.abort('cancelled');pending=null;lastRequest=-10;keeperPending?.abort('cancelled');keeperPending=null;lastKeeperRequest=-10;}
function notify(text){$('error').textContent=text;$('error').hidden=false;setTimeout(()=>$('error').hidden=true,5000);}
function observedPlayer(p){const packet=state.orders[p.id],c=packet?.command;return {id:p.id,x:p.x,z:p.z,vx:p.vx,vz:p.vz,cooldown:p.cooldown,keeper:p.keeper,...(c&&packet.expires>state.time?{currentCommand:{type:c.type,assignment:c.assignment||'',x:c.x??p.x,z:c.z??p.z,speed:c.speed||0,angleDegrees:c.angleDegrees||0,remaining:Math.max(0,packet.expires-state.time)}}:{})};}
function planUI(){
  for(const b of $('strategy-buttons').children)b.setAttribute('aria-pressed',String(b.dataset.strategy===state.strategies[1]));
  $('strategy-copy').textContent=STRATEGIES[state.strategies[1]].description;
}
function showModelParameters(box,d){
  if(d.assignment){const role=document.createElement('p');role.textContent=`Team duty: ${d.assignment.duty} · ${d.assignment.lane}. JEV chooses the route and controls within this area.`;box.append(role);}
  if(!d.parameters)return;
  const timing=document.createElement('p');timing.textContent=`JEV selected the action and ${d.command?.controlVersion===3?'a complete control combination':'controls'}. ${d.stages?.calls||2} calls · action ${d.stages?.intentMs??'—'} ms · controls ${d.stages?.parametersMs??'—'} ms`;box.append(timing);
  for(const [name,answer]of Object.entries(d.parameters)){
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`${name}: ${namedText(answer.label)}`;details.append(summary);
    for(const [key,p]of Object.entries(answer.probabilities).sort((a,b)=>b[1]-a[1])){
      const row=document.createElement('div');row.className=`prob-row${key===answer.choice?' chosen':''}`;const label=document.createElement('span'),value=document.createElement('b');label.textContent=namedText(answer.labels[key]);value.textContent=`${(p*100).toFixed(1)}%`;row.append(label,value);details.append(row);
    }
    box.append(details);
  }
}
function inspect(){
  const samples=activeHistory(),sample=selectedSample===null?samples.at(-1):samples[selectedSample],d=sample?.decisions[inspected],box=$('decision-inspection');box.replaceChildren();
  if(inspected===state.selected){box.textContent='You control this player. JEV commands cannot move or kick for this player.';return;}
  if(!d){box.textContent='No response for this player yet.';return;}
  const title=document.createElement('p');title.className='sample-title';title.textContent=`${playerName(inspected)} · ${sample.source} · ${sample.time.toFixed(2)} s · ${Object.keys(d.probabilities).length} choices`;box.append(title);
  const chosen=document.createElement('p');chosen.className='sample-command';chosen.textContent=`${namedText(d.label)}${d.applied===false?` — NOT USED: ${d.reason}`:''}`;box.append(chosen);
  showModelParameters(box,d);
  const c=d.command;if(c){const detail=document.createElement('p');detail.textContent=[c.speed?`${c.speed} m/s`:null,c.duration?`${Math.round(c.duration*1000)} ms limit`:null,Number.isFinite(c.x)&&Number.isFinite(c.z)?`Target (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) m`:null,c.target?`Player ${playerName(c.target)}`:null].filter(Boolean).join(' · ');box.append(detail);}
  for(const [key,p]of Object.entries(d.probabilities).sort((a,b)=>b[1]-a[1])){const row=document.createElement('div');row.className=`prob-row${key===d.action?' chosen':''}`;const label=document.createElement('span'),value=document.createElement('b');label.textContent=namedText(d.labels[key]);value.textContent=`${(p*100).toFixed(1)}%`;row.append(label,value);box.append(row);}
  const note=document.createElement('p');note.textContent='These are action probabilities, not goal probabilities.';box.append(note);
}
function decisionRows(){
  const plan=teamPlan(state,decisionTeam);
  for(const p of state.players.filter(p=>p.team===decisionTeam&&p.role!=='GK')){
    const existing=$('player-decisions').querySelector(`[data-player="${p.id}"]`);if(existing){existing.setAttribute('aria-pressed',String(p.id===inspected));continue;}
    const button=document.createElement('button');button.className='player-row';button.dataset.player=p.id;button.setAttribute('aria-pressed',String(p.id===inspected));
    for(const [className,text]of [['number',String(p.number).padStart(2,'0')],['role',p.role],['action',lastDecisions[p.id]?.label||(state.mode==='practice'?plan.targets[p.id].job:'Waiting for JEV')]]){const span=document.createElement('span');span.className=className;span.textContent=text;button.append(span);}
    const name=document.createElement('strong');name.className='player-name';name.textContent=p.shortName;name.title=p.name;button.prepend(name);
    const status=document.createElement('small');status.className='command-status';button.append(status);
    button.onclick=()=>{inspected=p.id;$('follow-decision').checked=false;$('inspection').open=true;world.inspected=p.id;decisionRows();inspect();};$('player-decisions').append(button);
  }
  inspect();
}
function resetDecisions(){supportHistory=[];supportResponses=0;keeperHistory=[];keeperSample=null;$('keeper-sample').replaceChildren(new Option('Latest response','latest'));renderKeepers();lastDecisions={};lastBatchSource='';history=[];selectedSample=null;responses=0;$('decision-sample').replaceChildren(new Option('Latest response','latest'));$('response-time').textContent='— ms';$('request-count').textContent='0 responses';decisionRows();}
function batchApplied(decisions,latencyMs,source,roundTripMs=latencyMs,team=1){
  lastDecisions={...lastDecisions,...decisions};lastBatchSource=source;if(team===0)supportResponses++;else responses++;
  if(team===decisionTeam){$('response-time').textContent=`${latencyMs} ms`;$('request-count').textContent=`${team===0?supportResponses:responses} responses`;}
  $('model-note').textContent=source==='JEV'?'Team duties keep the formation. JEV selects complete routes and kicks, including direction, speed, power and elevation.':'Practice: local rules choose all actions. No model calls.';
  const samples=team===0?supportHistory:history;samples.push({team,time:state.time,wallAt:performance.now(),strategy:state.strategies[team],latencyMs,roundTripMs,source,decisions});
  if(team===decisionTeam)$('decision-sample').append(new Option(`${samples.length} · ${state.time.toFixed(2)} s · ${state.strategies[team]}`,String(samples.length-1)));decisionRows();
}
async function requestTeam(team=1){
  const ownPending=team===0?supportPending:pending,last=team===0?lastSupportRequest:lastRequest;
  if(ownPending||state.phase!=='playing'||(state.mode==='practice'&&state.time-last<PRACTICE_INTERVAL))return;
  if(team===0)lastSupportRequest=state.time;else lastRequest=state.time;
  if(state.mode==='practice'){
    const plan=teamPlan(state,team),decisions={};for(const p of state.players.filter(p=>p.team===team&&p.role!=='GK'&&(team!==0||p.id!==state.selected))){const a=practiceAction(state,p,plan),options=actionOptions(state,p,plan);decisions[p.id]={action:a.key,label:a.command.label||a.key,command:a.command,applied:true,options,probabilities:Object.fromEntries(Object.keys(options).map(k=>[k,k===a.key?1:0])),labels:Object.fromEntries(Object.entries(options).map(([k,c])=>[k,c.label]))};}batchApplied(decisions,0,'Practice',0,team);return;
  }
  const snapshot=state,seq=state.sequence,version=state.planVersion,epoch=generation,controller=new AbortController(),selection=state.selectionVersion;if(team===0)supportPending=controller;else pending=controller;
  const timer=setTimeout(()=>controller.abort(),2400),started=performance.now();
  const input={selected:state.selected,selectionVersion:state.selectionVersion,requestId:++requestId,sequence:seq,planVersion:version,time:state.time,strategies:state.strategies,players:state.players.map(observedPlayer),ball:{...state.ball}};
  try{
    const response=await fetch(team===0?'/api/teammate-decision':'/api/team-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:controller.signal});const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(data.error||'JEV is unavailable.'),{status:response.status,code:data.code});
    if(state!==snapshot||generation!==epoch||state.phase!=='playing'||seq!==state.sequence||version!==state.planVersion||(team===0&&selection!==state.selectionVersion))return;
    const roundTripMs=Math.round(performance.now()-started),decisions=applyTeamResponse(state,data.decisions,input,roundTripMs);
    $('connection').textContent='JEV LIVE';batchApplied(decisions,data.latencyMs,'JEV',roundTripMs,team);
  }catch(error){
    if(generation!==epoch||state!==snapshot||state.phase!=='playing'||seq!==state.sequence||version!==state.planVersion||controller.signal.reason==='cancelled'||(team===0&&selection!==state.selectionVersion))return;
    reportRequestFailure(error,input,team===0?'teammates':'opponents',performance.now()-started);$('connection').textContent='JEV OFFLINE';
  }finally{clearTimeout(timer);if((team===0?supportPending:pending)===controller){if(team===0)supportPending=null;else pending=null;if(state===snapshot&&generation===epoch&&state.phase==='playing'&&state.mode==='live')setTimeout(()=>requestTeam(team),0);}}
}
function renderKeepers(){
  for(const id of ['h1','j1']){const p=state.players.find(p=>p.id===id);$('keeper-'+id).textContent=`${p.shortName}: ${p.executing?.label||'Waiting for play'} · ${p.executing?.source||state.mode.toUpperCase()}`;}
  const sample=keeperSample===null?keeperHistory.at(-1):keeperHistory[keeperSample],id=$('keeper-player').value,d=sample?.decisions[id],box=$('keeper-inspection');box.replaceChildren();
  if(!d){box.textContent='Both keepers use a separate JEV request in Live mode. Practice uses local rules.';return;}
  const title=document.createElement('p');title.textContent=`${playerName(id)} · ${sample.source} · ${sample.time.toFixed(2)} s · ${sample.roundTripMs} ms · ${namedText(d.label)}${d.applied===false?` · Not used: ${d.reason}`:''}`;box.append(title);
  showModelParameters(box,d);
  for(const [key,value]of Object.entries(d.probabilities).sort((a,b)=>b[1]-a[1])){const row=document.createElement('div');row.className=`prob-row${key===d.action?' chosen':''}`;const label=document.createElement('span'),prob=document.createElement('b');label.textContent=namedText(d.labels[key]);prob.textContent=`${(value*100).toFixed(1)}%`;row.append(label,prob);box.append(row);}
}
function keeperBatch(decisions,roundTripMs,source){
  keeperHistory.push({time:state.time,roundTripMs,source,decisions});$('keeper-sample').append(new Option(`${keeperHistory.length} · ${state.time.toFixed(2)} s`,String(keeperHistory.length-1)));renderKeepers();
}
async function requestKeepers(){
  const keepers=state.players.filter(p=>p.role==='GK'),urgent=keepers.some(p=>keeperObservation(state,p).threat||state.ball.owner===p.id);
  const interval=(urgent||lastKeeperVersion!==state.ball.version)? .1 : .5;
  if(keeperPending||state.phase!=='playing'||(state.mode==='practice'&&state.time-lastKeeperRequest<interval))return;
  lastKeeperRequest=state.time;lastKeeperVersion=state.ball.version;
  if(state.mode==='practice'){const decisions=Object.fromEntries(keepers.map(p=>[p.id,{...practiceKeeperAction(state,p),applied:true}]));keeperBatch(decisions,0,'Practice');return;}
  const snapshot=state,epoch=generation,controller=new AbortController();keeperPending=controller;
  const input={selected:state.selected,selectionVersion:state.selectionVersion,requestId:++requestId,sequence:state.sequence,planVersion:state.planVersion,time:state.time,strategies:state.strategies,players:state.players.map(observedPlayer),ball:{...state.ball}};
  const started=performance.now(),timer=setTimeout(()=>controller.abort(),2400);
  try{
    const response=await fetch('/api/keeper-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:controller.signal}),data=await response.json();
    if(!response.ok)throw Object.assign(new Error(data.error||'Keeper response failed'),{status:response.status,code:data.code});
    if(snapshot!==state||epoch!==generation||state.phase!=='playing')return;
    const roundTripMs=Math.round(performance.now()-started),decisions=applyTeamResponse(state,data.decisions,input,roundTripMs);keeperBatch(decisions,roundTripMs,'JEV');
  }catch(error){if(snapshot!==state||epoch!==generation||state.phase!=='playing'||input.sequence!==state.sequence||input.planVersion!==state.planVersion||controller.signal.reason==='cancelled')return;reportRequestFailure(error,input,'keepers',performance.now()-started);}
  finally{clearTimeout(timer);if(keeperPending===controller){keeperPending=null;if(state===snapshot&&generation===epoch&&state.phase==='playing'&&state.mode==='live')setTimeout(requestKeepers,0);}}
}
function pause(title='Take a breath.',copy='Choose a team plan, then continue.'){
  if(!['playing','goal'].includes(state.phase))return;
  state.resumePhase=state.phase;state.phase='paused';matchAudio.pause();keys.clear();charge=null;cancelRequests();$('pause-title').textContent=title;$('pause-copy').textContent=copy;$('pause-kicker').textContent='MATCH PAUSED';$('pause-screen').hidden=false;$('pause').textContent='Continue';
}
function resume(){
  if(state.phase==='finished'){restart();return;}
  if(!['paused','halftime'].includes(state.phase))return;
  matchAudio.unlock();state.phase=state.resumePhase||'playing';delete state.resumePhase;$('resume').blur();$('pause').blur();$('pause-screen').hidden=true;$('pause').textContent='Pause';lastRequest=-10;
}
function start(){
  if(state.mode==='live'&&!ready){notify('JEV is not connected. Select Practice to start.');return;}
  matchAudio.unlock();state.phase='playing';$('start').blur();$('start-screen').hidden=true;lastRequest=-10;event(state,world.cameraMode==='end'?'Kick-off. You attack up the screen.':'Kick-off. You attack right across the screen.');
}
function restart(){matchAudio.reset();cancelRequests();const strategies=[...state.strategies],mode=state.mode;state=createMatch(mode);state.strategies=strategies;keys.clear();charge=null;chargingPlayer=null;accumulator=0;resetDecisions();planUI();$('pause-screen').hidden=true;$('start-screen').hidden=false;$('banner').hidden=true;$('pause').textContent='Pause';}
function inputDirection(){return world.movement((keys.has('d')?1:0)-(keys.has('a')?1:0),(keys.has('s')?1:0)-(keys.has('w')?1:0));}
function chargePower(){return Math.min(1,Math.max(0,(performance.now()-charge)/1400));}
function releaseKick(kind){
  if(charge===null||chargeKind!==kind)return;
  if(state.phase==='playing'&&state.selected===chargingPlayer&&state.ball.owner===chargingPlayer){
    const kick={pass:humanPass,shot:humanShoot,lob:humanLob,chip:humanChip}[kind];kick(state,inputDirection(),chargePower());
  }
  charge=null;chargingPlayer=null;chargeKind=null;
}
function minimap(){
  const c=$('minimap'),ctx=c.getContext('2d'),x=v=>12+(v+34)/68*176,z=v=>10+(v+52.5)/105*250;
  ctx.fillStyle='#142e20';ctx.fillRect(0,0,200,270);ctx.strokeStyle='#87a77866';ctx.lineWidth=1;ctx.strokeRect(12,10,176,250);ctx.beginPath();ctx.moveTo(12,135);ctx.lineTo(188,135);ctx.stroke();ctx.beginPath();ctx.arc(100,135,22,0,Math.PI*2);ctx.stroke();
  for(const p of state.players){ctx.fillStyle=TEAMS[p.team].map;ctx.beginPath();ctx.arc(x(p.x),z(p.z),p.id===state.selected?4.5:3.3,0,Math.PI*2);ctx.fill();if(p.id===state.selected){ctx.strokeStyle='#ffe1a6';ctx.beginPath();ctx.arc(x(p.x),z(p.z),7,0,Math.PI*2);ctx.stroke();}}
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x(state.ball.x),z(state.ball.z),2.5,0,Math.PI*2);ctx.fill();
}
function updateUI(){
  const audioStatus=matchAudio.getStatus();$('sound-status').textContent=!audioStatus.enabled?'Muted':audioStatus.error?'Audio unavailable':audioStatus.loaded?`${audioStatus.loaded}/19 sounds${audioStatus.failed.length?' · some missing':''}`:audioStatus.context==='locked'?'Starts at kick-off':'Loading sounds';
  $('sound-caption').textContent=performance.now()<matchAudio.captionUntil?matchAudio.caption:audioStatus.voiceMissing?'No local English voice. Crowd sounds are active.':'Crowd reacts to the match';
  $('human-score').textContent=state.scores[0];$('jev-score').textContent=state.scores[1];$('clock').textContent=`${String(Math.floor(state.time/60)).padStart(2,'0')}:${String(Math.floor(state.time%60)).padStart(2,'0')}`;$('half').textContent=state.half===1?'1ST HALF':'2ND HALF';
  const p=state.players.find(p=>p.id===state.selected);$('selected-player').textContent=`${p.number} · ${p.shortName} · ${p.role}`;$('event-log').textContent=state.events.slice(-2).map(e=>namedText(e.text).replace(/\bYou\b/g,'Argentina').replace(/\bJEV\b/g,'Spain')).join(' · ');
  const power=charge===null?0:Math.round(chargePower()*100);
  $('charge-fill').style.width=`${power}%`;
  $('charge-label').textContent=charge===null?'Hold Space, J, U or I to set power':`${({pass:'Pass',shot:'Shot',lob:'Lob',chip:'Chip'})[chargeKind]} power: ${power}% · Release to kick`;
  $('banner').hidden=state.phase!=='goal';if(state.phase==='goal')$('banner').textContent=state.conceding===1?'GOAL · ARGENTINA':'GOAL · SPAIN';minimap();
  if($('follow-decision').checked){const focus=state.players.find(p=>p.id===state.ball.owner&&p.team===decisionTeam&&p.role!=='GK'&&p.id!==state.selected)||state.players.filter(p=>p.team===decisionTeam&&p.role!=='GK'&&p.id!==state.selected).sort((a,b)=>distance(a,state.ball)-distance(b,state.ball))[0];if(focus.id!==inspected){inspected=focus.id;world.inspected=inspected;decisionRows();}}
  for(const row of $('player-decisions').children){const actor=state.players.find(p=>p.id===row.dataset.player),current=actor.executing;row.querySelector('.action').textContent=namedText(current?.label||lastDecisions[actor.id]?.label||'Awaiting play');row.querySelector('.command-status').textContent=current?.source==='JEV'?`JEV · ${Math.max(0,Math.round((state.time-current.issuedAt)*1000))} ms old`:current?.source==='Waiting'?'Waiting for JEV':current?.source||'No action yet';row.classList.toggle('has-ball',actor.id===state.ball.owner);}
  const actor=state.players.find(p=>p.id===inspected),c=actor.executing;$('active-command').textContent=`${playerName(inspected)} · ${namedText(c?.label||'Awaiting play')}${c?.source?` · ${c.source}`:''}`;
  for(const id of ['h1','j1']){const p=state.players.find(p=>p.id===id);$('keeper-'+id).textContent=`${p.shortName}: ${p.executing?.label||'Waiting for play'} · ${p.executing?.source||state.mode.toUpperCase()}`;}
  const samples=activeHistory(),latest=samples.at(-1);
  $('support-status').textContent=`Your teammates: ${supportResponses} ${state.mode==='practice'?'local':'JEV'} responses · You: ${p.shortName}`;
  $('request-count').textContent=`${decisionTeam===0?supportResponses:responses} responses`;$('response-time').textContent=latest?`${latest.latencyMs} ms`:'— ms';$('response-age').textContent=latest?`${latest.roundTripMs} ms round trip`:'No response yet';
  const gaps=samples.slice(-10).slice(1).map((h,i)=>(h.wallAt-samples.slice(-10)[i].wallAt)/1000).filter(g=>g>0&&g<2);$('decision-cadence').textContent=state.mode==='practice'?'Practice · local decisions every 200 ms':gaps.length?`${(gaps.length/gaps.reduce((a,b)=>a+b,0)).toFixed(1)} command batches/s · next batch on reply`:'Next command batch starts on reply';
}
function frame(now){
  const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;accumulator+=dt;
  const movement=inputDirection();
  const input={...movement,sprint:keys.has('shift'),tackle:keys.has('k')};
  const phase=state.phase;while(accumulator>=DT){stepMatch(state,DT,input);accumulator-=DT;}
  if(state.phase!==phase){
    if(state.phase==='goal'){cancelRequests();charge=null;}
    if(state.phase==='halftime'||state.phase==='finished'){
      cancelRequests();keys.clear();charge=null;$('pause-screen').hidden=false;$('pause-kicker').textContent=state.phase==='halftime'?'HALF TIME':'FULL TIME';$('pause-title').textContent=state.phase==='halftime'?'Set the next plan.':`${state.scores[0]} — ${state.scores[1]}`;$('pause-copy').textContent=state.phase==='halftime'?'Review the team strategy, then start the second half.':'Match complete. Start another match to test a different plan.';
    }
  }
  if(charge!==null&&(state.selected!==chargingPlayer||state.ball.owner!==chargingPlayer)){charge=null;chargingPlayer=null;}
  if(lastSupportSelection!==state.selectionVersion){lastSupportSelection=state.selectionVersion;supportPending?.abort('cancelled');supportPending=null;lastSupportRequest=-10;}
  if(state.phase==='playing'){requestKeepers();requestTeam();requestTeam(0);}
  matchAudio.update(state);world.updateMatch(state,dt);uiTime+=dt;if(uiTime>.1){uiTime=0;updateUI();}requestAnimationFrame(frame);
}
function setup(){
  $('decision-team').onchange=e=>{decisionTeam=Number(e.target.value);inspected=decisionTeam===1?'j10':state.players.find(p=>p.team===0&&p.role!=='GK'&&p.id!==state.selected).id;world.inspected=inspected;$('player-decisions').replaceChildren();historyPicker();decisionRows();$('decision-team').blur();};
  $('sound-enabled').onchange=e=>matchAudio.setEnabled(e.target.checked);
  $('sound-volume').oninput=e=>matchAudio.setVolume(Number(e.target.value));
  $('sound-commentary').onchange=e=>matchAudio.setCommentary(e.target.checked);
  $('keeper-player').onchange=()=>{world.inspected=$('keeper-player').value;$('follow-decision').checked=false;renderKeepers();$('keeper-player').blur();};
  $('keeper-sample').onchange=e=>{keeperSample=e.target.value==='latest'?null:Number(e.target.value);renderKeepers();};
  for(const p of state.players.filter(p=>p.team===0)){const row=document.createElement('div');row.textContent=`${p.number} · ${p.name} · ${p.role}`;$('human-roster').append(row);}
  function setCamera(mode){world.cameraMode=mode;$('camera').value=mode;keys.clear();charge=null;$('attack-direction').textContent=mode==='end'?'YOU ATTACK ↑':'YOU ATTACK →';$('camera').blur();}
  $('camera').onchange=e=>setCamera(e.target.value);$('camera-zoom').oninput=e=>{world.cameraZoom=Number(e.target.value);};
  $('decision-sample').onchange=e=>{selectedSample=e.target.value==='latest'?null:Number(e.target.value);$('follow-decision').checked=false;inspect();};
  $('follow-decision').onchange=()=>{selectedSample=null;$('decision-sample').value='latest';inspect();};
  $('start').onclick=start;$('pause').onclick=()=>state.phase==='paused'?resume():pause();$('resume').onclick=resume;$('restart').onclick=restart;
  $('mode').onchange=e=>{if(state.phase==='playing'||state.phase==='goal')pause();state.mode=e.target.value;cancelRequests();state.orders={};resetDecisions();$('connection').textContent=state.mode==='practice'?'PRACTICE':ready?'JEV READY':'JEV OFFLINE';$('model-note').textContent=state.mode==='practice'?'Practice uses local rules. No model calls.':'JEV selects actions and their movement and kick controls.';};
  for(const b of $('strategy-buttons').children)b.onclick=()=>{changeStrategy(state,1,b.dataset.strategy);b.blur();cancelRequests();lastDecisions={};decisionRows();planUI();$('model-note').textContent='New plan set. Waiting for the next team response.';};
  $('human-strategy').onchange=e=>{changeStrategy(state,0,e.target.value);cancelRequests();};
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();if(e.target.closest('input,select,summary,details')||(e.target.closest('button')&&[' ','enter'].includes(key)))return;
    if([' ','w','a','s','d','j','u','i','k','l','shift'].includes(key))e.preventDefault();keys.add(key);
    if(e.repeat)return;if(key==='c'){const modes=['broadcast','wide','end'];setCamera(modes[(modes.indexOf(world.cameraMode)+1)%3]);return;}if(key==='escape'){state.phase==='paused'?resume():pause();return;}
    if(state.phase!=='playing')return;
    if(key==='l'){charge=null;switchPlayer(state);}
    if([' ','j','u','i'].includes(key)&&charge===null){
      if(state.ball.owner===state.selected){charge=performance.now();chargingPlayer=state.selected;chargeKind=({' ':'shot',j:'pass',u:'lob',i:'chip'})[key];}
      else notify('Your selected player needs the ball. Press L to switch.');
    }
  });
  window.addEventListener('keyup',e=>{const key=e.key.toLowerCase();keys.delete(key);if([' ','j','u','i'].includes(key))releaseKick(({' ':'shot',j:'pass',u:'lob',i:'chip'})[key]);});
  window.addEventListener('blur',()=>{keys.clear();charge=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('Match paused','Return to the pitch and continue.');});
  window.addEventListener('resize',()=>world.resize());
}
try{
  world=new MatchWorld($('pitch'),state.players);setup();planUI();decisionRows();renderKeepers();updateUI();
  const response=await fetch('/api/health');ready=(await response.json()).ready;$('connection').textContent=ready?'JEV READY':'JEV OFFLINE';
  window.__MATCH__={getState:()=>structuredClone({...state,requestFailures,lastDecisions,decisionHistory:history,supportHistory,supportResponses,keeperHistory,responses,audio:matchAudio.getStatus(),camera:{mode:world.cameraMode,position:world.camera.position.toArray(),target:world.cameraTarget.toArray(),zoom:world.cameraZoom}}),project:(x,z)=>world.project(x,0,z)};
  requestAnimationFrame(frame);
}catch(error){$('error').hidden=false;$('error').textContent=`The match could not start: ${error.message}`;console.error(error);}
