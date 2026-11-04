/* ---------- the 3D handle: arrows move, rings turn, the middle cube resizes ---------- */
const AX={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)},AXC={x:0xe5484d,y:0x2fb344,z:0x1c7ed6};
const gizmo=new THREE.Group(),gpick=[],gmat={};
const gMat=(id,c)=>{const m=new THREE.MeshBasicMaterial({color:c,depthTest:false,transparent:true,opacity:.95});m.userData.base=c;gmat[id]=m;return m};
const gInv=()=>new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false});
for(const k of['x','y','z']){
 const g=new THREE.Group(),m=gMat('m:'+k,AXC[k]);
 const sh=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.05,10),m);sh.position.y=.775;
 const cn=new THREE.Mesh(new THREE.ConeGeometry(.13,.34,16),m);cn.position.y=1.47;
 const pk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.74,8),gInv());pk.position.y=.61;pk.userData={kind:'m',axis:k};gpick.push(pk);
 const pk2=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.42,8),gInv());pk2.position.y=1.5;pk2.userData={kind:'m',axis:k};gpick.push(pk2);
 sh.renderOrder=cn.renderOrder=999;g.add(sh,cn,pk,pk2);if(k==='x')g.rotation.z=-Math.PI/2;if(k==='z')g.rotation.x=Math.PI/2;gizmo.add(g);
 const rg=new THREE.Group(),ring=new THREE.Mesh(new THREE.TorusGeometry(1.15,.03,8,72),gMat('r:'+k,AXC[k])),rp=new THREE.Mesh(new THREE.TorusGeometry(1.15,.13,6,40),gInv());
 ring.renderOrder=998;rp.userData={kind:'r',axis:k};gpick.push(rp);rg.add(ring,rp);if(k==='x')rg.rotation.y=Math.PI/2;if(k==='y')rg.rotation.x=Math.PI/2;gizmo.add(rg)}
{const cube=new THREE.Mesh(new THREE.BoxGeometry(.26,.26,.26),gMat('s',0xffffff)),cp=new THREE.Mesh(new THREE.SphereGeometry(.24,8,8),gInv());cube.renderOrder=1000;cp.userData={kind:'s'};gpick.push(cp);gizmo.add(cube,cp)}
gizmo.visible=false;scene.add(gizmo);
let gizmoOn=true;
function updateGizmo(){const p=sel&&partById(sel);gizmo.visible=!!p&&gizmoOn&&selIds().length<2&&!(typeof isSculpt==='function'&&isSculpt());if(!p)return;const b=bbox(p.pts);gizmo.position.set(b.cx,b.cy,p.z);gizmo.scale.setScalar(cam.position.distanceTo(gizmo.position)*(touchMode?.09:.062));gizmo.updateMatrixWorld(true)}
function setGizmoHi(id){for(const a in gmat)gmat[a].color.setHex(gmat[a].userData.base).offsetHSL(0,0,a===id?.2:0);requestRender(false,false)}
/* where along an axis line the mouse ray passes closest */
function axisParam(ray,O,D){const w0=O.clone().sub(ray.origin),b=D.dot(ray.direction),d=D.dot(w0),e=ray.direction.dot(w0),den=1-b*b;return den<1e-4?null:(b*e-d)/den}
/* angle of the mouse around an axis, measured on the ring's own plane (right-handed) */
const RUV={x:['y','z'],y:['z','x'],z:['x','y']};
function ringAngle(ray,O,k){const N=AX[k],den=N.dot(ray.direction);if(Math.abs(den)<.02)return null;const t=N.dot(O.clone().sub(ray.origin))/den,P=ray.origin.clone().add(ray.direction.clone().multiplyScalar(t)).sub(O),[u,v]=RUV[k];return Math.atan2(P.dot(AX[v]),P.dot(AX[u]))}
/* part rotation is Rz*Ry*Rx (degrees); turning about a world axis is a left-multiply, then back to the three angles */
function rotM(a,b,g){const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);return[cg*cb,cg*sb*sa-sg*ca,cg*sb*ca+sg*sa,sg*cb,sg*sb*sa+cg*ca,sg*sb*ca-cg*sa,-sb,cb*sa,cb*ca]}
function mul3(A,B){const o=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)o.push(A[r*3]*B[c]+A[r*3+1]*B[3+c]+A[r*3+2]*B[6+c]);return o}
function axisRot(k,t){const c=Math.cos(t),s=Math.sin(t);return k==='x'?[1,0,0,0,c,-s,0,s,c]:k==='y'?[c,0,s,0,1,0,-s,0,c]:[c,-s,0,s,c,0,0,0,1]}
function eulerOf(R){const sb=clamp(-R[6],-1,1),b=Math.asin(sb);let a,g;if(Math.abs(R[6])<.99999){a=Math.atan2(R[7],R[8]);g=Math.atan2(R[3],R[0])}else{a=0;g=Math.atan2(-R[1],R[4])}const d=180/Math.PI,r=v=>Math.round(v*d*10)/10;return{rx:r(a),ry:r(b),rz:r(g)}}
const gtip=document.createElement('div');gtip.className='giztip';gtip.hidden=true;host.appendChild(gtip);
const showTip=t=>{gtip.textContent=t;gtip.hidden=false},hideTip=()=>{gtip.hidden=true};
function focusSel(){const p=sel&&partById(sel);if(!p){toast('Select a part first.');return}const b=bbox(p.pts);tgt.set(b.cx,b.cy,p.z);dist=Math.max(35,Math.hypot(b.w,b.h,p.depth)*2.8);placeCam();requestRender(false,false)}
$('#vFocus').onclick=focusSel;$('#vFront').onclick=()=>frame3d('front');$('#vSide').onclick=()=>frame3d('side');$('#vTop').onclick=()=>frame3d('top');$('#vReset').onclick=()=>frame3d('iso');
if(R){const dom3=R.domElement;let gd=null;
 const rayOf=e=>{const r=dom3.getBoundingClientRect(),rc=new THREE.Raycaster();rc.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1),cam);return rc};
 const gHit=e=>{if(!gizmo.visible)return null;const rc=rayOf(e),h=rc.intersectObjects(gpick,false)[0];return h?{rc,u:h.object.userData}:null};
 const hiId=u=>u.kind==='s'?'s':u.kind+':'+u.axis;
 const centreXY=O=>{const r=dom3.getBoundingClientRect(),v=O.clone().project(cam);return[r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height]};
 /* capture phase: these run before the orbit handlers and stop them while a handle is in use */
 dom3.addEventListener('pointerdown',e=>{if(e.button!==0||e.shiftKey)return;const h=gHit(e),p=sel&&partById(sel);if(!h||!p)return;
  const b=bbox(p.pts),O=new THREE.Vector3(b.cx,b.cy,p.z),u=h.u,k=u.axis;let st=null;
  if(u.kind==='m'){const s0=axisParam(h.rc.ray,O,AX[k]);if(s0===null)return;st={kind:'m',k,O,orig:clone(p.pts),z0:p.z,s0}}
  else if(u.kind==='r'){const a0=ringAngle(h.rc.ray,O,k);if(a0===null)return;const d=Math.PI/180;st={kind:'r',k,O,a0,R0:rotM((p.rx||0)*d,(p.ry||0)*d,(p.rz||0)*d),e0:{rx:p.rx||0,ry:p.ry||0,rz:p.rz||0}}}
  else{const c=centreXY(O);st={kind:'s',O,c,d0:Math.max(24,Math.hypot(e.clientX-c[0],e.clientY-c[1])),orig:clone(p.pts),dep:p.depth,cx:b.cx,cy:b.cy}}
  e.stopImmediatePropagation();dom3.setPointerCapture(e.pointerId);gd=Object.assign(st,{id:sel,moved:false,pid:e.pointerId});setGizmoHi(hiId(u));dom3.style.cursor='grabbing'},true);
 dom3.addEventListener('pointermove',e=>{
  if(gd){if(e.pointerId!==gd.pid)return;e.stopImmediatePropagation();const p=partById(gd.id);if(!p)return;
   if(gd.kind==='m'){const s=axisParam(rayOf(e).ray,gd.O,AX[gd.k]);if(s===null)return;let d=s-gd.s0;if(snapOn)d=Math.round(d);if(d!==0)gd.moved=true;
    if(gd.k==='x')p.pts=gd.orig.map(q=>[q[0]+d,q[1]]);else if(gd.k==='y')p.pts=gd.orig.map(q=>[q[0],q[1]+d]);else p.z=gd.z0+d;showTip('Moved '+(Math.round(d*10)/10)+' mm')}
   else if(gd.kind==='r'){const a=ringAngle(rayOf(e).ray,gd.O,gd.k);if(a===null)return;let t=a-gd.a0;t=Math.atan2(Math.sin(t),Math.cos(t));let dg=t*180/Math.PI;const s15=Math.round(dg/15)*15;if(Math.abs(dg-s15)<4)dg=s15;if(Math.abs(dg)>.2)gd.moved=true;
    const E=eulerOf(mul3(axisRot(gd.k,dg*Math.PI/180),gd.R0));p.rx=E.rx;p.ry=E.ry;p.rz=E.rz;showTip('Turned '+Math.round(dg)+'°')}
   else{let f=Math.hypot(e.clientX-gd.c[0],e.clientY-gd.c[1])/gd.d0;f=clamp(Math.round(f*20)/20,.2,5);if(f!==1)gd.moved=true;
    p.pts=gd.orig.map(q=>[gd.cx+(q[0]-gd.cx)*f,gd.cy+(q[1]-gd.cy)*f]);p.depth=clamp(gd.dep*f,2,p.cut?200:80);showTip('Size '+Math.round(f*100)+'%')}
   requestRender();return}
  if(e.buttons===0){const h=gHit(e);setGizmoHi(h?hiId(h.u):null);dom3.style.cursor=h?'pointer':'grab'}},true);
 const gEnd=e=>{if(!gd||e.pointerId!==gd.pid)return;e.stopImmediatePropagation();const m=gd.moved;gd=null;setGizmoHi(null);hideTip();dom3.style.cursor='grab';if(m)commit()};
 dom3.addEventListener('pointerup',gEnd,true);dom3.addEventListener('pointercancel',gEnd,true);
 dom3.addEventListener('dblclick',()=>{if(sel)focusSel()})}
