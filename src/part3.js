/* ---------- 2D sketch editor ---------- */
const cv=$('#c2d'),cx=cv.getContext('2d');
let view2d='front',touchMode=false,cw=300,ch=300,dpr=1,V={s:4,ox:150,oy:150},hover=null,drag=null,spaceDown=false,snapOn=true,keepTool=false,fitted=false;
const ptrs=new Map();
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ICON={
 select:'<path d="M5 3l14 7-6 2-2 6z"/>',draw:'<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
 circle:'<circle cx="12" cy="12" r="8"/>',box:'<rect x="4" y="5" width="16" height="14" rx="4"/>',
 star:'<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.7 1.1-6.1L3.2 9.4l6.1-.8z"/>',
 egg:'<path d="M12 3c4 0 7 6 7 11a7 7 0 01-14 0c0-5 3-11 7-11z"/>',
 capsule:'<rect x="3" y="8" width="18" height="8" rx="4"/>',
 triangle:'<path d="M12 4l9 15H3z" stroke-linejoin="round"/>',
 drop:'<path d="M12 3c3 4 6 8 6 12a6 6 0 01-12 0c0-4 3-8 6-12z"/>',
 moon:'<path d="M16 4a8 8 0 100 16 6 6 0 010-16z"/>',
 erase:'<path d="M7 20h12M5 15l8-9 6 6-6 6H8z"/><path d="M10 11l6 6"/>',
 eyes:'<circle cx="7.5" cy="12" r="3.5"/><circle cx="16.5" cy="12" r="3.5"/><circle cx="7.5" cy="12" r="1"/><circle cx="16.5" cy="12" r="1"/>',
 smile:'<path d="M4 10c1 6 5 8 8 8s7-2 8-8"/>',crease:'<path d="M3 8c4 0 5 8 9 8s5-8 9-8"/><path d="M4 19h16" opacity=".4"/>',
 heart:'<path d="M12 20s-7-4.4-8.5-9A4.6 4.6 0 0112 7a4.6 4.6 0 018.5 4c-1.5 4.6-8.5 9-8.5 9z"/>',
 fill:'<path d="M5 11l7-7 7 7-7 7z"/><path d="M19 14c1.5 2 2 3 2 4a2 2 0 01-4 0c0-1 .5-2 2-4z"/>',
 limb:'<path d="M4 19c7 0 3-9 9-9s3 5 7 3"/><circle cx="4" cy="19" r="1.6"/>',
 holeC:'<circle cx="12" cy="12" r="7.5" stroke-dasharray="3 3"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
 holeB:'<rect x="3.5" y="8" width="17" height="8" rx="4" stroke-dasharray="3 3"/><path d="M10 10.5l4 3M14 10.5l-4 3"/>'};
const HOLE={holeC:'circle',holeB:'box'};
const TCOL={select:'#2563eb',draw:'#ea580c',limb:'#0d9488',circle:'#db2777',box:'#7c3aed',star:'#d97706',heart:'#dc2626',egg:'#ca8a04',capsule:'#0d9488',triangle:'#7c3aed',drop:'#0891b2',moon:'#6366f1',holeC:'#475569',holeB:'#475569',fill:'#0891b2',erase:'#dc2626',eyes:'#1f2937',smile:'#e11d48',crease:'#0f766e',edit:'#2563eb',flat:'#475569',round:'#db2777',belly:'#16a34a',waist:'#0d9488',back:'#7c3aed',fwd:'#4f46e5',point:'#d97706'};
const TOOLS=[['select','Select','V'],['erase','Remove','Q'],['sep'],['draw','Draw','P'],['limb','Tail/arm','L'],['eyes','Eyes','Y'],['smile','Smile','J'],['crease','Crease','G'],['sep'],['circle','Circle','C'],['box','Box','R'],['star','Star','S'],['heart','Heart','H'],['egg','Egg','E'],['capsule','Capsule','K'],['triangle','Triangle','T'],['drop','Drop','D'],['moon','Moon','M'],['sep'],['holeC','Hole','O'],['holeB','Slot','X']];
const HINTS={select:'Tap a shape to pick it. Drag it to move it. Hold Shift (or tap Multi) to pick several.',
 draw:'Draw a loop with your finger or mouse. It closes and smooths itself!',
 circle:'Drag to make a circle, or just tap to drop one.',box:'Drag to make a box, or just tap to drop one.',
 star:'Drag to make a star, or just tap to drop one.',erase:'Tap a part to remove it. You can always undo.',eyes:'Tap to add an eye. With Mirror on, the other eye appears too.',smile:'Tap to add a smile.',heart:'Drag to make a heart, or just tap to drop one.',egg:'Drag to make an egg shape. Great for heads and tummies.',capsule:'Drag to make a capsule. Great for arms, legs and tails.',triangle:'Drag to make a triangle. Great for ears, horns and hats.',drop:'Drag to make a drop. Great for ears, tails and tears.',moon:'Drag to make a crescent. Great for smiles, horns and eyebrows.',
 crease:'Drag to carve a groove into the surface. Undo takes it back. With Remove, tap a groove to delete it.',limb:'Drag a line for a tail or arm. Then change its widths and bend!',
 reshape:'Drag any edge to bend it smoothly. Pull it in or out.',fill:'Tap a part to paint it. Pick a colour with the dot below the tools.',
 holeC:'Drag to cut a round hole right through your toy.',holeB:'Drag to cut a slot right through your toy.'};
