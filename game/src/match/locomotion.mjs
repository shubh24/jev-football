// Visual motion follows simulation velocity. It never resets on a model reply.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const blend=(a,b,t)=>a+(b-a)*t;
export function createLocomotion(index=0){return {phase:index*1.731,speed:0,heading:null,lastTime:null};}
function kneeBetween(hip,ankle){
 const dy=ankle[1]-hip[1],dz=ankle[2]-hip[2],d=Math.hypot(dy,dz),half=d*.5;
 const bend=Math.sqrt(Math.max(.002,.445*.445-half*half));
 return [hip[0],(hip[1]+ankle[1])*.5+dz/(d||1)*bend,(hip[2]+ankle[2])*.5-dy/(d||1)*bend];
}
export function runningPose(p,time,motion){
 const dt=motion.lastTime===null?0:clamp(time-motion.lastTime,0,.08);motion.lastTime=time;
 motion.heading??=p.heading||0;const turn=Math.atan2(Math.sin((p.heading||0)-motion.heading),Math.cos((p.heading||0)-motion.heading));motion.heading+=turn*(1-Math.exp(-dt*14));
 const speed=Math.hypot(p.vx,p.vz);motion.speed=blend(motion.speed,speed,1-Math.exp(-dt*14));
 const moving=clamp(motion.speed/.8,0,1),run=clamp((motion.speed-1.7)/4.5,0,1),sprint=clamp((motion.speed-5.5)/3,0,1);
 const cycles=blend(1.15,2.65,clamp(motion.speed/8,0,1));motion.phase+=dt*cycles*Math.PI*2*moving;
 const phase=motion.phase,bob=(1-Math.cos(phase*2))*.5*.046*moving,lean=.035+run*.085+sprint*.04;
 const hip=[Math.sin(phase)*.018*moving,.94-.07*run+bob,0],neck=[hip[0]-.01*Math.sin(phase)*moving,1.52-.07*run+bob,lean];
 const j={hip,neck,head:[neck[0],1.72-.07*run+bob,lean+.012]};
 const shoulderTwist=Math.sin(phase)*.045*moving,hipTwist=-Math.sin(phase)*.025*moving;
 const stride=blend(.16,.53,clamp(motion.speed/8,0,1))*moving;
 const kick=clamp((p.kickUntil-time)/.3,0,1),strike=kick>0?Math.sin((1-kick)*Math.PI):0;
 for(const [side,sign,offset]of [['L',-1,0],['R',1,Math.PI]]){
  const a=phase+offset,swing=Math.sin(a),lift=Math.max(0,Math.cos(a));
  const h=[sign*.125+hip[0],hip[1]-.015,sign*hipTwist];
  const ankle=[sign*blend(.16,.12,run),.10+Math.pow(lift,1.7)*blend(.08,.42,run)*moving,swing*stride];
  if(side==='R'&&kick>0){ankle[2]=blend(ankle[2],.62,strike);ankle[1]=blend(ankle[1],.46,strike);}
  const maxReach=Math.sqrt(Math.max(.01,.885*.885-(ankle[1]-h[1])**2));ankle[2]=clamp(ankle[2],h[2]-maxReach,h[2]+maxReach);
  const knee=kneeBetween(h,ankle);
  j[`hip${side}`]=h;j[`knee${side}`]=knee;j[`ankle${side}`]=ankle;
  const armAngle=-swing*blend(.25,.8,run)*moving,flex=blend(.18,1.55,run);
  const shoulder=[sign*.245+neck[0],1.43-.07*run+bob,lean+sign*shoulderTwist];
  const elbow=[sign*(.28+sprint*.025)+hip[0],shoulder[1]-.28*Math.cos(armAngle),shoulder[2]+.28*Math.sin(armAngle)];
  j[`shoulder${side}`]=shoulder;j[`elbow${side}`]=elbow;
  j[`hand${side}`]=[sign*.265+hip[0],elbow[1]-.25*Math.cos(armAngle+flex),elbow[2]+.25*Math.sin(armAngle+flex)];
 }
 return {joints:j,origin:hip,tilt:0,front:1,footPitch:{L:Math.cos(phase)*.32*moving,R:Math.cos(phase+Math.PI)*.32*moving},motion:{speed:motion.speed,phase,run}};
}
