/* ---------- core state + geometry helpers (units are millimetres, y up) ---------- */
const $=s=>document.querySelector(s);
const COLORS=['#e5484d','#f76808','#f5c518','#46a758','#12a594','#0091ff','#6e56cf','#e93d82','#8b5a3c','#ece7df','#889096','#1c2024'];
let parts=[],sel=null,tool='select',nid=1,counters={};
const hist={s:[],i:-1};let grooves=[],sculpt=[],sculptVer=0;const snap=()=>JSON.stringify(parts)+(grooves.length||sculpt.length?'\u0001'+JSON.stringify({g:grooves,s:sculpt}):'');
const uid=()=>'p'+(nid++);
const clone=o=>JSON.parse(JSON.stringify(o));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

function dedupe(pts){const o=[];for(const p of pts){const q=o[o.length-1];if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>1e-3)o.push(p)}
 while(o.length>1&&Math.hypot(o[0][0]-o[o.length-1][0],o[0][1]-o[o.length-1][1])<1e-3)o.pop();return o}
function perim(p){let L=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];L+=Math.hypot(b[0]-a[0],b[1]-a[1])}return L}
function area(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1]}return s/2}
function bbox(p){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const q of p){if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1]}
 return{x0,y0,x1,y1,w:x1-x0,h:y1-y0,cx:(x0+x1)/2,cy:(y0+y1)/2}}
function resample(p,n){const m=p.length,cum=[0];for(let i=0;i<m;i++){const a=p[i],b=p[(i+1)%m];cum.push(cum[i]+Math.hypot(b[0]-a[0],b[1]-a[1]))}
 const L=cum[m],out=[];let j=0;for(let k=0;k<n;k++){const t=k*L/n;while(j<m-1&&cum[j+1]<t)j++;const a=p[j],b=p[(j+1)%m],s=cum[j+1]-cum[j],u=s>0?(t-cum[j])/s:0;out.push([a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u])}return out}
function chaikin(p,it){for(let k=0;k<it;k++){const o=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];o.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]])}p=o}return p}
function lap(p,it){for(let k=0;k<it;k++){const n=p.length;p=p.map((a,i)=>{const b=p[(i+n-1)%n],c=p[(i+1)%n];return[(b[0]+2*a[0]+c[0])/4,(b[1]+2*a[1]+c[1])/4]})}return p}
/* Turn a rough freehand stroke into a clean, smooth, closed outline. */
function smoothStroke(raw){let p=dedupe(raw);if(p.length<4)return null;const b=bbox(p),d=Math.hypot(b.w,b.h);if(d<4)return null;
 p=resample(p,clamp(Math.round(perim(p)/(d/45)),24,90));p=lap(p,3);p=chaikin(p,2);p=resample(p,clamp(Math.round(perim(p)/(d/70)),64,120));
 return Math.abs(area(p))<d*d*0.02?null:p}
