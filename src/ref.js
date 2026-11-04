/* ---------- reference picture, one per view: move, scale, crop, opacity, over / under ---------- */
const REF={front:null,side:null};
let refMode='off',refDrag=null;
const REFKEY='sketch3d.ref';
const newRef=(img,src)=>({img,src,u:0,y:limits.h/2,w:Math.min(limits.w*.9,90),asp:img.height/img.width,op:.55,over:false,show:true,crop:[0,0,0,0]});
/* screen geometry of the picture; u is the horizontal world coordinate (x in front view, -z in side view) */
function refGeom(v){const R=REF[v];if(!R||!R.img)return null;const ox=v==='front'?V.ox:Vs.ox,s=V.s,cx=ox+R.u*s,cy=V.oy-R.y*s,W=R.w*s,H=R.w*R.asp*s,[l,t,r,b]=R.crop;
 return{R,cx,cy,W,H,cl:cx-W/2+l*W,ct:cy-H/2+t*H,cr:cx+W/2-r*W,cb:cy+H/2-b*H}}
function drawRef(x,v,layer){const g=refGeom(v);if(!g||!g.R.show||(g.R.over?'over':'under')!==layer)return;const R=g.R,[l,t,r,b]=R.crop,iw=R.img.width,ih=R.img.height,sw=iw*(1-l-r),sh=ih*(1-t-b);if(sw<2||sh<2)return;
 x.save();x.globalAlpha=R.op;x.drawImage(R.img,iw*l,ih*t,sw,sh,g.cl,g.ct,g.cr-g.cl,g.cb-g.ct);x.restore()}
function refHandles(g){const mx=(g.cl+g.cr)/2,my=(g.ct+g.cb)/2;
 return refMode==='move'?[{k:'c',n:'tl',x:g.cl,y:g.ct},{k:'c',n:'tr',x:g.cr,y:g.ct},{k:'c',n:'bl',x:g.cl,y:g.cb},{k:'c',n:'br',x:g.cr,y:g.cb}]
 :[{k:'e',n:'l',x:g.cl,y:my},{k:'e',n:'r',x:g.cr,y:my},{k:'e',n:'t',x:mx,y:g.ct},{k:'e',n:'b',x:mx,y:g.cb}]}
function drawRefHandles(x,v){if(refMode==='off')return;const g=refGeom(v);if(!g||!g.R.show)return;const ac=css('--accent'),pn=css('--panel'),hs=touchMode?11:7;
 x.save();x.strokeStyle=ac;x.lineWidth=2;x.setLineDash([6,4]);x.strokeRect(g.cl,g.ct,g.cr-g.cl,g.cb-g.ct);x.setLineDash([]);x.fillStyle=pn;
 for(const h of refHandles(g)){x.beginPath();if(h.k==='c')x.rect(h.x-hs,h.y-hs,hs*2,hs*2);else x.arc(h.x,h.y,hs,0,7);x.fill();x.stroke()}x.restore()}
function refDown(e,v){if(refMode==='off')return false;const g=refGeom(v);if(!g||!g.R.show)return false;const r=(v==='front'?cv:cvS).getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
 let hit=null,bd=touchMode?30:15;for(const h of refHandles(g)){const d=Math.hypot(h.x-mx,h.y-my);if(d<bd){bd=d;hit=h}}
 if(hit){refDrag={v,type:hit.k==='c'?'scale':'crop',n:hit.n,mx,my,w0:g.R.w,crop0:g.R.crop.slice(),g};return true}
 if(refMode==='move'&&mx>=g.cl&&mx<=g.cr&&my>=g.ct&&my<=g.cb){refDrag={v,type:'move',mx,my,u0:g.R.u,y0:g.R.y,g};return true}
 return false}
function refMove(e){const d=refDrag,r=(d.v==='front'?cv:cvS).getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,R=REF[d.v],s=V.s;
 if(d.type==='move'){R.u=d.u0+(mx-d.mx)/s;R.y=d.y0-(my-d.my)/s}
 else if(d.type==='scale'){const g=d.g,c0=Math.hypot(d.mx-g.cx,d.my-g.cy)||1,c1=Math.hypot(mx-g.cx,my-g.cy);R.w=clamp(d.w0*c1/c0,5,600)}
 else{const g=d.g,c=d.crop0.slice();
  if(d.n==='l')c[0]=clamp(c[0]+(mx-d.mx)/g.W,0,.92-c[2]);if(d.n==='r')c[2]=clamp(c[2]-(mx-d.mx)/g.W,0,.92-c[0]);
  if(d.n==='t')c[1]=clamp(c[1]+(my-d.my)/g.H,0,.92-c[3]);if(d.n==='b')c[3]=clamp(c[3]-(my-d.my)/g.H,0,.92-c[1]);R.crop=c}
 syncRefUI();requestRender(true,false)}
function refUp(){refDrag=null;saveRef()}
/* ----- loading, saving ----- */
function loadRefFile(file,v){if(!file||!/^image\//.test(file.type)){toast('Please choose a picture file.');return}
 const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const m=1000,k=Math.min(1,m/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);
  const src=c.toDataURL(file.type==='image/png'&&file.size<500000?'image/png':'image/jpeg',.85),im2=new Image();im2.onload=()=>{REF[v]=newRef(im2,src);refMode='move';syncRefUI();saveRef();requestRender(true,false);toast('Picture added. Drag it into place, then tap Done.')};im2.src=src};im.onerror=()=>toast('That picture could not be opened.');im.src=fr.result};fr.readAsDataURL(file)}
