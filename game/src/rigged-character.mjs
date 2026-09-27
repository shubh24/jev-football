import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {Footballer} from './character.mjs';
const UP=new THREE.Vector3(0,1,0),v=a=>new THREE.Vector3(...a),lerp=(a,b,t)=>v(a).lerp(v(b),t);
let loaded;
export function loadFootballer(){return loaded??=new GLTFLoader().loadAsync('/assets/players/footballer.glb');}
function jerseyTexture(kit){
 const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle=kit.color||'#e2e6d8';g.fillRect(0,0,256,256);
 if(kit.stripe){g.fillStyle=kit.stripe;for(let i=0;i<256;i+=76)g.fillRect(i,0,34,256);}
 for(let i=0;i<256;i+=3){g.fillStyle=i%2?'#ffffff09':'#00000006';g.fillRect(0,i,256,1);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.channel=2;return t;
}
export class RiggedFootballer extends Footballer{
 constructor(scene,keeper,kit={}){
  super(scene,keeper,kit);this.assetState='loading';this.assetError=null;this.kit=kit;
  this.assetReady=loadFootballer().then(gltf=>this.install(gltf)).catch(e=>{this.assetState='fallback';this.assetError=e.message;console.error('Human player model could not load:',e.message);});
 }
 install(gltf){
  const model=clone(gltf.scene);model.updateMatrixWorld(true);this.bones=new Map();this.rest=new Map();
  model.traverse(o=>{if(o.isBone){this.bones.set(o.name,o);this.rest.set(o.name,{position:o.getWorldPosition(new THREE.Vector3()),rotation:o.getWorldQuaternion(new THREE.Quaternion()),localRotation:o.quaternion.clone()});}});
  const jersey=jerseyTexture(this.kit);
  model.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;
   o.material=o.material.clone();const m=o.material;
   if(m.name==='Jersey'){m.map=jersey;m.color.set(0xffffff);m.normalMap=null;m.roughness=.92;}
   if(m.name==='Shorts'){m.color.set(this.kit.shorts||'#14271f');m.roughness=.9;}
   if(m.name==='Socks')m.color.set(this.kit.socks||'#dfe6d0');
   if(m.name==='Hair'){m.map=null;m.normalMap=null;m.color.set('#21170f');m.roughness=.95;}
   if(m.name==='MI_Hair_1')m.color.set('#24180f');
   if(m.name==='Boots')o.visible=false;
   if(m.name==='Skin'){m.color.set('#e0c2ae');m.roughness=.78;}
  });
  // The old body remains available only if asset loading fails. Keep kit labels and gloves.
  for(const child of this.group.children)child.visible=child===this.number||child===this.frontBadge||['bootL','bootR','bootStripeL','bootStripeR'].some(n=>this.parts[n]===child)||this.keeper&&['handL','handR','cuffL','cuffR'].some(n=>this.parts[n]===child);
  this.model=model;this.group.add(model);this.assetState='ready';if(this.pose)this.update(this.pose);
 }
 update(pose){
  super.update(pose);if(!this.model)return;
  const j=pose.joints,front=pose.front||1;
  for(const side of ['L','R'])this.parts[`boot${side}`].rotation.x=-(pose.footPitch?.[side]||0)*front;
  const spine=v(j.neck).sub(v(j.hip)).normalize(),torso=new THREE.Quaternion().setFromUnitVectors(UP,spine);
  if(front<0)torso.multiply(new THREE.Quaternion().setFromAxisAngle(UP,Math.PI));
  const targets=new Map();const add=(name,position,to=null)=>targets.set(name,{position:position.isVector3?position:v(position),to:to&&(to.isVector3?to:v(to))});
  add('pelvis',j.hip);add('spine_01',lerp(j.hip,j.neck,.19));add('spine_02',lerp(j.hip,j.neck,.39));add('spine_03',lerp(j.hip,j.neck,.62));add('neck_01',j.neck);add('Head',v(j.head).addScaledVector(spine,-.105));
  for(const [suffix,side,sign]of [['l',front>0?'R':'L',front],['r',front>0?'L':'R',-front]]){
   const shoulder=j[`shoulder${side}`],elbow=j[`elbow${side}`],hand=j[`hand${side}`],hip=j[`hip${side}`],knee=j[`knee${side}`],ankle=j[`ankle${side}`];
   add(`clavicle_${suffix}`,lerp(j.hip,j.neck,.8).add(new THREE.Vector3(sign*.04,0,0)),shoulder);
   add(`upperarm_${suffix}`,shoulder,elbow);add(`lowerarm_${suffix}`,elbow,hand);
   add(`hand_${suffix}`,hand,v(hand).add(v(hand).sub(v(elbow)).normalize().multiplyScalar(.1)));
   add(`thigh_${suffix}`,hip,knee);add(`calf_${suffix}`,knee,ankle);
   const pitch=pose.footPitch?.[side]||0,toe=v(ankle).add(new THREE.Vector3(0,-.06+Math.sin(pitch)*.13,front*.16));
   add(`foot_${suffix}`,ankle,toe);add(`ball_${suffix}`,toe);
  }
  this.group.updateWorldMatrix(true,false);const groupRotation=this.group.getWorldQuaternion(new THREE.Quaternion());
  const childFor={pelvis:'spine_01',spine_01:'spine_02',spine_02:'spine_03',spine_03:'neck_01',neck_01:'Head'};
  for(const side of ['l','r'])Object.assign(childFor,{[`clavicle_${side}`]:`upperarm_${side}`,[`upperarm_${side}`]:`lowerarm_${side}`,[`lowerarm_${side}`]:`hand_${side}`,[`hand_${side}`]:`middle_01_${side}`,[`thigh_${side}`]:`calf_${side}`,[`calf_${side}`]:`foot_${side}`,[`foot_${side}`]:`ball_${side}`});
  // Parent-first traversal converts the shared joint pose into each imported bone's coordinates.
  this.model.traverse(bone=>{
   if(!bone.isBone)return;const t=targets.get(bone.name),rest=this.rest.get(bone.name);
   if(t){
    const rot=torso.clone().multiply(rest.rotation),child=this.rest.get(childFor[bone.name]);
    if(t.to&&child){const from=child.position.clone().sub(rest.position).normalize().applyQuaternion(torso),to=t.to.clone().sub(t.position).normalize();rot.premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));}
    const worldPos=t.position.clone().applyMatrix4(this.group.matrixWorld),worldRot=groupRotation.clone().multiply(rot);
    bone.parent.updateWorldMatrix(true,false);bone.position.copy(bone.parent.worldToLocal(worldPos));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldRot));
   }else {bone.quaternion.copy(rest.localRotation);if(/^(index|middle|ring|pinky)_0[123]_/.test(bone.name))bone.rotateX(.7);}
   bone.updateWorldMatrix(false,false);
  });
  this.model.updateMatrixWorld(true);
 }
}
