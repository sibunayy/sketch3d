/* ---------- symmetry, stretchy limbs, print check and print-size lock ---------- */
let symOn=true;
/* ===== symmetry: a part and its twin stay mirror images across the centre line ===== */
const swapLR=n=>/left/i.test(n)?n.replace(/left/i,m=>m[0]==='L'?'Right':'right'):/right/i.test(n)?n.replace(/right/i,m=>m[0]==='R'?'Left':'left'):n+' mirror';
function mirrorInto(s,d){d.pts=s.pts.map(q=>[-q[0],q[1]]).reverse();d.depth=s.depth;d.round=s.round;d.z=s.z;d.blend=s.blend||0;d.melt=!!s.melt;d.cut=!!s.cut;d.color=s.color;
 if(s.prof)d.prof=clone(s.prof);else delete d.prof;d.rx=s.rx||0;d.ry=-(s.ry||0);d.rz=-(s.rz||0);d.taper=s.taper||0;d.squash=s.squash||0;
 if(s.limb){const L=s.limb;d.limb={sp:L.sp.map(q=>[-q[0],q[1]]),r0:L.r0,r1:L.r1,bend:-(L.bend||0),a:[-L.a[0],L.a[1]],c:[-L.c[0],L.c[1]]}}else delete d.limb}
function makeTwin(p){const b=bbox(p.pts);if(b.x0<1&&b.x1>-1)return null;
 const n=clone(p);n.id=uid();n.name=swapLR(p.name);n.twin=p.id;mirrorInto(p,n);p.twin=n.id;parts.push(n);return n}
function applySym(){if(!symOn)return;const ids=selIds(),S=new Set(ids);for(const id of ids){const p=partById(id);if(!p||!p.twin||S.has(p.twin))continue;const t=partById(p.twin);if(!t||t.twin!==p.id)continue;mirrorInto(p,t)}}
function linkTwins(){const m=new Map();for(const p of parts){const r=/^(.*?)\s*(left|right)$/i.exec(p.name);if(r){const k=r[1].toLowerCase();if(!m.has(k))m.set(k,[]);m.get(k).push(p)}}
 for(const a of m.values())if(a.length===2){a[0].twin=a[1].id;a[1].twin=a[0].id}}
/* ===== stretchy limbs: a path with a start width, an end width and a bend ===== */
function resampleOpen(p,n){const cum=[0];for(let i=1;i<p.length;i++)cum.push(cum[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));const L=cum[cum.length-1],o=[];let j=0;
 for(let k=0;k<n;k++){const t=k*L/(n-1);while(j<p.length-2&&cum[j+1]<t)j++;const s=cum[j+1]-cum[j],u=s>0?(t-cum[j])/s:0;o.push([p[j][0]+(p[j+1][0]-p[j][0])*u,p[j][1]+(p[j+1][1]-p[j][1])*u])}return o}
function smoothOpen(p,it){for(let k=0;k<it;k++)p=p.map((a,i)=>i===0||i===p.length-1?a:[(p[i-1][0]+2*a[0]+p[i+1][0])/4,(p[i-1][1]+2*a[1]+p[i+1][1])/4]);return p}
function limbOutline(L,a){let sp=L.sp.map(q=>[q[0],q[1]]);const n=sp.length;
 if(L.bend){const tot=L.bend*Math.PI/180,o=[[0,0]];for(let i=1;i<n;i++){const dx=L.sp[i][0]-L.sp[i-1][0],dy=L.sp[i][1]-L.sp[i-1][1],ang=tot*i/(n-1),c=Math.cos(ang),s=Math.sin(ang);o.push([o[i-1][0]+dx*c-dy*s,o[i-1][1]+dx*s+dy*c])}sp=o}
 sp=sp.map(q=>[q[0]+a[0],q[1]+a[1]]);
 const left=[],right=[],rad=[];
 for(let i=0;i<n;i++){const p0=sp[Math.max(0,i-1)],p1=sp[Math.min(n-1,i+1)];let tx=p1[0]-p0[0],ty=p1[1]-p0[1];const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;const r=L.r0+(L.r1-L.r0)*i/(n-1);rad.push(r);
  left.push([sp[i][0]-ty*r,sp[i][1]+tx*r]);right.push([sp[i][0]+ty*r,sp[i][1]-tx*r])}
 const tA=i=>{const p0=sp[Math.max(0,i-1)],p1=sp[Math.min(n-1,i+1)];return Math.atan2(p1[1]-p0[1],p1[0]-p0[0])};
 const out=left.slice(),te=tA(n-1),ts=tA(0);
 for(let k=1;k<8;k++){const th=te+Math.PI/2-Math.PI*k/8;out.push([sp[n-1][0]+Math.cos(th)*rad[n-1],sp[n-1][1]+Math.sin(th)*rad[n-1]])}
 for(let i=n-1;i>=0;i--)out.push(right[i]);
 for(let k=1;k<8;k++){const th=ts-Math.PI/2-Math.PI*k/8;out.push([sp[0][0]+Math.cos(th)*rad[0],sp[0][1]+Math.sin(th)*rad[0]])}
 return out}