function fit(p,x0,y0,x1,y1){const b=bbox(p),sx=b.w?(x1-x0)/b.w:1,sy=b.h?(y1-y0)/b.h:1;return p.map(q=>[x0+(q[0]-b.x0)*sx,y0+(q[1]-b.y0)*sy])}
const SHAPES={
 circle:(x0,y0,x1,y1)=>{const n=72,cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2,ry=(y1-y0)/2;return Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return[cx+Math.cos(a)*rx,cy+Math.sin(a)*ry]})},
 box:(x0,y0,x1,y1)=>{const r=Math.min(x1-x0,y1-y0)*.22,o=[];for(const[cx,cy,a0]of[[x1-r,y1-r,0],[x0+r,y1-r,90],[x0+r,y0+r,180],[x1-r,y0+r,270]])for(let k=0;k<=8;k++){const a=(a0+k*90/8)*Math.PI/180;o.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r])}return o},
 star:(x0,y0,x1,y1)=>{const o=[];for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.48:1;o.push([Math.cos(a)*r,Math.sin(a)*r])}return fit(resample(chaikin(o,2),90),x0,y0,x1,y1)},
 heart:(x0,y0,x1,y1)=>{const o=[];for(let i=0;i<96;i++){const t=i/96*Math.PI*2;o.push([16*Math.pow(Math.sin(t),3),13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t)])}return fit(o.reverse(),x0,y0,x1,y1)},
 egg:(x0,y0,x1,y1)=>{const o=[];for(let i=0;i<72;i++){const t=i/72*Math.PI*2;o.push([Math.cos(t)*(1-.2*Math.sin(t)),Math.sin(t)])}return fit(o,x0,y0,x1,y1)},
 capsule:(x0,y0,x1,y1)=>{const r=Math.min(x1-x0,y1-y0)/2,o=[];for(const[cx,cy,a0]of[[x1-r,y1-r,0],[x0+r,y1-r,90],[x0+r,y0+r,180],[x1-r,y0+r,270]])for(let k=0;k<=12;k++){const a=(a0+k*90/12)*Math.PI/180;o.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r])}return o},
 triangle:(x0,y0,x1,y1)=>fit(resample(chaikin([[0,1],[-1,-1],[1,-1]],4),90),x0,y0,x1,y1),
 drop:(x0,y0,x1,y1)=>{const o=[];for(let i=0;i<80;i++){const t=i/80*Math.PI*2;o.push([Math.sin(t)*Math.pow(Math.sin(t/2),1.4),Math.cos(t)])}let A=0;for(let i=0;i<o.length;i++){const p=o[i],q=o[(i+1)%o.length];A+=p[0]*q[1]-q[0]*p[1]}if(A<0)o.reverse();return fit(o,x0,y0,x1,y1)},
 moon:(x0,y0,x1,y1)=>{const o=[],d=.5,r1=.85,xi=(1-r1*r1+d*d)/(2*d),al=Math.atan2(Math.sqrt(1-xi*xi),xi);for(let i=0;i<=40;i++){const a=al+(2*Math.PI-2*al)*i/40;o.push([Math.cos(a),Math.sin(a)])}const b0=Math.atan2(-Math.sqrt(1-xi*xi),xi-d)+2*Math.PI,b1=Math.atan2(Math.sqrt(1-xi*xi),xi-d);for(let i=1;i<40;i++){const a=b0+(b1-b0)*i/40;o.push([d+r1*Math.cos(a),r1*Math.sin(a)])}return fit(o,x0,y0,x1,y1)}
};
const KIND={circle:'Circle',box:'Box',star:'Star',heart:'Heart',egg:'Egg',capsule:'Capsule',triangle:'Triangle',drop:'Drop',moon:'Moon',draw:'Drawing',limb:'Limb',eyes:'Eye',smile:'Smile'};
function frontOf(p){return p.z+p.depth/2}
function drawOrder(){return parts.slice().sort((a,b)=>frontOf(a)-frontOf(b))}
function partById(id){return parts.find(p=>p.id===id)}
/* New parts sit just in front of whatever they overlap so faces never fight. */
function autoZ(pts,depth){const b=bbox(pts);let any=false;for(const p of parts){if(p.cut)continue;const q=bbox(p.pts);if(q.x0<b.x1&&q.x1>b.x0&&q.y0<b.y1&&q.y1>b.y0){any=true;break}}
 if(!any)return 0;let lo=null,sum=0,cnt=0;
 try{const N=6;for(let i=0;i<=N;i++)for(let k=0;k<=N;k++){const x=b.x0+(b.x1-b.x0)*(i+.5)/(N+1),y=b.y0+(b.y1-b.y0)*(k+.5)/(N+1);if(!inPoly([x,y],pts))continue;let top=null;for(const p of parts){const v=surfZ(p,x,y);if(v!==null&&(top===null||v>top))top=v}if(top!==null){sum+=top;cnt++;if(lo===null||top<lo)lo=top}}}catch(e){lo=null}
 if(lo===null){let f=null;for(const p of parts){if(p.cut)continue;const q=bbox(p.pts);if(q.x0<b.x1&&q.x1>b.x0&&q.y0<b.y1&&q.y1>b.y0){const v=frontOf(p);if(f===null||v>f)f=v}}return f===null?0:f-2+depth/2}
 return Math.round(((lo+sum/cnt)/2-2+depth/2)*10)/10}