const TGROUPS=['Edit','Create','Shapes','Cut away'];
function buildTools(){const n=$('#tools');n.innerHTML='';let g=null,gi=-1;const open=()=>{gi++;g=document.createElement('div');g.className='tgroup g'+gi;const l=document.createElement('div');l.className='tg-l';l.textContent=TGROUPS[gi]||'';g.appendChild(l);n.appendChild(g)};open();
 for(const t of TOOLS){if(t[0]==='sep'){open();continue}
 const b=document.createElement('button');b.type='button';b.className='tool';b.dataset.t=t[0];b.title=t[1]+' ('+t[2]+')';b.setAttribute('aria-pressed','false');
 b.style.setProperty('--tc',TCOL[t[0]]||'');b.innerHTML='<svg class="i" viewBox="0 0 24 24">'+ICON[t[0]]+'</svg>'+t[1]+'<kbd>'+t[2]+'</kbd>';b.onclick=()=>setTool(t[0]);g.appendChild(b)}
 {const g0=n.querySelector('.tgroup.g0');if(g0){const b=document.createElement('button');b.type='button';b.className='tool';b.id='reshapeFront';b.title='Reshape: drag any edge to bend it smoothly';b.style.setProperty('--tc','#2563eb');b.innerHTML='<svg class="i" viewBox="0 0 24 24"><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="16" r="2.5"/><path d="M10 10l4 4"/></svg>Reshape';b.dataset.t='reshape';b.onclick=()=>setTool('reshape');g0.appendChild(b);for(const [id,l,k,ic] of [['railScale','Size','scale','<rect x="4" y="12" width="8" height="8" rx="1"/><path d="M14 4h6v6M20 4l-7 7"/>'],['railRot','Turn','rotate','<path d="M20 12a8 8 0 11-3-6.2"/><path d="M20 4v5h-5"/>']]){const t=document.createElement('button');t.type='button';t.className='tool';t.id=id;t.setAttribute('aria-pressed','false');t.title=l==='Size'?'Size: make the part bigger or smaller':'Turn: spin, turn or tilt the part';t.style.setProperty('--tc','#2563eb');t.innerHTML='<svg class="i" viewBox="0 0 24 24">'+ic+'</svg>'+l;g0.appendChild(t)}}}
 const fb=$('#fillTool');if(fb){fb.innerHTML='<svg class="i" viewBox="0 0 24 24">'+ICON.fill+'</svg>Fill';fb.style.setProperty('--tc',TCOL.fill);fb.onclick=()=>setTool('fill')}}
function setTool(t){{const ap=document.getElementById('app');if(ap&&ap.dataset.mode==='view'&&!['select','erase','fill'].includes(t)&&typeof setMode==='function')setMode('draw')}if(typeof view2d!=='undefined'&&view2d==='side'&&typeof sideRouteTool==='function'&&sideRouteTool(t))return;tool=t;drag=null;try{sideOptsVis()}catch(e){}saveWS();document.querySelectorAll('#rail .tool').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===t?'true':'false'));
 $('#hint2d').textContent=HINTS[t];cv.style.cursor=t==='select'?'default':'crosshair';requestRender(true,false)}
function size2d(){const r=$('#s2d').getBoundingClientRect();if(r.width<2||r.height<2)return;cw=r.width;ch=r.height;dpr=(typeof LOWPERF!=='undefined'&&LOWPERF)?1:Math.min(window.devicePixelRatio||1,2);
 for(const c of[cv,$('#cSide')]){c.width=Math.round(cw*dpr);c.height=Math.round(ch*dpr)}if(!fitted){fitted=true;fit2d()}requestRender(true,false)}
const fitScale=()=>Math.min(cw/(limits.w*1.12),ch/(limits.h*1.12));
function fit2d(){V.s=fitScale();V.ox=cw/2;V.oy=ch/2+limits.h/2*V.s;Vs.ox=cw/2;requestRender(true,false)}
/* the view can never drift away from the build area */
function clampView(){const fs=fitScale();V.s=clamp(V.s,fs*.6,fs*6);const cxs=V.ox,cys=V.oy-limits.h/2*V.s;V.ox+=clamp(cxs,cw*.15,cw*.85)-cxs;V.oy+=clamp(cys,ch*.15,ch*.85)-cys;Vs.ox=clamp(Vs.ox,cw*.15,cw*.85)}
function zoomAt(f,px,py){const fs=fitScale(),s=clamp(V.s*f,fs*.6,fs*6),wx=(px-V.ox)/V.s,wy=(V.oy-py)/V.s,wz=(Vs.ox-px)/V.s;V.s=s;V.ox=px-wx*s;V.oy=py+wy*s;Vs.ox=px+wz*s;requestRender(true,false)}
const toW=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left-V.ox)/V.s,-(e.clientY-r.top-V.oy)/V.s]};
const sn=w=>snapOn?[Math.round(w[0]),Math.round(w[1])]:w;
function inPoly(p,pts){let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
/* ----- the real 3D shape, seen from the front and the side (after sculpting, turning and rounding) ----- */
let ghost=null,ghostFor=null,ghostT=0,ghostTm=0;
function ghostBuild(){const M=curM;if(!M||!M.idx||!M.idx.length){ghost=null;ghostFor=null;return null}
 if(ghost&&ghostFor===M)return ghost;
 const now=performance.now();if(ghost&&now-ghostT<380){if(!ghostTm)ghostTm=setTimeout(()=>{ghostTm=0;requestRender(true,false)},400);return ghost}
 const P=M.pos,I=M.idx,PX=(typeof LOWPERF!=='undefined'&&LOWPERF)?3:4.5,x0=-(limits.w+24)/2,z0=-(limits.d+24)/2,y0=-4,y1=limits.h+8;
 const tri=(wmm,fu)=>{const c=document.createElement('canvas');c.width=Math.ceil(wmm*PX);c.height=Math.ceil((y1-y0)*PX);const g=c.getContext('2d');g.fillStyle='#000';g.beginPath();
  for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,d=I[t+2]*3;let ax=fu(P[a],P[a+2])*PX,ay=(y1-P[a+1])*PX,bx=fu(P[b],P[b+2])*PX,by=(y1-P[b+1])*PX,dx=fu(P[d],P[d+2])*PX,dy=(y1-P[d+1])*PX;
   if((bx-ax)*(dy-ay)-(by-ay)*(dx-ax)<0){const tx=bx,ty=by;bx=dx;by=dy;dx=tx;dy=ty}g.moveTo(ax,ay);g.lineTo(bx,by);g.lineTo(dx,dy);g.closePath()}
  g.fill();const w=c.width,h=c.height,im=g.getImageData(0,0,w,h),A=im.data,o=g.createImageData(w,h),O=o.data;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4+3;if(A[i]>127&&(A[i-4]<128||A[i+4]<128||A[i-w*4]<128||A[i+w*4]<128)){const j=i-3;O[j]=214;O[j+1]=51;O[j+2]=108;O[j+3]=255}}
  const e=document.createElement('canvas');e.width=w;e.height=h;e.getContext('2d').putImageData(o,0,0);return e};
 ghost={front:{c:tri(limits.w+24,(x,z)=>x-x0),x0,x1:-x0,y0,y1},side:{c:tri(limits.d+24,(x,z)=>z-z0),z0,z1:-z0,y0,y1}};ghostFor=M;ghostT=now;return ghost}
