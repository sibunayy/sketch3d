/* ---------- build area limits, and the linked side view ---------- */
let limits={w:110,h:110,d:70};
const LIMS={Small:[110,110,70],Medium:[160,160,100],Large:[240,240,140]};
/* keeps a part inside the build area, and never smaller than a few millimetres */
function clampPart(p){if(p.cut||p.pts.length<3)return;let b=bbox(p.pts);const W=limits.w,H=limits.h;
 if(b.w<3||b.h<3){const s=Math.max(3/Math.max(b.w,.01),3/Math.max(b.h,.01));p.pts=p.pts.map(q=>[b.cx+(q[0]-b.cx)*s,b.cy+(q[1]-b.cy)*s]);b=bbox(p.pts)}
 if(b.w>W||b.h>H){const s=Math.min(W/b.w,H/b.h);p.pts=p.pts.map(q=>[b.cx+(q[0]-b.cx)*s,b.cy+(q[1]-b.cy)*s]);b=bbox(p.pts)}
 let dx=0,dy=0;if(b.x0<-W/2)dx=-W/2-b.x0;else if(b.x1>W/2)dx=W/2-b.x1;if(b.y0<0)dy=-b.y0;else if(b.y1>H)dy=H-b.y1;
 if(Math.abs(dx)>1e-6||Math.abs(dy)>1e-6)p.pts=p.pts.map(q=>[q[0]+dx,q[1]+dy]);
 if(p.depth>limits.d)p.depth=limits.d;if(p.depth<2)p.depth=2;
 const hD=p.depth/2,zhi=(p.prof?Math.max(...p.prof.f,.05):1)*hD,zlo=(p.prof?Math.min(...p.prof.b,-.05):-1)*hD,D2=limits.d/2;
 if(zhi-zlo>limits.d){const s=limits.d/(zhi-zlo);p.depth*=s;return clampPart(p)}
 if(p.z+zhi>D2)p.z=D2-zhi;if(p.z+zlo<-D2)p.z=-D2-zlo}
function clampSel(){const p=sel&&partById(sel);if(p)clampPart(p)}
function clampAll(){for(const p of parts)clampPart(p)}
function setLimits(w,h,d,save){limits={w:clamp(Math.round(w),40,400),h:clamp(Math.round(h),40,400),d:clamp(Math.round(d),20,300)};clampAll();if(save){commit()}else persist();fit2d();requestRender();syncLimitUI();if(typeof camHome==='function')camHome()}
function normalizeParts(){const sol=parts.filter(p=>!p.cut);if(!sol.length)return;let x0=1e9,x1=-1e9,y0=1e9;for(const p of sol){const b=bbox(p.pts);x0=Math.min(x0,b.x0);x1=Math.max(x1,b.x1);y0=Math.min(y0,b.y0)}
 const dx=-(x0+x1)/2,dy=-y0;for(const p of parts)p.pts=p.pts.map(q=>[q[0]+dx,q[1]+dy])}
/* ===== side view: z runs left (front) to right (back), y is shared with the front view ===== */
let Vs={ox:300},sideTool='edit',symProf=false,sdrag=null,sideShowDots=false,sideBrush=45,sideHover=null;
const cvS=$('#cSide'),cxS=cvS.getContext('2d'),SN=9,ZMAX=1.8;
const zToX=z=>Vs.ox-z*V.s,xToZ=x=>(Vs.ox-x)/V.s,yToS=y=>V.oy-y*V.s,sToY=s=>(V.oy-s)/V.s;
function ensureProf(p){if(!p.prof)p.prof={f:Array(SN).fill(1),b:Array(SN).fill(-1)};return p.prof}
function tidyProf(p){const q=p.prof;if(q&&q.f.every(v=>Math.abs(v-1)<.01)&&q.b.every(v=>Math.abs(v+1)<.01))delete p.prof}
/* front surface height of a part at (x,y), following its rounded edges; null when outside the outline */
const SZC=new WeakMap();
function surfZ(p,x,y){const pts=p.pts,m=pts.length;if(p.cut||!inPoly([x,y],pts))return null;const b=bbox(pts),hD=p.depth/2;
 const dist=(px,py)=>{let d=1e9;for(let i=0,j=m-1;i<m;j=i++){const a=pts[i],q=pts[j],dx=q[0]-a[0],dy=q[1]-a[1],L=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/L)),ex=a[0]+t*dx-px,ey=a[1]+t*dy-py,e=ex*ex+ey*ey;if(e<d)d=e}return Math.sqrt(d)};
 let rin=SZC.get(pts);if(rin===undefined){rin=.01;for(let i=0;i<=8;i++)for(let k=0;k<=8;k++){const px=b.x0+(b.x1-b.x0)*i/8,py=b.y0+(b.y1-b.y0)*k/8;if(inPoly([px,py],pts)){const d=dist(px,py);if(d>rin)rin=d}}SZC.set(pts,rin)}
 const rc=Math.min(hD,rin),t=Math.min(1,Math.max(0,p.round));let rxy,rz;if(t<=.5){rxy=rz=rc*2*t}else{const q=2*t-1;rxy=rc+(Math.max(rc,rin*.98)-rc)*q;rz=rc+(hD-rc)*q}
 let g=1;if(rxy>=1e-3&&rz>=1e-3){const d=dist(x,y);if(d<rxy){const u=1-d/rxy;g=Math.max(.02,(hD-rz+rz*Math.sqrt(Math.max(0,1-u*u)))/hD)}}
 let f=g;if(p.prof){const tt=(y-b.y0)/Math.max(1e-6,b.y1-b.y0),q=profHalfC(p.prof,Math.min(1,Math.max(0,tt)));f=q[0]+q[1]*g}
 return p.z+f*hD}
