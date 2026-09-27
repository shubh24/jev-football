import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createMatch} from '../src/match/engine.mjs';
import {sanitizeTeamState,buildTeamRequest} from '../src/match/decision.mjs';
import {buildKeeperRequest} from '../src/match/keepers.mjs';
const live=process.argv.includes('--live'),name=live?'live':'controlled',report={mode:name,errors:[]},dir=resolve(`artifacts/continuous-${name}-frames`);
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));
let cdp,failNext=false;const frames=[],writes=[];
function summary(calls){
 const completed=calls.filter(c=>c.end&&!c.aborted),gaps=completed.slice(0,-1).map((c,i)=>completed[i+1].start-c.end).filter(g=>g>=0&&g<1000).sort((a,b)=>a-b),latencies=completed.map(c=>c.end-c.start).sort((a,b)=>a-b);
 return {responses:completed.length,meanRoundTripMs:latencies.reduce((a,b)=>a+b,0)/latencies.length,minRoundTripMs:latencies[0],maxRoundTripMs:latencies.at(-1),responsesPerSecond:(completed.length-1)*1000/(completed.at(-1).end-completed[0].end),medianReplyToNextCallMs:gaps[Math.floor(gaps.length/2)],maxReplyToNextCallMs:gaps.at(-1),maxPending:Math.max(...calls.map(c=>c.pending))};
}
try{
 const state=createMatch();state.time=1;state.ball.owner='j10';state.ball.x=0;state.ball.z=live?12:-20;state.players[20].x=0;state.players[20].z=state.ball.z;
 for(const p of state.players.filter(p=>p.team===0&&p.role!=='GK'))p.x=p.x<0?-25:25;
 await context.addInitScript(state=>{
  window.__CADENCE_FIXTURE__=state;window.__CALLS__=[];window.__SPEEDS__=[];
  const original=window.fetch.bind(window),pending={};
  window.fetch=async(input,options)=>{
   const url=String(input);if(!/\/api\/(team|keeper)-decision$/.test(url))return original(input,options);
   const c={url,start:performance.now(),pending:pending[url]=(pending[url]||0)+1};window.__CALLS__.push(c);let done=false;
   const finish=()=>{if(!done){done=true;c.end=performance.now();pending[url]--;}};
   options.signal?.addEventListener('abort',()=>{c.aborted=true;finish();},{once:true});
   try{const response=await original(input,options),json=response.json.bind(response);response.json=async()=>{try{return await json();}finally{finish();}};return response;}catch(e){finish();throw e;}
  };
  const sample=()=>{const s=window.__MATCH__?.getState();if(s?.phase==='playing'){const p=s.players.find(p=>p.id==='j10');window.__SPEEDS__.push({time:s.time,speed:Math.hypot(p.vx,p.vz),owner:s.ball.owner,action:p.executing?.label,source:p.executing?.source});}requestAnimationFrame(sample);};requestAnimationFrame(sample);
 },state);
 const source=await readFile('src/match/game.mjs','utf8');
 await page.route('**/src/match/game.mjs',route=>route.fulfill({contentType:'text/javascript',body:source.replace('state=createMatch(),','state=window.__CADENCE_FIXTURE__||createMatch(),')}));
 if(!live)await page.route('**/api/*-decision',async route=>{
  const input=sanitizeTeamState(route.request().postDataJSON()),keeper=route.request().url().includes('keeper'),choices=(keeper?buildKeeperRequest(input):buildTeamRequest(input)).choices;
  const decisions=Object.fromEntries(Object.entries(choices).map(([id,options])=>{const action=keeper?'wait':id==='j10'?'carry_forward':'hold';const command=options[action];assert(command);return [id,{action,command,label:command.label,options,labels:Object.fromEntries(Object.entries(options).map(([key,c])=>[key,c.label])),probabilities:Object.fromEntries(Object.keys(options).map(key=>[key,key===action?1:0]))}];}));
  await new Promise(r=>setTimeout(r,150));
  try{if(failNext&&!keeper){failNext=false;await route.fulfill({status:503,json:{error:'Controlled test error'}});}else await route.fulfill({json:{decisions,latencyMs:150}});}catch{}
 });
 await page.goto('http://127.0.0.1:4317/match');await page.waitForFunction(()=>window.__MATCH__);await page.locator('#sound-enabled').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
 if(live){cdp=await context.newCDPSession(page);cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});const name=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({name,time:e.metadata.timestamp});writes.push(writeFile(resolve(dir,name),Buffer.from(e.data,'base64')));});await cdp.send('Page.startScreencast',{format:'jpeg',quality:83,maxWidth:1440,maxHeight:960,everyNthFrame:2});}
 await page.locator('#start').click();
 await page.waitForFunction(()=>window.__MATCH__.getState().responses>=18,null,{timeout:18000});
 await page.locator('#pause').click();
 report.calls=await page.evaluate(()=>window.__CALLS__);report.speeds=await page.evaluate(()=>window.__SPEEDS__);report.state=await page.evaluate(()=>window.__MATCH__.getState());
 for(const endpoint of ['team','keeper']){report[endpoint]=summary(report.calls.filter(c=>c.url.includes(endpoint)));assert.equal(report[endpoint].maxPending,1);assert(report[endpoint].medianReplyToNextCallMs<50);}
 if(!live){const moving=report.speeds.filter(s=>s.time>2&&s.owner==='j10');report.minimumRunSpeed=Math.min(...moving.map(s=>s.speed));assert(report.minimumRunSpeed>4.6);}
 const pausedCalls=report.calls.length;await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__CALLS__.length),pausedCalls);report.pauseStopsRequests=true;
 await page.locator('#pause-screen').evaluate(el=>el.hidden=true);await page.locator('#inspection').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(`artifacts/continuous-${name}.png`)});
 if(!live){
  await page.locator('#pause').click();const baseline=report.state.responses;await page.waitForFunction(n=>window.__MATCH__.getState().responses>=n+3,baseline,{timeout:5000});
  failNext=true;await page.waitForFunction(()=>window.__MATCH__.getState().phase==='paused',null,{timeout:5000});const failedCalls=await page.evaluate(()=>window.__CALLS__.length);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__CALLS__.length),failedCalls);report.errorPausesWithoutRetry=true;
  const allCalls=await page.evaluate(()=>window.__CALLS__);assert.equal(Math.max(...allCalls.map(c=>c.pending)),1);report.resumeSinglePending=true;
  await page.selectOption('#mode','practice');await page.locator('#resume').click();await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>window.__CALLS__.length),failedCalls);report.practiceMakesNoCalls=true;
 }
 assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(e.stack);process.exitCode=1;await page.screenshot({path:resolve(`artifacts/continuous-${name}-failure.png`)}).catch(()=>{});}
finally{if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});await Promise.all(writes);if(frames.length)await writeFile(resolve(dir,'frames.txt'),frames.map((f,i)=>`file '${f.name}'\nduration ${Math.max(.008,(frames[i+1]?.time??f.time+.05)-f.time).toFixed(6)}`).join('\n')+`\nfile '${frames.at(-1).name}'\n`);await writeFile(`artifacts/request-cadence-${name}.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({mode:report.mode,team:report.team,keeper:report.keeper,minimumRunSpeed:report.minimumRunSpeed,pause:report.pauseStopsRequests,resume:report.resumeSinglePending,error:report.errorPausesWithoutRetry,practice:report.practiceMakesNoCalls,errors:report.errors},null,2));
