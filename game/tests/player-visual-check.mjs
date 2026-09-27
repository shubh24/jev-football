import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),report={errors:[],failed:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.failed.push({url:r.url(),status:r.status()});});
let cdp;const frames=[],writes=[],dir=resolve('artifacts/player-motion-frames');await mkdir(dir,{recursive:true});
try{
 await page.goto('http://127.0.0.1:4317/tests/player-preview.html');await page.waitForFunction(()=>window.__PREVIEW__?.ready,null,{timeout:20000});
 assert.equal(await page.evaluate(()=>window.__PREVIEW__.ready),'ready');await page.waitForTimeout(600);
 await page.screenshot({path:'artifacts/player-model-comparison.png'});
 cdp=await context.newCDPSession(page);cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});const name=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({name,time:e.metadata.timestamp});writes.push(writeFile(resolve(dir,name),Buffer.from(e.data,'base64')));});
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:88,maxWidth:1440,maxHeight:1000,everyNthFrame:2});await page.waitForTimeout(4000);await cdp.send('Page.stopScreencast');cdp=null;
 report.preview=await page.evaluate(()=>({asset:window.__PREVIEW__.ready,drawCalls:window.__PREVIEW__.renderer.info.render.calls}));
 const source=await readFile('src/match/game.mjs','utf8');await page.route('**/src/match/game.mjs',route=>route.fulfill({contentType:'text/javascript',body:source.replace('window.__MATCH__=', 'window.__VISUAL_WORLD__=world;window.__MATCH__=')}));
 await page.goto('http://127.0.0.1:4317/match');await page.waitForFunction(()=>window.__VISUAL_WORLD__?.avatars&&[...window.__VISUAL_WORLD__.avatars.values()].every(a=>a.assetState==='ready'),null,{timeout:20000});
 await page.selectOption('#mode','practice');await page.locator('#sound-enabled').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('#start').click();
 report.match=await page.evaluate(async()=>{const times=[];let last=performance.now();await new Promise(resolve=>{function frame(now){times.push(now-last);last=now;if(times.length<120)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});const w=window.__VISUAL_WORLD__;return {players:w.avatars.size,ready:[...w.avatars.values()].filter(a=>a.assetState==='ready').length,framesPerSecond:1000/(times.reduce((a,b)=>a+b,0)/times.length)};});
 await page.screenshot({path:'artifacts/human-players-match.png'});
 await page.locator('#pause').click();await page.locator('#pause-screen').evaluate(el=>el.hidden=true);
 for(const mode of ['broadcast','wide','end']){await page.selectOption('#camera',mode);await page.waitForTimeout(400);await page.screenshot({path:`artifacts/human-players-${mode}.png`});}
 // Render each keeper pose and check the bone endpoints against the shared collision pose.
 report.keepers=await page.evaluate(async()=>{const {keeperMatchPose}=await import('/src/match/engine.mjs'),{createKeeper,applyKeeperAction}=await import('/src/keeper-control.mjs');const w=window.__VISUAL_WORLD__,s=window.__MATCH__.getState(),rows=[];for(const id of ['h1','j1'])for(const action of ['left_low','right_high']){const p=s.players.find(p=>p.id===id);p.keeper=createKeeper();p.keeper.x=p.x;applyKeeperAction(p.keeper,action,0);const pose=keeperMatchPose(p,.2),a=w.avatars.get(id);a.update(pose);a.group.updateMatrixWorld(true);let maxError=0;for(const [suffix,side]of [['l',pose.front>0?'R':'L'],['r',pose.front>0?'L':'R']]){const pos=a.bones.get(`hand_${suffix}`).getWorldPosition(a.parts.handL.position.clone()),j=pose.joints[`hand${side}`];maxError=Math.max(maxError,Math.hypot(pos.x-j[0],pos.y-j[1],pos.z-j[2]));}rows.push({id,action,maxError});}return rows;});
 assert(report.keepers.every(k=>k.maxError<.001));assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);
}catch(e){report.errors.push(e.stack);process.exitCode=1;await page.screenshot({path:'artifacts/player-check-failure.png'}).catch(()=>{});}
finally{if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});await Promise.all(writes);if(frames.length)await writeFile(resolve(dir,'frames.txt'),frames.map((f,i)=>`file '${f.name}'\nduration ${Math.max(.008,(frames[i+1]?.time??f.time+.05)-f.time).toFixed(6)}`).join('\n')+`\nfile '${frames.at(-1).name}'\n`);await writeFile('artifacts/player-visual-check.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
