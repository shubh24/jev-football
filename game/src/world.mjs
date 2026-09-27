import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Footballer} from './character.mjs';
import {GOAL, BALL_RADIUS} from './physics.mjs';

let seed=1482;
function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const mat=(color,roughness=.8)=>new THREE.MeshStandardMaterial({color,roughness});
const up=new THREE.Vector3(0,1,0);
function cylinderBetween(a,b,r,material,group,segments=12){
  const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,p.distanceTo(q),segments),material);
  mesh.position.copy(p).lerp(q,.5);mesh.quaternion.setFromUnitVectors(up,q.sub(p).normalize());mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function box(w,h,d,x,y,z,material,group){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.receiveShadow=true;group.add(m);return m;}
function textureCanvas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

export class World {
  constructor(canvas){
    this.canvas=canvas;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x101d20);this.scene.fog=new THREE.FogExp2(0x14221e,.0115);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.22;
    this.camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.05,230);
    this.camera.position.set(7,3.8,21);this.camera.lookAt(-1.7,1.3,2);
    this.cameraTarget=new THREE.Vector3(-1.7,1.3,2);
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.composer.addPass(new OutputPass());
    this.setupLights();this.buildPitch();this.buildStadium();this.buildGoal();this.buildBall();this.buildAtmosphere();
    this.shooter=new Footballer(this.scene,false);this.keeper=new Footballer(this.scene,true);
    this.raycaster=new THREE.Raycaster();this.goalPlane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
    this.time=0;this.netHit=null;this.high=true;this.resize();
  }
  setupLights(){
    this.scene.add(new THREE.HemisphereLight(0xb8d5df,0x293723,2.1));
    const key=new THREE.DirectionalLight(0xffeed3,3.4);key.position.set(-16,24,14);key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-18;key.shadow.camera.right=18;key.shadow.camera.top=20;key.shadow.camera.bottom=-16;key.shadow.camera.near=1;key.shadow.camera.far=75;key.shadow.bias=-.0003;key.shadow.normalBias=.025;key.target.position.set(0,0,6);this.scene.add(key,key.target);this.key=key;
    const rim=new THREE.DirectionalLight(0xc2def5,2.8);rim.position.set(18,16,-9);this.scene.add(rim);
    const fill=new THREE.DirectionalLight(0xd5eec2,.8);fill.position.set(0,10,25);this.scene.add(fill);
  }
  buildPitch(){
    const tex=textureCanvas(2048,2048,(ctx,w,h)=>{
      const img=ctx.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const z=(1-y/h)*100-35;const stripe=(Math.floor((z+35)/6)%2)*7;const noise=(random()-.5)*28;
        const i=(y*w+x)*4;img.data[i]=32+stripe+noise*.6;img.data[i+1]=64+stripe+noise;img.data[i+2]=32+stripe*.6+noise*.4;img.data[i+3]=255;
      }
      ctx.putImageData(img,0,0);
      const px=x=>(x/86+.5)*w,py=z=>(z+35)/100*h;
      ctx.strokeStyle='#dbe1c4';ctx.fillStyle='#dbe1c4';ctx.lineWidth=2.5;
      const line=(x1,z1,x2,z2)=>{ctx.beginPath();ctx.moveTo(px(x1),py(z1));ctx.lineTo(px(x2),py(z2));ctx.stroke();};
      line(-34,0,34,0);line(-34,0,-34,65);line(34,0,34,65);
      for(const [width,depth]of[[20.16,16.5],[9.16,5.5]]){line(-width,0,-width,depth);line(-width,depth,width,depth);line(width,depth,width,0);}
      ctx.beginPath();ctx.ellipse(px(0),py(11),2.7,2.4,0,0,Math.PI*2);ctx.fill();
      const points=[];for(let a=0;a<=Math.PI*2;a+=.01){const x=Math.cos(a)*9.15,z=11+Math.sin(a)*9.15;if(z>=16.5)points.push([px(x),py(z)]);}
      ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
      line(-34,52.5,34,52.5);ctx.beginPath();ctx.ellipse(px(0),py(52.5),9.15/86*w,9.15/100*h,0,0,Math.PI*2);ctx.stroke();
    });tex.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
    const bump=textureCanvas(256,256,(ctx,w,h)=>{const img=ctx.createImageData(w,h);for(let i=0;i<img.data.length;i+=4){const n=70+random()*150;img.data[i]=img.data[i+1]=img.data[i+2]=n;img.data[i+3]=255;}ctx.putImageData(img,0,0);});bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.repeat.set(65,75);bump.colorSpace=THREE.NoColorSpace;
    const grass=new THREE.MeshStandardMaterial({map:tex,bumpMap:bump,bumpScale:.028,roughness:.98});
    const pitch=new THREE.Mesh(new THREE.PlaneGeometry(86,100),grass);pitch.rotation.x=-Math.PI/2;pitch.position.set(0,-.008,15);pitch.receiveShadow=true;this.scene.add(pitch);
    const surround=new THREE.Mesh(new THREE.PlaneGeometry(170,170),mat(0x202823));surround.rotation.x=-Math.PI/2;surround.position.y=-.06;this.scene.add(surround);
    // Individual grass blades add texture close to the camera.
    const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute([-.003,0,0,.003,0,0,.004,.018,0],3));blade.computeVertexNormals();
    const blades=new THREE.InstancedMesh(blade,new THREE.MeshBasicMaterial({color:0xa5b88b,side:THREE.DoubleSide}),26000);
    const matrix=new THREE.Object3D();const color=new THREE.Color();
    for(let i=0;i<26000;i++){matrix.position.set((random()-.5)*29,.002,random()*27-4);matrix.rotation.y=random()*Math.PI;matrix.scale.setScalar(.6+random()*.9);matrix.updateMatrix();blades.setMatrixAt(i,matrix.matrix);color.setHSL(.25+random()*.05,.25+random()*.16,.13+random()*.1);blades.setColorAt(i,color);}
    blades.receiveShadow=false;this.grass=blades;this.scene.add(blades);
    // Fine, pale chalk on the penalty spot.
    const spot=new THREE.Mesh(new THREE.CircleGeometry(.1,32),mat(0xd8ddc1));spot.rotation.x=-Math.PI/2;spot.position.set(0,.007,11);this.scene.add(spot);
  }
  buildStadium(){
    const standMat=mat(0x222b28);const metal=mat(0x52605a,.5);const roofMat=mat(0x141d1c,.68);
    const stands=new THREE.Group();this.scene.add(stands);
    const stand=(width,rows,position,rotation)=>{
      const g=new THREE.Group();g.position.fromArray(position);g.rotation.y=rotation;stands.add(g);
      for(let row=0;row<rows;row++){box(width,.5,1.2,0,.75+row*.51,-row*1.12,standMat,g);}
      box(width,.55,22,0,14.7,-10,roofMat,g);
      const seatsPerRow=Math.floor(width/.65);const count=rows*seatsPerRow;
      const seats=new THREE.InstancedMesh(new THREE.BoxGeometry(.43,.42,.33),mat(0x34433e),count);
      const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(.085,5,4),mat(0x68685c),count);
      const bodies=new THREE.InstancedMesh(new THREE.CylinderGeometry(.1,.14,.32,5),mat(0x465349),count);
      const dummy=new THREE.Object3D();const color=new THREE.Color();let index=0;
      for(let row=0;row<rows;row++)for(let n=0;n<seatsPerRow;n++){
        const x=(n-seatsPerRow/2)*.65;const aisle=n%24<2;
        dummy.position.set(x,1.11+row*.51,-row*1.12-.1);dummy.scale.set(aisle?0:1,1,1);dummy.updateMatrix();seats.setMatrixAt(index,dummy.matrix);
        const occupied=!aisle&&random()>.13;
        dummy.position.set(x+(random()-.5)*.12,1.57+row*.51,-row*1.12+.05);dummy.scale.setScalar(occupied?1:0);dummy.updateMatrix();heads.setMatrixAt(index,dummy.matrix);color.setHSL(.09,.15,.22+random()*.28);heads.setColorAt(index,color);
        dummy.position.y-=.22;dummy.updateMatrix();bodies.setMatrixAt(index,dummy.matrix);color.setHSL(random()>.75?.08:.29,random()*.28,.10+random()*.27);bodies.setColorAt(index,color);index++;
      }
      g.add(seats,heads,bodies);
      for(let x=-width/2;x<=width/2;x+=8){
        cylinderBetween([x,0,-20],[x,15,-20],.14,metal,g);
        cylinderBetween([x,14.4,-20],[x,14.4,1.4],.1,metal,g);
        cylinderBetween([x,14.4,-20],[x,12.2,1.4],.065,metal,g);
        cylinderBetween([x,12.2,1.4],[x,14.4,1.4],.06,metal,g);
        for(let z=-18;z<1;z+=4)cylinderBetween([x,14.4,z],[x,12.2,z+3.7],.035,metal,g,6);
      }
      const stripMat=new THREE.MeshBasicMaterial({color:0xe8e8c8,toneMapped:false});
      box(width,.027,.07,0,12.2,1.4,stripMat,g);
    };
    stand(104,19,[0,0,-16],0);stand(91,19,[-47,0,23],Math.PI/2);stand(91,19,[47,0,23],-Math.PI/2);
    // A dark ribbon board keeps the stadium scale readable.
    const ad=textureCanvas(2048,128,(ctx,w,h)=>{
      ctx.fillStyle='#1c2c26';ctx.fillRect(0,0,w,h);ctx.fillStyle='#c4cdb8';ctx.textBaseline='middle';ctx.font='600 38px Arial';
      for(let x=20;x<w;x+=500){ctx.fillText('E L E V E N',x,h/2);ctx.fillStyle='#ce9a6b';ctx.font='18px Arial';ctx.fillText('MAKE IT COUNT.',x+280,h/2);ctx.fillStyle='#c4cdb8';ctx.font='600 38px Arial';}
      ctx.fillStyle='#78905b';ctx.fillRect(0,h-3,w,3);
    });ad.wrapS=THREE.RepeatWrapping;ad.repeat.x=1.5;
    const adMat=new THREE.MeshStandardMaterial({map:ad,emissiveMap:ad,emissive:0xffffff,emissiveIntensity:.32,roughness:.8});
    const board=new THREE.Mesh(new THREE.PlaneGeometry(90,1.2),adMat);board.position.set(0,.72,-7);this.scene.add(board);
    for(const x of [-39,39]){const b=new THREE.Mesh(new THREE.PlaneGeometry(68,1.2),adMat);b.position.set(x,.72,25);b.rotation.y=x<0?Math.PI/2:-Math.PI/2;this.scene.add(b);}
    // Floodlight rigs, glowing lamp elements, and diffuse halos.
    const halo=textureCanvas(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,246,207,.7)');g.addColorStop(.13,'rgba(235,245,228,.2)');g.addColorStop(1,'rgba(210,230,225,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    const lampMat=new THREE.MeshBasicMaterial({color:new THREE.Color(3.3,3.4,3.1),toneMapped:false});
    for(const x of [-22,-11,0,11,22]){
      const lightBar=new THREE.Group();lightBar.position.set(x,12.5,-13);lightBar.rotation.x=-.28;this.scene.add(lightBar);
      box(3.6,.55,.23,0,0,0,metal,lightBar);
      for(let col=0;col<8;col++)box(.3,.24,.05,(col-3.5)*.41,0,.16,lampMat,lightBar);
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:halo,transparent:true,opacity:.25,depthWrite:false,blending:THREE.AdditiveBlending}));glow.position.set(x,12.5,-12.7);glow.scale.set(7,4,1);this.scene.add(glow);
    }
    for(const [x,z] of [[-27,-10],[27,-10],[-30,24],[30,24]]){
      cylinderBetween([x,0,z],[x,17,z],.18,metal,this.scene);
      const rig=new THREE.Group();rig.position.set(x,17,z);rig.rotation.y=-Math.sign(x)*.4;rig.rotation.x=-.22;this.scene.add(rig);
      box(3.8,1.6,.23,0,0,0,metal,rig);
      for(let col=0;col<5;col++)for(let row=0;row<3;row++)box(.49,.30,.12,(col-2)*.68,(row-1)*.44,.18,lampMat,rig);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:halo,color:0xfff2cf,transparent:true,opacity:.38,depthWrite:false,blending:THREE.AdditiveBlending}));sprite.scale.set(13,13,1);sprite.position.set(x,17,z+.3);this.scene.add(sprite);
    }
    // A small match clock is part of the stadium, not the HUD.
    const clock=textureCanvas(512,192,(ctx,w,h)=>{ctx.fillStyle='#0c1713';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.fillStyle='#a6b891';ctx.font='16px Arial';ctx.fillText('T H E   E L E V E N   G R O U N D',w/2,40);ctx.fillStyle='#e4e8d3';ctx.font='66px monospace';ctx.fillText('90:00',w/2,122);ctx.fillStyle='#9daf8c';ctx.font='14px Arial';ctx.fillText('P E N A L T Y   S H O O T O U T',w/2,162);});
    const clockBoard=new THREE.Mesh(new THREE.PlaneGeometry(8.8,3.3),new THREE.MeshBasicMaterial({map:clock}));clockBoard.position.set(0,10.9,-29);this.scene.add(clockBoard);
  }
  buildGoal(){
    this.goal=new THREE.Group();this.scene.add(this.goal);const white=mat(0xe9ece0,.28);white.metalness=.25;
    for(const x of [-3.66,3.66]){
      cylinderBetween([x,0,0],[x,2.44,0],.06,white,this.goal,24);
      cylinderBetween([x,2.42,.0],[x,2.35,-2.3],.031,white,this.goal);
      cylinderBetween([x,0,-2.3],[x,2.35,-2.3],.028,white,this.goal);
      cylinderBetween([x,.03,0],[x,.03,-2.3],.028,white,this.goal);
    }
    cylinderBetween([-3.66,2.44,0],[3.66,2.44,0],.06,white,this.goal,24);
    cylinderBetween([-3.66,2.35,-2.3],[3.66,2.35,-2.3],.025,white,this.goal);
    const vertices=[];
    const line=(a,b)=>vertices.push(...a,...b);
    const spacing=.14;
    for(let x=-3.66;x<=3.67;x+=spacing){line([x,0,-2.3],[x,2.35,-2.3]);line([x,2.44,0],[x,2.35,-2.3]);}
    for(let y=0;y<=2.35;y+=spacing)line([-3.66,y,-2.3],[3.66,y,-2.3]);
    for(let z=-2.3;z<=0;z+=spacing){const h=2.44+z*.039;line([-3.66,0,z],[-3.66,h,z]);line([3.66,0,z],[3.66,h,z]);line([-3.66,h,z],[3.66,h,z]);}
    for(let y=0;y<=2.35;y+=spacing){line([-3.66,y,0],[-3.66,y,-2.3]);line([3.66,y,0],[3.66,y,-2.3]);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    this.netOriginal=new Float32Array(vertices);this.net=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xc7d2bc,transparent:true,opacity:.38}));this.goal.add(this.net);
  }
  buildBall(){
    this.ball=new THREE.Group();this.scene.add(this.ball);
    const ballMat=mat(0xe8ece0,.52);ballMat.metalness=.02;
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS,40,28),ballMat);sphere.castShadow=true;this.ball.add(sphere);
    const ico=new THREE.IcosahedronGeometry(1,0);const position=ico.getAttribute('position');const unique=[];
    for(let i=0;i<position.count;i++){const p=new THREE.Vector3().fromBufferAttribute(position,i).normalize();if(!unique.some(q=>q.distanceTo(p)<.01))unique.push(p);}
    const patchMat=mat(0x192321,.54);const seamMat=new THREE.LineBasicMaterial({color:0x657064});
    for(const normal of unique){
      const tangent=new THREE.Vector3(0,1,0);if(Math.abs(normal.y)>.9)tangent.set(1,0,0);tangent.cross(normal).normalize();const bitangent=new THREE.Vector3().crossVectors(normal,tangent);
      const points=[];for(let i=0;i<5;i++){const a=i/5*Math.PI*2;points.push(normal.clone().multiplyScalar(.93).addScaledVector(tangent,Math.cos(a)*.34).addScaledVector(bitangent,Math.sin(a)*.34).normalize().multiplyScalar(.111));}
      const vertices=[];
      for(let side=0;side<5;side++){
        const a=normal.clone().multiplyScalar(.111),b=points[side],c=points[(side+1)%5],n=6;
        const point=(i,j)=>a.clone().multiplyScalar(1-(i+j)/n).addScaledVector(b,i/n).addScaledVector(c,j/n).normalize().multiplyScalar(.1114);
        const tri=(a,b,c)=>vertices.push(...a.toArray(),...b.toArray(),...c.toArray());
        for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){
          tri(point(i,j),point(i+1,j),point(i,j+1));
          if(i+j<n-1)tri(point(i+1,j),point(i+1,j+1),point(i,j+1));
        }
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();this.ball.add(new THREE.Mesh(geo,patchMat));
      const edge=[];for(let side=0;side<5;side++)for(let i=0;i<8;i++)edge.push(points[side].clone().lerp(points[(side+1)%5],i/8).normalize().multiplyScalar(.1117));
      this.ball.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edge),seamMat));
    }
    this.ball.position.set(0,.11,11);
    const shadow=textureCanvas(64,64,(ctx,w,h)=>{const g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(0,0,0,.6)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    this.ballShadow=new THREE.Mesh(new THREE.PlaneGeometry(.6,.6),new THREE.MeshBasicMaterial({map:shadow,transparent:true,depthWrite:false}));this.ballShadow.rotation.x=-Math.PI/2;this.ballShadow.position.set(0,.012,11);this.scene.add(this.ballShadow);
    this.trailPositions=[];this.trail=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe7dcc6,transparent:true,opacity:.22,depthWrite:false}));this.scene.add(this.trail);
  }
  buildAtmosphere(){
    const particles=[];for(let i=0;i<150;i++)particles.push((random()-.5)*60,random()*12+1,random()*60-15);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(particles,3));
    this.dust=new THREE.Points(geo,new THREE.PointsMaterial({color:0xdce1c9,size:.027,transparent:true,opacity:.22,depthWrite:false}));this.scene.add(this.dust);
  }
  setQuality(quality){this.high=quality==='high';this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.high?1.5:1));this.grass.visible=this.high;this.renderer.shadowMap.enabled=this.high;this.resize();}
  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.composer.setSize(innerWidth,innerHeight);}
  updateCamera(mode,dt,ballPos,replayTime=0){
    const mobile=innerWidth<700;let position,target,fov;
    if(mode==='intro'){position=mobile?[7,4.8,23]:[7,3.8,21];target=mobile?[0,1.4,1]:[-3,1.0,1];fov=mobile?53:45;}
    else if(mode==='result'){position=[7.5,3.2,16.5];target=[-2,1.05,.5];fov=46;}
    else if(mode==='replay'){position=[-9+Math.sin(replayTime*.3)*1.5,2.0,6];target=[ballPos[0]*.4,Math.max(1,ballPos[1]*.6),ballPos[2]*.7];fov=52;}
    else{position=mobile?[0,2.7,20.5]:[.15,2.3,17];target=[0,1.02,1.5];fov=mobile?57:48;}
    const alpha=1-Math.exp(-dt*3.0);this.camera.position.lerp(new THREE.Vector3(...position),alpha);this.cameraTarget.lerp(new THREE.Vector3(...target),alpha);this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,fov,alpha);this.camera.updateProjectionMatrix();this.camera.lookAt(this.cameraTarget);
  }
  updateBall(position,velocity,dt,trail=true){
    this.ball.position.fromArray(position);const axis=new THREE.Vector3(velocity[2],0,-velocity[0]);if(axis.length()>.05)this.ball.rotateOnWorldAxis(axis.normalize(),new THREE.Vector3(...velocity).length()*dt/BALL_RADIUS*.1);
    this.ballShadow.position.set(position[0],.012,position[2]);const scale=1+Math.max(0,position[1]-.11)*.6;this.ballShadow.scale.setScalar(scale);this.ballShadow.material.opacity=1/(1+position[1]*.7);
    if(trail&&new THREE.Vector3(...velocity).length()>8){this.trailPositions.push(new THREE.Vector3(...position));if(this.trailPositions.length>5)this.trailPositions.shift();}else this.trailPositions=[];
    this.trail.geometry.dispose();this.trail.geometry=new THREE.BufferGeometry().setFromPoints(this.trailPositions);
  }
  pulseNet(position){this.netHit={position,time:this.time};}
  updateNet(){
    const a=this.net.geometry.attributes.position;const o=this.netOriginal;const hit=this.netHit;
    if(!hit)return;
    const elapsed=this.time-hit.time;
    for(let i=0;i<a.count;i++){let z=o[i*3+2];if(z<-2.1){const d=Math.hypot(o[i*3]-hit.position[0],o[i*3+1]-hit.position[1]);z-=Math.sin(elapsed*18-d*3)*Math.exp(-elapsed*2.7)*Math.exp(-d*1.1)*.33;}a.setZ(i,z);}
    a.needsUpdate=true;if(elapsed>3)this.netHit=null;
  }
  aimFromPointer(x,y){this.raycaster.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,-y/innerHeight*2+1),this.camera);const point=new THREE.Vector3();if(this.raycaster.ray.intersectPlane(this.goalPlane,point))return {x:THREE.MathUtils.clamp(point.x,-4.6,4.6),y:THREE.MathUtils.clamp(point.y,.16,3.2)};return null;}
  project(x,y,z=0){const p=new THREE.Vector3(x,y,z).project(this.camera);return {x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight};}
  render(dt){this.time+=dt;this.dust.rotation.y=this.time*.0008;this.updateNet();this.composer.render();}
}
