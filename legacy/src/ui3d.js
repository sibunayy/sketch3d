/* ---------- 3D preview: one blended mesh built from the signed-distance fields ---------- */
/* Low-power mode is the default (school Chromebooks): no antialiasing, 1x pixels, coarser mesh, throttled rebuilds. */
const LOWPERF=(()=>{try{return localStorage.getItem('sketch3d.perf')!=='high'}catch(e){return true}})();
const host=$('#s3d');let R=null,floor=null,az=.55,el=.2,dist=200;const tgt=new THREE.Vector3();
try{R=new THREE.WebGLRenderer({antialias:!LOWPERF,alpha:true,precision:LOWPERF?'mediump':'highp',stencil:false,powerPreference:LOWPERF?'low-power':'default'});R.setPixelRatio(LOWPERF?1:Math.min(window.devicePixelRatio||1,2));host.appendChild(R.domElement)}
catch(e){R=null;host.innerHTML='<div class="nogl">The 3D preview needs WebGL, which is turned off in this browser. Sketching and export still work.</div>'}
const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(35,1,1,4000);
const hl=new THREE.HemisphereLight(0xffffff,0x8a97a6,.95);scene.add(hl);
const kl=new THREE.DirectionalLight(0xffffff,.85);kl.position.set(120,200,260);scene.add(kl);
const fl=new THREE.DirectionalLight(0xffffff,.3);fl.position.set(-200,60,-120);scene.add(fl);
/* ---- scene: lighting + environment (classroom with window light by default) ---- */
const LIGHTS={
 clay:{n:'Clay studio',d:'High contrast, so every bump and edge is easy to see',sky:0xffffff,gnd:0xb8ae9c,hi:.9,key:0xffffff,ki:.8,fill:0xdbe8ff,fi:.35,ang:-35,mc:true},
 window:{n:'Window light',d:'Soft daylight from a classroom window',sky:0xfff7e8,gnd:0xb8ae9c,hi:.85,key:0xfff0d8,ki:.95,fill:0xdbe8ff,fi:.35,ang:-35},
 bright:{n:'Bright room',d:'Even light, few shadows',sky:0xffffff,gnd:0xc8cdd6,hi:1.15,key:0xffffff,ki:.55,fill:0xffffff,fi:.45,ang:20},
 lamp:{n:'Desk lamp',d:'Warm light from above',sky:0xffe9cc,gnd:0x8a7a68,hi:.6,key:0xffc888,ki:1.2,fill:0xffe0c0,fi:.2,ang:15},
 spot:{n:'Spotlight',d:'Strong shadows to see the shape',sky:0xdde6f5,gnd:0x555d6b,hi:.4,key:0xffffff,ki:1.45,fill:0xaabbd8,fi:.2,ang:30}};
const ENVS={
 classroom:{n:'Classroom desk',bg:'linear-gradient(#f7f0e1,#eadfc8)',surf:0x8f7b5e,fog:0xeadfc8,grid:false},
 plain:{n:'Plain grid',bg:'',surf:null,fog:null,grid:true},
 outdoors:{n:'Outdoors',bg:'linear-gradient(#bfe3ff,#e8f5ff)',surf:0x8ec86c,fog:0xe8f5ff,grid:false},
 night:{n:'Night',bg:'linear-gradient(#2c3446,#171b26)',surf:null,fog:null,grid:true}};