function limbFinish(pts){pts=dedupeE(pts,.05);if(autoFix&&findCross(pts))pts=repairOutline(pts)||pts;return orient(pts)}
function regenLimb(p){const L=p.limb;if(!L)return;const b=bbox(p.pts);L.a=[L.a[0]+(b.cx-L.c[0]),L.a[1]+(b.cy-L.c[1])];
 p.pts=limbFinish(limbOutline(L,L.a));const nb=bbox(p.pts);L.c=[nb.cx,nb.cy]}
function finishLimb(d){const raw=dedupeE(d.pts,.3);if(raw.length<3||perim(raw)<8){toast('Drag a longer line to make a tail or arm.');return}
 const sp0=resampleOpen(smoothOpen(resampleOpen(raw,24),3),14);
 let total=0;for(let i=1;i<sp0.length;i++)total+=Math.hypot(sp0[i][0]-sp0[i-1][0],sp0[i][1]-sp0[i-1][1]);
 const r0=clamp(total*.12,2.5,10),L={sp:sp0.map(q=>[q[0]-sp0[0][0],q[1]-sp0[0][1]]),r0,r1:Math.max(1.2,r0*.45),bend:0,a:[sp0[0][0],sp0[0][1]],c:[0,0]};
 const pts=limbFinish(limbOutline(L,L.a));if(pts.length<3||Math.abs(area(pts))<2){toast('That line was too short. Try again.');return}
 const nb=bbox(pts);L.c=[nb.cx,nb.cy];
 const p=addPart(pts,'limb',{depth:Math.round(r0*2.2),round:.9,blend:3});p.limb=L;afterCreate(p)}
/* tail or arm drawn from the side: a rod along the path, its side shape taken from the stroke */
function finishLimbSide(d){const raw=dedupeE(d.pts,.3);if(raw.length<3||perim(raw)<8){toast('Drag a longer line to make a tail or arm.');return}
 const sp0=resampleOpen(smoothOpen(resampleOpen(raw,24),3),14);
 let total=0;for(let i=1;i<sp0.length;i++)total+=Math.hypot(sp0[i][0]-sp0[i-1][0],sp0[i][1]-sp0[i-1][1]);
 const r0=clamp(total*.12,2.5,10),L={sp:sp0.map(q=>[q[0]-sp0[0][0],q[1]-sp0[0][1]]),r0,r1:Math.max(1.2,r0*.45),bend:0,a:[sp0[0][0],sp0[0][1]],c:[0,0]};
 const loop=limbFinish(limbOutline(L,L.a));if(loop.length<3||Math.abs(area(loop))<2){toast('That line was too short. Try again.');return}
 const lb=bbox(loop),rx=Math.max(1.5,(r0+L.r1)/2),pts=SHAPES.circle(-rx,lb.y0,rx,Math.max(lb.y1,lb.y0+2*rx));
 const p=addPart(pts,'limb',{depth:Math.max(4,Math.round(lb.w)),round:.9,blend:3,z:Math.round(lb.cx*10)/10});
 const pr=profFromLoop(p,loop);if(pr){p.prof=pr;tidyProf(p)}
 afterCreate(p)}