function ghostDraw(x,view){const G=ghostBuild();if(!G)return;const g=G[view];x.save();x.globalAlpha=.85;x.imageSmoothingEnabled=true;try{x.imageSmoothingQuality='high'}catch(e){}
 if(view==='front'){x.translate(V.ox+g.x0*V.s,V.oy-g.y1*V.s);x.scale(V.s*(g.x1-g.x0)/g.c.width,V.s*(g.y1-g.y0)/g.c.height)}
 else{const xa=zToX(g.z0),xb=zToX(g.z1),yt=yToS(g.y1),yb=yToS(g.y0);x.translate(xa,yt);x.scale((xb-xa)/g.c.width,(yb-yt)/g.c.height)}
 x.drawImage(g.c,0,0);x.restore();
 x.save();x.font='600 11px DM Sans,system-ui,sans-serif';x.textBaseline='middle';x.lineJoin='round';x.lineWidth=3;x.strokeStyle='rgba(255,255,255,.85)';x.fillStyle='#d6336c';x.beginPath();x.arc(14,76,4,0,7);x.fill();const tx='Pink line = the real 3D shape';x.strokeText(tx,24,76);x.fillStyle=css('--ink')||'#222';x.fillText(tx,24,76);x.restore()}
/* front-view stacking: a small part sitting on a bigger part's surface (eyes on a face) draws on top of it */
function drawOrder2D(){const L=parts.slice(),key=new Map();for(const p of L){let k=frontOf(p);if(!p.cut){const b=bbox(p.pts);for(const q of L){if(q===p||q.cut)continue;const fq=frontOf(q);if(fq<=k)continue;const bq=bbox(q.pts);if(b.w*b.h>=bq.w*bq.h||b.cx<bq.x0||b.cx>bq.x1||b.cy<bq.y0||b.cy>bq.y1)continue;let s=null;try{s=surfZ(q,b.cx,b.cy)}catch(e){}if(s!==null&&frontOf(p)>=s-1)k=Math.max(k,fq+.01)}}key.set(p,k)}return L.sort((a,b)=>key.get(a)-key.get(b))}
function hitsAt(w){const o=drawOrder2D(),r=[];for(let i=o.length-1;i>=0;i--)if(inPoly(w,o[i].pts))r.push(o[i].id);return r}
function hitPart(w){return hitsAt(w)[0]||null}
let cycTip=false;function cycleNext(list){const i=list.indexOf(sel);const id=list[(i+1)%list.length];select(id);const p=partById(id);if(!cycTip){cycTip=true;toast('Picked '+(p?p.name:'the part')+' underneath. Tap again to keep going.')}else if(p)toast('Picked '+p.name)}
function handles(){const p=sel&&partById(sel);if(!p||tool==='reshape'||selIds().length>1)return[];const b=bbox(p.pts),l=V.ox+b.x0*V.s,r=V.ox+b.x1*V.s,t=V.oy-b.y1*V.s,bt=V.oy-b.y0*V.s,out=[];
 for(const hy of[1,0,-1])for(const hx of[-1,0,1]){if(!hx&&!hy)continue;out.push({hx,hy,x:hx<0?l:hx>0?r:(l+r)/2,y:hy>0?t:hy<0?bt:(t+bt)/2})}
 out.push({rot:true,hx:0,hy:0,x:r+(touchMode?34:26),y:t-(touchMode?34:26)});return out}