let sceneCfg={lv:2,light:'clay',env:'classroom',bright:1,ang:null,tex:!LOWPERF};
try{const s=JSON.parse(localStorage.getItem('sketch3d.scene')||'null');if(s&&LIGHTS[s.light]&&ENVS[s.env]){if(!s.texUser)delete s.tex;if(!(s.lv>=2)){s.light='clay';s.lv=2}sceneCfg=Object.assign(sceneCfg,s)}}catch(e){}
const deskMat=LOWPERF?new THREE.MeshLambertMaterial({color:0x8f7b5e}):new THREE.MeshStandardMaterial({color:0x8f7b5e,roughness:.9,metalness:0}),desk=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),deskMat);desk.rotation.x=-Math.PI/2;desk.visible=false;scene.add(desk);
const shTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,4,64,64,62);g.addColorStop(0,'rgba(0,0,0,.45)');g.addColorStop(.6,'rgba(0,0,0,.18)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})();
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:shTex,transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.visible=false;scene.add(shadow);
function applyScene(){const L=LIGHTS[sceneCfg.light],E=ENVS[sceneCfg.env],b=sceneCfg.bright,ang=(sceneCfg.ang==null?L.ang:sceneCfg.ang)*Math.PI/180;
 hl.color.setHex(L.sky);hl.groundColor.setHex(L.gnd);hl.intensity=L.hi*b;kl.color.setHex(L.key);kl.intensity=L.ki*b;fl.color.setHex(L.fill);fl.intensity=L.fi*b;
 try{blob.material=L.mc?clayMat:blobMat;clayMat.color.setScalar(Math.min(1.35,Math.max(.6,b)))}catch(e){}
 kl.position.set(300*Math.sin(ang),210,300*Math.cos(ang));fl.position.set(-300*Math.sin(ang),70,-300*Math.cos(ang));
 try{$('#s3d').style.background=E.bg}catch(e){}
 scene.fog=E.fog?new THREE.Fog(E.fog,450,1300):null;
 desk.visible=!!E.surf;if(E.surf)deskMat.color.setHex(E.surf);shadow.visible=!!E.surf;if(floor){floor.visible=true;floor.material.opacity=E.grid?1:.55}
 try{updateFloor()}catch(e){}requestRender(false,false)}
function saveScene(){try{localStorage.setItem('sketch3d.scene',JSON.stringify(sceneCfg))}catch(e){}}
function modelBounds(){const sol=parts.filter(p=>!p.cut&&p.pts.length>2);if(!sol.length)return null;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,z0=1e9,z1=-1e9;
 for(const p of sol){const b=partBox(p);x0=Math.min(x0,b.x0);x1=Math.max(x1,b.x1);y0=Math.min(y0,b.y0);y1=Math.max(y1,b.y1);z0=Math.min(z0,b.z0);z1=Math.max(z1,b.z1)}
 return{x0,x1,y0,y1,z0,z1,w:x1-x0,h:y1-y0,d:z1-z0}}
function makeFloor(){if(floor){scene.remove(floor);floor.geometry.dispose();floor.material.dispose()}
 floor=new THREE.GridHelper(300,30,new THREE.Color(css('--g3a')),new THREE.Color(css('--g3b')));floor.material.transparent=true;floor.material.depthWrite=false;floor.renderOrder=1;scene.add(floor);updateFloor();if(typeof applyScene==='function')applyScene()}
function updateFloor(){if(!floor)return;const b=modelBounds(),cx=b?(b.x0+b.x1)/2:0,cy=(b?b.y0:0)-.1,cz=b?(b.z0+b.z1)/2:0;floor.position.set(0,cy+.02,0);desk.position.set(cx,cy-.15,cz);shadow.position.set(cx,cy+.05,cz);const s=b?Math.max(b.w,b.d)*1.5+20:120;shadow.scale.set(s,s,1)}
/* after adding a part, zoom the 3D view out (keeping the angle) if the model no longer fits */
let fitAnim=0;
function fit3dLimits(){let L=-.9;try{const t=document.querySelector('.v3dtools'),r=host.getBoundingClientRect();if(t&&t.offsetParent&&r.width>0){const q=t.getBoundingClientRect();if(q.height>q.width&&q.right>r.left)L=Math.min(.2,-1+2*(q.right-r.left)/r.width+.04)}}catch(e){}return L}
function fits3d(b,L){cam.updateMatrixWorld();const v=new THREE.Vector3();for(const x of[b.x0,b.x1])for(const y of[b.y0,b.y1])for(const z of[b.z0,b.z1]){v.set(x,y,z).project(cam);if(v.z>1||v.x<L||v.x>.9||Math.abs(v.y)>.86)return false}return true}
function fit3dIfNeeded(){if(!R)return;const b=modelBounds();if(!b)return;const L=fit3dLimits();if(fits3d(b,L))return;
 const t0=tgt.clone(),d0=dist,T=new THREE.Vector3((b.x0+b.x1)/2,(b.y0+b.y1)/2,(b.z0+b.z1)/2);
 const xc=(L+.9)/2,th=Math.tan(cam.fov*Math.PI/360)*cam.aspect,rgt=new THREE.Vector3(Math.cos(az),0,-Math.sin(az));let D=Math.max(60,d0*.7),TT=T.clone();
 for(let i=0;i<40;i++){TT.copy(T).addScaledVector(rgt,-xc*D*th);tgt.copy(TT);dist=D;placeCam();if(fits3d(b,L))break;D*=1.08}const T2=TT.clone();
 tgt.copy(t0);dist=d0;placeCam();const st=performance.now();let rm=false;try{rm=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
 cancelAnimationFrame(fitAnim);const step=()=>{const k=rm?1:Math.min(1,(performance.now()-st)/380),e=1-Math.pow(1-k,3);tgt.lerpVectors(t0,T2,e);dist=d0+(D-d0)*e;placeCam();requestRender(false,false);if(k<1)fitAnim=requestAnimationFrame(step)};step()}
function placeCam(){cam.position.set(tgt.x+dist*Math.cos(el)*Math.sin(az),tgt.y+dist*Math.sin(el),tgt.z+dist*Math.cos(el)*Math.cos(az));cam.lookAt(tgt);cam.updateMatrix()}
function frame3d(front){const b=modelBounds();if(b){tgt.set((b.x0+b.x1)/2,(b.y0+b.y1)/2,(b.z0+b.z1)/2);dist=Math.max(60,Math.hypot(b.w,b.h,b.d)/2*4.4)}else{tgt.set(0,0,0);dist=200}
 const v=front===true?'front':front||'iso',A={front:[0,0],side:[Math.PI/2,0],top:[0,1.5],iso:[.55,.2]}[v]||[.55,.2];az=A[0];el=A[1];placeCam();requestRender(false,false)}
function resize3d(){if(!R)return;const w=host.clientWidth,h=host.clientHeight;if(w<2||h<2)return;R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();requestRender(false,false)}
let lostShown=false;
function camBase(){const b=modelBounds();return b?{C:new THREE.Vector3((b.x0+b.x1)/2,(b.y0+b.y1)/2,(b.z0+b.z1)/2),r:Math.hypot(b.w,b.h,b.d)/2}:{C:new THREE.Vector3(0,limits.h/2,0),r:Math.hypot(limits.w,limits.h,limits.d)/3}}
function checkCam(){const{C,r}=camBase(),fit=Math.max(60,r*4.4),dc=cam.position.distanceTo(C),lost=dc>fit*2.4||dc<fit*.3||tgt.distanceTo(C)>Math.max(r*1.8,40);
 if(lost!==lostShown){lostShown=lost;$('#camLost').hidden=!lost}}
function camHome(){frame3d('iso')}
let lastCC=0,interactUntil=0,curPR=1,prT=0;
function bumpInteract(){if(!LOWPERF)return;interactUntil=performance.now()+220;clearTimeout(prT);prT=setTimeout(()=>requestRender(false,false),260)}
function render3d(){if(!R)return;if(host.clientWidth<2||host.clientHeight<2)return;
 if(LOWPERF){const want=performance.now()<interactUntil?.6:1;if(want!==curPR){curPR=want;R.setPixelRatio(want)}}
 updateGizmo();const nw=performance.now();if(nw-lastCC>250){lastCC=nw;checkCam()}R.render(scene,cam);updCube()}
/* ---------- view cube: shows which way you are looking; tap a face to snap to it ---------- */
const VC=(()=>{const w=document.createElement('div');w.className='vcube-wrap';w.setAttribute('role','group');w.setAttribute('aria-label','Snap the 3D view');
 const c=document.createElement('div');c.className='vcube';w.appendChild(c);
 const F=[['front','Front',0,0],['back','Back',Math.PI,0],['right','Right',Math.PI/2,0],['left','Left',-Math.PI/2,0],['top','Top',null,1.45],['bottom','Under',null,-1.45]];
 for(const [k,l,a,e] of F){const b=document.createElement('button');b.type='button';b.className='vcf vcf-'+k;b.textContent=l;b.title='Look from the '+(k==='bottom'?'bottom':k);b.onclick=ev=>{ev.stopPropagation();snapView(a,e)};c.appendChild(b)}
 const h=document.createElement('button');h.type='button';h.className='vchome';h.title='Back to the starting view';h.setAttribute('aria-label','Starting view');h.innerHTML='<svg class="i" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/></svg>';h.onclick=ev=>{ev.stopPropagation();snapView(.55,.2)};w.appendChild(h);
 for(const t of['pointerdown','pointermove','pointerup','wheel'])w.addEventListener(t,ev=>ev.stopPropagation());
 host.appendChild(w);return c})();
function updCube(){if(!VC)return;const m=cam.matrixWorldInverse.elements,f=v=>Math.abs(v)<1e-10?0:v;
 VC.style.transform='translateZ(-60px) matrix3d('+[f(m[0]),f(-m[1]),f(m[2]),0,f(-m[4]),f(m[5]),f(-m[6]),0,f(m[8]),f(-m[9]),f(m[10]),0,0,0,0,1].join(',')+')'}
let snapAnim=0;function snapView(a,e){const a0=az,e0=el;let a1=a===null?az:a;let d=((a1-a0)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI;a1=a0+d;const st=performance.now();let rm=false;try{rm=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(x){}
 cancelAnimationFrame(snapAnim);const step=()=>{const k=rm?1:Math.min(1,(performance.now()-st)/360),q=1-Math.pow(1-k,3);az=a0+(a1-a0)*q;el=e0+(e-e0)*q;placeCam();requestRender(false,false);if(k<1)snapAnim=requestAnimationFrame(step)};step()}
/* The model: a quick coarse mesh while you edit, then a finer one a moment after you stop. */
const blobMat=LOWPERF?new THREE.MeshLambertMaterial({vertexColors:true}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:0}),blob=new THREE.Mesh(new THREE.BufferGeometry(),blobMat);
blob.frustumCulled=false;scene.add(blob);
/* 3D-print layer lines (look only: bands in world height, faded when too small to see) */
const layerU={uOn:{value:1},uPitch:{value:1.1}};
/* high-contrast "matcap" clay look: lighting baked into a small sphere picture, cheap to draw */
const clayMat=new THREE.MeshMatcapMaterial({vertexColors:true,matcap:(()=>{const S=256,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d'),im=x.createImageData(S,S),L=[-.45,.62,.64],Ln=Math.hypot(...L),l=L.map(v=>v/Ln);
 for(let j=0;j<S;j++)for(let i=0;i<S;i++){const nx=(i+.5)/S*2-1,ny=1-(j+.5)/S*2,r2=nx*nx+ny*ny,o=(j*S+i)*4;if(r2>1){im.data[o+3]=255;continue}const nz=Math.sqrt(1-r2),d=Math.max(0,nx*l[0]+ny*l[1]+nz*l[2]),
  h=2*d*nz-l[2],sp=Math.pow(Math.max(0,h),36),rim=Math.pow(1-nz,2.6),bot=Math.max(0,-ny)*.18,v=.16+.86*Math.pow(d,1.15)-bot;
  im.data[o]=Math.min(255,255*(v+.42*sp+.22*rim*.9));im.data[o+1]=Math.min(255,255*(v+.42*sp+.22*rim*.95));im.data[o+2]=Math.min(255,255*(v+.42*sp+.22*rim*1.1));im.data[o+3]=255}
 x.putImageData(im,0,0);return new THREE.CanvasTexture(c)})()});
const layerPatch=sh=>{Object.assign(sh.uniforms,layerU);
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying float vLY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLY=(modelMatrix*vec4(transformed,1.0)).y;');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vLY;uniform float uOn;uniform float uPitch;').replace('#include <color_fragment>','#include <color_fragment>\n{float ph=vLY/uPitch;float fw=fwidth(ph);float amp=uOn*clamp(1.0-fw*1.6,0.0,1.0);float b=0.5+0.5*sin(ph*6.2831853);diffuseColor.rgb*=1.0-0.17*amp*b;}');
};
function setLayers(on){for(const m of[blobMat,clayMat])if(on&&!m.userData.lp){m.userData.lp=1;m.onBeforeCompile=layerPatch;m.customProgramCacheKey=()=>'layers1';m.needsUpdate=true}layerU.uOn.value=on?1:0;sceneCfg.tex=!!on;try{$('#texBtn').setAttribute('aria-pressed',on?'true':'false')}catch(e){}requestRender(false,false)}
const fcache=new Map();let curM=null,sigG='',sigC='',fineT=0;
const modelSize=()=>{const b=modelBounds();return b?Math.max(b.w,b.h,b.d,40):100};
const geomSig=()=>JSON.stringify([sculptVer,sculpt.length,grooves,parts.map(p=>[p.pts,p.depth,p.round,p.z,p.blend||0,p.rx||0,p.ry||0,p.rz||0,p.melt?1:0,p.cut?1:0,p.taper||0,p.squash||0,p.prof||0,p.limb||0])])+JSON.stringify(grooves);
const colSig=()=>JSON.stringify([selIds(),parts.map(p=>p.color)]);
/* Display mesh: where two hard-joined parts meet, triangles are split along the exact boundary so each colour edge is crisp.
   Melted joins keep the soft colour blend. */
function buildDisplay(M){const I=M.idx,Pp=M.pos,C=M.col,P=M.pid,A=M.act,Ps=M.Ps;
 const nv=Pp.length/3,N=new Float32Array(nv*3),NA=new Float32Array(nv*3),FN=new Float32Array(I.length);
 const fp=t=>{const x=P[I[t]],y=P[I[t+1]],z=P[I[t+2]];return x===y||x===z?x:y===z?y:x};
 for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3,ux=Pp[b]-Pp[a],uy=Pp[b+1]-Pp[a+1],uz=Pp[b+2]-Pp[a+2],wx=Pp[c]-Pp[a],wy=Pp[c+1]-Pp[a+1],wz=Pp[c+2]-Pp[a+2],nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;FN[t]=nx;FN[t+1]=ny;FN[t+2]=nz;const f=fp(t);
  for(let k=0;k<3;k++){const v=I[t+k];NA[v*3]+=nx;NA[v*3+1]+=ny;NA[v*3+2]+=nz;if(f===P[v]||(A[P[v]]&&A[P[v]].melt)){N[v*3]+=nx;N[v*3+1]+=ny;N[v*3+2]+=nz}}}
 for(let v=0;v<nv;v++){let x=N[v*3],y=N[v*3+1],z=N[v*3+2];if(x*x+y*y+z*z<1e-12){x=NA[v*3];y=NA[v*3+1];z=NA[v*3+2]}const l=Math.hypot(x,y,z)||1;N[v*3]=x/l;N[v*3+1]=y/l;N[v*3+2]=z/l}
 const op=[],on=[],oc=[];const pc=new Map();const partCol=j=>{if(pc.has(j))return pc.get(j);return rgbOf(A[j].color)};
 for(let v=0;v<P.length;v++)if(!pc.has(P[v]))pc.set(P[v],[C[v*3],C[v*3+1],C[v*3+2]]);
 const put=(p,n,c)=>{op.push(p[0],p[1],p[2]);on.push(n[0],n[1],n[2]);oc.push(c[0],c[1],c[2])};
 const V=v=>[Pp[v*3],Pp[v*3+1],Pp[v*3+2]],Nn=v=>[N[v*3],N[v*3+1],N[v*3+2]],Cv=v=>[C[v*3],C[v*3+1],C[v*3+2]],L=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
 for(let t=0;t<I.length;t+=3){const T=[I[t],I[t+1],I[t+2]],q=T.map(v=>P[v]);
  const melt=q.some(j=>A[j]&&A[j].melt);
  if(q[0]===q[1]&&q[1]===q[2]||melt){for(const v of T)put(V(v),Nn(v),Cv(v));continue}
  const a=q[0],b=q[1]!==a?q[1]:q[2],cA=partCol(a),cB=partCol(b);
  const sv=T.map(v=>{const p=V(v);return partSdf(Ps[a],p[0],p[1],p[2])-partSdf(Ps[b],p[0],p[1],p[2])});
  const neg=sv.map(x=>x<0),nN=neg.filter(Boolean).length;
  if(nN===0||nN===3){const c=nN?cA:cB;for(const v of T)put(V(v),Nn(v),c);continue}
  const lone=nN===1?neg.indexOf(true):neg.indexOf(false),i0=lone,i1=(lone+1)%3,i2=(lone+2)%3,cl=neg[lone]?cA:cB,co=neg[lone]?cB:cA;
  const v0=T[i0],v1=T[i1],v2=T[i2],t1=sv[i0]/(sv[i0]-sv[i1]),t2=sv[i0]/(sv[i0]-sv[i2]);
  const p01=L(V(v0),V(v1),t1),p02=L(V(v0),V(v2),t2),fl=Math.hypot(FN[t],FN[t+1],FN[t+2])||1,fn=[FN[t]/fl,FN[t+1]/fl,FN[t+2]/fl];
  const n0=Nn(v0),n1=Nn(v1),n2=Nn(v2);put(V(v0),n0,cl);put(p01,n0,cl);put(p02,n0,cl);
  put(p01,n1,co);put(V(v1),n1,co);put(V(v2),n2,co);
  put(p01,n1,co);put(V(v2),n2,co);put(p02,n2,co)}
 return{pos:new Float32Array(op),nor:new Float32Array(on),col:new Float32Array(oc)}}
function showModel(M){blob.geometry.dispose();const g=new THREE.BufferGeometry();curM=M;
 if(M){const D=buildDisplay(M);g.setAttribute('position',new THREE.BufferAttribute(D.pos,3));g.setAttribute('normal',new THREE.BufferAttribute(D.nor,3));g.setAttribute('color',new THREE.BufferAttribute(D.col,3));blob.visible=true}else blob.visible=false;
 blob.geometry=g;silStamp++;requestRender(true,false)}
function rebuild(fine){const t0=performance.now();try{return rebuild0(fine)}finally{if(!fine){const dt=performance.now()-t0;syncGap=Math.round(Math.min(400,Math.max(110,syncGap*.6+dt*2.4*.4)))}}}
function rebuild0(fine){const s=modelSize(),scm=document.getElementById('app').classList.contains('sculpting'),v=scm?(fine?Math.max(.8,s/90):Math.max(1.5,s/48)):fine?(LOWPERF?Math.max(1.3,s/55):Math.max(.9,s/90)):(LOWPERF?Math.max(2.4,s/28):Math.max(1.7,s/42));
 for(const id of [...fcache.keys()])if(!partById(id))fcache.delete(id);
 let M=null;try{M=buildModel(parts,drawOrder(),v,{blendOn,cache:fcache,colors:true,hl:hlSel(),grooves,sculpt:sculptNow(),project:!!fine})}catch(e){console.error(e)}
 showModel(M);sigC=colSig();if(fine){findPieces(M);pcSig='';renderCheck()}requestRender(false,false)}
function recolor(){sigC=colSig();if(!curM)return;curM.act=curM.act.map(p=>partById(p.id)||p);colorModel(curM,hlSel());
 {const D=buildDisplay(curM);blob.geometry.setAttribute('position',new THREE.BufferAttribute(D.pos,3));blob.geometry.setAttribute('normal',new THREE.BufferAttribute(D.nor,3));blob.geometry.setAttribute('color',new THREE.BufferAttribute(D.col,3));blob.geometry.computeBoundingSphere()}silStamp++;requestRender(true,false)}
function sync3d(){const g=geomSig();
 if(g!==sigG){sigG=g;rebuild(false);clearTimeout(fineT);fineT=setTimeout(()=>rebuild(true),LOWPERF?420:240)}
 else if(colSig()!==sigC)recolor();
 updateFloor();updateStats()}
/* which part is nearest to a point on the surface */
function pickPart(pt){if(!curM)return null;let best=null,bd=1e9;for(let j=0;j<curM.act.length;j++){const d=partSdf(curM.Ps[j],pt.x,pt.y,pt.z)-(curM.act[j].cut?.4:0);if(d<bd){bd=d;best=curM.act[j].id}}return best}
/* orbit / zoom / pan / click-to-select */
const p3=new Map();let g3=null;
function panBy(dx,dy){const r=new THREE.Vector3().setFromMatrixColumn(cam.matrix,0),u=new THREE.Vector3().setFromMatrixColumn(cam.matrix,1),k=dist*.0016;tgt.addScaledVector(r,-dx*k).addScaledVector(u,dy*k);placeCam()}
if(R){const dom=R.domElement;
 dom.addEventListener('contextmenu',e=>e.preventDefault());
 dom.addEventListener('pointerdown',e=>{dom.setPointerCapture(e.pointerId);p3.set(e.pointerId,{x:e.clientX,y:e.clientY});
  g3={x0:e.clientX,y0:e.clientY,t:performance.now(),sh:e.shiftKey||multiOn,moved:false,pan:e.shiftKey||e.button===2||e.button===1,pd:0};
  if(p3.size===2){const a=[...p3.values()];g3.pd=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}dom.style.cursor='grabbing'});
 dom.addEventListener('pointermove',e=>{const o=p3.get(e.pointerId);if(!o||!g3)return;const dx=e.clientX-o.x,dy=e.clientY-o.y;p3.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(Math.hypot(e.clientX-g3.x0,e.clientY-g3.y0)>4)g3.moved=true;
  if(p3.size>=2){const a=[...p3.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(g3.pd)dist=clamp(dist*g3.pd/d,8,2500);g3.pd=d;panBy(dx/2,dy/2)}
  else if(g3.pan)panBy(dx,dy);else{az-=dx*.008;el=clamp(el+dy*.008,-1.45,1.45);placeCam()}
  bumpInteract();requestRender(false,false)});
 const up=e=>{const was=p3.size;p3.delete(e.pointerId);dom.style.cursor='grab';
  if(g3&&!g3.moved&&was===1&&performance.now()-g3.t<600&&e.type==='pointerup'){const r=dom.getBoundingClientRect(),rc=new THREE.Raycaster();
   rc.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1),cam);
   const hit=blob.visible?rc.intersectObject(blob)[0]:null,id=hit?pickPart(hit.point):null,et=view2d==='side'?({fill:'fill',erase:'erase'}[sideTool]||''):tool,q=id&&partById(id);
   if(q&&et==='fill'&&!q.cut){sel=id;if(q.color!==paintColor){q.color=paintColor;commit()}requestRender()}else if(q&&et==='erase'){select(id);delSel()}else if(g3.sh&&id)toggleSel(id);else select(id)}
  if(!p3.size)g3=null};
 dom.addEventListener('pointerup',up);dom.addEventListener('pointercancel',up);
 dom.addEventListener('wheel',e=>{e.preventDefault();dist=clamp(dist*Math.exp(e.deltaY*.0015),8,2500);placeCam();bumpInteract();requestRender(false,false)},{passive:false})}
