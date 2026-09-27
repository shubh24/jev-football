import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createMatch} from '../src/match/engine.mjs';
const report={errors:[]},dir=resolve('artifacts/attack-frames');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
const frames=[],writes=[];let cdp;
try{
 const s=createMatch();s.time=1;s.ball.owner='j10';s.ball.x=0;s.ball.z=12;s.players[20].x=0;s.players[20].z=12;for(const p of s.players.filter(p=>p.team===0&&p.role!=='GK'))p.x=p.x<0?-25:25;
 await context.addInitScript(s=>window.__ATTACK_FIXTURE__=s,s);const source=await readFile('src/match/game.mjs','utf8');await page.route('**/src/match/game.mjs',route=>route.fulfill({contentType:'text/javascript',body:source.replace('state=createMatch(),','state=window.__ATTACK_FIXTURE__||createMatch(),')}));
 await page.goto('http://127.0.0.1:4317/match');await page.waitForFunction(()=>window.__MATCH__);await page.waitForTimeout(500);
 cdp=await context.newCDPSession(page);cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});const name=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({name,time:e.metadata.timestamp});writes.push(writeFile(resolve(dir,name),Buffer.from(e.data,'base64')));});await cdp.send('Page.startScreencast',{format:'jpeg',quality:83,maxWidth:1440,maxHeight:960,everyNthFrame:2});
 await page.getByRole('button',{name:'START MATCH'}).click();await page.waitForFunction(()=>window.__MATCH__.getState().decisionHistory.some(h=>Object.values(h.decisions).some(d=>d.action==='drive_goal'&&d.applied)),null,{timeout:10000});
 await page.locator('#inspection').scrollIntoViewIfNeeded();await page.screenshot({path:resolve('artifacts/jev-forward-run.png')});
 await page.waitForFunction(()=>window.__MATCH__.getState().stats[1].shots>0,null,{timeout:20000});await page.waitForTimeout(900);
 await page.getByRole('button',{name:'Pause',exact:true}).click();report.state=await page.evaluate(()=>window.__MATCH__.getState());
 await page.locator('#pause-screen').evaluate(el=>el.hidden=true);
 const shotIndex=report.state.decisionHistory.findIndex(h=>Object.values(h.decisions).some(d=>d.command.type==='shoot'&&d.applied));
 assert(shotIndex>=0);const player=Object.entries(report.state.decisionHistory[shotIndex].decisions).find(([id,d])=>d.command.type==='shoot'&&d.applied)[0];
 await page.locator(`[data-player="${player}"]`).click();await page.selectOption('#decision-sample',String(shotIndex));await page.locator('#inspection').scrollIntoViewIfNeeded();await page.screenshot({path:resolve('artifacts/jev-attacking-shot.png')});
 assert(report.state.decisionHistory.some(h=>Object.values(h.decisions).some(d=>d.action==='run_attack'&&d.applied)));assert.deepEqual(report.errors,[]);await page.waitForTimeout(600);
}catch(e){report.errors.push(e.stack);process.exitCode=1;report.state=await page.evaluate(()=>window.__MATCH__?.getState()).catch(()=>null);await page.screenshot({path:resolve('artifacts/attack-browser-failure.png')});}
finally{if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});await Promise.all(writes);if(frames.length)await writeFile(resolve(dir,'frames.txt'),frames.map((f,i)=>`file '${f.name}'\nduration ${Math.max(.008,(frames[i+1]?.time??f.time+.05)-f.time).toFixed(6)}`).join('\n')+`\nfile '${frames.at(-1).name}'\n`);await writeFile('artifacts/attack-browser-check.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({stats:report.state?.stats,scores:report.state?.scores,responses:report.state?.responses,errors:report.errors}));