const RGC=new WeakMap();
function roundG(p,n){if(p.cut||!(p.round>0))return null;const key=p.round+'|'+p.depth+'|'+n,c=RGC.get(p.pts);if(c&&c.k===key)return c.g;
 const pts=p.pts,m=pts.length,b=bbox(p.pts),hD=p.depth/2,NX=14,dist=(x,y)=>{let d=1e9,ins=false;for(let i=0,j=m-1;i<m;j=i++){const a=pts[i],q=pts[j];if((a[1]>y)!==(q[1]>y)&&x<(q[0]-a[0])*(y-a[1])/(q[1]-a[1])+a[0])ins=!ins;const dx=q[0]-a[0],dy=q[1]-a[1],L=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/L)),ex=a[0]+t*dx-x,ey=a[1]+t*dy-y,e=ex*ex+ey*ey;if(e<d)d=e}return ins?Math.sqrt(d):0};
 const D=[];let rin=.01;for(let i=0;i<=n;i++){const y=b.y0+(b.y1-b.y0)*Math.min(Math.max(i/n,.004),.996);let mx=0;for(let k=0;k<=NX;k++){const d=dist(b.x0+(b.x1-b.x0)*k/NX,y);if(d>mx)mx=d}D.push(mx);if(mx>rin)rin=mx}
 const rc=Math.min(hD,rin),t=Math.min(1,p.round);let rxy,rz;if(t<=.5){rxy=rz=rc*2*t}else{const q=2*t-1;rxy=rc+(Math.max(rc,rin*.98)-rc)*q;rz=rc+(hD-rc)*q}
 let g=null;if(rxy>=1e-3&&rz>=1e-3){g=D.map(d=>{if(d>=rxy)return 1;const u=1-d/rxy,zh=hD-rz+rz*Math.sqrt(Math.max(0,1-u*u));return Math.max(.02,zh/hD)})}
 RGC.set(p.pts,{k:key,g});return g}
function profPoly(p){const b=bbox(p.pts),hD=p.depth/2,n=24,pr=p.prof,F=[],B=[],G=roundG(p,n);
 for(let i=0;i<=n;i++){const t=i/n,y=b.y0+(b.y1-b.y0)*t,g=G?G[i]:1;let f=g,bk=-g;if(pr){const q=profHalfC(pr,t);f=q[0]+q[1]*g;bk=q[0]-q[1]*g}F.push([p.z+f*hD,y]);B.push([p.z+bk*hD,y])}return F.concat(B.reverse())}
function sideHandlesOf(p){const pr=p.prof||{f:Array(SN).fill(1),b:Array(SN).fill(-1)},b=bbox(p.pts),hD=p.depth/2,o=[];
 for(let i=0;i<SN;i++){const y=b.y0+(b.y1-b.y0)*i/(SN-1);o.push({s:'f',i,x:zToX(p.z+pr.f[i]*hD),y:yToS(y)});o.push({s:'b',i,x:zToX(p.z+pr.b[i]*hD),y:yToS(y)})}return o}
