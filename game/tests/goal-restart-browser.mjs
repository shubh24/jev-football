import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createMatch} from '../src/match/engine.mjs';
const live=process.argv.includes('--live'),report={live,errors:[],requests:[]},browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
let fail=false,cdp;const frames=[],writes=[],dir=resolve('artifacts/goal-restart-frames');
page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/\/api\/.*-decision/.test(r.url())){const input=r.postDataJSON();report.requests.push({path:new URL(r.url()).pathname,id:input.requestId,sequence:input.sequence});}});
try{
 const state=createMatch();state.time=2;for(const p of state.players){if(p.role==='GK'){p.x=3;p.keeper.x=3;p.keeper.targetX=3;}else{p.x=p.team?20:-20;p.z=p.index*2;}}
 Object.assign(state.ball,{owner:null,x:0,y:.5,z:-47,vx:0,vy:0,vz:-25,lockUntil:0,shot:{player:'h10',team:0},receiver:null,passTarget:null});
 await page.addInitScript(s=>window.__GOAL_FIXTURE__=s,state);
 const source=await readFile('src/match/game.mjs','utf8');await page.route('**/src/match/game.mjs',r=>r.fulfill({contentType:'text/javascript',body:source.replace('state=createMatch(),','state=window.__GOAL_FIXTURE__||createMatch(),')}));
 if(!live)await page.route('**/api/*-decision',async r=>{
  const input=r.request().postDataJSON(),keeper=r.request().url().includes('keeper'),human=r.request().url().includes('teammate');
  const players=input.players.filter((p,i)=>keeper?i%11===0:human?i>0&&i<11&&p.id!==input.selected:i>11);
  const decisions=Object.fromEntries(players.map(p=>[p.id,{action:'hold',label:'Hold',command:{type:keeper?'keeper':'hold',action:'wait',controlVersion:2,requiresBall:input.ball.owner===p.id,duration:.25},probabilities:{hold:1},labels:{hold:'Hold'},parameters:{}}]));
  await new Promise(resolve=>setTimeout(resolve,700));try{if(fail&&!keeper&&!human)await r.fulfill({status:504,json:{error:'JEV did not finish within the request time limit.',code:'JEV_TIMEOUT',requestId:input.requestId}});else await r.fulfill({json:{decisions,latencyMs:700}});}catch{}
 });
 await page.goto((process.env.JEV_TEST_URL||'http://127.0.0.1:4317')+'/match');await page.waitForFunction(()=>window.__MATCH__);
 await page.locator('#sound-enabled').evaluate(e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));});
 if(live){await mkdir(dir,{recursive:true});cdp=await context.newCDPSession(page);cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});const name=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({name,time:e.metadata.timestamp});writes.push(writeFile(resolve(dir,name),Buffer.from(e.data,'base64')));});await cdp.send('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:1440,maxHeight:960,everyNthFrame:2});}
 await page.locator('#start').click();await page.waitForFunction(()=>window.__MATCH__.getState().phase==='goal',null,{timeout:3000});
 report.goal=await page.evaluate(()=>window.__MATCH__.getState());assert.deepEqual(report.goal.scores,[1,0]);await page.screenshot({path:`artifacts/goal-restart-${live?'live':'controlled'}-goal.png`});
 await page.waitForFunction(()=>{const s=window.__MATCH__.getState();return s.phase==='paused'||s.sequence>1&&s.responses>=2&&s.supportResponses>=2&&s.keeperHistory.length>=2;},null,{timeout:12000});
 report.restart=await page.evaluate(()=>window.__MATCH__.getState());assert.equal(report.restart.phase,'playing');assert.deepEqual(report.restart.scores,[1,0]);assert.equal(report.restart.sequence,2);assert.equal(report.restart.requestFailures.length,0);
 for(const path of ['/api/team-decision','/api/teammate-decision','/api/keeper-decision'])assert(report.requests.some(r=>r.path===path&&r.sequence===2));
 await page.screenshot({path:`artifacts/goal-restart-${live?'live':'controlled'}-playing.png`});
 if(!live){fail=true;await page.waitForFunction(()=>window.__MATCH__.getState().phase==='paused');report.failure=await page.evaluate(()=>window.__MATCH__.getState().requestFailures.at(-1));assert.equal(report.failure.code,'JEV_TIMEOUT');assert.equal(report.failure.status,504);assert.match(await page.locator('#pause-copy').innerText(),/request time limit.*Request/);fail=false;await page.locator('#resume').click();await page.waitForTimeout(850);assert.equal(await page.evaluate(()=>window.__MATCH__.getState().phase),'playing');report.retry=true;}
 await page.locator('#pause').click();assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(e.stack);report.state=await page.evaluate(()=>window.__MATCH__?.getState()).catch(()=>null);process.exitCode=1;}
finally{if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});await Promise.all(writes);if(frames.length)await writeFile(resolve(dir,'frames.txt'),frames.map((f,i)=>`file '${f.name}'\nduration ${Math.max(.008,(frames[i+1]?.time??f.time+.05)-f.time).toFixed(6)}`).join('\n')+`\nfile '${frames.at(-1).name}'\n`);await writeFile(`artifacts/goal-restart-${live?'live':'controlled'}.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({live,errors:report.errors,scores:report.restart?.scores,phase:report.restart?.phase,responses:report.restart?.responses,supportResponses:report.restart?.supportResponses,keeperResponses:report.restart?.keeperHistory.length,requests:report.requests.length,retry:report.retry,failure:report.failure},null,2));