/* ===== print scale lock + teacher settings ===== */
let teach={lock:true,min:30,max:100,pin:'1234',size:1},teachOpen=false,pcPieces=[],saveWarned=false;
try{const t=JSON.parse(localStorage.getItem('sketch3d.teach')||'null');if(t)teach=Object.assign(teach,t)}catch(e){}
const saveTeach=()=>{try{localStorage.setItem('sketch3d.teach',JSON.stringify(teach))}catch(e){}};
const longestSide=()=>{const b=modelBounds();return b?Math.max(b.w,b.h,b.d):0};
const sizeTargets=()=>[teach.min,Math.round((teach.min+teach.max)/2),teach.max];
const sizeNames=['Small','Medium','Large'];
function printK(){const L=longestSide();if(teach.lock)return L?sizeTargets()[teach.size]/L:1;return +$('#scale').value/100}
function renderSizeUI(){const t=sizeTargets(),box=$('#sizeChips');$('#lockBox').hidden=!teach.lock;$('#scaleBox').hidden=teach.lock;
 if(!teach.lock)return;if(!box.children.length){t.forEach((v,i)=>{const b=document.createElement('button');b.type='button';b.className='chip';b.dataset.i=i;b.onclick=()=>{teach.size=i;saveTeach();updateStats();saveWarned=false};box.appendChild(b)})}
 [...box.children].forEach((b,i)=>{b.innerHTML='<b>'+sizeNames[i]+'</b><span>'+t[i]+' mm</span>';b.setAttribute('aria-pressed',teach.size===i?'true':'false')});
 $('#sizeNote').textContent='Your toy is scaled so its longest side prints '+t[teach.size]+' mm. Sizes are set by your teacher.'}
function renderTeach(){const b=$('#teachBody');b.innerHTML='';
 if(!teachOpen){b.innerHTML='<div class="field"><label for="pin"><span>Teacher PIN</span></label><div class="pinrow"><input type="password" id="pin" inputmode="numeric" maxlength="8" autocomplete="off"><button class="btn" id="pinGo" type="button">Unlock</button></div></div><p class="sub" id="pinMsg">Ask your teacher to change the print sizes.</p>';
  const go=()=>{if($('#pin').value===teach.pin){teachOpen=true;renderTeach()}else{$('#pinMsg').textContent='That PIN is not right.';$('#pin').value=''}};$('#pinGo').onclick=go;$('#pin').onkeydown=e=>{if(e.key==='Enter')go()};return}
 b.innerHTML='<label class="switch sm"><input type="checkbox" id="tLock"><span class="track"></span><span>Lock print size to Small / Medium / Large</span></label><div class="posrow"><label>Small (mm)<input type="number" id="tMin" min="10" max="300"></label><label>Large (mm)<input type="number" id="tMax" min="10" max="300"></label><label>New PIN<input type="text" id="tPin" maxlength="8" inputmode="numeric" placeholder="keep"></label></div><div class="btnrow" style="margin-top:8px"><button class="btn primary" id="tSave" type="button">Save</button><button class="btn" id="tClose" type="button">Lock settings</button></div>';
 $('#tLock').checked=teach.lock;$('#tMin').value=teach.min;$('#tMax').value=teach.max;
 $('#tSave').onclick=()=>{teach.lock=$('#tLock').checked;let a=clamp(+$('#tMin').value||30,10,300),c=clamp(+$('#tMax').value||100,10,300);if(c<a+5)c=a+5;teach.min=a;teach.max=c;const np=$('#tPin').value.trim();if(np)teach.pin=np;saveTeach();toast('Saved.');renderTeach();updateStats()};
 $('#tClose').onclick=()=>{teachOpen=false;renderTeach()}}
/* ===== print check ===== */
function meshComponents(M){const nv=M.pos.length/3,par=new Int32Array(nv);for(let i=0;i<nv;i++)par[i]=i;const f=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x]}return x},idx=M.idx;
 for(let t=0;t<idx.length;t+=3){const a=f(idx[t]),b=f(idx[t+1]),c=f(idx[t+2]);if(a!==b)par[b]=a;const a2=f(a),c2=f(c);if(a2!==c2)par[c2]=a2}
 const cnt=new Map();for(let t=0;t<idx.length;t+=3){const r=f(idx[t]);const o=cnt.get(r)||{n:0,v:idx[t]};o.n++;cnt.set(r,o)}
 return[...cnt.values()].filter(o=>o.n>=16).sort((a,b)=>b.n-a.n)}
function findPieces(M){pcPieces=[];if(!M)return;const comps=meshComponents(M);if(comps.length<2)return;
 for(const c of comps.slice(1)){const x=M.pos[c.v*3],y=M.pos[c.v*3+1],z=M.pos[c.v*3+2];let best=null,bd=1e9;for(let j=0;j<M.act.length;j++){if(M.act[j].cut)continue;const d=partSdf(M.Ps[j],x,y,z);if(d<bd){bd=d;best=M.act[j].id}}pcPieces.push({id:best})}}
