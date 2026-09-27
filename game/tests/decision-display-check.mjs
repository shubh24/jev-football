import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ACTIONS} from '../src/decision.mjs';

const out=resolve('artifacts');await mkdir(out,{recursive:true});
const report={date:new Date().toISOString(),checks:[],shots:[],errors:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
async function check(name,fn){await fn();report.checks.push(name);console.log(name);}
async function shoot(x,y){
  await page.waitForFunction(()=>window.__ELEVEN__?.getState().phase==='ready');await page.waitForTimeout(1300);
  const p=await page.evaluate(([x,y])=>window.__ELEVEN__.project(x,y),[x,y]);await page.mouse.move(p.x,p.y);
  await page.keyboard.down('Space');await page.waitForTimeout(750);await page.keyboard.up('Space');
  await page.waitForFunction(()=>window.__ELEVEN__.getState().phase==='result',null,{timeout:15000});
  return page.evaluate(()=>window.__ELEVEN__.getState());
}
async function checkSnapshot(index,state){
  const entry=state.decisionHistory[index];
  assert.equal(await page.locator('#action-probabilities > div').count(),10);
  for(const [action,p]of Object.entries(entry.probabilities))assert.equal(await page.locator(`[data-action="${action}"] b`).textContent(),`${(p*100).toFixed(1)}%`);
  assert.equal(await page.locator('.action-probability.chosen').getAttribute('data-action'),entry.action);
}
try{
  await page.goto('http://127.0.0.1:4317',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ELEVEN__);
  await page.getByRole('button',{name:'STEP UP'}).click();
  const step=await shoot(.7,1.2);report.shots.push(step);
  await check('All live responses have a visible history entry and ten matching probabilities.',async()=>{
    assert(step.decisionHistory.length>=2);assert.equal(await page.locator('.decision-entry').count(),step.decisionHistory.length);await checkSnapshot(step.decisionHistory.length-1,step);
    for(const [i,d]of step.decisionHistory.entries())assert((await page.locator('.decision-entry').nth(i).textContent()).includes(`${d.time.toFixed(2)} s`));
  });
  const selected=Math.max(0,step.decisionHistory.findIndex(d=>d.action.startsWith('step_')));
  await page.locator('.decision-entry').nth(selected).click();
  await check('Selecting an earlier decision restores its probability values.',()=>checkSnapshot(selected,step));
  await page.screenshot({path:resolve(out,'decision-history-live.png')});
  await page.getByRole('button',{name:'Latest',exact:true}).click();
  await check('Latest returns to the newest response.',()=>checkSnapshot(step.decisionHistory.length-1,step));
  await page.getByRole('button',{name:'WATCH REPLAY'}).click();await page.waitForTimeout(1100);
  await check('Replay keeps the recorded decisions visible and makes no new requests.',async()=>{
    assert(await page.locator('#decision-details').isVisible());const replay=await page.evaluate(()=>window.__ELEVEN__.getState());assert.equal(replay.requests,step.requests);assert.deepEqual(replay.decisionHistory,step.decisionHistory);assert.equal(replay.goals,step.goals);assert.equal(replay.saves,step.saves);
  });
  await page.screenshot({path:resolve(out,'decision-history-replay.png')});
  await page.getByRole('button',{name:'BACK TO RESULT'}).click();await page.getByRole('button',{name:'NEXT PENALTY'}).click();
  await check('The next shot clears history and all probability values.',async()=>{assert.equal(await page.locator('.decision-entry').count(),0);assert.equal(await page.locator('.action-probability.chosen').count(),0);assert((await page.locator('.action-probability b').allTextContents()).every(x=>x==='—'));});
  const dive=await shoot(-2.1,.45);report.shots.push(dive);
  await check('A live dive is shown as a separate low or high action.',async()=>{assert(dive.decisionHistory.some(d=>d.applied&&/^left_(low|high)$/.test(d.action)));await checkSnapshot(dive.decisionHistory.length-1,dive);});
  await page.screenshot({path:resolve(out,'decision-history-dive.png')});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#decision-details > summary').click();
  await check('The narrow screen can collapse and open the decision panel.',async()=>{
    assert.equal(await page.locator('#decision-details').getAttribute('open'),null);
    await page.screenshot({path:resolve(out,'decision-history-mobile-closed.png')});
    await page.locator('#decision-details > summary').click();assert(await page.locator('#action-probabilities').isVisible());
    const bounds=await page.locator('#keeper-card').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    assert(await page.locator('.action-probability.chosen').evaluate(el=>{const r=el.getBoundingClientRect();return Boolean(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#keeper-card'));}));
    await page.screenshot({path:resolve(out,'decision-history-mobile.png')});
  });
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'NEXT PENALTY'}).click();
  // A slow run-up response is rejected by gameplay but remains available for inspection.
  await page.route('**/api/decision',async route=>{
    const input=route.request().postDataJSON();if(input.phase==='approach')await new Promise(r=>setTimeout(r,820));
    await route.fulfill({json:{action:'wait',probabilities:Object.fromEntries(Object.keys(ACTIONS).map(a=>[a,a==='wait'?1:0])),confidence:1,latencyMs:input.phase==='approach'?820:0,source:'test-fixture'}}).catch(()=>{});
  });
  const late=await shoot(2.8,1.75);
  await check('A late response is retained and marked Not used with a reason.',async()=>{const i=late.decisionHistory.findIndex(d=>!d.applied);assert(i>=0);const entry=page.locator('.decision-entry').nth(i);assert((await entry.textContent()).includes('Not used'));assert((await entry.textContent()).includes(late.decisionHistory[i].reason));await entry.click();await checkSnapshot(i,late);});
  await page.screenshot({path:resolve(out,'decision-history-late-response.png')});
}catch(e){report.errors.push(e.message);console.error(e);await page.screenshot({path:resolve(out,'decision-display-failure.png')}).catch(()=>{});}
finally{await writeFile(resolve(out,'decision-display-check.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks:report.checks.length,errors:report.errors}));if(report.errors.length)process.exitCode=1;
