import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestSlots} from '../src/request-slots.mjs';
const signal=()=>new AbortController().signal;
test('a replacement waits for an old request to finish without exceeding the active limit',async()=>{
 const slots=new RequestSlots(3),releases=await Promise.all([slots.acquire(signal()),slots.acquire(signal()),slots.acquire(signal())]);let granted=false;
 const next=slots.acquire(signal()).then(release=>{granted=true;return release;});await Promise.resolve();assert.equal(granted,false);assert.equal(slots.active,3);
 releases[0]();const release=await next;assert.equal(slots.active,3);release();releases[1]();releases[2]();assert.equal(slots.active,0);
});
test('cancelled queued requests cannot start after a goal',async()=>{
 const slots=new RequestSlots(1),release=await slots.acquire(signal()),controller=new AbortController();
 const cancelled=slots.acquire(controller.signal);controller.abort();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(slots.waiting.length,0);release();assert.equal(slots.active,0);
});
test('queue capacity is bounded and releasing a slot twice is safe',async()=>{
 const slots=new RequestSlots(1,1),release=await slots.acquire(signal()),next=slots.acquire(signal());await assert.rejects(slots.acquire(signal()),{code:'DECISION_BUSY'});
 release();release();assert.equal(slots.active,1);(await next)();assert.equal(slots.active,0);
});
