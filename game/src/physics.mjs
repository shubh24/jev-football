export const BALL_RADIUS = 0.11;
export const GOAL = { halfWidth: 3.66, height: 2.44, depth: 2.3, postRadius: 0.06 };
export const STEP = 1 / 180;
const add = (a,b) => a.map((n,i) => n+b[i]);
const sub = (a,b) => a.map((n,i) => n-b[i]);
const mul = (a,s) => a.map(n => n*s);
const dot = (a,b) => a.reduce((s,n,i) => s+n*b[i],0);
const length = a => Math.sqrt(dot(a,a));
const normalize = a => mul(a,1/(length(a)||1));
const clamp = (x,lo,hi) => Math.min(hi,Math.max(lo,x));
const mix = (a,b,t) => add(a,mul(sub(b,a),t));

export function closestSegments(p1,q1,p2,q2) {
  const d1=sub(q1,p1), d2=sub(q2,p2), r=sub(p1,p2);
  const a=dot(d1,d1), e=dot(d2,d2), f=dot(d2,r);
  let s=0,t=0;
  if(a<=1e-12 && e<=1e-12) return {a:p1,b:p2,s:0,t:0,distance:length(r)};
  if(a<=1e-12) t=clamp(f/e,0,1);
  else {
    const c=dot(d1,r);
    if(e<=1e-12) s=clamp(-c/a,0,1);
    else {
      const b=dot(d1,d2), denom=a*e-b*b;
      if(denom!==0) s=clamp((b*f-c*e)/denom,0,1);
      t=(b*s+f)/e;
      if(t<0) {t=0;s=clamp(-c/a,0,1);}
      else if(t>1) {t=1;s=clamp((b-c)/a,0,1);}
    }
  }
  const pa=mix(p1,q1,s),pb=mix(p2,q2,t);
  return {a:pa,b:pb,s,t,distance:length(sub(pa,pb))};
}
const posts = [
  {a:[-3.66,0,0],b:[-3.66,2.44,0],radius:0.06,type:'post'},
  {a:[3.66,0,0],b:[3.66,2.44,0],radius:0.06,type:'post'},
  {a:[-3.66,2.44,0],b:[3.66,2.44,0],radius:0.06,type:'post'},
];
export function firstContact(start,end,collider,radius) {
  const closest=closestSegments(start,end,collider.a,collider.b);
  if(closest.distance>=radius)return null;
  const axis=sub(collider.b,collider.a),denom=dot(axis,axis);
  const onAxis=p=>add(collider.a,mul(axis,denom?clamp(dot(sub(p,collider.a),axis)/denom,0,1):0));
  let lo=0,hi=closest.s;
  // Find the entry point. The minimum-distance point is too late and gives
  // the wrong surface normal for glancing shots and fast ball movement.
  for(let i=0;i<18;i++){
    const mid=(lo+hi)/2,p=mix(start,end,mid);
    if(length(sub(p,onAxis(p)))<radius)hi=mid;else lo=mid;
  }
  const a=mix(start,end,hi),b=onAxis(a);
  return {a,b,s:hi,distance:length(sub(a,b))};
}
export function createBall() {
  return {position:[0,BALL_RADIUS,11],velocity:[0,0,0],active:false,goal:false,touched:false,post:false,age:0};
}
export function launchBall(ball, targetX, targetY, power) {
  const speed=14+clamp(power,0,1)*16;
  const t=11/speed;
  ball.velocity=[targetX/t,(targetY-BALL_RADIUS+4.905*t*t)/t,-speed];
  ball.active=true;
  return length(ball.velocity);
}
export function stepBall(ball,dt,keeperCapsules=[]) {
  if(!ball.active) return [];
  ball.age+=dt;
  const events=[];
  const previous=[...ball.position];
  ball.velocity[1]-=9.81*dt;
  ball.velocity=mul(ball.velocity,Math.exp(-0.018*dt));
  let next=add(previous,mul(ball.velocity,dt));
  for(const collider of [...posts,...keeperCapsules]) {
    if(ball.goal && collider.type!=='post') continue;
    const radius=BALL_RADIUS+collider.radius;
    const contact=firstContact(previous,next,collider,radius);
    if(contact) {
      let normal=normalize(sub(contact.a,contact.b));
      if(contact.distance<1e-7) normal=normalize(mul(ball.velocity,-1));
      const vn=dot(ball.velocity,normal);
      if(vn<0) {
        const restitution=collider.type==='post' ? 0.73 : 0.48;
        ball.velocity=sub(ball.velocity,mul(normal,(1+restitution)*vn));
        next=add(contact.b,mul(normal,radius+0.003));
        next=add(next,mul(ball.velocity,dt*(1-contact.s)));
        if(collider.type==='post') {ball.post=true; events.push({type:'post',position:[...next]});}
        else {ball.touched=true; events.push({type:'save',position:[...next]});}
        break;
      }
    }
  }
  if(next[1]<BALL_RADIUS) {
    next[1]=BALL_RADIUS;
    if(ball.velocity[1]<-0.4) {ball.velocity[1]*=-0.48; events.push({type:'bounce'});}
    else ball.velocity[1]=0;
    ball.velocity[0]*=Math.exp(-2.2*dt); ball.velocity[2]*=Math.exp(-2.2*dt);
  }
  if(!ball.goal && previous[2]>=-BALL_RADIUS && next[2]<-BALL_RADIUS) {
    const t=(-BALL_RADIUS-previous[2])/(next[2]-previous[2]);
    const cross=mix(previous,next,t);
    if(Math.abs(cross[0])<GOAL.halfWidth-BALL_RADIUS && cross[1]<GOAL.height-BALL_RADIUS) {
      ball.goal=true; events.push({type:'goal',position:cross});
    } else events.push({type:'wide'});
  }
  if(ball.goal) {
    if(next[2]<-GOAL.depth+BALL_RADIUS) {next[2]=-GOAL.depth+BALL_RADIUS;ball.velocity[2]=Math.abs(ball.velocity[2])*.12;ball.velocity[0]*=.4;ball.velocity[1]*=.4;events.push({type:'net',position:[...next]});}
    if(Math.abs(next[0])>GOAL.halfWidth-BALL_RADIUS) {next[0]=Math.sign(next[0])*(GOAL.halfWidth-BALL_RADIUS);ball.velocity[0]*=-.15;}
    if(next[1]>GOAL.height-BALL_RADIUS) {next[1]=GOAL.height-BALL_RADIUS;ball.velocity[1]*=-.15;}
  }
  ball.position=next;
  return events;
}

