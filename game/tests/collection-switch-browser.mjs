import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const report={switches:[],errors:[],modelCalls:0};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});
page.on('pageerror',e=>report.errors.push(e.message));
page.on('request',r=>{if(/\/api\/.*-decision/.test(r.url()))report.modelCalls++;});
try{
 await page.goto('http://127.0.0.1:4317/match');await page.waitForFunction(()=>window.__MATCH__);
 await page.selectOption('#mode','practice');await page.locator('#start').click();
 report.switches=await page.evaluate(()=>{
  const rows=[];
  for(let i=0;i<4;i++){
   const before=window.__MATCH__.getState();
   const expected=before.players.filter(p=>p.team===0&&p.role!=='GK'&&p.id!==before.selected).sort((a,b)=>Math.hypot(a.x-before.ball.x,a.z-before.ball.z)-Math.hypot(b.x-before.ball.x,b.z-before.ball.z))[0].id;
   for(const type of ['keydown','keyup'])document.body.dispatchEvent(new KeyboardEvent(type,{key:'l',bubbles:true,cancelable:true}));
   rows.push({before:before.selected,after:window.__MATCH__.getState().selected,expected});
  }
  return rows;
 });
 for(const row of report.switches){assert.notEqual(row.before,row.after);assert.equal(row.after,row.expected);}
 report.collection=await page.evaluate(async()=>{
  const {createMatch,updateBall,DT}=await import('/src/match/engine.mjs');const results=[];
  for(const team of [0,1]){
   const s=createMatch();s.time=2;for(const p of s.players){p.x=25;p.z=25;}
   const p=s.players.find(p=>p.team===team&&p.role==='CM');p.x=3;p.z=0;
   Object.assign(s.ball,{owner:null,x:0,y:.11,z:0,vx:0,vy:0,vz:0,lockUntil:0});updateBall(s,DT);results.push({team,expected:p.id,owner:s.ball.owner});
  }
  return results;
 });
 for(const row of report.collection)assert.equal(row.owner,row.expected);
 await page.keyboard.press('Escape');await page.screenshot({path:'artifacts/collection-switch.png'});
 assert.equal(report.modelCalls,0);assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(e.stack);process.exitCode=1;}
finally{await writeFile('artifacts/collection-switch-browser.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