function saveRef(){try{const o={};for(const v of['front','side']){const R=REF[v];if(R)o[v]={src:R.src,u:R.u,y:R.y,w:R.w,op:R.op,over:R.over,show:R.show,crop:R.crop}}localStorage.setItem(REFKEY,JSON.stringify(o))}catch(e){}}
function restoreRef(){try{const o=JSON.parse(localStorage.getItem(REFKEY)||'null');if(!o)return;for(const v of['front','side']){const d=o[v];if(!d||!d.src)continue;const im=new Image();im.onload=()=>{REF[v]=Object.assign(newRef(im,d.src),{u:d.u,y:d.y,w:d.w,op:d.op,over:!!d.over,show:d.show!==false,crop:d.crop||[0,0,0,0]});syncRefUI();requestRender(true,false)};im.src=d.src}}catch(e){}}
/* ----- panel ----- */
function syncRefUI(){const v=view2d,R=REF[v],has=!!R;$('#refTitle').textContent='Picture · '+(v==='front'?'front':'side')+' view';
 $('#refEmpty').hidden=has;$('#refBody').hidden=!has;$('#refBtn').setAttribute('aria-pressed',(has&&R.show)?'true':'false');if(!has)return;
 const set=(id,val,out)=>{const i=$('#'+id);if(i!==document.activeElement)i.value=val;if(out)$(out).textContent=i.dataset.fmt?i.dataset.fmt.replace('#',Math.round(val)):Math.round(val)};
 set('refOp',Math.round(R.op*100),'#refOpO');set('refSize',Math.round(R.w),'#refSizeO');
 [['refCl',0],['refCt',1],['refCr',2],['refCb',3]].forEach(([id,k])=>set(id,Math.round(R.crop[k]*100)));
 $('#refShow').checked=R.show;
 document.querySelectorAll('#refMode button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===refMode?'true':'false'));
 document.querySelectorAll('#refLayer button').forEach(b=>b.setAttribute('aria-pressed',(b.dataset.l==='over')===R.over?'true':'false'))}
function wireRef(){
 $('#refBtn').onclick=()=>{const p=$('#refPanel');p.hidden=!p.hidden;if(p.hidden){refMode='off'}syncRefUI();requestRender(true,false)};
 $('#refClose').onclick=()=>{$('#refPanel').hidden=true;refMode='off';syncRefUI();requestRender(true,false)};
 $('#refPick').onclick=()=>$('#refFile').click();$('#refPick2').onclick=()=>$('#refFile').click();
 $('#refFile').onchange=e=>{loadRefFile(e.target.files[0],view2d);e.target.value=''};
 const R=()=>REF[view2d],upd=()=>{syncRefUI();saveRef();requestRender(true,false)};
 $('#refOp').oninput=e=>{if(R()){R().op=e.target.value/100;upd()}};
 $('#refSize').oninput=e=>{if(R()){R().w=+e.target.value;upd()}};
 [['refCl',0],['refCt',1],['refCr',2],['refCb',3]].forEach(([id,k])=>{$('#'+id).oninput=e=>{const r=R();if(!r)return;const c=r.crop.slice();c[k]=Math.min(e.target.value/100,.92-c[k^2]);r.crop=c;upd()}});
 $('#refShow').onchange=e=>{if(R()){R().show=e.target.checked;upd()}};
 $('#refMode').onclick=e=>{const b=e.target.closest('button');if(!b||!R())return;refMode=b.dataset.m;upd()};
 $('#refLayer').onclick=e=>{const b=e.target.closest('button');if(!b||!R())return;R().over=b.dataset.l==='over';upd()};
 $('#refReset').onclick=()=>{const r=R();if(!r)return;Object.assign(r,{u:0,y:limits.h/2,w:Math.min(limits.w*.9,90),op:.55,crop:[0,0,0,0]});upd()};
 $('#refRemove').onclick=()=>{REF[view2d]=null;refMode='off';upd();toast('Reference removed.')};
 const st=$('#s2d');st.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault()});
 st.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f){e.preventDefault();loadRefFile(f,view2d)}});syncRefUI()}
/* the picture handles run before the normal tools and only take over when they are actually hit */
for(const [c,v] of [[cv,'front'],[cvS,'side']]){
 c.addEventListener('pointerdown',e=>{if(e.button!==0||view2d!==v)return;if(refDown(e,v)){e.stopImmediatePropagation();c.setPointerCapture(e.pointerId)}},true);
 c.addEventListener('pointermove',e=>{if(refDrag&&refDrag.v===v){e.stopImmediatePropagation();refMove(e)}},true);
 c.addEventListener('pointerup',e=>{if(refDrag&&refDrag.v===v){e.stopImmediatePropagation();refUp()}},true);
 c.addEventListener('pointercancel',e=>{if(refDrag&&refDrag.v===v){e.stopImmediatePropagation();refUp()}},true)}
const _sv=setView;setView=function(v){_sv(v);try{syncRefUI()}catch(e){}};
