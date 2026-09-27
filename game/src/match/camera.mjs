import {clamp,distance} from './strategy.mjs';
export function cameraFrame(state,mode='broadcast',zoom=1){
  const b=state.ball,selected=state.players.find(p=>p.id===state.selected),speed=Math.hypot(b.vx,b.vz);
  const include=selected&&distance(selected,b)<22?.12:0;
  let x=b.x+clamp(b.vx*.2,-4,4)+(selected?selected.x-b.x:0)*include;
  let z=b.z+clamp(b.vz*.2,-5,5)+(selected?selected.z-b.z:0)*include;
  if(Math.abs(b.z)>34)z+=(Math.sign(b.z)*52.5-z)*.12;
  x=clamp(x,-29,29);z=clamp(z,-49,49);
  const scale=1/clamp(zoom,.8,1.3),wide=mode==='wide',motion=clamp((speed-12)*.15,0,4);
  if(mode==='end')return {position:[x*.4,(40+motion)*scale,z+43*scale],target:[x,.7,z],fov:49};
  return {position:[x+(wide?61:40)*scale,(wide?44:27+motion)*scale,z],target:[x,.7,z],fov:wide?53:49};
}
export function screenMovement(horizontal,vertical,cameraPosition,cameraTarget){
  const fx=cameraTarget[0]-cameraPosition[0],fz=cameraTarget[2]-cameraPosition[2],length=Math.hypot(fx,fz)||1;
  return {x:horizontal*(-fz/length)-vertical*(fx/length),z:horizontal*(fx/length)-vertical*(fz/length)};
}
