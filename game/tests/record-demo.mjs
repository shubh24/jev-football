import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve('artifacts/video-frames');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:854},deviceScaleFactor:1});
const page=await context.newPage();const records=[];const writes=[];let recording=true;
try {
  await page.goto('http://127.0.0.1:4317',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ELEVEN__);await page.waitForTimeout(1000);
  const cdp=await context.newCDPSession(page);
  cdp.on('Page.screencastFrame',event=>{
    cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
    if(!recording)return;
    const name=`frame-${String(records.length).padStart(5,'0')}.jpg`;
    records.push({name,time:event.metadata.timestamp});writes.push(writeFile(resolve(dir,name),Buffer.from(event.data,'base64')));
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:83,maxWidth:1280,maxHeight:854,everyNthFrame:2});
  await page.waitForTimeout(1400);await page.getByRole('button',{name:'STEP UP'}).click();await page.waitForTimeout(1700);
  async function shoot(x,y){
    const aim=await page.evaluate(([x,y])=>window.__ELEVEN__.project(x,y),[x,y]);await page.mouse.move(aim.x,aim.y);await page.waitForTimeout(250);
    await page.keyboard.down('Space');await page.waitForTimeout(800);await page.keyboard.up('Space');await page.waitForFunction(()=>window.__ELEVEN__.getState().phase==='result',null,{timeout:15000});
    console.log(JSON.stringify(await page.evaluate(()=>({result:window.__ELEVEN__.getState().lastResult,decision:window.__ELEVEN__.getState().decision}))));
  }
  await shoot(-1.8,.45);await page.screenshot({path:resolve('artifacts/video-low-result.png')});await page.waitForTimeout(1200);
  await page.getByRole('button',{name:'WATCH REPLAY'}).click();await page.waitForTimeout(1100);await page.screenshot({path:resolve('artifacts/low-dive.png')});await page.waitForTimeout(2300);await page.getByRole('button',{name:'BACK TO RESULT'}).click();await page.waitForTimeout(400);
  await page.getByRole('button',{name:'NEXT PENALTY'}).click();await page.waitForTimeout(1700);await shoot(1.8,1.85);await page.screenshot({path:resolve('artifacts/video-high-result.png')});await page.waitForTimeout(1000);
  await page.getByRole('button',{name:'WATCH REPLAY'}).click();await page.waitForTimeout(1100);await page.screenshot({path:resolve('artifacts/high-dive.png')});await page.waitForTimeout(2500);
  recording=false;await cdp.send('Page.stopScreencast');await Promise.all(writes);
  const list=records.map((frame,i)=>`file '${frame.name}'\nduration ${Math.max(.008,(records[i+1]?.time??frame.time+.05)-frame.time).toFixed(6)}`).join('\n')+`\nfile '${records.at(-1).name}'\n`;
  await writeFile(resolve(dir,'frames.txt'),list);console.log(JSON.stringify({frames:records.length,duration:records.at(-1).time-records[0].time}));
}finally{await browser.close();}