let reshHover=null;
function outlineNear(p,w){let bi=-1,bd=1e9;for(let i=0;i<p.pts.length;i++){const d=Math.hypot(p.pts[i][0]-w[0],p.pts[i][1]-w[1]);if(d<bd){bd=d;bi=i}}
 const n=p.pts.length;for(let i=0;i<n;i++){const a=p.pts[i],b=p.pts[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy||1,u=clamp(((w[0]-a[0])*dx+(w[1]-a[1])*dy)/L,0,1),d=Math.hypot(a[0]+u*dx-w[0],a[1]+u*dy-w[1]);if(d<bd-.001){bd=d;bi=u<.5?i:(i+1)%n}}
 return{i:bi,d:bd}}
function reshapeTarget(w){const rr=(touchMode?26:16)/V.s;let p=sel&&partById(sel);if(p&&!p.cut||p&&p.cut){const o=outlineNear(p,w);if(o.d<rr)return{p,i:o.i}}
 const id=hitPart(w);if(id){const q=partById(id),o=outlineNear(q,w);return{p:q,i:o.i}}return null}
function reshapeDrag(d,w,k){const n=d.orig.length,C=d.cum,Lt=C[n],sf=(typeof sideBrush==='number'?sideBrush/45:1)*(typeof sideShowDots!=='undefined'&&sideShowDots?.3:1),R0=clamp(Lt*.2*sf,sideShowDots?3:5,60*Math.max(1,sf)),dx=w[0]-d.w0[0],dy=w[1]-d.w0[1];
 const si=C[d.i];const out=[];for(let j=0;j<n;j++){let s=Math.abs(C[j]-si);s=Math.min(s,Lt-s);const x=s/R0,wt=x>=2?0:Math.exp(-x*x*1.2)*(1-x/2>0?1:0);out.push([d.orig[j][0]+dx*wt,d.orig[j][1]+dy*wt])}return out}
function hitHandle(e){const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let best=null,bd=touchMode?28:12;for(const h of handles()){const d=Math.hypot(h.x-x,h.y-y);if(d<bd){bd=d;best=h}}return best}
/* ----- drawing ----- */
function draw2d(){if(view2d==='side'){drawSide();return}clampView();const x=cx,T={cv:css('--cv'),gm:css('--gridm'),gM:css('--gridM'),ax:css('--axis'),ac:css('--accent'),ink:css('--ink'),mute:css('--mute'),pn:css('--panel')};
 x.setTransform(dpr,0,0,dpr,0,0);x.fillStyle=T.cv;x.fillRect(0,0,cw,ch);
 const mn=[1,2,5,10,20,50,100].find(s=>s*V.s>=12)||100,mj=mn*5,wx0=-V.ox/V.s,wx1=(cw-V.ox)/V.s,wy1=V.oy/V.s,wy0=(V.oy-ch)/V.s;
 const gl=(st,col)=>{x.strokeStyle=col;x.lineWidth=1;x.beginPath();for(let g=Math.ceil(wx0/st)*st;g<=wx1;g+=st){const sx=Math.round(V.ox+g*V.s)+.5;x.moveTo(sx,0);x.lineTo(sx,ch)}
  for(let g=Math.ceil(wy0/st)*st;g<=wy1;g+=st){const sy=Math.round(V.oy-g*V.s)+.5;x.moveTo(0,sy);x.lineTo(cw,sy)}x.stroke()};
 gl(mn,T.gm);gl(mj,T.gM);
 {const ax0=V.ox-limits.w/2*V.s,ay0=V.oy-limits.h*V.s,aw=limits.w*V.s,ah=limits.h*V.s;x.save();x.fillStyle='rgba(80,50,170,.10)';x.beginPath();x.rect(0,0,cw,ch);x.rect(ax0,ay0,aw,ah);x.fill('evenodd');x.restore();
  x.strokeStyle=T.ac;x.lineWidth=2;x.setLineDash([8,6]);x.strokeRect(ax0,ay0,aw,ah);x.setLineDash([]);x.fillStyle=T.ac;x.font='600 11px DM Sans,system-ui,sans-serif';x.textBaseline='bottom';x.fillText('Build area '+limits.w+' × '+limits.h+' mm',ax0+6,ay0-4);
  x.strokeStyle=T.ink;x.globalAlpha=.5;x.lineWidth=3;x.beginPath();x.moveTo(ax0,ay0+ah);x.lineTo(ax0+aw,ay0+ah);x.stroke();x.globalAlpha=1}
 x.strokeStyle=T.ax;x.lineWidth=1.5;x.setLineDash([6,5]);x.beginPath();x.moveTo(V.ox,0);x.lineTo(V.ox,ch);x.stroke();x.setLineDash([]);
 x.fillStyle=T.mute;x.font='11px DM Sans,system-ui,sans-serif';x.textBaseline='top';x.fillText('centre line (mirror)',V.ox+6,6);
 const path=pts=>{x.beginPath();pts.forEach((q,i)=>{const sx=V.ox+q[0]*V.s,sy=V.oy-q[1]*V.s;i?x.lineTo(sx,sy):x.moveTo(sx,sy)});x.closePath()};
 x.lineJoin='round';drawRef(x,'front','under');const SL=silGet('front');if(SL)drawSil(x,SL,V.ox);
 const ORD=drawOrder2D();for(const p of ORD){if(SL&&!p.cut){if(p.id===hover&&p.id!==sel){path(p.pts);x.strokeStyle=T.ac;x.lineWidth=2;x.stroke()}continue}path(p.pts);if(p.cut){x.fillStyle='rgba(229,72,77,.2)';x.fill();x.setLineDash([6,4]);x.lineWidth=2;x.strokeStyle='#e5484d';x.stroke();x.setLineDash([])}else{x.fillStyle=p.color;x.globalAlpha=.94;x.fill();x.globalAlpha=1;x.lineWidth=1.5;x.strokeStyle='rgba(0,0,0,.42)';x.stroke()}
  if(p.id===hover&&p.id!==sel){x.strokeStyle=T.ac;x.lineWidth=2;x.stroke()}}
 if(!SL){x.save();x.lineWidth=1.3;x.strokeStyle='rgba(29,27,58,.6)';for(const p of ORD){if(p.cut||p.id===sel)continue;path(p.pts);x.stroke()}x.restore()}
 drawRef(x,'front','over');
 if(grooves.length){x.save();x.lineCap='round';x.lineJoin='round';x.strokeStyle='rgba(15,118,110,.9)';x.lineWidth=Math.max(2,3.6*V.s);x.globalAlpha=.55;for(const g of grooves){for(const sg of (g.sym?[1,-1]:[1])){x.beginPath();g.pts.forEach((q,i)=>{const sx=V.ox+q[0]*sg*V.s,sy=V.oy-q[1]*V.s;i?x.lineTo(sx,sy):x.moveTo(sx,sy)});x.stroke()}}x.restore()}
 ghostDraw(x,'front');
 const sp=sel&&partById(sel);
 if(sp){if(symOn&&sp.twin){const tw=partById(sp.twin);if(tw){path(tw.pts);x.strokeStyle=T.ac;x.lineWidth=1.5;x.setLineDash([3,4]);x.stroke();x.setLineDash([])}}path(sp.pts);x.strokeStyle=T.ac;x.lineWidth=2.5;x.stroke();const b=bbox(sp.pts),l=V.ox+b.x0*V.s,t=V.oy-b.y1*V.s,w=b.w*V.s,h=b.h*V.s;
  x.strokeStyle=T.ac;x.lineWidth=1;x.setLineDash([4,4]);x.strokeRect(l+.5,t+.5,w,h);x.setLineDash([]);
  if(tool==='reshape'&&reshHover){const hx=V.ox+reshHover[0]*V.s,hy=V.oy-reshHover[1]*V.s;x.beginPath();x.arc(hx,hy,12,0,7);x.fillStyle='rgba(29,95,191,.18)';x.fill();x.strokeStyle=T.ac;x.lineWidth=3;x.stroke()}
  if(tool==='reshape'&&sideShowDots){for(const q of sp.pts){x.beginPath();x.arc(V.ox+q[0]*V.s,V.oy-q[1]*V.s,touchMode?7:4.5,0,7);x.fillStyle=T.pn;x.fill();x.strokeStyle=T.ac;x.lineWidth=2;x.stroke()}}
  for(const hd of handles()){if(hd.rot){x.strokeStyle=T.ac;x.lineWidth=1.5;x.beginPath();x.moveTo(l+w,t);x.lineTo(hd.x,hd.y);x.stroke();const R0=touchMode?17:13;x.beginPath();x.arc(hd.x,hd.y,R0,0,7);x.fillStyle=T.pn;x.fill();x.lineWidth=2;x.stroke();x.beginPath();x.arc(hd.x,hd.y,R0*.52,-2.4,1.9);x.stroke();const ax=hd.x+R0*.52*Math.cos(1.9),ay=hd.y+R0*.52*Math.sin(1.9);x.beginPath();x.moveTo(ax+4,ay-4);x.lineTo(ax,ay);x.lineTo(ax-5,ay-3);x.stroke();continue}x.fillStyle=T.pn;x.strokeStyle=T.ac;x.lineWidth=2;const hs=touchMode?10:5;x.fillRect(hd.x-hs,hd.y-hs,hs*2,hs*2);x.strokeRect(hd.x-hs,hd.y-hs,hs*2,hs*2)}
  label(x,T,b.w.toFixed(1)+' × '+b.h.toFixed(1)+' mm',l+w/2,t+h+10);for(const c of crossings(sp.pts)){x.beginPath();x.arc(V.ox+c[0]*V.s,V.oy-c[1]*V.s,6,0,7);x.fillStyle='#e03131';x.fill();x.strokeStyle='#fff';x.lineWidth=2;x.stroke()}}
 {const mi=selIds();if(mi.length>1){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const i of mi){const q=partById(i);if(!q)continue;if(i!==sel){path(q.pts);x.strokeStyle=T.ac;x.lineWidth=2.5;x.stroke()}const b=bbox(q.pts);x0=Math.min(x0,b.x0);x1=Math.max(x1,b.x1);y0=Math.min(y0,b.y0);y1=Math.max(y1,b.y1)}x.strokeStyle=T.ac;x.lineWidth=1;x.setLineDash([4,4]);x.strokeRect(V.ox+x0*V.s+.5,V.oy-y1*V.s+.5,(x1-x0)*V.s,(y1-y0)*V.s);x.setLineDash([]);label(x,T,mi.length+' parts selected',V.ox+(x0+x1)/2*V.s,V.oy-y0*V.s+10)}}
 if(drag&&drag.type==='shape'&&drag.pts){path(drag.pts);x.fillStyle=T.ac;x.globalAlpha=.22;x.fill();x.globalAlpha=1;x.strokeStyle=T.ac;x.lineWidth=2;x.stroke();
  const b=bbox(drag.pts);label(x,T,b.w.toFixed(1)+' × '+b.h.toFixed(1)+' mm',V.ox+b.cx*V.s,V.oy-b.y0*V.s+10)}
 if(drag&&(drag.type==='draw'||drag.type==='limb'||drag.type==='crease')&&drag.pts.length>1){x.beginPath();drag.pts.forEach((q,i)=>{const sx=V.ox+q[0]*V.s,sy=V.oy-q[1]*V.s;i?x.lineTo(sx,sy):x.moveTo(sx,sy)});x.strokeStyle=T.ac;x.lineWidth=3;x.lineCap='round';x.stroke();x.lineCap='butt'}
 drawRefHandles(x,'front');const bl=mj*V.s;x.strokeStyle=T.ink;x.lineWidth=2;x.beginPath();x.moveTo(SBX,ch-16);x.lineTo(SBX+bl,ch-16);x.moveTo(SBX,ch-20);x.lineTo(SBX,ch-12);x.moveTo(SBX+bl,ch-20);x.lineTo(SBX+bl,ch-12);x.stroke();
 x.fillStyle=T.ink;x.textBaseline='bottom';x.fillText(mj+' mm',SBX,ch-22)}