/* ---------- part settings: one set of sliders in the 3D pop-up, a compact set in the side panel ---------- */
const PDEF=[
 {k:'depth',label:'Thickness',min:2,max:80,get:p=>Math.round(p.depth),set:(p,v)=>{p.depth=v},fmt:v=>v+' mm'},
 {k:'round',label:'Roundness',min:0,max:100,get:p=>Math.round(p.round*100),set:(p,v)=>{p.round=v/100},fmt:v=>v+'%'},
 {k:'blend',label:'Melt amount',min:0,max:20,get:p=>Math.round(p.blend||0),set:(p,v)=>{p.blend=v},fmt:v=>v?v+' mm':'Off'},
 {k:'z',label:'Move forward / back',min:-100,max:100,get:p=>Math.round(p.z),set:(p,v)=>{p.z=v},fmt:v=>(v>0?'+':'')+v+' mm'}];
const SDEF=[
 {k:'taper',label:'Taper',tip:'+ pointy top',min:-100,max:100,step:5,get:p=>Math.round(p.taper||0),set:(p,v)=>{p.taper=v},fmt:v=>v+'%'},
 {k:'squash',label:'Squash',tip:'+ stretch · − squat',min:-60,max:80,step:5,get:p=>Math.round(p.squash||0),set:(p,v)=>{p.squash=v},fmt:v=>v+'%'}];
