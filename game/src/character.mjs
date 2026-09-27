import * as THREE from 'three';

const up = new THREE.Vector3(0,1,0);
const v = p => new THREE.Vector3(...p);
const mix = (a,b,t) => a.map((x,i)=>x+(b[i]-x)*t);
function material(color, extra={}) {return new THREE.MeshStandardMaterial({color,roughness:.87,...extra});}
function labelTexture(text,number,color) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.textAlign='center';
  ctx.font='500 26px Arial';ctx.fillText(text,128,48,240);ctx.font='bold 150px Arial';ctx.fillText(number,128,190);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function fabricTexture(color,stripe) {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle=color;ctx.fillRect(0,0,128,128);
  if(stripe){ctx.fillStyle=stripe;for(let x=0;x<128;x+=32)ctx.fillRect(x,0,16,128);}
  for(let y=0;y<128;y+=2){ctx.fillStyle=y%4?'#00000008':'#ffffff09';ctx.fillRect(0,y,128,1);}
  for(let x=0;x<128;x+=2){ctx.fillStyle='#ffffff05';ctx.fillRect(x,0,1,128);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(stripe?1:3,3);return texture;
}
export class Footballer {
  constructor(scene,keeper=false,kit={}) {
    this.group=new THREE.Group();this.group.name=keeper?'JEV goalkeeper':'Human shooter';scene.add(this.group);this.keeper=keeper;
    const shirt=material(0xffffff,{map:fabricTexture(kit.color||(keeper?'#cb7448':'#e2e6d8'),kit.stripe)});
    const shorts=material(kit.shorts||(keeper?0x273b32:0x14271f));
    const skin=material(keeper?0xa97451:0x9c6545,{roughness:.65});
    const sock=material(kit.socks||(keeper?0xd7aa7c:0xdfe6d0));
    const boot=material(0x131b19,{roughness:.48});
    const glove=material(0xebede1,{roughness:.5});
    this.parts={};
    const mesh=(name,geo,mat)=>{const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;this.group.add(m);this.parts[name]=m;return m;};
    const torsoGeo=new THREE.LatheGeometry([
      new THREE.Vector2(.16,-.22),new THREE.Vector2(.18,-.17),new THREE.Vector2(.195,0),
      new THREE.Vector2(.248,.19),new THREE.Vector2(.22,.25),new THREE.Vector2(.10,.30)
    ],24);
    this.torso=mesh('torso',torsoGeo,shirt);this.torso.scale.z=.64;
    this.pelvis=mesh('pelvis',new THREE.SphereGeometry(1,20,12),shorts);this.pelvis.scale.set(.20,.16,.14);
    this.neck=mesh('neck',new THREE.CylinderGeometry(.067,.072,.12,12),skin);
    this.head=new THREE.Group();this.group.add(this.head);
    const headMesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,20),skin);headMesh.scale.set(.12,.166,.13);headMesh.castShadow=true;this.head.add(headMesh);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(1,24,16,0,Math.PI*2,0,1.5),material(0x211e19));hair.scale.set(.123,.172,.134);hair.position.y=.007;this.head.add(hair);
    for(const sign of [-1,1]) {
      const ear=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),skin);ear.scale.set(.025,.04,.023);ear.position.set(sign*.119,-.004,0);this.head.add(ear);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.012,8,6),material(0x252522));eye.scale.y=.6;eye.position.set(sign*.043,.024,.12);this.head.add(eye);
      const brow=new THREE.Mesh(new THREE.BoxGeometry(.039,.008,.005),material(0x32281e));brow.position.set(sign*.043,.047,.12);this.head.add(brow);
    }
    const nose=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),skin);nose.scale.set(.022,.028,.025);nose.position.set(0,-.01,.128);this.head.add(nose);
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(.041,.006,.007),material(0x684431));mouth.position.set(0,-.065,.113);this.head.add(mouth);
    for(const side of ['L','R']) {
      mesh(`sleeve${side}`,new THREE.CylinderGeometry(.104,.088,1,16),shirt);
      mesh(`upperArm${side}`,new THREE.CylinderGeometry(.079,.064,1,14),skin);
      mesh(`forearm${side}`,new THREE.CylinderGeometry(.065,.046,1,14),skin);
      mesh(`elbow${side}`,new THREE.SphereGeometry(.067,12,10),skin);
      const hand=mesh(`hand${side}`,new THREE.SphereGeometry(1,14,10),keeper?glove:skin);hand.scale.set(keeper?.073:.042,keeper?.107:.075,.041);
      if(keeper) {const cuff=mesh(`cuff${side}`,new THREE.CylinderGeometry(.06,.06,.06,12),material(0x283e30));}
      mesh(`thigh${side}`,new THREE.CylinderGeometry(.119,.095,1,16),shorts);
      mesh(`lowerThigh${side}`,new THREE.CylinderGeometry(.094,.083,1,16),skin);
      mesh(`knee${side}`,new THREE.SphereGeometry(.083,12,10),skin);
      mesh(`shin${side}`,new THREE.CylinderGeometry(.083,.055,1,14),sock);
      const shoe=mesh(`boot${side}`,new THREE.SphereGeometry(1,16,12),boot);shoe.scale.set(.075,.063,.15);
      const stripe=mesh(`bootStripe${side}`,new THREE.BoxGeometry(.145,.013,.02),material(keeper?0xdf9d68:0xd1dca1));
    }
    this.number=new THREE.Mesh(new THREE.PlaneGeometry(.24,.26),new THREE.MeshStandardMaterial({map:labelTexture(kit.name||(keeper?'JEV':'ELEVEN'),kit.number||(keeper?'01':'09'),kit.ink||(keeper?'#eee6ce':'#233d2f')),transparent:true,roughness:.9,depthWrite:false}));
    this.group.add(this.number);
    this.frontBadge=new THREE.Mesh(new THREE.PlaneGeometry(.038,.048),material(keeper?0x273c30:0xc4a077));this.group.add(this.frontBadge);
  }
  link(name,a,b) {const mesh=this.parts[name];const pa=v(a),pb=v(b);mesh.position.copy(pa).lerp(pb,.5);mesh.quaternion.setFromUnitVectors(up,pb.sub(pa).normalize());mesh.scale.y=v(b).distanceTo(v(a));}
  update(pose) {
    this.pose=pose;const j=pose.joints;const front=pose.front;
    const spine=v(j.neck).sub(v(j.hip)).normalize();const rotation=new THREE.Quaternion().setFromUnitVectors(up,spine);
    this.torso.position.copy(v(j.hip)).lerp(v(j.neck),.48);this.torso.quaternion.copy(rotation);
    this.pelvis.position.copy(v(j.hip));this.pelvis.quaternion.copy(rotation);
    this.neck.position.copy(v(j.neck));this.neck.quaternion.copy(rotation);
    this.head.position.copy(v(j.head));this.head.quaternion.copy(rotation);if(front<0)this.head.rotateY(Math.PI);
    for(const side of ['L','R']) {
      const shoulder=j[`shoulder${side}`],elbow=j[`elbow${side}`],hand=j[`hand${side}`],hip=j[`hip${side}`],knee=j[`knee${side}`],ankle=j[`ankle${side}`];
      const sleeveEnd=mix(shoulder,elbow,.48);
      this.link(`sleeve${side}`,shoulder,sleeveEnd);this.link(`upperArm${side}`,sleeveEnd,elbow);this.link(`forearm${side}`,elbow,hand);
      this.parts[`elbow${side}`].position.fromArray(elbow);this.parts[`hand${side}`].position.fromArray(hand);this.parts[`hand${side}`].quaternion.copy(rotation);
      if(this.keeper){this.parts[`cuff${side}`].position.fromArray(mix(elbow,hand,.84));this.parts[`cuff${side}`].quaternion.copy(this.parts[`forearm${side}`].quaternion);}
      this.link(`thigh${side}`,hip,mix(hip,knee,.72));this.link(`lowerThigh${side}`,mix(hip,knee,.70),knee);this.parts[`knee${side}`].position.fromArray(knee);this.link(`shin${side}`,knee,ankle);
      this.parts[`boot${side}`].position.set(ankle[0],Math.max(.065,ankle[1]-.045),ankle[2]+front*.055);this.parts[`boot${side}`].rotation.z=pose.tilt*.4;
      this.parts[`bootStripe${side}`].position.set(ankle[0],Math.max(.09,ankle[1]-.01),ankle[2]+front*.115);
    }
    // The shirt number is on the back; both uniforms face the correct way.
    this.number.position.copy(v(j.hip)).lerp(v(j.neck),.56);this.number.position.z-=front*.151;this.number.quaternion.copy(rotation);if(front>0)this.number.rotateY(Math.PI);
    this.frontBadge.position.copy(v(j.hip)).lerp(v(j.neck),.7);this.frontBadge.position.x-=.1;this.frontBadge.position.z+=front*.155;this.frontBadge.quaternion.copy(rotation);if(front<0)this.frontBadge.rotateY(Math.PI);
  }
}