function addPart(pts,kind,o={}){const ck=o.cut?'hole':kind,n=counters[ck]=(counters[ck]||0)+1,depth=o.depth??16;
 const p={id:uid(),name:(o.cut?'Hole':KIND[kind])+' '+n,cut:!!o.cut,pts,color:o.color||COLORS[parts.length%COLORS.length],depth,round:o.round??.7,z:o.z??autoZ(pts,depth),blend:o.blend??0};
 parts.push(p);return p}
/* ---------- history, persistence, change plumbing ---------- */
function persist(){const sn=document.getElementById('saveNote');if(sn)sn.textContent='✓ Saved';try{localStorage.setItem('sketch3d.v2',JSON.stringify({meltv:2,parts,grooves,sculpt,nid,counters,autoFix,blendOn,symOn,limits,melt20:1}))}catch(e){}}
function commit(){clampSel();applySym();hist.s.length=hist.i+1;hist.s.push(snap());if(hist.s.length>80)hist.s.shift();hist.i=hist.s.length-1;persist();refreshUI()}
function restore(){const S=hist.s[hist.i].split('\u0001');parts=JSON.parse(S[0]);{const o=S[1]?JSON.parse(S[1]):null;if(Array.isArray(o)){grooves=o;sculpt=[]}else{grooves=(o&&o.g)||[];sculpt=(o&&o.s)||[]}sculptVer++}if(!partById(sel))sel=null;persist();refreshUI()}
function undo(){if(typeof flushNudge==='function')flushNudge();if(hist.i>0){hist.i--;restore()}}
function redo(){if(hist.i<hist.s.length-1){hist.i++;restore()}}
let rq=0,dirty2=true,dirty3=true;
let wsReady=false;function saveWS(){if(!wsReady)return;try{localStorage.setItem('sketch3d.ws',JSON.stringify({tool,view:view2d,side:sideTool,paint:paintColor,opt:sideOptOpen}))}catch(e){}}
function requestRender(a=true,b=true){dirty2=dirty2||a;dirty3=dirty3||b;if(!rq)rq=requestAnimationFrame(frame)}
let lastSync=0,syncGap=110;
function frame(){rq=0;if(!dirty2&&!dirty3){try{render3d()}catch(e){}return}clampSel();applySym();if(dirty2){dirty2=false;try{draw2d()}catch(e){console.error(e)}}if(dirty3){if(typeof LOWPERF!=='undefined'&&LOWPERF&&performance.now()-lastSync<syncGap){rq=requestAnimationFrame(frame);try{render3d()}catch(e){}return}dirty3=false;lastSync=performance.now();try{sync3d()}catch(e){console.error(e)}}try{updatePosFields()}catch(e){}render3d()}
let msel=new Set(),mbase=null,multiOn=false,msTip=false;
function selIds(){if(msel.size&&mbase!==sel)msel.clear();const a=sel?[sel]:[];for(const i of msel)if(i!==sel&&partById(i))a.push(i);return a}
function toggleSel(id){if(!id)return;selIds();if(!sel){sel=id;msel.clear()}else if(id===sel){const n=[...msel].find(i=>partById(i));if(n)msel.delete(n);sel=n||null}else if(msel.has(id))msel.delete(id);else msel.add(id);mbase=sel;const c=selIds().length;if(c>1&&!msTip){msTip=true;toast('Picked '+c+' parts. Move, copy, colour or delete them together.')}refreshUI();requestRender()}
function hlSel(){const a=selIds();return a.length>1?new Set(a):sel}
function select(id){sel=id;msel.clear();mbase=sel;refreshUI();requestRender()}
let toastT=0;
function toast(m,label,fn){const t=$('#toast');t.textContent=m;if(label){const b=document.createElement('button');b.type='button';b.className='tact';b.textContent=label;b.onclick=()=>{t.hidden=true;fn()};t.appendChild(b)}t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,label?6500:3200)}
