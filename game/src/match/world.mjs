import * as THREE from 'three';
import {World} from '../world.mjs';
import {RiggedFootballer as Footballer} from '../rigged-character.mjs';
import {createLocomotion,runningPose} from './locomotion.mjs';
import {keeperMatchPose} from './engine.mjs';
import {cameraFrame,screenMovement} from './camera.mjs';
import {playerKit} from './teams.mjs';
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.85});
const mesh=(geo,mat,group,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);group.add(m);return m;};
export class MatchWorld extends World{
  constructor(canvas,players){
    super(canvas);this.shooter.group.visible=false;this.keeper.group.visible=false;
    this.scene.fog.density=.0038;this.camera.far=350;this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
    this.avatars=new Map(players.map(p=>{
      const avatar=new Footballer(this.scene,p.role==='GK',playerKit(p));
      avatar.group.name=p.name;avatar.motion=createLocomotion(p.index+p.team*11);
      avatar.group.traverse(o=>{if(o.isMesh)o.castShadow=false;});avatar.torso.castShadow=true;avatar.pelvis.castShadow=true;return [p.id,avatar];
    }));
    this.selectedRing=mesh(new THREE.RingGeometry(.68,.81,40),new THREE.MeshBasicMaterial({color:0xf6c38b,side:THREE.DoubleSide}),this.scene,0,.026,0);this.selectedRing.rotation.x=-Math.PI/2;
    this.ballMarker=mesh(new THREE.RingGeometry(.32,.39,30),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7,side:THREE.DoubleSide}),this.scene,0,.025,0);this.ballMarker.rotation.x=-Math.PI/2;
    this.cameraMode='broadcast';this.cameraZoom=1;this.inspected='j10';
    this.camera.position.set(40,27,0);this.cameraTarget.set(0,.7,0);this.camera.fov=49;this.camera.lookAt(this.cameraTarget);this.camera.updateProjectionMatrix();
    this.groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.intentLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x99d9ed,depthTest:false,transparent:true,opacity:.85}));this.intentLine.renderOrder=10;this.scene.add(this.intentLine);
    this.intentRing=mesh(new THREE.RingGeometry(.58,.68,32),new THREE.MeshBasicMaterial({color:0x99d9ed,side:THREE.DoubleSide,depthTest:false}),this.scene,0,.04,0);this.intentRing.rotation.x=-Math.PI/2;this.intentRing.renderOrder=10;
    this.targetRing=mesh(new THREE.RingGeometry(.23,.32,24),new THREE.MeshBasicMaterial({color:0x99d9ed,side:THREE.DoubleSide,depthTest:false}),this.scene,0,.04,0);this.targetRing.rotation.x=-Math.PI/2;this.targetRing.renderOrder=10;this.resize();
  }
  setupLights(){
    this.scene.add(new THREE.HemisphereLight(0xc9dce5,0x243b22,2.3));
    const key=new THREE.DirectionalLight(0xffefce,3.2);key.position.set(-35,75,32);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-70,right:70,top:80,bottom:-80,near:1,far:180});key.shadow.bias=-.0004;key.shadow.normalBias=.07;this.scene.add(key);this.key=key;
    const fill=new THREE.DirectionalLight(0xc3daeb,1.5);fill.position.set(40,40,-45);this.scene.add(fill);
  }
  buildPitch(){
    const c=document.createElement('canvas');c.width=1024;c.height=1536;const ctx=c.getContext('2d');
    ctx.fillStyle='#214a32';ctx.fillRect(0,0,c.width,c.height);
    for(let i=0;i<20;i++){ctx.fillStyle=i%2?'#2b5839':'#255033';ctx.fillRect(0,i*c.height/20,c.width,c.height/20);}
    const x=n=>(n/80+.5)*c.width,z=n=>(n/120+.5)*c.height;
    ctx.strokeStyle='#d2ddbb';ctx.fillStyle='#d2ddbb';ctx.lineWidth=1.8;
    const line=(x1,z1,x2,z2)=>{ctx.beginPath();ctx.moveTo(x(x1),z(z1));ctx.lineTo(x(x2),z(z2));ctx.stroke();};
    const rect=(a,b,w,h)=>ctx.strokeRect(x(a),z(b),w/80*c.width,h/120*c.height);
    rect(-34,-52.5,68,105);line(-34,0,34,0);
    ctx.beginPath();ctx.ellipse(x(0),z(0),9.15/80*c.width,9.15/120*c.height,0,0,Math.PI*2);ctx.stroke();
    for(const sign of [-1,1]){const base=sign<0?-52.5:36;rect(-20.16,base,40.32,16.5);rect(-9.16,sign<0?-52.5:47,18.32,5.5);ctx.beginPath();ctx.arc(x(0),z(sign*41.5),2.3,0,Math.PI*2);ctx.fill();}
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
    const field=mesh(new THREE.PlaneGeometry(80,120),new THREE.MeshStandardMaterial({map:tex,roughness:1}),this.scene,0,-.008,0);field.rotation.x=-Math.PI/2;field.receiveShadow=true;
    const floor=mesh(new THREE.PlaneGeometry(180,200),material(0x19251e),this.scene,0,-.04,0);floor.rotation.x=-Math.PI/2;
  }
  buildStadium(){
    const concrete=material(0x22312c),seats=material(0x5a6d58),roof=material(0x10231c);
    for(const [px,pz,rotation,width]of [[0,-65,0,94],[0,65,Math.PI,94],[-46,0,Math.PI/2,124],[46,0,-Math.PI/2,124]]){
      const g=new THREE.Group();g.position.set(px,0,pz);g.rotation.y=rotation;this.scene.add(g);
      for(let row=0;row<10;row++)mesh(new THREE.BoxGeometry(width,.65,1.5),concrete,g,0,.7+row*.65,-row*1.4);
      // Hide the roof and its fixtures together when they block the camera.
      const canopy=new THREE.Group();g.add(canopy);
      mesh(new THREE.BoxGeometry(width,.45,18),roof,canopy,0,12,-5);(this.stadiumRoofs??=[]).push({mesh:canopy,x:px,z:pz});
      const count=Math.floor(width/.72)*10,crowd=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.15,.32,2,5),seats,count),dummy=new THREE.Object3D(),color=new THREE.Color();
      for(let i=0;i<count;i++){const row=Math.floor(i/Math.floor(width/.72)),col=i%Math.floor(width/.72);dummy.position.set(col*.72-width/2,1.3+row*.65,-row*1.4);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);color.setHSL((i*17%100)/100,.16,.16+(i%7)*.025);crowd.setColorAt(i,color);}g.add(crowd);
      const ad=mesh(new THREE.BoxGeometry(width,1,.15),material(0x406347),g,0,.6,4);ad.material.emissive=new THREE.Color(0x17321e);ad.material.emissiveIntensity=.2;
      for(let px=-width/2;px<=width/2;px+=14){mesh(new THREE.CylinderGeometry(.1,.15,12,6),concrete,canopy,px,6,-12);mesh(new THREE.BoxGeometry(3,.35,.5),new THREE.MeshBasicMaterial({color:0xffedc0}),canopy,px,11.8,1);}
    }
  }
  buildGoal(){super.buildGoal();this.goal.position.z=-52.5;const other=this.goal.clone();other.rotation.y=Math.PI;other.position.z=52.5;this.scene.add(other);}
  updateMatch(state,dt){
    for(const p of state.players){
      const avatar=this.avatars.get(p.id);
      if(p.role==='GK'){
        avatar.group.position.set(0,0,0);avatar.group.rotation.y=0;avatar.update(keeperMatchPose(p,state.time));
      }else{
        const pose=runningPose(p,state.time,avatar.motion);
        avatar.group.position.set(p.x,0,p.z);avatar.group.rotation.y=avatar.motion.heading;avatar.update(pose);
      }
    }
    const selected=state.players.find(p=>p.id===state.selected);this.selectedRing.position.set(selected.x,.026,selected.z);
    const b=state.ball;this.updateBall([b.x,b.y,b.z],[b.vx,b.vy,b.vz],dt,true);this.ballMarker.position.set(b.x,.028,b.z);
    const frame=cameraFrame(state,this.cameraMode,this.cameraZoom),alpha=1-Math.exp(-dt*4.5);
    this.camera.position.lerp(new THREE.Vector3(...frame.position),alpha);this.cameraTarget.lerp(new THREE.Vector3(...frame.target),alpha);this.camera.fov+= (frame.fov-this.camera.fov)*alpha;this.camera.updateProjectionMatrix();this.camera.lookAt(this.cameraTarget);
    for(const roof of this.stadiumRoofs||[]){const c=this.camera.position;roof.mesh.visible=!((roof.x>0&&c.x>34)||(roof.x<0&&c.x< -34)||(roof.z>0&&c.z>52.5)||(roof.z<0&&c.z< -52.5));}
    const viewed=state.players.find(p=>p.id===this.inspected),order=viewed?.executing;
    this.intentRing.visible=Boolean(viewed);if(viewed){const root=viewed.role==='GK'?keeperMatchPose(viewed,state.time).origin:[viewed.x,0,viewed.z];this.intentRing.position.set(root[0],.04,root[2]);}
    const show=Boolean(viewed&&order?.source==='JEV'&&Number.isFinite(order.x)&&Number.isFinite(order.z)&&order.expires>state.time);
    this.intentLine.visible=this.targetRing.visible=show;
    if(show){this.intentLine.geometry.dispose();this.intentLine.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(viewed.x,.06,viewed.z),new THREE.Vector3(order.x,.06,order.z)]);this.targetRing.position.set(order.x,.04,order.z);}
    this.render(dt);
  }
  resize(){super.resize();if(this.cameraMode){const panel=innerWidth>700?(document.querySelector('.team-panel')?.getBoundingClientRect().width||0):0;this.camera.setViewOffset(innerWidth,innerHeight,panel*.5,0,innerWidth,innerHeight);}}
  movement(horizontal,vertical){return screenMovement(horizontal,vertical,this.camera.position.toArray(),this.cameraTarget.toArray());}
  pointer(x,y){this.raycaster.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,-y/innerHeight*2+1),this.camera);const point=new THREE.Vector3();return this.raycaster.ray.intersectPlane(this.groundPlane,point)?{x:point.x,z:point.z}:null;}
}