function label(x,T,txt,cx0,y){x.font='600 11px DM Sans,system-ui,sans-serif';x.textBaseline='middle';const w=x.measureText(txt).width+12,l=clamp(cx0-w/2,4,cw-w-4),t=clamp(y,4,ch-26);
 x.fillStyle=T.ink;x.globalAlpha=.88;x.beginPath();x.roundRect?x.roundRect(l,t,w,20,6):x.rect(l,t,w,20);x.fill();x.globalAlpha=1;x.fillStyle=css('--bg');x.fillText(txt,l+6,t+10)}
/* ----- pointer interaction ----- */
function startPinch(){if(drag&&drag.type==='move'){const p=partById(drag.id);if(p)p.pts=drag.orig}else if(drag&&drag.type==='scale'){const p=partById(drag.id);if(p)p.pts=drag.orig}
 const a=[...ptrs.values()];drag={type:'pinch',d0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,c0:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},s0:V.s,ox0:V.ox,oy0:V.oy};requestRender()}
function movePinch(){const a=[...ptrs.values()],r=cv.getBoundingClientRect(),d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),c={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},k=drag,s=clamp(k.s0*d/k.d0,fitScale()*.6,fitScale()*6),
 wx=(k.c0.x-r.left-k.ox0)/k.s0,wy=-(k.c0.y-r.top-k.oy0)/k.s0;V.s=s;V.ox=c.x-r.left-wx*s;V.oy=c.y-r.top+wy*s;requestRender(true,false)}
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(ptrs.size===2){startPinch();return}if(ptrs.size>2)return;
 const w=toW(e),pan={type:'pan',sx:e.clientX,sy:e.clientY,ox:V.ox,oy:V.oy};
 if(e.button===1||spaceDown||(e.button===0&&e.altKey)){drag=pan;cv.style.cursor='grabbing';return}if(e.button!==0)return;
 if(tool==='reshape'){const tg=reshapeTarget(w);if(!tg){select(null);return}const p=tg.p;if(p.id!==sel)select(p.id);if(p.pts.length<90){const keep=p.pts[tg.i];p.pts=resample(p.pts,96);let bi=0,bd=1e9;p.pts.forEach((q,i)=>{const d=Math.hypot(q[0]-keep[0],q[1]-keep[1]);if(d<bd){bd=d;bi=i}});tg.i=bi}
  const orig=clone(p.pts),C=[0];for(let j=0;j<orig.length;j++){const a=orig[j],b=orig[(j+1)%orig.length];C.push(C[j]+Math.hypot(b[0]-a[0],b[1]-a[1]))}
  drag={type:'reshape',id:p.id,orig,cum:C,i:tg.i,w0:w,changed:false};return}
 if(tool==='select'){const h=sel&&hitHandle(e);
  if(h&&h.rot){const p=partById(sel),b=bbox(p.pts),c=[b.cx,b.cy];drag={type:'rotate',id:sel,orig:clone(p.pts),c,a0:Math.atan2(w[1]-c[1],w[0]-c[0]),changed:false};return}
  if(h){const p=partById(sel);drag={type:'scale',h,orig:clone(p.pts),b:bbox(p.pts),id:sel,changed:false};return}
  const hs=hitsAt(w),ms=selIds(),grp=a=>a.map(i=>({id:i,orig:clone(partById(i).pts)}));
  if((e.shiftKey||multiOn)&&hs[0]){const was=ms.includes(hs[0]);toggleSel(hs[0]);if(!was)drag={type:'move',id:hs[0],group:grp(selIds()),w0:w,sx:e.clientX,sy:e.clientY,moved:false};return}
  {const gi=ms.length>1?hs.find(i=>ms.includes(i)):null;if(gi){drag={type:'move',id:gi,group:grp(ms),w0:w,sx:e.clientX,sy:e.clientY,moved:false};return}}
  const keep=!!sel&&hs.includes(sel),id=keep?sel:hs[0]||null;if(id){if(id!==sel)select(id);drag={cyc:keep&&hs.length>1?hs:null,type:'move',id,orig:clone(partById(id).pts),w0:w,sx:e.clientX,sy:e.clientY,moved:false};return}
  if(sel)select(null);drag=pan;cv.style.cursor='grabbing';return}
 if(tool==='fill'){const id=hitPart(w);if(id){const ms=selIds();if(ms.length>1&&ms.includes(id)){for(const i of ms){const q=partById(i);if(q&&!q.cut)q.color=paintColor}commit();requestRender();return}const q=partById(id);if(q&&!q.cut&&q.color!==paintColor){q.color=paintColor;sel=id;commit();requestRender()}else select(id)}return}
 if(tool==='erase'){const gi=hitGroove(w);if(gi>=0){grooves.splice(gi,1);commit();requestRender();toast('Groove removed.','Undo',undo);return}const id=hitPart(w);if(id)select(id),delSel();return}
 if(tool==='eyes'||tool==='smile'){const a=sn(w);if(tool==='eyes')afterCreate(addPart(SHAPES.circle(a[0]-5,a[1]-5,a[0]+5,a[1]+5),'eyes',{color:'#1f2937',depth:8,round:.95}));else{const m=SHAPES.moon(a[0]-5,a[1]-11,a[0]+5,a[1]+11),c=[a[0],a[1]];afterCreate(addPart(m.map(q=>[c[0]-(q[1]-c[1]),c[1]+(q[0]-c[0])]),'smile',{color:'#be123c',depth:8,round:.9}))}return}
 if(tool==='crease'){drag={type:'crease',pts:[w]};return}
 if(tool==='draw'){drag={type:'draw',pts:[w]};return}
 if(tool==='limb'){drag={type:'limb',pts:[w]};return}
 drag={type:'shape',kind:HOLE[tool]||tool,cut:!!HOLE[tool],p0:sn(w),pts:null}});