const LDEF=[
 {k:'r0',label:'Start width',min:1,max:30,get:p=>Math.round(p.limb.r0*2),set:(p,v)=>{p.limb.r0=v/2;regenLimb(p)},fmt:v=>v+' mm'},
 {k:'r1',label:'End width',min:1,max:30,get:p=>Math.round(p.limb.r1*2),set:(p,v)=>{p.limb.r1=v/2;regenLimb(p)},fmt:v=>v+' mm'},
 {k:'bend',label:'Bend',tip:'curl it',min:-180,max:180,step:5,get:p=>Math.round(p.limb.bend||0),set:(p,v)=>{p.limb.bend=v;regenLimb(p)},fmt:v=>v+'°'}];
const RDEF=[
 {k:'rz',label:'Spin',tip:'like a clock',min:-180,max:180,step:5,get:p=>Math.round(p.rz||0),set:(p,v)=>{p.rz=v},fmt:v=>v+'°'},
 {k:'ry',label:'Turn',tip:'left or right',min:-180,max:180,step:5,get:p=>Math.round(p.ry||0),set:(p,v)=>{p.ry=v},fmt:v=>v+'°'},
 {k:'rx',label:'Tilt',tip:'nod',min:-180,max:180,step:5,get:p=>Math.round(p.rx||0),set:(p,v)=>{p.rx=v},fmt:v=>v+'°'}];
const PIC={
 depth:'<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
 round:'<rect x="4" y="6" width="16" height="12" rx="6"/>',
 blend:'<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>',
 z:'<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
 taper:'<path d="M9 4h6l4 16H5z"/>',
 squash:'<path d="M12 3v7M9 7l3 3 3-3M12 21v-7M9 17l3-3 3 3"/><path d="M5 12h14"/>',
 r0:'<circle cx="8" cy="12" r="4"/><path d="M12 12h8"/>',
 r1:'<circle cx="16" cy="12" r="4"/><path d="M4 12h8"/>',
 bend:'<path d="M5 20c0-8 4-13 14-13M15 3l4 4-4 4"/>',
 rz:'<path d="M20 12a8 8 0 11-3-6.2"/><path d="M20 4v5h-5"/>',
 ry:'<path d="M4 12h16M16 8l4 4-4 4M8 8l-4 4 4 4"/>',
 rx:'<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
 melt:'<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>',
 cut:'<circle cx="12" cy="12" r="7" stroke-dasharray="3 3"/><path d="M9 9l6 6M15 9l-6 6"/>',
 move:'<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
 turn:'<path d="M20 12a8 8 0 11-3-6.2"/><path d="M20 4v5h-5"/>',
 outline:'<path d="M5 5h14v14H5z" stroke-dasharray="3 2"/><path d="M9 9h6v6H9z"/>',
 mirror:'<path d="M12 3v18M8 8l-5 4 5 4zM16 8l5 4-5 4z"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
 shape:'<circle cx="12" cy="12" r="8"/>',
 limb:'<path d="M4 19c7 0 11-4 14-14"/>'};
const pico=k=>'<svg class="pi" viewBox="0 0 24 24" aria-hidden="true">'+(PIC[k]||PIC.shape)+'</svg>';
let hudCtls=[],sideCtls=[];
function paramCtl(d,pre,list){const f=document.createElement('div');f.className='field cs';
 f.innerHTML='<label for="'+pre+'-'+d.k+'"><span>'+pico(d.k)+d.label+(d.tip?' <em>'+d.tip+'</em>':'')+'</span><output></output></label><input type="range" id="'+pre+'-'+d.k+'" min="'+d.min+'" max="'+d.max+'" step="'+(d.step||1)+'">';
 const i=f.querySelector('input'),o=f.querySelector('output'),c={d,i,o};list.push(c);
 i.oninput=()=>{const p=sel&&partById(sel);if(!p)return;d.set(p,+i.value);o.textContent=d.fmt(+i.value);syncParams();requestRender()};
 i.onchange=()=>commit();return f}
let hudSw=[],sideSw=[];
function blendSwitch(list){const l=document.createElement('label');l.className='switch sm melt';l.innerHTML='<input type="checkbox"><span class="track"></span><span>Melt into touching parts</span>';
 const i=l.querySelector('input');list.push(i);i.onchange=()=>{const p=sel&&partById(sel);if(!p)return;p.melt=i.checked;if(p.melt&&!(p.blend>0))p.blend=5;syncParams();commit();requestRender();if(p.melt)toast(p.name+' will melt into the parts it touches.')};return l}
function syncParams(){const p=sel&&partById(sel);if(!p)return;
 for(const c of hudCtls.concat(sideCtls)){const k=c.d.k,f=c.i.closest('.field');
  if(k==='blend'){c.i.disabled=!p.melt&&!p.cut;const s=f&&f.querySelector('label span');if(s)s.textContent=p.cut?'Soft edge':'Melt amount'}
  if(k==='round'&&f)f.style.display=p.cut?'none':'';
  if(k==='depth')c.i.max=p.cut?200:80;
  if(c.i===document.activeElement)continue;let v=0;try{v=c.d.get(p)}catch(e){continue}c.i.value=v;c.o.textContent=c.d.fmt(v)}
 for(const i of hudSw.concat(sideSw)){i.checked=!!p.melt;i.disabled=false;const l=i.closest('label');if(l)l.style.display=p.cut?'none':''}
 if(typeof syncKid==='function')syncKid()}
