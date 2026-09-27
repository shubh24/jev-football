export class StadiumAudio {
  constructor(){this.enabled=false;this.ctx=null;}
  init(){
    if(this.ctx)return;
    this.ctx=new (window.AudioContext||window.webkitAudioContext)();
    this.master=this.ctx.createGain();this.master.gain.value=0;this.master.connect(this.ctx.destination);
    const length=this.ctx.sampleRate*4;const buffer=this.ctx.createBuffer(1,length,this.ctx.sampleRate);const data=buffer.getChannelData(0);
    let last=0;for(let i=0;i<length;i++){last=(last+(Math.random()*2-1)*.025)/1.025;data[i]=last*3.2;}
    this.crowd=this.ctx.createBufferSource();this.crowd.buffer=buffer;this.crowd.loop=true;
    const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1100;
    this.crowdGain=this.ctx.createGain();this.crowdGain.gain.value=.15;this.crowd.connect(filter).connect(this.crowdGain).connect(this.master);this.crowd.start();
  }
  async toggle(){this.init();this.enabled=!this.enabled;await this.ctx.resume();this.master.gain.setTargetAtTime(this.enabled?.8:0,this.ctx.currentTime,.15);return this.enabled;}
  tone(frequency,duration,gain,type='sine',endFrequency=frequency){if(!this.enabled)return;const t=this.ctx.currentTime;const osc=this.ctx.createOscillator(),volume=this.ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(endFrequency,t+duration);volume.gain.setValueAtTime(gain,t);volume.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(volume).connect(this.master);osc.start(t);osc.stop(t+duration+.01);}
  kick(){this.tone(125,.15,.7,'sine',38);this.tone(500,.04,.12,'triangle',120);}
  post(){this.tone(830,.5,.22,'triangle',610);this.tone(1220,.3,.12,'sine',1200);}
  save(){this.tone(190,.16,.32,'triangle',60);}
  whistle(){this.tone(2100,.18,.06,'sine',2400);}
  cheer(goal){if(!this.enabled)return;const now=this.ctx.currentTime;this.crowdGain.gain.cancelScheduledValues(now);this.crowdGain.gain.setValueAtTime(.15,now);this.crowdGain.gain.linearRampToValueAtTime(goal?.8:.38,now+.3);this.crowdGain.gain.exponentialRampToValueAtTime(.15,now+3.5);}
}