cv.addEventListener('pointermove',e=>{if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(drag&&drag.type==='pinch'){if(ptrs.size>=2)movePinch();return}
 const w=toW(e);if(!drag){hoverAt(e,w);return}
 if(drag.type==='pan'){V.ox=drag.ox+e.clientX-drag.sx;V.oy=drag.oy+e.clientY-drag.sy;requestRender(true,false)}
 else if(drag.type==='move'){if(!drag.moved&&Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<3)return;let dx=w[0]-drag.w0[0],dy=w[1]-drag.w0[1];if(snapOn){dx=Math.round(dx);dy=Math.round(dy)}
  drag.moved=true;if(drag.group){for(const g of drag.group){const q=partById(g.id);if(q)q.pts=g.orig.map(v=>[v[0]+dx,v[1]+dy])}}else partById(drag.id).pts=drag.orig.map(q=>[q[0]+dx,q[1]+dy]);requestRender()}
 else if(drag.type==='reshape'){const p=partById(drag.id);if(!p)return;p.pts=reshapeDrag(drag,w);reshHover=[p.pts[drag.i][0],p.pts[drag.i][1]];drag.changed=true;requestRender()}
 else if(drag.type==='rotate'){const c=drag.c;let da=Math.atan2(w[1]-c[1],w[0]-c[0])-drag.a0;let dg=da*180/Math.PI;dg=((dg+540)%360)-180;if(!e.shiftKey){const sn15=Math.round(dg/15)*15;if(Math.abs(dg-sn15)<4)dg=sn15}drag.deg=dg;da=dg*Math.PI/180;const co=Math.cos(da),si=Math.sin(da);partById(drag.id).pts=drag.orig.map(q=>[c[0]+(q[0]-c[0])*co-(q[1]-c[1])*si,c[1]+(q[0]-c[0])*si+(q[1]-c[1])*co]);drag.changed=true;requestRender()}
 else if(drag.type==='scale'){const{h,b}=drag,q=sn(w),p=partById(drag.id);let sx=1,sy=1;
  if(h.hx)sx=Math.max(.05,((q[0]-(h.hx>0?b.x0:b.x1))*h.hx)/b.w);if(h.hy)sy=Math.max(.05,((q[1]-(h.hy>0?b.y0:b.y1))*h.hy)/b.h);
  if(h.hx&&h.hy&&!e.shiftKey){sx=sy=Math.max(sx,sy)}
  const ax=h.hx>0?b.x0:b.x1,ay=h.hy>0?b.y0:b.y1;p.pts=drag.orig.map(v=>[h.hx?ax+(v[0]-ax)*sx:v[0],h.hy?ay+(v[1]-ay)*sy:v[1]]);drag.changed=true;requestRender()}
 else if(drag.type==='draw'||drag.type==='limb'||drag.type==='crease'){const l=drag.pts[drag.pts.length-1];if(Math.hypot(w[0]-l[0],w[1]-l[1])>.35){drag.pts.push(w);requestRender(true,false)}}
 else if(drag.type==='shape'){const a=drag.p0,q=sn(w);let dx=q[0]-a[0],dy=q[1]-a[1];if(e.shiftKey||drag.kind==='circle'&&e.shiftKey){const m=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx||1)*m;dy=Math.sign(dy||1)*m}
  drag.pts=Math.abs(dx)<.5||Math.abs(dy)<.5?null:SHAPES[drag.kind](Math.min(a[0],a[0]+dx),Math.min(a[1],a[1]+dy),Math.max(a[0],a[0]+dx),Math.max(a[1],a[1]+dy));requestRender(true,false)}});