function meltBox(pre,ctls,sw,D){const b=document.createElement('div');b.className='meltbox';b.appendChild(blendSwitch(sw));b.appendChild(paramCtl(D('blend'),pre,ctls));return b}
function buildHud(){const b=$('#hudBody');b.innerHTML='';hudCtls=[];hudSw=[];const D=k=>PDEF.find(d=>d.k===k);
 b.appendChild(paramCtl(D('depth'),'h',hudCtls));b.appendChild(paramCtl(D('round'),'h',hudCtls));b.appendChild(meltBox('h',hudCtls,hudSw,D));
 const h=document.createElement('div');h.className='hudsec';h.innerHTML='<button type="button" class="rothead" id="rotHead" aria-expanded="false"><span>More</span><svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><button type="button" class="btn" id="rotReset">Reset</button>';b.appendChild(h);
 const rot=document.createElement('div');rot.id='hudRot';rot.hidden=true;
 rot.appendChild(paramCtl(D('z'),'h',hudCtls));
 for(const d of RDEF.concat(SDEF))rot.appendChild(paramCtl(d,'h',hudCtls));b.appendChild(rot);
 $('#rotHead').onclick=()=>{rot.hidden=!rot.hidden;h.classList.toggle('open',!rot.hidden);$('#rotHead').setAttribute('aria-expanded',rot.hidden?'false':'true')};
 $('#rotReset').onclick=()=>{const p=sel&&partById(sel);if(!p)return;p.rx=p.ry=p.rz=p.taper=p.squash=0;syncParams();commit();requestRender()}}
function syncHud(){const p=sel&&partById(sel),h=$('#hud');h.hidden=!p;if(!p)return;$('#hudName').textContent=p.name;$('#hudDot').style.background=p.color;syncParams()}
$('#hudToggle').onclick=()=>{const h=$('#hud'),c=h.classList.toggle('min');$('#hudToggle').setAttribute('aria-expanded',c?'false':'true')};
/* ---------- touch mode: bigger targets and handles ---------- */
function setTouch(on,save){touchMode=on;document.body.classList.toggle('touch',on);$('#touchBtn').setAttribute('aria-pressed',on?'true':'false');$('#touchBtn').querySelector('.lbl').textContent='Touch controls: '+(on?'On':'Off');
 for(const k of gpick){k.scale.x=k.scale.z=on?2.4:1}
 if(save){try{localStorage.setItem('sketch3d.ui',JSON.stringify({touch:on}))}catch(e){}toast(on?'Touch controls on: bigger buttons and handles. Drag with one finger to orbit, two to pan and zoom.':'Touch controls off.')}
 size2d();resize3d();requestRender()}
/* ---------- inspector ---------- */
function renderLayers(){const ul=$('#layers');ul.innerHTML='';
 if(!parts.length){const li=document.createElement('li');li.className='empty';li.textContent='Nothing here yet. Pick a shape tool and drag on the sketch, or open Presets.';ul.appendChild(li);return}
 const SI=new Set(selIds());for(const p of drawOrder().reverse()){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='layer';b.setAttribute('aria-pressed',SI.has(p.id)?'true':'false');
  b.innerHTML='<i></i><span></span>';b.firstChild.style.background=p.color;b.lastChild.textContent=(p.cut?'✂ ':'')+p.name+(findCross(dedupeE(p.pts,.02))?'  ⚠':'');b.onclick=e=>{if(e.shiftKey||e.ctrlKey||e.metaKey||multiOn)toggleSel(p.id);else select(p.id)};li.appendChild(b);ul.appendChild(li)}}
function mkBtn(txt,cls,fn){const b=document.createElement('button');b.type='button';b.className='btn '+cls;b.textContent=txt;b.onclick=fn;return b}
let kidSync=[];
function kidSeg(cls,items,getI,setI){const w=document.createElement('div');w.className='kseg '+cls;w.setAttribute('role','group');items.forEach((it,i)=>{const b=document.createElement('button');b.type='button';b.innerHTML=(it.icon?'<svg viewBox="0 0 30 22" class="ki">'+it.icon+'</svg>':'')+'<span>'+it.label+'</span>';b.onclick=()=>{if(!sel)return;setI(i);commit();requestRender();syncKid()};w.appendChild(b)});kidSync.push(()=>{const a=getI();[...w.children].forEach((b,i)=>b.setAttribute('aria-pressed',i===a?'true':'false'))});return w}
function syncKid(){for(const f of kidSync)try{f()}catch(e){}}
function renderProps(){const box=$('#props');box.innerHTML='';sideCtls=[];sideSw=[];kidSync=[];const p=sel&&partById(sel),h=document.createElement('h3');h.textContent='Change this part';box.appendChild(h);
 if(!p){const t=document.createElement('p');t.className='empty';t.textContent='Tap a part on the sketch or in the list to change it.';box.appendChild(t);{const ph=$('#posHost');if(ph)ph.innerHTML='<p class="sub">Tap a part first.</p>';const pc=$('#posCard');if(pc)pc.querySelector('summary').textContent='Position of selected part'}return}
 const D=k=>PDEF.find(d=>d.k===k);
 kidSync=[];const P=()=>sel&&partById(sel);
 const who=document.createElement('div');who.className='kwho';who.innerHTML='<span class="kth"><i></i></span><input type="text" id="pname" maxlength="40" aria-label="Part name">';
 who.querySelector('i').style.background=p.color;const ni=who.querySelector('input');ni.value=p.name;ni.oninput=()=>{p.name=ni.value;renderLayers();$('#hudName').textContent=p.name};ni.onchange=()=>commit();h.replaceWith(who);
 const SEC={};const mkSec=(k,t,ic)=>{const d=document.createElement('section');d.className='psec ps-'+k;d.innerHTML='<h4 class="pst">'+pico(ic)+t+'</h4>';SEC[k]=d;return d};
 [['shape','Shape','round'],['limb','Tail / arm','limb'],['join','Join parts','melt'],['turn','Turn','turn'],['squash','Squash & stretch','squash'],['place','Place','move'],['cut','Cut away','cut'],['tidy','Tidy up','outline']].forEach(a=>mkSec(a[0],a[1],a[2]));
 const rf=document.createElement('div');rf.className='field';rf.innerHTML='<div class="rl"><span>How round?</span></div>';const RV=[.04,.4,.8,1];
 const rk=i=>'<rect x="3" y="3" width="24" height="16" rx="'+[1,5,8,8][i]+'" fill="none" stroke="currentColor" stroke-width="2"/>'+(i===3?'<rect x="9" y="7" width="12" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/>':'');
 rf.appendChild(kidSeg('c4',['Square','Soft','Round','Pill'].map((l,i)=>({label:l,icon:rk(i)})),()=>{const r=P().round;let b=0;RV.forEach((v,i)=>{if(Math.abs(v-r)<Math.abs(RV[b]-r))b=i});return b},i=>{P().round=RV[i]}));SEC.shape.appendChild(rf);
 const tf=document.createElement('div');tf.className='field';tf.innerHTML='<div class="rl"><span>How thick?</span><output class="tv"></output></div><input type="range" class="tslide" aria-label="How thick" min="2" max="80" step="1">';
 const tsl=tf.querySelector('.tslide'),tv=tf.querySelector('.tv'),tmax=()=>P().cut?200:80;
 tsl.oninput=()=>{const q=P();if(!q)return;q.depth=clamp(+tsl.value,2,tmax());tv.textContent=Math.round(q.depth)+' mm';requestRender()};
 tsl.onchange=()=>{commit();requestRender();syncParams()};
 kidSync.push(()=>{const q=P();if(!q)return;tv.textContent=Math.round(q.depth)+' mm';tsl.max=tmax();if(document.activeElement!==tsl||true)tsl.value=Math.round(q.depth)});SEC.shape.appendChild(tf);
 const mb=document.createElement('div');mb.className='meltbox';mb.appendChild(blendSwitch(sideSw));
 const ms=kidSeg('c3',['A little','Some','A lot'].map(l=>({label:l})),()=>{const v=P().blend||0;return v<=5?0:v<=11?1:2},i=>{const q=P();q.blend=[3,8,15][i];q.melt=true});
 kidSync.push(()=>{const q=P();if(q)ms.hidden=!q.melt});mb.appendChild(ms);SEC.join.appendChild(mb);
 if(p.limb){const lb=document.createElement('div');lb.className='limbbox';lb.innerHTML='<div class="rl"><span>Tail / arm shape</span></div>';lb.querySelector('.rl').remove();for(const d of LDEF)lb.appendChild(paramCtl(d,'s',sideCtls));SEC.limb.appendChild(lb)}
 const row=document.createElement('div');row.className='btnrow krow';row.appendChild(mkBtn('Copy','',dupSel));row.appendChild(mkBtn('Delete','danger',delSel));
 const cs=document.createElement('label');cs.className='switch sm';cs.innerHTML='<input type="checkbox"><span class="track"></span><span>Cut a hole (takes away)</span>';const csi=cs.querySelector('input');csi.checked=!!p.cut;csi.onchange=()=>{p.cut=csi.checked;if(p.cut){const b=modelBounds();if(b){p.depth=Math.round(Math.max(b.d+40,60));p.z=Math.round((b.z0+b.z1)/2)}}commit();requestRender()};SEC.cut.appendChild(cs);
 for(const d of SDEF)SEC.squash.appendChild(paramCtl(d,'s',sideCtls));
 for(const d of RDEF)SEC.turn.appendChild(paramCtl(d,'s',sideCtls));
 SEC.turn.appendChild(mkBtn('Reset turn','',()=>{p.rx=p.ry=p.rz=0;syncParams();commit();requestRender()}));
 {const ph=$('#posHost');if(ph){ph.innerHTML='';ph.appendChild(posRow(p));const pc=$('#posCard');if(pc)pc.querySelector('summary').innerHTML=pico('move')+'Position of '+(p.name||'part')}}
 SEC.tidy.appendChild(outlineRow(p));{const r2=document.createElement('div');r2.className='btnrow';r2.appendChild(mkBtn('Mirror copy','',mirrorSel));SEC.tidy.appendChild(r2)}
 for(const k of ['shape','limb','join','turn','squash','cut','tidy']){if(k==='limb'&&!p.limb)continue;box.appendChild(SEC[k])}
 box.appendChild(row);
 decorateProps(box);syncParams()}
