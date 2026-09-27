import {SoundDirector} from './sound-director.mjs';
import {TEAMS,playerName} from './teams.mjs';

const ROOT='/src/match/sounds/';
const POOLS={bed:['2097','2111'],chant:['363','438','522'],goal:['462','3022'],reaction:['2110','459','504'],applause:['362','509','439'],kick:['2112','2108','2099'],bounce:['2077'],whistle:['615'],effort:['2170']};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pick=a=>a[Math.floor(Math.random()*a.length)];
export class MatchAudio{
  constructor(){
    this.director=new SoundDirector();this.buffers=new Map();this.sources=new Set();this.lastPick={};this.cooldowns={};
    this.enabled=true;this.commentary=true;this.volume=.65;this.active=false;this.tension=0;this.nextBed=0;this.nextChant=18;
    this.caption='Crowd and match sounds';this.captionUntil=0;this.played={};this.loaded=0;this.failed=[];this.lastSpeech=-20;this.voicePriority=0;this.voiceUntil=0;
  }
  async unlock(){
    try{
      if(!this.ctx){
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)throw new Error('Audio is not supported');
        this.ctx=new Context();this.master=this.ctx.createGain();this.master.gain.value=this.enabled?this.volume:0;
        const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=12;limiter.ratio.value=6;
        this.master.connect(limiter).connect(this.ctx.destination);
        this.crowd=this.ctx.createGain();this.crowd.gain.value=0;this.crowd.connect(this.master);
        this.loading=this.load();
      }
      await this.ctx.resume();await this.loading;
    }catch(error){this.error=error.message;}
  }
  async load(){
    const queue=[...new Set(Object.values(POOLS).flat())];
    await Promise.all(Array.from({length:4},async()=>{
      while(queue.length){const id=queue.shift();try{
        const response=await fetch(`${ROOT}${id}.mp3`);if(!response.ok)throw new Error('Missing audio');
        const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
        // Match the level of recordings from different sessions, with a peak limit.
        let sum=0,count=0,peak=0;
        for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));if(i%16===0){sum+=data[i]*data[i];count++;}}}
        const scale=Math.min(3,.14/(Math.sqrt(sum/Math.max(1,count))||1),.92/(peak||1));
        for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]*=scale;}
        this.buffers.set(id,buffer);this.loaded++;
      }catch{this.failed.push(id);}}
    }));
  }
  choose(group){
    const available=(POOLS[group]||[]).filter(id=>this.buffers.has(id));
    if(!available.length)return null;
    const alternatives=available.filter(id=>id!==this.lastPick[group]);
    const id=pick(alternatives.length?alternatives:available);this.lastPick[group]=id;return id;
  }
  clip(group,{gain=.4,max=8,pan=0,bed=false,fade=.04,offset=0}={}){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running'||this.sources.size>=14)return null;
    const id=this.choose(group);if(!id)return null;
    const buffer=this.buffers.get(id),duration=Math.min(max,buffer.duration-offset);if(duration<=0)return null;
    const source=this.ctx.createBufferSource(),volume=this.ctx.createGain(),stereo=this.ctx.createStereoPanner(),now=this.ctx.currentTime;
    source.buffer=buffer;stereo.pan.value=clamp(pan,-.7,.7);source.connect(volume).connect(stereo).connect(bed?this.crowd:this.master);
    const edge=Math.min(fade,duration*.2);
    volume.gain.setValueAtTime(0,now);volume.gain.linearRampToValueAtTime(gain,now+edge);volume.gain.setValueAtTime(gain,now+duration-edge);volume.gain.linearRampToValueAtTime(0,now+duration);
    const item={source,volume,bed};this.sources.add(item);source.onended=()=>{this.sources.delete(item);source.disconnect();volume.disconnect();stereo.disconnect();};
    source.start(now,offset,duration);this.played[group]=(this.played[group]||0)+1;return duration;
  }
  metal(){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const now=this.ctx.currentTime;
    for(const hz of [760,1210,1730]){const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.frequency.value=hz;gain.gain.setValueAtTime(.035,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.65);osc.connect(gain).connect(this.master);osc.start();osc.stop(now+.7);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
  }
  say(text,priority=1){
    this.caption=text;this.captionUntil=performance.now()+3500;
    if(!this.enabled||!this.commentary||this.volume===0||!globalThis.speechSynthesis)return;
    const now=this.ctx?.currentTime||0;
    if(priority<4&&(now-this.lastSpeech<4||speechSynthesis.speaking))return;
    // Use installed voices only. Do not make cloud speech requests.
    const voices=speechSynthesis.getVoices().filter(v=>v.localService&&/^en\b/i.test(v.lang));
    const voice=voices.find(v=>/en-GB/i.test(v.lang))||voices[0];if(!voice){this.voiceMissing=true;return;}
    this.voiceMissing=false;speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=priority>=3?1.13:1.04;utterance.volume=this.volume*.8;
    this.lastSpeech=now;this.voicePriority=priority;this.voiceUntil=now+Math.min(5,text.length/14);
    utterance.onend=utterance.onerror=()=>{this.voiceUntil=0;};speechSynthesis.speak(utterance);
  }
  cue(e){
    if(!this.ctx)return;
    if(e.type==='whistle'&&!this.buffers.has('615')){this.pendingWhistle=e;return;}
    const now=this.ctx.currentTime,limits={kick:.09,shot:.12,bounce:.22,tackle:1.3,save:1.5,post:.45,possession:4,danger:8,goal:.5,whistle:.5};
    if(now-(this.cooldowns[e.type]??-100)<(limits[e.type]||0))return;
    this.cooldowns[e.type]=now;const name=e.player?playerName(e.player):'The player',pan=(e.x||0)/60;
    if(e.type==='bounce')this.clip('bounce',{gain:.2*(e.strength||.5),max:.7,pan});
    if(e.type==='shot'){this.clip('kick',{gain:.8,max:1.2,pan});this.say(`${name} shoots!`,3);}
    if(e.type==='tackle'){this.clip('effort',{gain:.13,max:.5,pan});this.react('applause',.22,3);this.say(pick([`${name} wins the ball.`,'A strong tackle.','Good work to win it back.']));}
    if(e.type==='possession'){this.react('applause',.14,2);this.say(`${TEAMS[e.team].name} take possession.`);}
    if(e.type==='danger'){this.react('reaction',.23,3);this.say(pick(['A chance is opening up.','Moving into shooting range.','The defence is under pressure.']),2);}
    if(e.type==='save'){this.clip('bounce',{gain:.35,max:.7,pan});this.react('reaction',.38,4);this.say(`${name} gets a touch!`,3);}
    if(e.type==='post'){this.metal();this.react('reaction',.42,4);this.say('Off the post!',3);}
    if(e.type==='goal'){
      // A goal replaces any small crowd reaction and has speech priority.
      for(const item of this.sources)if(!item.bed)this.fadeStop(item);
      this.clip('goal',{gain:.8,max:12,fade:.12});this.say(`Goal for ${TEAMS[e.team].name}!`,5);
    }
    if(e.type==='whistle'){this.clip('whistle',{gain:.28,max:1.4});this.say(e.break==='finished'?'Full time.':e.break==='halftime'?'Half time.':'The match is under way.',e.break?4:2);}
  }
  react(group,gain,max){
    const now=this.ctx.currentTime;if(now-(this.lastReaction??-10)<2)return;
    this.lastReaction=now;this.clip(group,{gain,max,fade:.15});
  }
  fadeStop(item){const now=this.ctx.currentTime;item.volume.gain.cancelScheduledValues(now);item.volume.gain.setTargetAtTime(0,now,.035);try{item.source.stop(now+.16);}catch{}}
  pause(){
    if(this.ctx){for(const item of this.sources)this.fadeStop(item);this.crowd.gain.setTargetAtTime(0,this.ctx.currentTime,.08);}
    globalThis.speechSynthesis?.cancel();this.nextBed=0;this.active=false;this.voiceUntil=0;
  }
  reset(){this.pause();this.director.reset();this.pendingWhistle=null;this.cooldowns={};this.nextChant=(this.ctx?.currentTime||0)+18;this.lastSpeech=-20;this.lastReaction=-10;this.caption='Crowd and match sounds';}
  setEnabled(enabled){this.enabled=enabled;if(!enabled)this.pause();if(this.ctx)this.master.gain.setTargetAtTime(enabled?this.volume:0,this.ctx.currentTime,.06);if(enabled)this.unlock();}
  setVolume(value){this.volume=clamp(value,0,1);if(this.ctx)this.master.gain.setTargetAtTime(this.enabled?this.volume:0,this.ctx.currentTime,.04);if(value===0)globalThis.speechSynthesis?.cancel();}
  setCommentary(enabled){this.commentary=enabled;if(!enabled)globalThis.speechSynthesis?.cancel();}
  update(state){
    const frame=this.director.update(state);this.tension=frame.tension;
    if(!this.ctx||!this.enabled)return;
    const now=this.ctx.currentTime;
    if(!frame.active&&this.active)this.pause();this.active=frame.active;
    if(frame.active&&this.ctx.state==='running'){
      if(this.pendingWhistle&&this.buffers.has('615')){const cue=this.pendingWhistle;this.pendingWhistle=null;this.cue(cue);}
      if(now>=this.nextBed){const length=this.clip('bed',{bed:true,gain:1,max:28,fade:.8});this.nextBed=now+(length?length-Math.min(.8,length*.2):.5);}
      const duck=now<this.voiceUntil ? .55 : 1;
      this.crowd.gain.setTargetAtTime((.15+.28*frame.tension)*duck,now,1.2);
      if(now>=this.nextChant){this.clip('chant',{gain:.12+frame.tension*.14,max:9,fade:.7});this.nextChant=now+18+Math.random()*12;}
    }
    // A goalkeeper touch can precede a goal in one frame. Announce only the goal.
    const cues=frame.cues.some(e=>e.type==='goal')?frame.cues.filter(e=>e.type==='goal'):frame.cues;
    for(const cue of cues)this.cue(cue);
  }
  getStatus(){return {enabled:this.enabled,commentary:this.commentary,loaded:this.loaded,failed:[...this.failed],context:this.ctx?.state||'locked',active:this.active,tension:this.tension,playing:this.sources.size,played:{...this.played},voiceMissing:Boolean(this.voiceMissing),error:this.error||null};}
}
