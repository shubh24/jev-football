import {chromium} from 'playwright';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {createMatch} from '../src/match/engine.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),report={errors:[],requests:[]};let fail=false;
page.on('pageerror',e=>report.errors.push(e.message));
try{
 const state=createMatch();state.time=1;for(const p of state.players)if(p.role!=='GK'){p.x=27;p.z=35;}state.players[9].x=0;state.players[9].z=5;state.players[6].x=0;state.players[6].z=-8;state.ball.x=0;state.ball.z=5;
 await page.addInitScript(s=>window.__HANDOFF__=s,state);const source=await readFile('src/match/game.mjs','utf8');await page.route('**/src/match/game.mjs',r=>r.fulfill({contentType:'text/javascript',body:source.replace('state=createMatch(),','state=window.__HANDOFF__||createMatch(),')}));
 await page.route('**/api/*-decision',async route=>{const input=route.request().postDataJSON(),url=route.request().url(),keeper=url.includes('keeper'),human=url.includes('teammate');report.requests.push({url,selected:input.selected,selectionVersion:input.selectionVersion});
  const players=input.players.filter((p,i)=>keeper?i%11===0:human?i>0&&i<11&&p.id!==input.selected:i>11);
  const decisions=Object.fromEntries(players.map(p=>[p.id,{action:'hold',label:'Hold position',command:{type:keeper?'keeper':'hold',action:'wait',controlVersion:2,requiresBall:input.ball.owner===p.id,duration:.25,label:'Hold position'},probabilities:{hold:1},labels:{hold:'Hold position'},parameters:{}}]));
  await new Promise(r=>setTimeout(r,250));try{if(fail&&human)await route.fulfill({status:503,json:{error:'Test failure'}});else await route.fulfill({json:{decisions,latencyMs:250}});}catch{}
 });
 await page.goto((process.env.JEV_TEST_URL||'http://127.0.0.1:4317')+'/match');await page.waitForFunction(()=>window.__MATCH__);await page.locator('#sound-enabled').evaluate(e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('#start').click();await page.waitForTimeout(60);
 await page.keyboard.down('d');await page.keyboard.down('j');await page.waitForTimeout(260);await page.keyboard.up('j');await page.keyboard.up('d');
 await page.waitForFunction(()=>window.__MATCH__.getState().selected==='h7');await page.waitForTimeout(650);
 let s=await page.evaluate(()=>window.__MATCH__.getState());assert.equal(s.phase,'playing');assert.equal(s.players.find(p=>p.id==='h7').executing.source,'Human');assert(!s.orders.h7);assert(report.requests.some(r=>r.url.includes('teammate')&&r.selected==='h10'));assert(report.requests.some(r=>r.url.includes('teammate')&&r.selected==='h7'));report.handoff=true;
 await page.selectOption('#decision-team','0');await page.locator('[data-player="h7"]').click();assert.match(await page.locator('#decision-inspection').innerText(),/You control this player/);report.humanInspection=true;
 fail=true;await page.waitForFunction(()=>window.__MATCH__.getState().phase==='paused',null,{timeout:4000});const count=report.requests.length;await page.waitForTimeout(400);assert.equal(report.requests.length,count);report.failurePausesAll=true;assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(e.stack);process.exitCode=1;}
finally{await writeFile('artifacts/teammate-handoff-browser.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({handoff:report.handoff,humanInspection:report.humanInspection,failurePausesAll:report.failurePausesAll,errors:report.errors}));
