import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createBall,launchBall,stepBall,STEP} from '../src/physics.mjs';

const base='http://127.0.0.1:4317',dir=resolve('artifacts/footwork-frames');
await mkdir(dir,{recursive:true});
const report={date:new Date().toISOString(),fixtures:[],shots:[],errors:[]};
let id=0;
for(const [x,keeperX,expected]of [[-.45,0,'step_left_25'],[.45,0,'step_right_25'],[-.75,0,'step_left_50'],[.75,0,'step_right_50'],[.8,1.2,'step_left_25'],[-.8,-1.2,'step_right_25']]){
  const ball=createBall();launchBall(ball,x,1.2,.6);for(let i=0;i<13;i++)stepBall(ball,STEP);
  const input={requestId:++id,shotId:id,phase:'flight',elapsed:ball.age,keeperX,keeperTargetX:keeperX,keeperMoving:false,visibleLean:'balanced',ballPosition:ball.position,ballVelocity:ball.velocity};
  const response=await fetch(base+'/api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const answer=await response.json();const row={x,keeperX,expected,actual:answer.action,pass:response.ok&&answer.action===expected,latencyMs:answer.latencyMs};report.fixtures.push(row);console.log(JSON.stringify({fixture:row}));
}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:854},deviceScaleFactor:1});
const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
const frames=[],writes=[];let recording=false,cdp;
try{
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ELEVEN__);
  cdp=await context.newCDPSession(page);
  cdp.on('Page.screencastFrame',event=>{
    cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});if(!recording)return;
    const name=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({name,time:event.metadata.timestamp});writes.push(writeFile(resolve(dir,name),Buffer.from(event.data,'base64')));
  });
  recording=true;await cdp.send('Page.startScreencast',{format:'jpeg',quality:83,maxWidth:1280,maxHeight:854,everyNthFrame:2});
  await page.getByRole('button',{name:'STEP UP'}).click();
  let goals=0,saves=0;
  for(const [name,x]of [['right',.7],['left',-.7]]){
    await page.waitForTimeout(1500);
    const point=await page.evaluate(x=>window.__ELEVEN__.project(x,1.2),x);await page.mouse.move(point.x,point.y);
    await page.keyboard.down('Space');await page.waitForTimeout(750);await page.keyboard.up('Space');
    await page.waitForFunction(()=>window.__ELEVEN__.getState().phase==='result',null,{timeout:15000});
    const state=await page.evaluate(()=>window.__ELEVEN__.getState());
    if(state.lastResult.outcome==='goal')goals++;if(state.lastResult.outcome==='save')saves++;
    assert.equal(state.goals,goals);assert.equal(state.saves,saves);assert.equal(state.ball.goal,state.lastResult.outcome==='goal');
    report.shots.push({name,state});console.log(JSON.stringify({shot:name,outcome:state.lastResult.outcome,keeper:state.keeper,decisions:state.decisionHistory}));
    await page.screenshot({path:resolve(`artifacts/footwork-${name}-result.png`)});
    await page.waitForTimeout(800);await page.getByRole('button',{name:'WATCH REPLAY'}).click();await page.waitForTimeout(1050);
    await page.screenshot({path:resolve(`artifacts/footwork-${name}.png`)});await page.waitForTimeout(2300);
    const replay=await page.evaluate(()=>window.__ELEVEN__.getState());assert.equal(replay.goals,goals);assert.equal(replay.saves,saves);assert.equal(replay.requests,state.requests);
    await page.getByRole('button',{name:'BACK TO RESULT'}).click();
    if(name==='right'){await page.getByRole('button',{name:'NEXT PENALTY'}).click();assert.equal(await page.evaluate(()=>window.__ELEVEN__.getState().keeper.x),0);}
  }
}catch(error){report.errors.push(error.message);console.error(error);}
finally{
  recording=false;if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});await Promise.all(writes);
  if(frames.length)await writeFile(resolve(dir,'frames.txt'),frames.map((f,i)=>`file '${f.name}'\nduration ${Math.max(.008,(frames[i+1]?.time??f.time+.05)-f.time).toFixed(6)}`).join('\n')+`\nfile '${frames.at(-1).name}'\n`);
  await writeFile(resolve('artifacts/footwork-check.json'),JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify({summary:{fixtures:report.fixtures.filter(f=>f.pass).length+'/'+report.fixtures.length,shots:report.shots.length,errors:report.errors}}));
if(report.errors.length||report.fixtures.some(f=>!f.pass))process.exitCode=1;