function hoverAt(e,w){let cur=tool==='select'?'default':'crosshair';
 if(tool==='reshape'){const tg=reshapeTarget(w);const nh=tg?[tg.p.pts[tg.i][0],tg.p.pts[tg.i][1]]:null;if(JSON.stringify(nh)!==JSON.stringify(reshHover)){reshHover=nh;requestRender(true,false)}cur=tg?'grab':'default';cv.style.cursor=cur;return}
 if(tool==='select'){const h=sel&&hitHandle(e);if(h&&h.rot)cur='grab';else if(h)cur=h.hx&&h.hy?(h.hx*h.hy>0?'nesw-resize':'nwse-resize'):h.hx?'ew-resize':'ns-resize';
  else{const id=hitPart(w);if(id!==hover){hover=id;requestRender(true,false)}cur=id?'move':'grab'}}
 if(spaceDown)cur='grab';cv.style.cursor=cur}
function endPtr(e){ptrs.delete(e.pointerId);if(!drag)return;const d=drag;if(d.type==='pinch'){if(ptrs.size<2)drag=null;return}drag=null;
 if(d.type==='move'&&d.moved)commit();else if(d.type==='move'&&d.cyc)cycleNext(d.cyc);else if((d.type==='scale'||d.type==='rotate'||d.type==='reshape')&&d.changed)commit();else if(d.type==='draw')finishDraw(d);else if(d.type==='crease')finishCrease(d);else if(d.type==='limb')finishLimb(d);else if(d.type==='shape')finishShape(d);
 cv.style.cursor=tool==='select'?'default':'crosshair';requestRender()}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('pointerleave',()=>{if(hover){hover=null;requestRender(true,false)}});
cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect();
 if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*.01),e.clientX-r.left,e.clientY-r.top);else{V.ox-=e.deltaX;V.oy-=e.deltaY;requestRender(true,false)}},{passive:false});
function afterCreate(p){sel=p.id;if(symOn){const n=makeTwin(p);if(n)toast('Added a mirror copy on the other side.')}commit();requestRender();try{fit3dIfNeeded()}catch(e){}if(!keepTool)setTool('select')}
function meshTopZ(x,y){const M=curM;if(!M||!M.idx||!M.idx.length)return null;const P=M.pos,I=M.idx;let best=null;
 for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3,ax=P[a],ay=P[a+1],bx=P[b],by=P[b+1],cx=P[c],cy=P[c+1];
  if((x<ax&&x<bx&&x<cx)||(x>ax&&x>bx&&x>cx)||(y<ay&&y<by&&y<cy)||(y>ay&&y>by&&y>cy))continue;
  const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-9)continue;const l1=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,l2=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d,l3=1-l1-l2;
  if(l1<-.001||l2<-.001||l3<-.001)continue;const z=l1*P[a+2]+l2*P[b+2]+l3*P[c+2];if(best===null||z>best)best=z}return best}
function hitGroove(w){const tol=Math.max(3,8/V.s);for(let gi=grooves.length-1;gi>=0;gi--){const g=grooves[gi];for(const sg of(g.sym?[1,-1]:[1])){for(const q of g.pts){if(Math.hypot(q[0]*sg-w[0],q[1]-w[1])<tol)return gi}}}return -1}
function finishCrease(d){let pts=d.pts;if(pts.length<2){toast('Drag a line to carve a groove.');return}
 pts=resample2(pts,1.6);if(pts.length<2)return;
 for(let k=0;k<2;k++){const o=pts.map(q=>q.slice());for(let i=1;i<pts.length-1;i++)pts[i]=[(o[i-1][0]+2*o[i][0]+o[i+1][0])/4,(o[i-1][1]+2*o[i][1]+o[i+1][1])/4]}
 const r=1.8,out=[];for(const q of pts){let z=meshTopZ(q[0],q[1]);if(z===null){let top=null;for(const p of parts){const v=surfZ(p,q[0],q[1]);if(v!==null&&(top===null||v>top))top=v}z=top}if(z===null)continue;out.push([+q[0].toFixed(2),+q[1].toFixed(2),+(z+r*.2).toFixed(2)])}
 if(out.length<2){toast('Draw the line across a part to carve it.');return}
 grooves.push({pts:out,r,sym:!!symOn});commit();requestRender();toast('Carved a groove!','Undo',undo)}
