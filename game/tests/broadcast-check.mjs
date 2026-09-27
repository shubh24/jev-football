import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createMatch} from '../src/match/engine.mjs';
const dir=resolve('artifacts');await mkdir(dir,{recursive:true});const report={date:new Date().toISOString(),modelFixtures:[],checks:[],errors:[],live:[]};
for(const strategy of ['possession','attack','defend']){
  const s=createMatch();s.strategies[1]=strategy;s.ball.owner='j10';s.requestId=1;
  const start=performance.now(),response=await fetch('http://127.0.0.1:4317/api/team-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)}),data=await response.json();
  report.modelFixtures.push({strategy,status:response.status,roundTripMs:Math.round(performance.now()-start),...data});console.log(JSON.stringify({strategy,status:response.status,latencyMs:data.latencyMs,actions:Object.fromEntries(Object.entries(data.decisions||{}).map(([k,d])=>[k,d.action]))}));
  assert(response.ok,JSON.stringify(data));assert.equal(Object.keys(data.decisions).length,10);
}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
let calls=0;page.on('request',r=>{if(r.url().endsWith('/api/team-decision'))calls++;});
try{
  await page.goto('http://127.0.0.1:4317/match',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__MATCH__);assert.equal(calls,0);assert.equal((await page.evaluate(()=>window.__MATCH__.getState())).players.length,22);report.checks.push('22 players; no API calls before kick-off.');
  await page.screenshot({path:resolve(dir,'broadcast-intro.png')});
  await page.selectOption('#mode','practice');await page.getByRole('button',{name:'START MATCH'}).click();
  const before=await page.evaluate(()=>window.__MATCH__.getState());await page.keyboard.down('w');await page.keyboard.down('Shift');await page.waitForTimeout(350);await page.keyboard.up('w');await page.keyboard.up('Shift');const after=await page.evaluate(()=>window.__MATCH__.getState());
  assert(after.players.find(p=>p.id===before.selected).x<before.players.find(p=>p.id===before.selected).x-.3);report.checks.push('WASD and sprint move the selected player up the broadcast view.');
  await page.keyboard.press('d');await page.keyboard.press('j');await page.waitForTimeout(300);assert((await page.evaluate(()=>window.__MATCH__.getState())).stats[0].passes>0);report.checks.push('The pass key releases the ball.');
  await page.keyboard.press('l');assert((await page.evaluate(()=>window.__MATCH__.getState())).selected.startsWith('h'));report.checks.push('The switch key selects a human player.');
  await page.getByRole('button',{name:'Attack',exact:true}).click();assert.equal((await page.evaluate(()=>window.__MATCH__.getState())).strategies[1],'attack');await page.waitForTimeout(900);assert.equal(calls,0);assert.equal(await page.locator('.player-row').count(),10);report.checks.push('Practice uses no API calls and shows 10 outfield actions.');
  await page.screenshot({path:resolve(dir,'broadcast-practice.png')});
  assert.equal((await page.evaluate(()=>window.__MATCH__.getState())).camera.mode,'broadcast');
  await page.keyboard.press('c');assert.equal((await page.evaluate(()=>window.__MATCH__.getState())).camera.mode,'wide');
  await page.keyboard.press('c');assert.equal((await page.evaluate(()=>window.__MATCH__.getState())).camera.mode,'end');
  await page.selectOption('#camera','broadcast');await page.waitForTimeout(600);
  report.checks.push('C cycles through broadcast, wide and end cameras.');await page.getByRole('button',{name:'Pause',exact:true}).click();
  const paused=await page.evaluate(()=>window.__MATCH__.getState().time);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.__MATCH__.getState().time),paused);report.checks.push('Pause stops the simulation.');
  await page.selectOption('#mode','live');await page.getByRole('button',{name:/^CONTINUE/}).click();
  await page.waitForFunction(()=>window.__MATCH__.getState().responses>=2,null,{timeout:15000});
  await page.getByRole('button',{name:'Defend',exact:true}).click();
  await page.waitForFunction(()=>window.__MATCH__.getState().decisionHistory.some(h=>h.strategy==='defend'&&h.source==='JEV'),null,{timeout:15000});
  await page.waitForFunction(()=>window.__MATCH__.getState().responses>=8,null,{timeout:15000});
  await page.locator('[data-player="j10"]').click();await page.selectOption('#decision-sample','0');
  const saved=await page.locator('#decision-inspection').textContent();
  const count=await page.evaluate(()=>window.__MATCH__.getState().responses);await page.waitForFunction(n=>window.__MATCH__.getState().responses>n,count,{timeout:5000});
  assert.equal(await page.locator('#decision-inspection').textContent(),saved);
  assert(saved.includes('choices'));assert(saved.includes('ms limit'));report.checks.push('History stays fixed while new responses arrive; command limits and all choices are shown.');
  await page.selectOption('#decision-sample','latest');await page.keyboard.press('l');await page.keyboard.down('w');await page.waitForTimeout(1600);await page.keyboard.up('w');
  await page.getByRole('button',{name:'Pause',exact:true}).click();const live=await page.evaluate(()=>window.__MATCH__.getState());report.live=live.decisionHistory;assert(live.decisionHistory.some(h=>Object.keys(h.decisions).length===10));assert.equal(live.strategies[1],'defend');assert.equal(live.planVersion,2);report.checks.push('Live JEV returns 10 outfield actions and uses the changed team plan.');
  // Hide only the pause overlay for a clear still of the paused match. This does not alter gameplay state.
  await page.locator('#pause-screen').evaluate(el=>el.hidden=true);await page.locator('[data-player="j7"]').click();await page.screenshot({path:resolve(dir,'broadcast-live.png')});
  assert(await page.locator('#decision-inspection').textContent());report.checks.push('Player inspection shows real action probabilities.');
  await page.setViewportSize({width:1050,height:760});await page.screenshot({path:resolve(dir,'broadcast-compact.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1050);
}catch(e){report.errors.push(e.message);console.error(e);await page.screenshot({path:resolve(dir,'broadcast-failure.png')}).catch(()=>{});}
finally{report.calls=calls;await writeFile(resolve(dir,'broadcast-check.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks:report.checks,errors:report.errors,calls}));if(report.errors.length)process.exitCode=1;