function decorateProps(box){const M=[['How round','round'],['How thick','depth'],['Tail / arm shape','limb'],['Melt into','melt'],['Cut a hole','cut'],['Taper &','squash'],['Taper','taper'],['Rotate this part','turn'],['Position','move'],['Outline','outline'],['Mirror copy','mirror']];
 for(const el of box.querySelectorAll('.rl>span:first-child,summary,.switch>span:last-child')){if(el.querySelector('.pi'))continue;const t=el.textContent.trim();const m=M.find(x=>t.startsWith(x[0]));if(m)el.insertAdjacentHTML('afterbegin',pico(m[1]))}
 for(const d of box.querySelectorAll('details'))d.open=true}
function syncBlendUI(){const bo=$('#blendOn'),ba=$('#blendAll');if(!bo||!ba)return;bo.checked=blendOn;try{$('#meltTop').setAttribute('aria-pressed',blendOn?'true':'false')}catch(e){}ba.disabled=!blendOn;
 if(ba!==document.activeElement){const m=Math.round(Math.max(0,...parts.map(p=>p.blend||0)));ba.value=m;$('#blendAllOut').textContent=m?m+' mm':'Off'}}
function refreshUI(){try{scSync()}catch(e){}try{$('#qCopy').disabled=$('#qDel').disabled=!sel}catch(e){}try{xfRender()}catch(e){}renderLayers();renderProps();syncHud();syncBlendUI();updatePosFields();$('#undo').disabled=hist.i<=0;$('#redo').disabled=hist.i>=hist.s.length-1;updateStats()}
/* ---------- presets picker ---------- */
function buildPresets(){const g=$('#pgrid');g.innerHTML='';
 for(const P of PRESETS){const b=document.createElement('button');b.type='button';b.className='pcard';b.innerHTML='<img alt=""><b></b><span></span>';
  b.querySelector('img').src=presetThumb(P,64);b.querySelector('b').textContent=P.name;b.querySelector('span').textContent=P.desc;
  b.onclick=()=>{applyPreset(P.id);$('#presets').hidden=true;toast(P.id==='blank'?'Blank project ready. Pick a tool and start drawing!':P.name+' is ready!','Undo',undo)};g.appendChild(b)}}
/* ---------- export ---------- */
function updateStats(){const b=modelBounds(),k=printK();$('#scaleOut').textContent=Math.round(k*100)+'%';
 $('#dims').textContent=b?(b.w*k).toFixed(1)+' × '+(b.h*k).toFixed(1)+' × '+(b.d*k).toFixed(1)+' mm':'Nothing to export yet';renderSizeUI();renderCheck()}
function stlBytes(k){const b=modelBounds();if(!b)return null;const s=modelSize(),div={draft:55,standard:100,fine:150}[$('#detail').value]||100;
 const M=buildModel(parts,drawOrder(),Math.max(.5,s/div),{blendOn,cache:null,colors:false,grooves,sculpt:sculptNow(),project:true});if(!M)return null;
 const mx=(b.x0+b.x1)/2,mz=(b.z0+b.z1)/2,pos=M.pos,idx=M.idx,n=idx.length/3,buf=new ArrayBuffer(84+n*50),dv=new DataView(buf);dv.setUint32(80,n,true);let off=84;
 const P=[[0,0,0],[0,0,0],[0,0,0]];
 for(let t=0;t<n;t++){for(let j=0;j<3;j++){const a=idx[t*3+j]*3;P[j][0]=(pos[a]-mx)*k;P[j][1]=-(pos[a+2]-mz)*k;P[j][2]=(pos[a+1]-b.y0)*k}
  const ux=P[1][0]-P[0][0],uy=P[1][1]-P[0][1],uz=P[1][2]-P[0][2],vx=P[2][0]-P[0][0],vy=P[2][1]-P[0][1],vz=P[2][2]-P[0][2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;
  dv.setFloat32(off,nx/l,true);dv.setFloat32(off+4,ny/l,true);dv.setFloat32(off+8,nz/l,true);off+=12;
  for(const q of P){dv.setFloat32(off,q[0],true);dv.setFloat32(off+4,q[1],true);dv.setFloat32(off+8,q[2],true);off+=12}off+=2}
 return new Uint8Array(buf)}
const CRCT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRCT[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function zipOne(name,u){const nb=new TextEncoder().encode(name),crc=crc32(u),d=new Date(),dd=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),dt=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
 const lh=30+nb.length,cd=46+nb.length,buf=new ArrayBuffer(lh+u.length+cd+22),dv=new DataView(buf),b8=new Uint8Array(buf);let o=0;
 const w32=v=>{dv.setUint32(o,v,true);o+=4},w16=v=>{dv.setUint16(o,v,true);o+=2};
 w32(0x04034b50);w16(20);w16(0);w16(0);w16(dt);w16(dd);w32(crc);w32(u.length);w32(u.length);w16(nb.length);w16(0);b8.set(nb,o);o+=nb.length;b8.set(u,o);o+=u.length;
 const cdOff=o;w32(0x02014b50);w16(20);w16(20);w16(0);w16(0);w16(dt);w16(dd);w32(crc);w32(u.length);w32(u.length);w16(nb.length);w16(0);w16(0);w16(0);w16(0);w32(0);w32(0);b8.set(nb,o);o+=nb.length;
 w32(0x06054b50);w16(0);w16(0);w16(1);w16(1);w32(cd);w32(cdOff);w16(0);return b8}
async function doSave(){if(!parts.length){toast('Add a shape first.');return}
 let dl=null;try{if(window.claude&&window.claude.use)dl=await window.claude.use('downloads')}catch(e){dl=null}
 if(!dl)dl={plain:true,save:async({filename,data})=>{const bl=new Blob([data],{type:/\.stl$/.test(filename)?'model/stl':'application/zip'}),u=URL.createObjectURL(bl),a=document.createElement('a');a.href=u;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),8000)}};
 if(printCheck().some(i=>i.lv==='bad')&&!saveWarned){saveWarned=true;pcSig='';renderCheck();toast('There are things to fix first. Tap again to save anyway.');return}
 toast('Building the printable mesh…');await new Promise(r=>setTimeout(r,30));
 const stl=stlBytes(printK());if(!stl){toast('Nothing to export yet.');return}
 const zip=zipOne('sketch3d-toy.stl',stl);
 try{if(dl.plain){await dl.save({filename:'sketch3d-toy.stl',data:stl});toast('Saved sketch3d-toy.stl. Open it in your slicer.')}else{await dl.save({filename:'sketch3d-toy.zip',data:zip});toast('Saved. Unzip it, then open the .stl in your slicer.')}}
 catch(err){const c=err&&err.code;if(c!=='declined')toast(c==='rate_limited'?'One moment, then try again.':'Saving did not work in this view.')}}