function resample2(pts,step){const o=[pts[0]];let acc=0;for(let i=1;i<pts.length;i++){let a=o[o.length-1],b=pts[i],dd=Math.hypot(b[0]-a[0],b[1]-a[1]);while(dd>=step){const t=step/dd;a=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];o.push(a);dd=Math.hypot(b[0]-a[0],b[1]-a[1])}}const l=pts[pts.length-1],e=o[o.length-1];if(Math.hypot(l[0]-e[0],l[1]-e[1])>step*.4)o.push(l);return o}
function dfltThick(pts,kind){const b=bbox(pts),m=Math.min(b.w,b.h),M=Math.max(b.w,b.h);if(kind==='circle')return{depth:clamp(Math.round(M),8,80),round:1};return{depth:clamp(Math.round(m*.7),12,60)}}
function finishDraw(d){let pts=smoothStroke(d.pts);if(pts&&autoFix){const crossed=!!findCross(dedupeE(pts,.02));pts=repairOutline(pts);if(pts&&crossed)toast('Your outline crossed itself, so I untwisted it.')}
 if(!pts){toast('Draw a bigger, closed loop and try again.');return}afterCreate(addPart(pts,'draw',dfltThick(pts,'draw')))}
function finishShape(d){const kind=d.kind;let pts=d.pts;if(!pts){const a=d.p0,w=d.cut?(kind==='box'?30:14):(kind==='box'?36:28),h=d.cut?(kind==='box'?10:14):(kind==='box'?24:28);pts=SHAPES[kind](a[0]-w/2,a[1]-h/2,a[0]+w/2,a[1]+h/2)}
 if(d.cut){const b=modelBounds()||{z0:-20,z1:20,d:40};afterCreate(addPart(pts,kind,{cut:true,depth:Math.round(Math.max(b.d+40,60)),z:Math.round((b.z0+b.z1)/2),round:0,blend:0,color:'#e5484d'}))}else afterCreate(addPart(pts,kind,dfltThick(pts,kind)))}
/* ----- part actions ----- */
function delSel(){const ids=selIds();if(!ids.length)return;const kill=new Set();for(const i of ids){kill.add(i);const p=partById(i);if(p&&p.twin&&symOn&&partById(p.twin))kill.add(p.twin)}const nm=ids.length>1?ids.length+' parts':(partById(ids[0])||{name:'part'}).name;parts=parts.filter(q=>!kill.has(q.id));for(const q of parts)if(kill.has(q.twin))delete q.twin;sel=null;msel.clear();commit();requestRender();toast('Deleted '+nm+'.','Undo',undo)}
function dupSel(){const ids=selIds();if(!ids.length)return;const made=[];for(const i of ids){const p=partById(i);if(!p)continue;const n=clone(p);n.id=uid();delete n.twin;n.name=p.name+' copy';n.pts=n.pts.map(q=>[q[0]+6,q[1]-6]);n.z=p.z+2;parts.push(n);made.push(n.id)}if(!made.length)return;sel=made[0];msel=new Set(made.slice(1));mbase=sel;commit();requestRender()}
function mirrorSel(){const p=sel&&partById(sel);if(!p)return;if(p.twin&&partById(p.twin)){toast('This part already has a mirror copy.');return}
 const n=makeTwin(p);if(!n){toast('This part is on the centre line. Move it sideways first, then mirror it.');return}sel=n.id;commit();requestRender()}
function flushNudge(){if(nudgeT){clearTimeout(nudgeT);nudgeT=0;commit()}}
let nudgeT=0;function nudge(dx,dy,dz){const ids=selIds();if(!ids.length)return;for(const i of ids){const p=partById(i);if(!p)continue;if(dx||dy)p.pts=p.pts.map(q=>[q[0]+dx,q[1]+dy]);if(dz)p.z=Math.round((p.z+dz)*10)/10}applySym();requestRender();clearTimeout(nudgeT);nudgeT=setTimeout(()=>{nudgeT=0;commit()},250)}
addEventListener('keydown',e=>{const t=e.target,tg=t&&t.tagName;if(tg==='TEXTAREA'||(tg==='INPUT'&&t.type!=='checkbox'))return;
 const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
 if(mod&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}if(mod&&k==='y'){e.preventDefault();redo();return}if(mod&&k==='d'){e.preventDefault();dupSel();return}if(mod||e.altKey)return;
 if(k===' '){if(t===document.body||t===cv){e.preventDefault();spaceDown=true;cv.style.cursor='grab'}return}
 const map={g:'crease',v:'select',p:'draw',l:'limb',c:'circle',r:'box',s:'star',h:'heart',q:'erase',y:'eyes',j:'smile',e:'egg',k:'capsule',t:'triangle',d:'drop',m:'moon',o:'holeC',x:'holeB'};if(map[k]){if(document.getElementById('app').classList.contains('sculpting'))return;setTool(map[k]);return}
 if((k==='delete'||k==='backspace')&&sel){e.preventDefault();delSel();return}
 if(k==='f'&&sel&&typeof focusSel==='function'){e.preventDefault();focusSel();return}
 if(k==='escape'){$('#sheet').hidden=true;if(sel)select(null);else setTool('select');return}
 if(sel&&(k.startsWith('arrow')||k==='pageup'||k==='pagedown')){e.preventDefault();const st=e.shiftKey?5:1,h=k==='arrowleft'?-st:k==='arrowright'?st:0,v=k==='arrowup'?st:k==='arrowdown'?-st:0,f=k==='pageup'?st:k==='pagedown'?-st:0;
  if(view2d==='side')nudge(0,v,-h+f);else nudge(h,v,f)}});
addEventListener('keyup',e=>{if(e.key===' ')spaceDown=false});
