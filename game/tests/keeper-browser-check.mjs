import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createMatch} from '../src/match/engine.mjs';
import {direction} from '../src/match/strategy.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
let currentPage;
const report={shots:[],errors:[],checks:[]};
try{
 for(const [team,x,height]of [[0,-2.1,.45],[1,2.1,1.85]]){
  const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();currentPage=page;page.on('pageerror',e=>report.errors.push(e.message));
  const s=createMatch();s.time=1;for(const p of s.players)if(p.role!=='GK'){p.x=25;p.z=0;}
  const p=s.players.find(p=>p.team===team&&p.role==='GK'),dir=direction(team),t=.65;
  Object.assign(s.ball,{owner:null,version:s.ball.version+1,x:0,z:p.z+dir*11,y:.11,vx:x/t,vz:-dir*11/t,vy:(height-.11+4.905*t*t)/t,lockUntil:0,lastTouch:1-team});
  // Supply a fixed starting shot in this isolated test page only. The game
  // code, network requests, response handling and movement remain unchanged.
  await context.addInitScript(state=>window.__KEEPER_FIXTURE__=state,s);
  const source=await readFile('src/match/game.mjs','utf8');await page.route('**/src/match/game.mjs',route=>route.fulfill({contentType:'text/javascript',body:source.replace('state=createMatch(),','state=window.__KEEPER_FIXTURE__||createMatch(),')}));
  await page.goto('http://127.0.0.1:4317/match');await page.waitForFunction(()=>window.__MATCH__);await page.selectOption('#camera','end');await page.locator('#camera-zoom').fill('1.3');await page.waitForTimeout(900);
  await page.locator('#keeper-panel').evaluate(el=>el.open=true);await page.selectOption('#keeper-player',p.id);await page.getByRole('button',{name:'START MATCH'}).click();
  await page.waitForFunction(id=>{const s=window.__MATCH__.getState(),p=s.players.find(p=>p.id===id);return p.keeper.committed&&s.time-p.keeper.actionAt>.18;},p.id,{timeout:7000});
  await page.getByRole('button',{name:'Pause',exact:true}).click();const paused=await page.evaluate(()=>window.__MATCH__.getState());
  assert(paused.keeperHistory.length>0);assert(paused.keeperHistory.some(h=>h.source==='JEV'&&h.decisions[p.id].applied));assert.notEqual(paused.selected,'h1');
  await page.locator('#pause-screen').evaluate(el=>el.hidden=true);await page.selectOption('#keeper-sample','0');await page.locator('#keeper-panel').scrollIntoViewIfNeeded();await page.waitForTimeout(100);await page.screenshot({path:resolve(`artifacts/match-keeper-${team===0?'argentina-low':'spain-high'}.png`)});
  const history=paused.keeperHistory.length;await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__MATCH__.getState().keeperHistory.length),history);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForTimeout(950);await page.getByRole('button',{name:'Pause',exact:true}).click();const result=await page.evaluate(()=>window.__MATCH__.getState());
  report.shots.push({team,keeper:p.id,scores:result.scores,events:result.events,history:result.keeperHistory});assert.deepEqual(result.scores,[0,0]);assert(result.events.some(e=>e.text===`${p.id.toUpperCase()} contacts the ball`));
  await context.close();
 }
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4317/match');await page.waitForFunction(()=>window.__MATCH__);await page.selectOption('#mode','practice');let calls=0;page.on('request',r=>{if(r.url().includes('/api/keeper-decision'))calls++;});await page.getByRole('button',{name:'START MATCH'}).click();await page.waitForTimeout(650);assert.equal(calls,0);assert.equal(await page.locator('.player-row').count(),10);await page.close();
 report.checks=['Both live keepers dive and contact the ball.','Keeper choices and probabilities are visible.','Pause stops keeper responses.','Human selection stays outfield.','Practice makes no keeper API calls.','Team panel contains ten outfield players.'];
 assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(e.stack);if(currentPage&&!currentPage.isClosed()){report.failure=await currentPage.evaluate(()=>window.__MATCH__?.getState());await currentPage.screenshot({path:resolve('artifacts/keeper-browser-failure.png')});}process.exitCode=1;}
finally{await writeFile('artifacts/keeper-browser-check.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks:report.checks,shots:report.shots.map(s=>({team:s.team,scores:s.scores,responses:s.history.length})),errors:report.errors}));