function drawSide(){clampView();const x=cxS,T={cv:css('--cv'),gm:css('--gridm'),gM:css('--gridM'),ac:css('--accent'),ink:css('--ink'),mute:css('--mute'),pn:css('--panel')};
 x.setTransform(dpr,0,0,dpr,0,0);x.fillStyle=T.cv;x.fillRect(0,0,cw,ch);
 const mn=[1,2,5,10,20,50,100].find(s=>s*V.s>=12)||100,mj=mn*5;
 const gl=(st,col)=>{x.strokeStyle=col;x.lineWidth=1;x.beginPath();const z0=xToZ(cw),z1=xToZ(0);for(let g=Math.ceil(z0/st)*st;g<=z1;g+=st){const sx=Math.round(zToX(g))+.5;x.moveTo(sx,0);x.lineTo(sx,ch)}
  const y0=sToY(ch),y1=sToY(0);for(let g=Math.ceil(y0/st)*st;g<=y1;g+=st){const sy=Math.round(yToS(g))+.5;x.moveTo(0,sy);x.lineTo(cw,sy)}x.stroke()};
 gl(mn,T.gm);gl(mj,T.gM);
 const ax0=zToX(limits.d/2),ax1=zToX(-limits.d/2),ay0=yToS(limits.h),ah=limits.h*V.s;
 x.save();x.fillStyle='rgba(80,50,170,.10)';x.beginPath();x.rect(0,0,cw,ch);x.rect(ax0,ay0,ax1-ax0,ah);x.fill('evenodd');x.restore();
 x.strokeStyle=T.ac;x.lineWidth=2;x.setLineDash([8,6]);x.strokeRect(ax0,ay0,ax1-ax0,ah);x.setLineDash([]);
 x.strokeStyle=T.ink;x.globalAlpha=.5;x.lineWidth=3;x.beginPath();x.moveTo(ax0,ay0+ah);x.lineTo(ax1,ay0+ah);x.stroke();x.globalAlpha=1;
 x.strokeStyle=T.ac;x.globalAlpha=.55;x.lineWidth=1.5;x.setLineDash([6,5]);x.beginPath();x.moveTo(zToX(0),0);x.lineTo(zToX(0),ch);x.stroke();x.setLineDash([]);x.globalAlpha=1;
 x.font='600 14px Geist,DM Sans,system-ui,sans-serif';x.textBaseline='top';x.fillStyle=T.ac;x.textAlign='left';x.fillText('◀ FRONT',ax0+8,Math.max(8,ay0+6));x.textAlign='right';x.fillText('BACK ▶',ax1-8,Math.max(8,ay0+6));x.textAlign='left';
 const path=pts=>{x.beginPath();pts.forEach((q,i)=>{const sx=zToX(q[0]),sy=yToS(q[1]);i?x.lineTo(sx,sy):x.moveTo(sx,sy)});x.closePath()};x.lineJoin='round';
 drawRef(x,'side','under');const sp=sel&&partById(sel),SL=silGet('side');
 if(SL){if(sp&&!sp.cut){x.save();x.globalAlpha=.3;try{x.filter='grayscale(.9)'}catch(e){}drawSil(x,SL,Vs.ox);x.restore();x.save();path(profPoly(sp));x.clip();drawSil(x,SL,Vs.ox);x.restore()}else drawSil(x,SL,Vs.ox)}
 for(const p of drawOrder()){if(p.id===sel)continue;if(SL&&!p.cut)continue;path(profPoly(p));if(p.cut){x.fillStyle='rgba(229,72,77,.15)';x.fill();x.setLineDash([5,4]);x.strokeStyle='#e5484d'}else{x.fillStyle=p.color;x.globalAlpha=sp?.28:.7;x.fill();x.globalAlpha=1;x.strokeStyle='rgba(0,0,0,.3)'}x.lineWidth=1.2;x.stroke();x.setLineDash([])}
 x.save();x.lineWidth=1.3;x.strokeStyle='rgba(29,27,58,.6)';for(const p of drawOrder()){if(p.cut||p.id===sel||(SL&&!p.cut))continue;path(profPoly(p));x.stroke()}x.restore();
 drawRef(x,'side','over');
 ghostDraw(x,'side');
 {const mi=selIds();if(mi.length>1)for(const i of mi){if(i===sel)continue;const q=partById(i);if(!q)continue;path(profPoly(q));x.strokeStyle=T.ac;x.lineWidth=3;x.stroke()}}
 if(sp){path(profPoly(sp));if(!SL||sp.cut){x.fillStyle=sp.cut?'rgba(229,72,77,.25)':sp.color;x.globalAlpha=.95;x.fill();x.globalAlpha=1}if(!SL||sp.cut||sp.prof){x.strokeStyle=T.ac;x.lineWidth=3;x.stroke()}
  if(sideTool==='edit'&&sideHover&&sideHover.id===sp.id){x.beginPath();x.arc(sideHover.x,sideHover.y,sideHover.r,0,7);x.fillStyle='rgba(37,99,235,.13)';x.fill();x.strokeStyle='#2563eb';x.lineWidth=1.5;x.setLineDash([4,4]);x.stroke();x.setLineDash([])}
  if(sideTool==='edit'&&!sp.cut&&!(sdrag&&sdrag.type==='draw')){const hs=sideHandlesOf(sp),mid=(SN-1)/2;for(const sd of['f','b']){let hb=null;for(const h of hs)if(h.s===sd&&(!hb||Math.abs(h.i-mid)<Math.abs(hb.i-mid)))hb=h;if(!hb)continue;const r=touchMode?22:17,dir=sd==='f'?-1:1;x.beginPath();x.arc(hb.x,hb.y,r,0,7);x.fillStyle=T.pn;x.fill();if(!SL||sp.cut||sp.prof){x.strokeStyle=T.ac;x.lineWidth=3;x.stroke()}x.beginPath();x.moveTo(hb.x-6,hb.y-6);x.lineTo(hb.x-12,hb.y);x.lineTo(hb.x-6,hb.y+6);x.moveTo(hb.x+6,hb.y-6);x.lineTo(hb.x+12,hb.y);x.lineTo(hb.x+6,hb.y+6);x.lineWidth=2.5;x.lineCap='round';x.lineJoin='round';x.stroke();x.lineCap='butt'}}
  if(sideTool==='edit'&&sideShowDots)for(const h of sideHandlesOf(sp)){const r=touchMode?11:6.5;x.beginPath();x.arc(h.x,h.y,r,0,7);x.fillStyle=T.pn;x.fill();x.strokeStyle=T.ac;x.lineWidth=2.5;x.stroke()}}
 else{x.fillStyle=T.mute;x.font='600 16px Geist,DM Sans,system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('Tap a part to shape its side',cw/2,ch/2);x.textAlign='left'}
 if(sdrag&&(sdrag.type==='draw'||sdrag.type==='limb')&&sdrag.pts.length>1){x.beginPath();sdrag.pts.forEach((q,i)=>{const sx=zToX(q[0]),sy=yToS(q[1]);i?x.lineTo(sx,sy):x.moveTo(sx,sy)});x.strokeStyle=T.ac;x.lineWidth=3.5;x.lineCap='round';x.stroke();x.lineCap='butt'}
 drawRefHandles(x,'side');const bl=mj*V.s;x.strokeStyle=T.ink;x.lineWidth=2;x.beginPath();x.moveTo(SBX,ch-16);x.lineTo(SBX+bl,ch-16);x.moveTo(SBX,ch-20);x.lineTo(SBX,ch-12);x.moveTo(SBX+bl,ch-20);x.lineTo(SBX+bl,ch-12);x.stroke();x.fillStyle=T.ink;x.textBaseline='bottom';x.font='13px Geist,DM Sans,system-ui,sans-serif';x.fillText(mj+' mm',SBX,ch-22)}
/* shape presets, each as thickness-by-height curves (front f, back b) */
const SPRESETS={
 flat:{icon:'<rect x="8" y="4" width="8" height="16"/>',label:'Flat',fn:t=>[1,-1]},
 round:{icon:'<ellipse cx="12" cy="12" rx="4.5" ry="8"/>',label:'Round',fn:t=>{const h=Math.max(.2,Math.sqrt(Math.max(0,1-Math.pow(2*t-1,2))));return[h,-h]}},
 belly:{icon:'<path d="M10 4C6 9 6 15 10 20h4c4-5 4-11 0-16z"/>',label:'Belly',fn:t=>{const h=.45+.55*Math.sin(Math.PI*t);return[h,-h]}},
 waist:{icon:'<path d="M7 4h10c-4 4-4 12 0 16H7c4-4 4-12 0-16z"/>',label:'Waist',fn:t=>{const h=1-.62*Math.sin(Math.PI*t);return[h,-h]}},
 back:{icon:'<path d="M7 20h6l4-16h-6z"/>',label:'Lean back',fn:t=>{const c=(t-.5)*.9;return[c+.8,c-.8]}},
 fwd:{icon:'<path d="M11 20h6l-4-16H7z"/>',label:'Lean front',fn:t=>{const c=-(t-.5)*.9;return[c+.8,c-.8]}},
 point:{icon:'<path d="M7 20h10l-4-16h-2z"/>',label:'Point top',fn:t=>{const h=1-.78*t;return[h,-h]}}};
function applySidePreset(k){const p=sel&&partById(sel);if(!p){toast('Tap a part first, then pick a shape.');return}const S=SPRESETS[k];
 p.prof={f:[],b:[]};for(let i=0;i<SN;i++){const q=S.fn(i/(SN-1));p.prof.f.push(q[0]);p.prof.b.push(q[1])}tidyProf(p);commit();requestRender()}
function profFromLoop(p,pts){const b=bbox(p.pts),hD=p.depth/2,F=[],B=[];
 for(let i=0;i<SN;i++){const y=b.y0+(b.y1-b.y0)*i/(SN-1),zs=[];for(let k=0;k<pts.length;k++){const a=pts[k],c=pts[(k+1)%pts.length];if((a[1]<=y)!==(c[1]<=y))zs.push(a[0]+(y-a[1])*(c[0]-a[0])/(c[1]-a[1]))}
  if(zs.length>=2){F.push(Math.max(...zs));B.push(Math.min(...zs))}else{F.push(null);B.push(null)}}
 if(F.every(v=>v===null))return null;
 const fill=a=>{let last=null;for(let i=0;i<a.length;i++){if(a[i]!==null)last=a[i];else if(last!==null)a[i]=last}last=null;for(let i=a.length-1;i>=0;i--){if(a[i]!==null)last=a[i];else a[i]=last}};fill(F);fill(B);
 const f=[],bk=[];for(let i=0;i<SN;i++){let fv=clamp((F[i]-p.z)/hD,-ZMAX,ZMAX),bv=clamp((B[i]-p.z)/hD,-ZMAX,ZMAX);if(fv-bv<PROF_MIN){const c=(fv+bv)/2;fv=c+PROF_MIN/2;bv=c-PROF_MIN/2}f.push(fv);bk.push(bv)}
 return{f,b:bk}}
const sw=e=>{const r=cvS.getBoundingClientRect();return[xToZ(e.clientX-r.left),sToY(e.clientY-r.top)]};
const sptr=new Map();let spinch=null;
function sideCancelDrag(){const d=sdrag;if(!d)return;const p=d.id&&partById(d.id);if(p){if(d.type==='move'){if(d.group){for(const g of d.group){const q=partById(g.id);if(q){q.z=g.z0;q.pts=g.orig}}}else{p.z=d.z0;p.pts=d.orig}}else if((d.type==='g'||d.type==='h')&&d.orig){p.prof=clone(d.orig)}}sdrag=null;requestRender()}
cvS.addEventListener('pointerdown',e=>{if(view2d!=='side')return;sptr.set(e.pointerId,{x:e.clientX,y:e.clientY});if(sptr.size===2){sideCancelDrag();const a=[...sptr.values()];spinch={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,c:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}};return}if(sptr.size>2)return;cvS.setPointerCapture(e.pointerId);const r=cvS.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,w=sw(e),p=sel&&partById(sel);
 if(e.button===1||spaceDown||e.button===2){sdrag={type:'pan',sx:e.clientX,sy:e.clientY,ox:Vs.ox,oy:V.oy};return}
 if(sideTool==='draw'){if(!p){toast('Tap a part first, then draw its side.');return}sdrag={type:'draw',pts:[w]};return}
 if(sideTool==='limb'){sdrag={type:'limb',pts:[w]};return}
 if(sideTool==='erase'||sideTool==='fill'){const o=drawOrder();for(let i=o.length-1;i>=0;i--){if(inPoly(w,profPoly(o[i]))){const q=o[i];if(sideTool==='erase'){select(q.id);delSel()}else if(selIds().length>1&&selIds().includes(q.id)){for(const i of selIds()){const r=partById(i);if(r&&!r.cut)r.color=paintColor}commit();requestRender()}else if(!q.cut&&q.color!==paintColor){q.color=paintColor;sel=q.id;commit();requestRender()}else select(q.id);return}}return}
 if(p&&sideShowDots&&sideTool==='edit'){let best=null,bd=touchMode?26:13;for(const h of sideHandlesOf(p)){const d=Math.hypot(h.x-mx,h.y-my);if(d<bd){bd=d;best=h}}
  if(best){const pr=ensureProf(p);sdrag={type:'h',s:best.s,i:best.i,orig:clone(pr),id:p.id,changed:false};return}}
 if(p&&sideTool==='edit'){const g=sideGrabAt(p,mx,my);if(g){const pr=ensureProf(p);sdrag={type:'g',s:g.s,y0:g.y,z0:w[0],orig:clone(pr),id:p.id,changed:false};cvS.style.cursor='grabbing';return}}
 {const o=drawOrder(),hs=[];for(let i=o.length-1;i>=0;i--)if(inPoly(w,profPoly(o[i])))hs.push(o[i].id);if(hs.length){const ms=selIds(),sg=a=>a.map(i=>{const r=partById(i);return{id:i,z0:r.z,orig:clone(r.pts)}});
  if(e.shiftKey||multiOn){const was=ms.includes(hs[0]);toggleSel(hs[0]);if(!was){const r=partById(hs[0]);sdrag={type:'move',id:r.id,w0:w,z0:r.z,orig:clone(r.pts),group:sg(selIds()),sx:e.clientX,sy:e.clientY,moved:false}}return}
  {const gi=ms.length>1?hs.find(i=>ms.includes(i)):null;if(gi){const r=partById(gi);sdrag={type:'move',id:gi,w0:w,z0:r.z,orig:clone(r.pts),group:sg(ms),sx:e.clientX,sy:e.clientY,moved:false};return}}
  const keep=!!sel&&hs.includes(sel),q=partById(keep?sel:hs[0]);if(q.id!==sel)select(q.id);sdrag={type:'move',id:q.id,w0:w,z0:q.z,orig:clone(q.pts),sx:e.clientX,sy:e.clientY,moved:false,cyc:keep&&hs.length>1?hs:null};return}}
 if(sel)select(null);sdrag={type:'pan',sx:e.clientX,sy:e.clientY,ox:Vs.ox,oy:V.oy}});
