import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createBall,launchBall,stepBall,STEP} from '../src/physics.mjs';
import {ACTIONS} from '../src/decision.mjs';

const base='http://127.0.0.1:4317';
const out=resolve('artifacts');await mkdir(out,{recursive:true});
const report={started:new Date().toISOString(),modelFixtures:[],scoreFixtures:[],liveShots:[],errors:[],checks:[]};
const fixtureTargets=[['left low',-2.7,.4,'left_low'],['left high',-2.7,1.85,'left_high'],['centre',0,1.2,'center'],['right low',2.7,.4,'right_low'],['right high',2.7,1.85,'right_high']];
let requestId=0;
for(let repeat=0;repeat<(process.argv.includes('--after-fix')?0:2);repeat++)for(const [name,x,y,expected]of fixtureTargets){
  const ball=createBall();launchBall(ball,x,y,.72);for(let i=0;i<13;i++)stepBall(ball,STEP);
  const input={phase:'flight',requestId:++requestId,shotId:requestId,elapsed:13*STEP,keeperX:0,visibleLean:repeat?'left':'balanced',history:['center'],ballPosition:ball.position,ballVelocity:ball.velocity};
  const start=performance.now();const response=await fetch(base+'/api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const decision=await response.json();
  const row={name,repeat,expected,actual:decision.action,pass:decision.action===expected,status:response.status,latencyMs:decision.latencyMs,roundTripMs:Math.round(performance.now()-start),probabilities:decision.probabilities};report.modelFixtures.push(row);console.log(JSON.stringify({modelFixture:row}));
}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});const page=await context.newPage();
page.on('pageerror',error=>report.errors.push(error.message));
let fixtureCalls=0;
await page.route('**/api/decision',async route=>{fixtureCalls++;const input=route.request().postDataJSON();await route.fulfill({json:{action:'wait',probabilities:Object.fromEntries(Object.keys(ACTIONS).map(x=>[x,x==='wait'?1:0])),confidence:1,latencyMs:0,source:'test-fixture',shotId:input.shotId,requestId:input.requestId}});});
async function load(){await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ELEVEN__?.getState());await page.getByRole('button',{name:'STEP UP'}).click();await page.waitForTimeout(1400);}
async function fire(x,y,{capture=null}={}){
  await page.waitForFunction(()=>window.__ELEVEN__.getState().phase==='ready');await page.waitForTimeout(1300);
  const point=await page.evaluate(([x,y])=>window.__ELEVEN__.project(x,y),[x,y]);await page.mouse.move(point.x,point.y);
  const aim=await page.evaluate(()=>window.__ELEVEN__.getState().aim);
  assert(Math.abs(aim.x-x)<.04&&Math.abs(aim.y-y)<.04,`Aim mapping mismatch: ${JSON.stringify({x,y,point,aim})}`);
  await page.keyboard.down('Space');await page.waitForTimeout(750);await page.keyboard.up('Space');
  await page.waitForFunction(()=>window.__ELEVEN__.getState().phase==='result',null,{timeout:15000});
  if(capture)await page.screenshot({path:resolve(out,capture)});
  return page.evaluate(()=>({state:window.__ELEVEN__.getState(),displayGoals:document.querySelector('#goals').textContent,displaySaves:document.querySelector('#saves').textContent}));
}
let goalCount=0,saveCount=0;
try{
  await load();
  const fixtures=[['clear corner',2.8,1.75,'goal'],['keeper body',0,1.2,'save'],['outside goal',4.4,1.1,'miss'],['right post',3.66,1,'miss'],['above crossbar',0,3.15,'miss']];
  for(const[name,x,y,expected]of fixtures){
    const data=await fire(x,y);const actual=data.state.lastResult.outcome;
    if(expected==='goal')goalCount++;if(expected==='save')saveCount++;
    const pass=actual===expected&&Number(data.displayGoals)===goalCount&&Number(data.displaySaves)===saveCount&&data.state.ball.goal===(expected==='goal');
    const row={name,expected,actual,pass,displayGoals:Number(data.displayGoals),displaySaves:Number(data.displaySaves),ballCrossedGoal:data.state.ball.goal,keeperContact:data.state.ball.touched,postContact:data.state.ball.post};report.scoreFixtures.push(row);console.log(JSON.stringify({scoreFixture:row}));
    assert(pass,`Scoring fixture failed: ${name}`);
    if(name==='clear corner'){
      const calls=fixtureCalls;await page.getByRole('button',{name:'WATCH REPLAY'}).click();await page.waitForTimeout(1800);const replay=await page.evaluate(()=>window.__ELEVEN__.getState());assert.equal(replay.goals,1);assert.equal(replay.saves,0);assert.equal(fixtureCalls,calls);report.checks.push('Replay does not change score or request new model decisions.');await page.getByRole('button',{name:'BACK TO RESULT'}).click();
    }
    if(name!=='above crossbar')await page.getByRole('button',{name:'NEXT PENALTY'}).click();
  }
  await page.getByRole('button',{name:'PLAY AGAIN'}).click();const reset=await page.evaluate(()=>window.__ELEVEN__.getState());assert.equal(reset.round,1);assert.equal(reset.goals,0);assert.equal(reset.saves,0);report.checks.push('Five-shot match and restart reset the counters correctly.');
  await page.unroute('**/api/decision');
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ELEVEN__?.getState());await page.waitForTimeout(900);await page.screenshot({path:resolve(out,'intro.png')});await page.getByRole('button',{name:'STEP UP'}).click();
  for(const[name,x,y]of [['left high',-2.8,1.85],['right low',2.1,.45],['centre',0,1.2],['right high',2.8,1.85],['outside goal',4.4,1.1]]){
    const responses=[];const onResponse=async response=>{if(response.url().endsWith('/api/decision')){try{responses.push({request:response.request().postDataJSON(),answer:await response.json()});}catch{}}};page.on('response',onResponse);
    const data=await fire(x,y,{capture:`live-${name.replaceAll(' ','-')}.png`});page.off('response',onResponse);
    report.liveShots.push({name,...data,responses});console.log(JSON.stringify({liveShot:{name,outcome:data.state.lastResult.outcome,action:data.state.keeperAction,latencyMs:data.state.decision?.latencyMs,ballGoal:data.state.ball.goal,keeperContact:data.state.ball.touched,goals:data.displayGoals,saves:data.displaySaves}}));
    if(name!=='outside goal')await page.getByRole('button',{name:'NEXT PENALTY'}).click();
  }
  await page.getByRole('button',{name:'PLAY AGAIN'}).click();await page.waitForTimeout(1300);await page.screenshot({path:resolve(out,'ready.png')});
  report.checks.push('Live shots were played through mouse aim and keyboard charge/release.');
}catch(error){report.errors.push(error.message);console.error(error);await page.screenshot({path:resolve(out,'test-failure.png')}).catch(()=>{});}
finally{report.finished=new Date().toISOString();await writeFile(resolve(out,process.argv.includes('--after-fix')?'live-check-after-fix.json':'live-check.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({summary:{modelChoices:report.modelFixtures.filter(x=>x.pass).length+'/'+report.modelFixtures.length,scoreFixtures:report.scoreFixtures.filter(x=>x.pass).length+'/'+report.scoreFixtures.length,liveShots:report.liveShots.length,errors:report.errors,checks:report.checks}}));
if(report.errors.length||report.scoreFixtures.some(x=>!x.pass))process.exitCode=1;
