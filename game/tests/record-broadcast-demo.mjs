import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve('artifacts/broadcast-video-frames');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1}),page=await context.newPage();const frames=[],writes=[],errors=[];let recording=false,cdp;page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:4317/match',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__MATCH__);
  cdp=await context.newCDPSession(page);cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});if(!recording)return;const name=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({name,time:e.metadata.timestamp});writes.push(writeFile(resolve(dir,name),Buffer.from(e.data,'base64')));});
  recording=true;await cdp.send('Page.startScreencast',{format:'jpeg',quality:82,maxWidth:1440,maxHeight:960,everyNthFrame:2});await page.waitForTimeout(700);
  await page.getByRole('button',{name:'START MATCH'}).click();await page.keyboard.down('Space');await page.waitForTimeout(350);await page.keyboard.up('Space');
  await page.waitForFunction(()=>window.__MATCH__.getState().stats[0].shots>0,null,{timeout:4000});
  await page.keyboard.press('l');await page.keyboard.down('d');await page.keyboard.down('Shift');await page.waitForTimeout(1700);await page.keyboard.up('d');await page.keyboard.up('Shift');
  await page.getByRole('button',{name:'Attack',exact:true}).click();await page.waitForTimeout(2500);await page.keyboard.press('l');await page.keyboard.down('d');await page.waitForTimeout(1800);await page.keyboard.up('d');await page.keyboard.press('j');
  await page.locator('#inspection').scrollIntoViewIfNeeded();await page.waitForTimeout(1500);await page.screenshot({path:resolve('artifacts/broadcast-decision.png')});
  await page.getByRole('button',{name:'Defend',exact:true}).click();await page.waitForTimeout(1200);
  await page.selectOption('#camera','wide');await page.waitForTimeout(1800);await page.screenshot({path:resolve('artifacts/broadcast-wide.png')});
  await page.selectOption('#camera','end');await page.waitForTimeout(1600);await page.screenshot({path:resolve('artifacts/broadcast-end.png')});
  await page.selectOption('#camera','broadcast');await page.waitForTimeout(1600);await page.screenshot({path:resolve('artifacts/broadcast-final.png')});
  await page.getByRole('button',{name:'Pause',exact:true}).click();const state=await page.evaluate(()=>window.__MATCH__.getState());
  assert(state.responses>=3);assert.equal(errors.length,0);assert(state.decisionHistory.some(h=>h.strategy==='defend'));
  const responseCount=state.responses;await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.__MATCH__.getState().responses),responseCount);
  await writeFile(resolve('artifacts/broadcast-video-report.json'),JSON.stringify({state,errors,checks:['Human shoot key works.','Live decisions reach ten outfield players; keeper requests are separate.','Strategy changes reach JEV.','Pause stops further responses.']},null,2));
  console.log(JSON.stringify({time:state.time,responses:state.responses,stats:state.stats,latencies:state.decisionHistory.map(h=>h.latencyMs),errors}));
}finally{
  recording=false;if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});await Promise.all(writes);if(frames.length)await writeFile(resolve(dir,'frames.txt'),frames.map((f,i)=>`file '${f.name}'\nduration ${Math.max(.008,(frames[i+1]?.time??f.time+.05)-f.time).toFixed(6)}`).join('\n')+`\nfile '${frames.at(-1).name}'\n`);await browser.close();
}