cvS.addEventListener('pointermove',e=>{if(view2d!=='side')return;if(sptr.has(e.pointerId))sptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(spinch&&sptr.size>=2){const a=[...sptr.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,c={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},r=cvS.getBoundingClientRect();Vs.ox+=c.x-spinch.c.x;V.oy+=c.y-spinch.c.y;zoomAt(d/spinch.d,c.x-r.left,c.y-r.top);spinch={d,c};return}
 if(!sdrag){const r=cvS.getBoundingClientRect(),p=sel&&partById(sel),mx=e.clientX-r.left,my=e.clientY-r.top;let cur='default',hv=null;if(sideTool==='draw'||sideTool==='limb')cur='crosshair';else if(p&&sideTool==='edit'){if(sideShowDots)for(const h of sideHandlesOf(p))if(Math.hypot(h.x-mx,h.y-my)<13)cur='ew-resize';
  if(cur==='default'){const g=sideGrabAt(p,mx,my);if(g){cur='grab';hv={id:p.id,x:g.sx,y:g.sy,r:sideR(p)*V.s}}}}
  cvS.style.cursor=cur;if(hv||sideHover){sideHover=hv;requestRender(true,false)}return}
 const d=sdrag;
 if(d.type==='pan'){Vs.ox=d.ox+e.clientX-d.sx;V.oy=d.oy+e.clientY-d.sy;requestRender(true,false)}
 else if(d.type==='move'){if(!d.moved&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<4)return;const w=sw(e),p=partById(d.id);if(!p)return;let dz=w[0]-d.w0[0],dy=w[1]-d.w0[1];if(snapOn){dz=Math.round(dz);dy=Math.round(dy)}if(d.group){for(const g of d.group){const q=partById(g.id);if(q){q.z=Math.round((g.z0+dz)*10)/10;q.pts=g.orig.map(v=>[v[0],v[1]+dy])}}}else{p.z=Math.round((d.z0+dz)*10)/10;p.pts=d.orig.map(q=>[q[0],q[1]+dy])}d.moved=true;cvS.style.cursor='grabbing';requestRender()}
 else if(d.type==='draw'||d.type==='limb'){const w=sw(e),l=d.pts[d.pts.length-1];if(Math.hypot(w[0]-l[0],w[1]-l[1])>.35){d.pts.push(w);requestRender(true,false)}}
 else if(d.type==='g'){const p=partById(d.id);if(!p)return;const pr=ensureProf(p),hD=p.depth/2,b=bbox(p.pts);let dz=sw(e)[0]-d.z0;if(snapOn)dz=Math.round(dz);const dl=dz/hD,R=sideR(p),W=[];
  for(let j=0;j<SN;j++){const y=b.y0+(b.y1-b.y0)*j/(SN-1),q=Math.min(1,Math.abs(y-d.y0)/R);W.push(.5*(1+Math.cos(Math.PI*q)))}
  applySideDelta(pr,d.orig,d.s,dl,W);d.changed=true;requestRender()}
 else if(d.type==='h'){const p=partById(d.id);if(!p)return;const pr=ensureProf(p),hD=p.depth/2;let z=sw(e)[0];if(snapOn)z=Math.round(z);const val=clamp((z-p.z)/hD,-ZMAX,ZMAX),i=d.i,o=d.orig,wts=[1,.4,.12];
  if(d.s==='f'){const delta=Math.max(val,o.b[i]+PROF_MIN)-o.f[i];for(let k=-2;k<=2;k++){const j=i+k;if(j<0||j>=SN)continue;const w=wts[Math.abs(k)],nf=clamp(o.f[j]+delta*w,-ZMAX,ZMAX);pr.f[j]=nf;if(symProf)pr.b[j]=clamp(o.b[j]-delta*w,-ZMAX,nf-PROF_MIN);else pr.b[j]=Math.min(o.b[j],nf-PROF_MIN)}}
  else{const delta=o.b[i]-Math.min(val,o.f[i]-PROF_MIN);for(let k=-2;k<=2;k++){const j=i+k;if(j<0||j>=SN)continue;const w=wts[Math.abs(k)],nb=clamp(o.b[j]-delta*w,-ZMAX,ZMAX);pr.b[j]=nb;if(symProf)pr.f[j]=clamp(o.f[j]+delta*w,nb+PROF_MIN,ZMAX);else pr.f[j]=Math.max(o.f[j],nb+PROF_MIN)}}
  d.changed=true;requestRender()}});
function endSide(e){sptr.delete(e.pointerId);if(spinch){if(sptr.size<2)spinch=null;sdrag=null;return}const d=sdrag;sdrag=null;if(!d)return;
 if(d.type==='move'){if(d.moved)commit();else if(d.cyc)cycleNext(d.cyc);cvS.style.cursor=''}
 else if(d.type==='h'||d.type==='g'){const p=partById(d.id);if(p&&d.changed){tidyProf(p);commit()}else if(p)tidyProf(p)}
 else if(d.type==='limb')finishLimbSide(d);
 else if(d.type==='draw'){const p=sel&&partById(sel);if(p&&d.pts.length>6){const pr=profFromLoop(p,d.pts);if(pr){p.prof=pr;tidyProf(p);commit();toast('Side shape updated!');setSideTool('edit')}else toast('Draw a closed shape around the part, from the side.')}else toast('Draw a bigger shape.')}
 requestRender()}
cvS.addEventListener('pointerup',endSide);cvS.addEventListener('pointercancel',endSide);
cvS.addEventListener('wheel',e=>{if(view2d!=='side')return;e.preventDefault();const r=cvS.getBoundingClientRect();if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*.01),e.clientX-r.left,e.clientY-r.top);else{Vs.ox-=e.deltaX;V.oy-=e.deltaY;requestRender(true,false)}},{passive:false});
/* side tool rail */
function buildSideTools(){const n=$('#sOptShapes');if(!n)return;n.innerHTML='';
 const mk=(id,label,icon,fn,cls)=>{const b=document.createElement('button');b.type='button';b.className='chip '+(cls||'');b.dataset.s=id;b.setAttribute('aria-pressed','false');b.title=label;b.setAttribute('aria-label',label);b.innerHTML='<svg class="i" viewBox="0 0 24 24">'+icon+'</svg>'+(id==='draw'?label:'');b.onclick=fn;n.appendChild(b)};
 mk('draw','Draw side','<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',()=>setSideTool('draw'),'st');
 for(const k of Object.keys(SPRESETS))mk(k,SPRESETS[k].label,SPRESETS[k].icon,()=>applySidePreset(k),'sp');
 setSideTool('edit')}
