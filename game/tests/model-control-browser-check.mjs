import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createMatch} from '../src/match/engine.mjs';
const pressure=process.env.JEV_SCENARIO==='pressure',prefix=pressure?'model-control-pressure':'model-control';
const base=process.env.JEV_TEST_URL||'http://127.0.0.1:4318',report={errors:[]},frames=[],writes=[],dir=resolve(`artifacts/${prefix}-frames`);await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();let cdp;
page.on('pageerror',e=>report.errors.push(e.message));
try{
 const state=createMatch();state.time=1;state.ball.owner='j10';state.ball.x=0;state.ball.z=12;state.players[20].x=0;state.players[20].z=12;for(const p of state.players.filter(p=>p.team===0&&p.role!=='GK'))p.x=p.x<0?-25:25;
 if(pressure){state.selected='h8';state.players[7].x=0;state.players[7].z=13;state.players[21].x=8;state.players[21].z=20;}
 await context.addInitScript(state=>{window.__MODEL_FIXTURE__=state;window.__MODEL_CALLS__=[];const fetch=window.fetch.bind(window),pending={};window.fetch=async(url,options)=>{
  if(!/\/api\/(team|keeper)-decision$/.test(String(url)))return fetch(url,options);
  const c={url,start:performance.now(),pending:pending[url]=(pending[url]||0)+1};window.__MODEL_CALLS__.push(c);let done=false;const finish=()=>{if(!done){done=true;c.end=performance.now();pending[url]--;}};options.signal?.addEventListener('abort',()=>{c.aborted=true;finish();},{once:true});
  try{const response=await fetch(url,options),json=response.json.bind(response);response.json=async()=>{try{const d=await json();c.stages=d.stages;c.status=response.status;return d;}finally{finish();}};return response;}catch(e){finish();throw e;}
 };},state);
 const source=await readFile('src/match/game.mjs','utf8');await page.route('**/src/match/game.mjs',route=>route.fulfill({contentType:'text/javascript',body:source.replace('state=createMatch(),','state=window.__MODEL_FIXTURE__||createMatch(),')}));
 await page.goto(base+'/match');await page.waitForFunction(()=>window.__MATCH__,null,{timeout:15000});
 await page.locator('#sound-enabled').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
 cdp=await context.newCDPSession(page);cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});const name=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({name,time:e.metadata.timestamp});writes.push(writeFile(resolve(dir,name),Buffer.from(e.data,'base64')));});await cdp.send('Page.startScreencast',{format:'jpeg',quality:83,maxWidth:1440,maxHeight:960,everyNthFrame:2});
 await page.locator('#start').click();await page.waitForFunction(()=>window.__MATCH__.getState().responses>=8||window.__MATCH__.getState().phase==='paused',null,{timeout:20000});
 report.state=await page.evaluate(()=>window.__MATCH__.getState());assert.equal(report.state.phase,'playing');assert(report.state.responses>=8);await page.locator('#pause').click();
 report.calls=await page.evaluate(()=>window.__MODEL_CALLS__);assert.equal(Math.max(...report.calls.map(c=>c.pending)),1);
 const count=report.calls.length;await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__MODEL_CALLS__.length),count);report.pause=true;
 assert(report.state.decisionHistory.every(h=>Object.values(h.decisions).every(d=>d.command.controlVersion===2)));
 const entries=report.state.decisionHistory.flatMap((h,i)=>Object.entries(h.decisions).map(([id,d])=>({id,d,i}))),selected=entries.find(e=>e.id==='j10'&&e.d.parameters.power&&e.d.applied)||entries.find(e=>e.d.parameters.speed&&e.d.applied);assert(selected);if(pressure)assert(selected.d.parameters.power,'Expected a model-selected kick in the pressure test');
 await page.locator('#pause-screen').evaluate(el=>el.hidden=true);await page.locator(`[data-player="${selected.id}"]`).click();await page.selectOption('#decision-sample',String(selected.i));await page.locator('#inspection').scrollIntoViewIfNeeded();
 assert.match(await page.locator('#decision-inspection').innerText(),/JEV selected the action and controls/);await page.screenshot({path:resolve(`artifacts/${prefix}-decisions.png`)});
 report.sample=selected;
 await page.selectOption('#mode','practice');await page.locator('#pause').click();await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.__MODEL_CALLS__.length),count);report.practiceNoCalls=true;assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(e.stack);process.exitCode=1;report.calls=await page.evaluate(()=>window.__MODEL_CALLS__).catch(()=>[]);report.state=await page.evaluate(()=>window.__MATCH__?.getState()).catch(()=>null);await page.screenshot({path:resolve(`artifacts/${prefix}-browser-failure.png`)}).catch(()=>{});}
finally{if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});await Promise.all(writes);if(frames.length)await writeFile(resolve(dir,'frames.txt'),frames.map((f,i)=>`file '${f.name}'\nduration ${Math.max(.008,(frames[i+1]?.time??f.time+.05)-f.time).toFixed(6)}`).join('\n')+`\nfile '${frames.at(-1).name}'\n`);await writeFile(`artifacts/${prefix}-browser-check.json`,JSON.stringify(report,null,2));await browser.close();}
const summary={responses:report.state?.responses,errors:report.errors,pause:report.pause,practice:report.practiceNoCalls};for(const kind of ['team','keeper']){const calls=(report.calls||[]).filter(c=>c.url.includes(kind)&&c.status===200),times=calls.map(c=>c.end-c.start),gaps=calls.slice(1).map((c,i)=>c.start-calls[i].end);summary[kind]={batches:calls.length,modelCalls:calls.reduce((n,c)=>n+c.stages.calls,0),minMs:Math.round(Math.min(...times)),meanMs:Math.round(times.reduce((a,b)=>a+b,0)/times.length),maxMs:Math.round(Math.max(...times)),maxGapMs:Math.max(...gaps)};}console.log(JSON.stringify(summary,null,2));