/* ---------- wiring ---------- */
$('#expBtn').onclick=()=>{$('#presets').hidden=true;$('#help').hidden=true;const s=$('#sheet');s.hidden=!s.hidden;updateStats()};
$('#closeSheet').onclick=()=>$('#sheet').hidden=true;
$('#preBtn').onclick=()=>{$('#sheet').hidden=true;$('#help').hidden=true;const s=$('#presets');s.hidden=!s.hidden};
$('#closePre').onclick=()=>$('#presets').hidden=true;
$('#scale').oninput=updateStats;function setSym(v){symOn=v;$('#symOn').checked=v;$('#symBtn').setAttribute('aria-pressed',v?'true':'false');persist();requestRender()}
$('#symOn').onchange=e=>{setSym(e.target.checked);if(symOn)toast('Mirror on: parts with a twin move together.')};
$('#symBtn').onclick=()=>{setSym(!symOn);toast(symOn?'Mirror on: change one side and the other copies it.':'Mirror off.')};
$('#advBtn').onclick=()=>{const a=$('#adv');a.hidden=!a.hidden;$('#advBtn').setAttribute('aria-expanded',a.hidden?'false':'true')};
function syncLimitUI(){const box=$('#limChips');if(!box.children.length){for(const k of Object.keys(LIMS)){const b=document.createElement('button');b.type='button';b.className='chip';b.dataset.k=k;b.onclick=()=>{setLimits(...LIMS[k],true);toast('Build area: '+k+'.')};box.appendChild(b)}}
 [...box.children].forEach(b=>{const L=LIMS[b.dataset.k];b.innerHTML='<b>'+b.dataset.k+'</b><span>'+L[0]+' mm</span>';b.setAttribute('aria-pressed',L[0]===limits.w&&L[1]===limits.h&&L[2]===limits.d?'true':'false')});
 for(const[id,v]of[['limW',limits.w],['limH',limits.h],['limD',limits.d]]){const i=$('#'+id);if(i!==document.activeElement)i.value=v}
 const an=$('#areaNote');if(an)an.textContent='Build area '+limits.w+' × '+limits.h+' × '+limits.d+' mm'}
for(const id of['limW','limH','limD'])$('#'+id).onchange=()=>setLimits(+$('#limW').value||limits.w,+$('#limH').value||limits.h,+$('#limD').value||limits.d,true);
$('#camReset').onclick=()=>{frame3d('iso');checkCam()};
$('#viewSeg').onclick=e=>{const b=e.target.closest('button');if(b)setView(b.dataset.v)};
let clrArm=0;$('#saveBtn').onclick=doSave;
$('#touchBtn').onclick=()=>setTouch(!touchMode,true);
$('#undo').onclick=undo;$('#redo').onclick=redo;
$('#clrBtn').onclick=()=>{const b=$('#clrBtn');if(!clrArm){clrArm=1;b.textContent='Tap again to clear everything';setTimeout(()=>{clrArm=0;b.textContent='Clear everything'},3000);return}clrArm=0;b.textContent='Clear everything';parts=[];grooves=[];sculpt=[];sculptVer++;sel=null;commit();requestRender();toast('Everything cleared.','Undo',undo)};
$('#zIn').onclick=()=>zoomAt(1.25,cw/2,ch/2);$('#zOut').onclick=()=>zoomAt(.8,cw/2,ch/2);$('#zFit').onclick=fit2d;
$('#snap').onchange=e=>snapOn=e.target.checked;$('#keep').onchange=e=>keepTool=e.target.checked;
function setMode(m){$('#app').dataset.mode=m;document.querySelectorAll('#modeSeg button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.m===m?'true':'false'));
 $('#expand3d').title=m==='view'?'Back to the sketch':'Open the 3D view full size';$('#expand3d').setAttribute('aria-label',$('#expand3d').title);
 $('#expand3d').innerHTML=m==='view'?'<svg class="i" viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg><span class="lbl">Shrink</span>':'<svg class="i" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span class="lbl">Expand</span>';
 requestAnimationFrame(()=>{size2d();resize3d();if(m==='view')fit3dSoon()});requestRender()}
function fit3dSoon(){requestRender(false,false)}
$('#modeSeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;setMode(b.dataset.m)};
$('#expand3d').onclick=()=>setMode($('#app').dataset.mode==='view'?'draw':'view');
/* ---------- Sculpt: a simple last-step workspace for small details on the 3D model ---------- */
let scTool='add',scSize='m',scStr='g',scStroke=null,scPrev='draw',scHoverQ=0;
const isSculpt=()=>$('#app').classList.contains('sculpting');
const scR=()=>scTool==='grab'?({s:7,m:12,l:20}[scSize]||12):({s:2.5,m:4.5,l:8}[scSize]||4.5);
const scRing=new THREE.Mesh(new THREE.RingGeometry(.82,1,40),new THREE.MeshBasicMaterial({color:0x2563eb,transparent:true,opacity:.9,depthTest:false,side:THREE.DoubleSide}));scRing.visible=false;scRing.renderOrder=10;scene.add(scRing);
function scHit(e){if(!R||!blob.visible)return null;const r=R.domElement.getBoundingClientRect(),rc=new THREE.Raycaster();rc.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1),cam);const h=rc.intersectObject(blob)[0];if(!h||!h.face)return null;return{p:h.point.clone(),n:h.face.normal.clone().normalize()}}
function scShowRing(h){if(!h||scTool==='view'){if(scRing.visible){scRing.visible=false;requestRender(false,false)}return}const r=scR();scRing.visible=true;scRing.scale.setScalar(r);scRing.position.copy(h.p).addScaledVector(h.n,.3);scRing.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),h.n);scRing.material.color.setHex(scTool==='add'?0x16a34a:scTool==='dent'?0xdc2626:scTool==='grab'?0x7c3aed:0x2563eb);requestRender(false,false)}
/* sculpting sticks to the part it was made on: move, resize, turn or reshape the part and the detail comes along */
function partFrame(p){const b=bbox(p.pts),d=Math.PI/180;return{O:[b.cx,b.cy,p.z],S:[Math.max(b.w,1),Math.max(b.h,1),Math.max(p.depth,1)],R:rotM((p.rx||0)*d,(p.ry||0)*d,(p.rz||0)*d)}}
const mv3=(R,v)=>[R[0]*v[0]+R[1]*v[1]+R[2]*v[2],R[3]*v[0]+R[4]*v[1]+R[5]*v[2],R[6]*v[0]+R[7]*v[1]+R[8]*v[2]],mv3T=(R,v)=>[R[0]*v[0]+R[3]*v[1]+R[6]*v[2],R[1]*v[0]+R[4]*v[1]+R[7]*v[2],R[2]*v[0]+R[5]*v[1]+R[8]*v[2]];
function scAttach(d,h){const id=pickPart(h.p),p=id&&partById(id);if(!p||p.cut)return;d.pid=id;d.fr=partFrame(p);d.c0=d.c.slice();d.r0=d.r}
function sculptNow(){if(!sculpt.length)return sculpt;const F=new Map();
 return sculpt.map(d=>{if(!d.pid&&curM&&!d.lg){d.lg=1;const id=pickPart({x:d.c[0],y:d.c[1],z:d.c[2]}),q=id&&partById(id);if(q&&!q.cut){d.pid=id;d.fr=partFrame(q);d.c0=d.c.slice();d.r0=d.r;if(d.d)d.d0=d.d.slice()}}
  if(!d.pid||!d.fr||!d.c0)return d;const p=partById(d.pid);if(!p)return d;let B=F.get(p.id);if(!B){B=partFrame(p);F.set(p.id,B)}
  const A=d.fr,k=[B.S[0]/A.S[0],B.S[1]/A.S[1],B.S[2]/A.S[2]],map=v=>{const l=mv3T(A.R,v);return mv3(B.R,[l[0]*k[0],l[1]*k[1],l[2]*k[2]])};
  const m=map([d.c0[0]-A.O[0],d.c0[1]-A.O[1],d.c0[2]-A.O[2]]),n=Object.assign({},d,{c:[B.O[0]+m[0],B.O[1]+m[1],B.O[2]+m[2]]});
  if(d.r0)n.r=d.r0*Math.cbrt(k[0]*k[1]*k[2]);if(d.d0)n.d=map(d.d0);return n})}
function scDab(h){const r=scR(),d={t:scTool,r,s:!!symOn};if(scTool==='smooth'){d.c=[+h.p.x.toFixed(2),+h.p.y.toFixed(2),+h.p.z.toFixed(2)];d.w=scStr==='g'?.35:.75}else{const hh=r*(scStr==='g'?.3:.6),c=h.p.clone().addScaledVector(h.n,(scTool==='add'?-1:1)*(r-hh));d.c=[+c.x.toFixed(2),+c.y.toFixed(2),+c.z.toFixed(2)]}
 scAttach(d,h);if(sculpt.length>=6000){toast('That is a lot of detail! Clear some sculpting to add more.');return false}sculpt.push(d);sculptVer++;requestRender();return true}