const SIDE_HINT={edit:'Pull the edge of the part to reshape its side.',select:'Tap a part to pick it.',erase:'Tap a part to remove it.',fill:'Tap a part to paint it. Pick a colour with the dot below the tools.',draw:'Draw the side of the part with your finger or mouse. Front is on the left.',limb:'Drag a line for a tail or arm that sticks out of the front or back. It appears on the centre line.'};
const SIDE_RAIL={edit:'reshape',select:'select',erase:'erase',fill:'fill',limb:'limb'};
function sideRouteTool(t){const M={select:'select',reshape:'edit',erase:'erase',fill:'fill',limb:'limb'};if(M[t]){setSideTool(M[t]);return true}tool=t;setView('front');return true}
function setSideTool(t){sideTool=t;sdrag=null;saveWS();try{sideOptsVis()}catch(e){}document.querySelectorAll('#sidePanel .st').forEach(b=>b.setAttribute('aria-pressed',b.dataset.s===t?'true':'false'));
 document.querySelectorAll('#tools .tool, #fillTool').forEach(b=>{const id=b.dataset.t||(b.id==='fillTool'?'fill':'');b.setAttribute('aria-pressed',view2d==='side'&&SIDE_RAIL[t]===id?'true':'false')});
 $('#hint2d').textContent=SIDE_HINT[t]||'';requestRender(true,false)}