/* exact position fields */
function posRow(p){const f=document.createElement('div');f.className='field';
 f.innerHTML='<div class="rl"><span>Position of centre (mm)</span></div><div class="posrow"><label>X<input type="number" id="pos-x" step="1"></label><label>Y<input type="number" id="pos-y" step="1"></label><label>Z<input type="number" id="pos-z" step="1"></label></div>';
 for(const k of['x','y','z']){const i=f.querySelector('#pos-'+k);i.onchange=()=>{const q=partById(sel);if(!q||i.value==='')return;const v=+i.value,b=bbox(q.pts);
  if(k==='x'){const d=v-b.cx;q.pts=q.pts.map(a=>[a[0]+d,a[1]])}else if(k==='y'){const d=v-b.cy;q.pts=q.pts.map(a=>[a[0],a[1]+d])}else q.z=v;commit();requestRender()}}
 const pad=document.createElement('div');pad.className='npad';
 const B=[['l','Left','<path d="M14 6l-6 6 6 6"/>',[-1,0,0]],['r','Right','<path d="M10 6l6 6-6 6"/>',[1,0,0]],['u','Up','<path d="M6 14l6-6 6 6"/>',[0,1,0]],['d','Down','<path d="M6 10l6 6 6-6"/>',[0,-1,0]],['f','Forward','<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',[0,0,1]],['b','Back','<circle cx="12" cy="12" r="7"/><path d="M8 8l8 8M16 8l-8 8"/>',[0,0,-1]]];
 for(const [id,l,ic,v] of B){const b=document.createElement('button');b.type='button';b.className='btn np-'+id;b.title='Move '+l.toLowerCase()+' 1 mm (hold to keep going)';b.innerHTML='<svg class="i" viewBox="0 0 24 24">'+ic+'</svg><span>'+l+'</span>';let rt=0,it=0;const go=()=>nudge(v[0],v[1],v[2]);const stop=()=>{clearTimeout(rt);clearInterval(it)};b.addEventListener('pointerdown',e=>{e.preventDefault();go();rt=setTimeout(()=>{it=setInterval(go,70)},380)});for(const ev of['pointerup','pointerleave','pointercancel'])b.addEventListener(ev,stop);b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}});pad.appendChild(b)}
 const cb=document.createElement('button');cb.type='button';cb.className='btn np-c';cb.textContent='Centre left-right';cb.onclick=()=>{const q=partById(sel);if(!q)return;const b=bbox(q.pts);q.pts=q.pts.map(a=>[a[0]-b.cx,a[1]]);commit();requestRender()};pad.appendChild(cb);
 f.appendChild(pad);return f}
function updatePosFields(){const p=sel&&partById(sel);if(!p)return;const b=bbox(p.pts),v={x:b.cx,y:b.cy,z:p.z};
 for(const k in v){const i=document.getElementById('pos-'+k);if(i&&i!==document.activeElement)i.value=String(Math.round(v[k]*10)/10)}
 syncParams()}
updatePosFields();