function scEnd(){if(!scStroke)return;const n0=scStroke.n0,g=scStroke.grab;scStroke=null;if(g)g.d0=g.d.slice();if(g&&Math.hypot(g.d[0],g.d[1],g.d[2])<.2){sculpt.splice(sculpt.indexOf(g),1);sculptVer++;requestRender();return}if(sculpt.length>n0)commit()}
if(R){host.addEventListener('pointerdown',e=>{if(!isSculpt()||e.target.closest('.vcube-wrap'))return;if(scStroke){scEnd();return}if(scTool==='view'||(e.pointerType==='mouse'&&e.button!==0))return;const h=scHit(e);if(!h)return;
  e.stopPropagation();e.preventDefault();try{R.domElement.setPointerCapture(e.pointerId)}catch(x){}scStroke={id:e.pointerId,last:h.p.clone(),n0:sculpt.length};
  if(scTool==='grab'){if(sculpt.length>=6000){toast('That is a lot of detail! Clear some sculpting to add more.');scStroke=null;return}const g={t:'grab',r:scR(),s:!!symOn,c:[+h.p.x.toFixed(2),+h.p.y.toFixed(2),+h.p.z.toFixed(2)],d:[0,0,0]};scAttach(g,h);sculpt.push(g);scStroke.grab=g;scStroke.p0=h.p.clone();scStroke.plane=new THREE.Plane().setFromNormalAndCoplanarPoint(cam.getWorldDirection(new THREE.Vector3()).negate(),h.p);scShowRing(h);return}
  scDab(h);scShowRing(h)},true);
 host.addEventListener('pointermove',e=>{if(!isSculpt())return;if(scStroke&&scStroke.grab&&e.pointerId===scStroke.id){e.stopPropagation();const r=R.domElement.getBoundingClientRect(),rc=new THREE.Raycaster();rc.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1),cam);const pt=new THREE.Vector3();if(!rc.ray.intersectPlane(scStroke.plane,pt))return;const D=pt.sub(scStroke.p0),mx=scStroke.grab.r*1.1;if(D.length()>mx)D.setLength(mx);scStroke.grab.d=[+D.x.toFixed(2),+D.y.toFixed(2),+D.z.toFixed(2)];sculptVer++;requestRender();scRing.position.copy(scStroke.p0).add(D);requestRender(false,false);return}
  if(scStroke&&e.pointerId===scStroke.id){e.stopPropagation();const h=scHit(e);if(!h)return;const sp=scR()*.4,dd=h.p.distanceTo(scStroke.last);if(dd>=sp){const steps=Math.min(8,Math.floor(dd/sp));for(let i=1;i<=steps;i++){const q=scStroke.last.clone().lerp(h.p,i/steps);if(!scDab({p:q,n:h.n}))break}scStroke.last.copy(h.p)}scShowRing(h);return}
  if(e.buttons)return;if(scHoverQ)return;scHoverQ=requestAnimationFrame(()=>{scHoverQ=0;scShowRing(scHit(e))})},true);
 for(const t of['pointerup','pointercancel'])host.addEventListener(t,e=>{if(scStroke&&e.pointerId===scStroke.id){e.stopPropagation();scEnd()}},true);
 host.addEventListener('pointerleave',()=>{if(!scStroke)scShowRing(null)})}
function setSculpt(on){const ap=$('#app');if(on===isSculpt())return;
 if(on){scPrev=ap.dataset.mode||'draw';closePops();ap.classList.add('sculpting');setMode('view');sigG='';toast('Sculpt: drag on your model to add small details. Drag the background to turn it.')}
 else{ap.classList.remove('sculpting');scShowRing(null);setMode(scPrev==='view'?'view':'draw');sigG=''}
 $('#sculptBtn').setAttribute('aria-pressed',on?'true':'false');scSync();requestRender()}
function scSync(){document.querySelectorAll('#sculptPanel [data-sc]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.sc===scTool?'true':'false'));
 document.querySelectorAll('#scSize button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===scSize?'true':'false'));
 document.querySelectorAll('#scStr button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===scStr?'true':'false'));
 const m=$('#scMirror');if(m)m.checked=!!symOn;const c=$('#scCount');if(c)c.textContent=sculpt.length?'':'Nothing sculpted yet.';
 const u=$('#scUndo'),r=$('#scRedo');if(u)u.disabled=hist.i<=0;if(r)r.disabled=hist.i>=hist.s.length-1}
$('#sculptBtn').onclick=()=>setSculpt(!isSculpt());
$('#scDone').onclick=()=>setSculpt(false);
document.querySelectorAll('#sculptPanel [data-sc]').forEach(b=>b.onclick=()=>{scTool=b.dataset.sc;scSync();if(scTool==='view')scShowRing(null)});
document.querySelectorAll('#scSize button').forEach(b=>b.onclick=()=>{scSize=b.dataset.v;scSync()});
document.querySelectorAll('#scStr button').forEach(b=>b.onclick=()=>{scStr=b.dataset.v;scSync()});
$('#scMirror').onchange=e=>setSym(e.target.checked);
$('#scUndo').onclick=()=>{undo();scSync()};$('#scRedo').onclick=()=>{redo();scSync()};
let scClrArm=0;$('#scClear').onclick=()=>{const b=$('#scClear');if(!sculpt.length){toast('Nothing sculpted yet.');return}if(!scClrArm){scClrArm=1;b.textContent='Tap again to clear';setTimeout(()=>{scClrArm=0;b.textContent='Clear sculpting'},3000);return}scClrArm=0;b.textContent='Clear sculpting';sculpt=[];sculptVer++;commit();requestRender();toast('Sculpting cleared.','Undo',undo)};
$('#min3d').onclick=()=>{const c=$('#p3d').classList.toggle('collapsed');$('#min3d').setAttribute('aria-expanded',c?'false':'true');requestAnimationFrame(resize3d)};
$('#helpBtn').onclick=()=>{$('#sheet').hidden=true;$('#presets').hidden=true;$('#help').hidden=!$('#help').hidden};$('#closeHelp').onclick=()=>$('#help').hidden=true;
function init(){buildTools();buildHud();buildPresets();let saved=null;try{saved=JSON.parse(localStorage.getItem('sketch3d.v2')||'null')}catch(e){}
 const ok=saved&&Array.isArray(saved.parts)?saved.parts.filter(p=>p&&Array.isArray(p.pts)&&p.pts.length>2&&p.id):[];
 autoFix=!(saved&&saved.autoFix===false);blendOn=true;{const was=!!(saved&&saved.melt20&&saved.blendOn!==false);if(!(saved&&saved.meltv>=2))for(const p of (saved&&Array.isArray(saved.parts)?saved.parts:[]))if(p)p.melt=false}symOn=!(saved&&saved.symOn===false);if(saved&&saved.limits)limits=Object.assign(limits,saved.limits);$('#autofix').checked=autoFix;setSym(symOn);renderTeach();buildSideTools();wireSideAdv();wireRef();wireUX();restoreRef();syncLimitUI();
 grooves=Array.isArray(saved&&saved.grooves)?saved.grooves.filter(g=>g&&Array.isArray(g.pts)&&g.pts.length>1):[];sculpt=Array.isArray(saved&&saved.sculpt)?saved.sculpt.filter(d=>d&&Array.isArray(d.c)&&d.r>0):[];if(ok.length){parts=ok;counters=saved.counters||{};nid=Math.max(saved.nid||1,...ok.map(p=>(parseInt(String(p.id).slice(1))||0)+1))}else{parts=[];counters={};nid=1;PRESETS[0].build((name,pts,color,depth,z,round,blend)=>{parts.push({id:uid(),name,pts,color,depth,round,z,blend})});linkTwins();normalizeParts()}
 clampAll();if(autoFix)fixAllParts();autoSel();
 hist.s=[snap()];hist.i=0;makeFloor();setTool('select');refreshUI();
 let ui=null;try{ui=JSON.parse(localStorage.getItem('sketch3d.ui')||'null')}catch(e){}
 setTouch(ui?!!ui.touch:matchMedia('(pointer: coarse)').matches,false);setMode('draw');setView('front');
 {let ws=null;try{ws=JSON.parse(localStorage.getItem('sketch3d.ws')||'null')}catch(e){}if(ws){try{if(typeof ws.opt==='boolean')sideOptOpen=ws.opt;if(ws.paint)pickPaint(ws.paint);if(ws.side&&['edit','select','erase','fill','draw'].includes(ws.side))sideTool=ws.side;if(ws.tool&&HINTS[ws.tool])setTool(ws.tool);if(ws.view==='side')setView('side')}catch(e){}}wsReady=true}
 try{if(!localStorage.getItem('sketch3d.seen')){$('#help').hidden=false;localStorage.setItem('sketch3d.seen','1')}}catch(e){}
 new ResizeObserver(size2d).observe($('#s2d'));if(R)new ResizeObserver(resize3d).observe(host);
 size2d();resize3d();frame3d(false);requestRender();
 const th=()=>{makeFloor();requestRender()};matchMedia('(prefers-color-scheme: dark)').addEventListener('change',th);new MutationObserver(th).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']})}