function printCheck(){const k=printK(),out=[],sol=parts.filter(p=>!p.cut&&p.pts.length>2);if(!sol.length)return out;
 const seen=new Set();for(const pc of pcPieces){const p=partById(pc.id);if(p&&!seen.has(p.id)){seen.add(p.id);out.push({lv:'bad',id:p.id,msg:p.name+' is not touching the rest of your toy, so it would fall off. Move it so it overlaps.'})}}
 for(const p of sol){const b=bbox(p.pts),th=p.depth*k,ce=fcache.get(p.id);let w=Math.min(b.w,b.h);if(ce&&ce.F&&ce.F.rin)w=Math.min(w,2*ce.F.rin);w*=k;
  if(th<1.6)out.push({lv:'bad',id:p.id,msg:p.name+' is only '+th.toFixed(1)+' mm thick when printed. Make it thicker.'});
  else if(w<1.6)out.push({lv:'bad',id:p.id,msg:p.name+' is very thin ('+w.toFixed(1)+' mm). It could snap. Make it wider.'});
  else if(th<2.4||w<2.4)out.push({lv:'warn',id:p.id,msg:p.name+' is quite thin. Handle it gently.'})}
 const L=longestSide()*k;if(!teach.lock){if(L<20)out.push({lv:'bad',id:null,msg:'Your toy would print only '+Math.round(L)+' mm long. That is tiny.'});else if(L>180)out.push({lv:'warn',id:null,msg:'Your toy would print '+Math.round(L)+' mm long. It may not fit on the printer.'})}
 return out}
let pcSig='';
let pcOpen=false;document.addEventListener('click',e=>{if(pcOpen&&!e.target.closest('#pcPop')){pcOpen=false;const p=$('#pcPop');if(p){p.hidden=true;const b=p.previousSibling;if(b)b.setAttribute('aria-expanded','false')}}});
function renderCheck(){const iss=printCheck(),k=printK(),b=modelBounds(),sig=JSON.stringify([iss.map(i=>i.msg),b&&[b.w,b.h,b.d].map(v=>Math.round(v*k))]);if(sig===pcSig)return;pcSig=sig;
 const bad=iss.filter(i=>i.lv==='bad').length;if(!bad)saveWarned=false;
 const html=(el)=>{el.innerHTML='';const hdr=el.id==='pcheck';const h=document.createElement(hdr?'button':'div');if(hdr)h.type='button';h.className='pcs '+(bad?'bad':iss.length?'warn':'ok');
  h.textContent=!parts.length?'Add a shape to start.':bad?'Fix '+bad+' thing'+(bad>1?'s':'')+' before printing':iss.length?'Looks okay (with a tip)':'Ready to print!';
  const host=hdr?document.createElement('div'):el;if(hdr){host.className='pcpop';host.id='pcPop';host.hidden=!pcOpen;h.setAttribute('aria-haspopup','true');h.setAttribute('aria-expanded',pcOpen?'true':'false');h.title='Click to see the print size and tips';h.onclick=e=>{e.stopPropagation();if(window.closePops)closePops('#pcPop');pcOpen=!pcOpen;host.hidden=!pcOpen;h.setAttribute('aria-expanded',pcOpen?'true':'false')};el.appendChild(h);el.appendChild(host)}else el.appendChild(h);
  if(b){const s=document.createElement('div');s.className='psz';s.textContent='Prints about '+(b.w*k).toFixed(0)+' × '+(b.h*k).toFixed(0)+' × '+(b.d*k).toFixed(0)+' mm';host.appendChild(s)}
  if(hdr&&!iss.length&&parts.length){const t=document.createElement('div');t.className='pci ok';t.textContent='No problems found. This model is ready to save and print.';host.appendChild(t)}
  for(const i of iss.slice(0,4)){const r=document.createElement('button');r.type='button';r.className='pci '+i.lv;r.textContent=i.msg;if(i.id)r.onclick=()=>select(i.id);host.appendChild(r)}};
 html($('#pcheck'));html($('#sheetCheck'));$('#saveBtn').textContent=saveWarned?'Save anyway':'Save .zip'}