export function keeperPose(action='wait', elapsed=0, clock=0) {
  const dir=action.startsWith('left')?-1:action.startsWith('right')?1:0;
  const diving=dir!==0;
  const high=action.endsWith('high');
  const progress=clamp(elapsed/.25,0,1);
  const reach=diving?clamp(elapsed/.18,0,1):action==='center'?clamp(elapsed/.2,0,1)*.5:0;
  const x=diving?dir*Math.min(2.15,Math.max(0,elapsed-.025)*(high?4.6:5.2)):Math.sin(clock*2.2)*.07;
  // A low dive lowers the hips while the arms extend. A high dive adds lift.
  // The same joints drive both the visible player and the collision shapes.
  const jump=diving?(high?Math.max(-.42,.64*Math.sin(Math.min(elapsed/.85,1)*Math.PI)-elapsed*.12):-.36*clamp(elapsed/.19,0,1)):0;
  const tilt=diving?-dir*progress*(high?1.48:1.7):Math.sin(clock*2)*.022;
  const origin=[x,.94+jump,.25];
  const local={
    hip:[0,0,0],neck:[0,.59,0],head:[0,.77,.01],
    shoulderL:[-.24,.47,0],shoulderR:[.24,.47,0],
    elbowL:[-.4+reach*.19,.2+reach*.62,.10],elbowR:[.4-reach*.19,.2+reach*.62,.10],
    handL:[-.49+reach*.25,.01+reach*1.18,.22],handR:[.49-reach*.25,.01+reach*1.18,.22],
    hipL:[-.13,-.01,0],hipR:[.13,-.01,0],
    kneeL:[-.2,-.42,.08],kneeR:[.2,-.42,.08],
    ankleL:[-.26,-.85,.01],ankleR:[.26,-.85,.01],
  };
  const joints={};
  for(const [k,p] of Object.entries(local)) joints[k]=[origin[0]+p[0]*Math.cos(tilt)-p[1]*Math.sin(tilt),Math.max(.1,origin[1]+p[0]*Math.sin(tilt)+p[1]*Math.cos(tilt)),origin[2]+p[2]];
  return {joints,origin,tilt,front:1};
}
export function shooterPose(phase='ready',elapsed=0,clock=0,lean=0) {
  const approach=phase==='runup'?clamp(elapsed/.55,0,1):phase==='flight'||phase==='result'?1:0;
  const kick=phase==='flight'||phase==='result'?Math.max(0,1-elapsed/.7):0;
  const x=-.5+approach*.23,z=12.8-approach*1.56;
  const stride=phase==='runup'?Math.sin(approach*Math.PI*3):0;
  const origin=[x,.96+Math.abs(stride)*.04,z];
  const joints={
    hip:[x,.96,z],neck:[x+lean*.09,1.55,z-.07],head:[x+lean*.12,1.74,z-.09],
    shoulderL:[x-.23+lean*.09,1.45,z-.04],shoulderR:[x+.23+lean*.09,1.45,z-.04],
    elbowL:[x-.34,1.15,z+.04+stride*.14],elbowR:[x+.37,1.16,z+.06-stride*.14],
    handL:[x-.38-kick*.25,.97+kick*.25,z-.05+stride*.23],handR:[x+.4+kick*.18,.99+kick*.2,z-.13-stride*.23],
    hipL:[x-.13,.93,z],hipR:[x+.13,.93,z],
    kneeL:[x-.14,.51,z+stride*.15],kneeR:[x+.18,.51+kick*.17,z-stride*.15-kick*.30],
    ankleL:[x-.14,.1,z+stride*.34],ankleR:[x+.20,.10+kick*.55,z-stride*.34-kick*.65],
  };
  joints.neck[1]+=Math.sin(clock*2)*.008;
  return {joints,origin,tilt:0,front:-1};
}
export function poseCapsules(pose) {
  const j=pose.joints;
  return [
    ['hip','neck',.22],['neck','head',.14],
    ['shoulderL','elbowL',.095],['elbowL','handL',.095],['handL','handL',.145],
    ['shoulderR','elbowR',.095],['elbowR','handR',.095],['handR','handR',.145],
    ['hipL','kneeL',.115],['kneeL','ankleL',.085],['hipR','kneeR',.115],['kneeR','ankleR',.085],
  ].map(([a,b,radius])=>({a:j[a],b:j[b],radius,type:'keeper'}));
}