function setView(v){const cF=$('#c2d'),fromEl=view2d==='side'?cvS:cF,toEl=v==='side'?cvS:cF;
 const apply=()=>{view2d=v;$('#app').dataset.view=v;document.querySelectorAll('#viewSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v?'true':'false'));
  cF.style.display=v==='front'?'block':'none';cvS.style.display=v==='side'?'block':'none';
  if(v==='side')setSideTool(sideTool);else setTool(tool);try{syncSideOpts()}catch(e){}saveWS();requestRender(true,false)};
 let rm=false;try{rm=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
 if(v===view2d||rm||!fromEl.animate||setView.busy||fromEl.style.display==='none'){apply();return}
 setView.busy=true;const dir=v==='side'?-1:1;
 fromEl.animate([{transform:'rotateY(0)'},{transform:'rotateY('+90*dir+'deg)'}],{duration:170,easing:'ease-in'}).onfinish=()=>{apply();
  toEl.animate([{transform:'rotateY('+(-90*dir)+'deg)'},{transform:'rotateY(0)'}],{duration:210,easing:'ease-out'}).onfinish=()=>{setView.busy=false}}}

/* ----- soft grab: pull the edge and the neighbouring heights follow smoothly ----- */
const sideR=p=>{const b=bbox(p.pts);return Math.max(b.h*sideBrush/100,b.h/6)};
function applySideDelta(pr,o,s,dl0,W){for(let j=0;j<SN;j++){const w=W[j];if(!w)continue;const dl=dl0*w;
 if(s==='f'){const nf=clamp(o.f[j]+dl,-ZMAX,ZMAX);pr.f[j]=nf;pr.b[j]=symProf?clamp(o.b[j]-dl,-ZMAX,nf-PROF_MIN):Math.min(o.b[j],nf-PROF_MIN)}
 else{const nb=clamp(o.b[j]+dl,-ZMAX,ZMAX);pr.b[j]=nb;pr.f[j]=symProf?clamp(o.f[j]-dl,nb+PROF_MIN,ZMAX):Math.max(o.f[j],nb+PROF_MIN)}}}
/* nearest front or back edge of the part to a screen point, if close enough */
function sideGrabAt(p,mx,my){const poly=profPoly(p),n=poly.length/2-1,thr=touchMode?32:20;let best=null,bd=thr;
 for(let k=0;k<poly.length;k++){const a=poly[k],c=poly[(k+1)%poly.length];if(k===n)continue;if(k===poly.length-1)continue;
  const ax=zToX(a[0]),ay=yToS(a[1]),cx2=zToX(c[0]),cy2=yToS(c[1]),dx=cx2-ax,dy=cy2-ay,L=dx*dx+dy*dy||1,t=clamp(((mx-ax)*dx+(my-ay)*dy)/L,0,1),px=ax+t*dx,py=ay+t*dy,dd=Math.hypot(mx-px,my-py);
  if(dd<bd){bd=dd;best={s:k<n?'f':'b',sx:px,sy:py,y:sToY(py)}}}
 return best}
function syncSideOpts(){const f=view2d!=='side',L=$('#sSymL'),sy=$('#sSym'),sub=$('#sOptSub');if(!L)return;L.textContent=f?'Left and right move together':'Front and back move together';sy.checked=f?symOn:symProf;sub.textContent=f?'Drag the edge of a shape to bend it. These settings are the same in Front and Side.':'Just drag the edge of a part to pull it. These settings are the same in Front and Side.'}
function smoothFront(p){const n=p.pts.length;if(n<4)return false;const q=resample(p.pts,Math.max(n,64));for(let k=0;k<3;k++){const o=q.map(a=>a.slice());for(let i=0;i<q.length;i++){const a=o[(i+q.length-1)%q.length],b=o[i],c=o[(i+1)%q.length];q[i]=[(a[0]+2*b[0]+c[0])/4,(a[1]+2*b[1]+c[1])/4]}}p.pts=q;return true}
let sideOptOpen=true;
function reshapeActive(){return view2d==='side'?sideTool==='edit':tool==='reshape'}
function sideOptsVis(){const P=$('#sidePanel'),B=$('#sideAdvBtn');if(!P||!B)return;P.hidden=!(sideOptOpen&&reshapeActive());{const ap=$('#app');ap.classList.toggle('ropen',!P.hidden);if(!P.hidden)requestAnimationFrame(()=>{ap.style.setProperty('--ph',P.offsetHeight+'px');try{resize3d()}catch(e){}});else requestAnimationFrame(()=>{try{resize3d()}catch(e){}})}B.setAttribute('aria-pressed',!P.hidden?'true':'false')}
function wireSideAdv(){const P=$('#sidePanel'),B=$('#sideAdvBtn');
 B.onclick=()=>{if(!reshapeActive()){sideOptOpen=true;if(view2d==='side')setSideTool('edit');else setTool('reshape')}else sideOptOpen=!sideOptOpen;sideOptsVis();saveWS()};
 $('#sideAdvClose').onclick=()=>{sideOptOpen=false;sideOptsVis();saveWS()};
 const br=$('#sBrush'),bo=$('#sBrushO');br.value=sideBrush;bo.textContent=sideBrush>=100?'Whole edge':sideBrush+'%';
 br.oninput=()=>{sideBrush=+br.value;bo.textContent=sideBrush>=100?'Whole edge':sideBrush+'%'};
 $('#sSym').onchange=e=>{if(view2d==='side')symProf=e.target.checked;else setSym(e.target.checked)};syncSideOpts();
 $('#sDots').onchange=e=>{sideShowDots=e.target.checked;requestRender(true,false)};
 $('#sSmooth').onclick=()=>{const p=sel&&partById(sel);if(view2d!=='side'){if(!p){toast('Tap a part first.');return}if(smoothFront(p)){commit();requestRender()}return}if(!p||!p.prof){toast(p?'Nothing to smooth yet.':'Tap a part first.');return}const sm=a=>{const o=a.slice();for(let i=0;i<a.length;i++)a[i]=(o[Math.max(0,i-1)]+2*o[i]+o[Math.min(a.length-1,i+1)])/4};sm(p.prof.f);sm(p.prof.b);sm(p.prof.f);sm(p.prof.b);tidyProf(p);commit();requestRender()};
 $('#sReset').onclick=()=>{const p=sel&&partById(sel);if(!p){toast('Tap a part first.');return}delete p.prof;commit();requestRender();toast('Side shape reset.')}}
