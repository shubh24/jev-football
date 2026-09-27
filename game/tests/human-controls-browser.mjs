import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const report={checks:[],errors:[],apiCalls:0};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/team-decision'))report.apiCalls++;});
try{
 for(const camera of ['broadcast','wide','end'])for(const action of ['pass','shoot']){
  await page.goto('http://127.0.0.1:4317/match');await page.waitForFunction(()=>window.__MATCH__);
  await page.selectOption('#mode','practice');await page.selectOption('#camera',camera);await page.waitForTimeout(850);
  await page.getByRole('button',{name:'START MATCH'}).click();
  // Use the actual keyboard handlers and capture ball velocity before the next physics step.
  const check=await page.evaluate(async ({camera,action})=>{
   const {screenMovement}=await import('/src/match/camera.mjs');
   const event=(type,key)=>document.body.dispatchEvent(new KeyboardEvent(type,{key,bubbles:true,cancelable:true}));
   if(action==='shoot'){event('keydown','w');event('keydown',' ');event('keyup','w');}
   const pressed=action==='pass'?['a','s']:['a'];for(const key of pressed)event('keydown',key);
   const before=window.__MATCH__.getState(),d=screenMovement(-1,action==='pass'?1:0,before.camera.position,before.camera.target);
   if(action==='pass'){event('keydown','j');event('keyup','j');}else event('keyup',' ');
   const after=window.__MATCH__.getState();for(const key of pressed)event('keyup',key);
   const dot=(d.x*after.ball.vx+d.z*after.ball.vz)/(Math.hypot(d.x,d.z)*Math.hypot(after.ball.vx,after.ball.vz));
   return {camera,action,dot,selected:after.selected,receiver:after.ball.receiver,stats:after.stats[0],ball:after.ball};
  },{camera,action});
  assert(check.dot>(action==='pass'?.89:.999),JSON.stringify(check));assert.equal(check.stats[action==='pass'?'passes':'shots'],1);
  if(check.receiver)assert.equal(check.selected,check.receiver);
  report.checks.push(check);await page.waitForTimeout(140);
  if(camera==='broadcast')await page.screenshot({path:resolve(`artifacts/keyboard-${action}.png`)});
 }
 // Verify a pass switches selection before receipt, then keeps the new owner selected.
 await page.goto('http://127.0.0.1:4317/match');await page.waitForFunction(()=>window.__MATCH__);await page.selectOption('#mode','practice');await page.getByRole('button',{name:'START MATCH'}).click();
 await page.keyboard.down('w');await page.keyboard.press('j');await page.keyboard.up('w');
 const flight=await page.evaluate(()=>window.__MATCH__.getState());assert(flight.ball.receiver);assert.equal(flight.selected,flight.ball.receiver);assert.equal(flight.ball.owner,null);
 await page.waitForFunction(()=>{const s=window.__MATCH__.getState();return s.ball.owner?.startsWith('h')&&s.ball.owner===s.selected;},null,{timeout:6000});
 report.checks.push({action:'automatic switch before and after receipt',receiver:flight.ball.receiver});await page.screenshot({path:resolve('artifacts/automatic-receiver.png')});
 assert.equal(report.apiCalls,0);assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(e.stack);process.exitCode=1;await page.screenshot({path:resolve('artifacts/human-controls-failure.png')}).catch(()=>{});}
finally{await writeFile('artifacts/human-controls-browser.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
