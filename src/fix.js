/* ---------- outline repair: close and untwist (the shape itself is never reshaped) ---------- */
let autoFix=true;
const orient=p=>area(p)<0?p.slice().reverse():p;
function dedupeE(pts,eps){const o=[];for(const p of pts){const q=o[o.length-1];if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>eps)o.push(p)}
 while(o.length>1&&Math.hypot(o[0][0]-o[o.length-1][0],o[0][1]-o[o.length-1][1])<=eps)o.pop();return o}
/* proper crossing of segments ab and cd (endpoint touches are ignored) */
function segX(a,b,c,d){const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-12)return null;
 const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
 if(t<=1e-9||t>=1-1e-9||u<=1e-9||u>=1-1e-9)return null;return[a[0]+t*rx,a[1]+t*ry]}
function findCross(p){const n=p.length;for(let i=0;i<n;i++){const a=p[i],b=p[(i+1)%n];for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;const x=segX(a,b,p[j],p[(j+1)%n]);if(x)return{i,j,x}}}return null}
function crossings(pts){const p=dedupeE(pts,.02),n=p.length,out=[];for(let i=0;i<n&&out.length<8;i++){const a=p[i],b=p[(i+1)%n];for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;const x=segX(a,b,p[j],p[(j+1)%n]);if(x)out.push(x)}}return out}
/* a crossing splits the outline into two loops; keep the bigger one and drop the twisted tail */
function removeCrossings(p){for(let k=0;k<60;k++){const c=findCross(p);if(!c)return p;const{i,j,x}=c,A=[x,...p.slice(i+1,j+1)],B=[x,...p.slice(j+1),...p.slice(0,i+1)];p=dedupeE(Math.abs(area(A))>=Math.abs(area(B))?A:B,.02)}return p}
function despike(p){let go=true,g=0;while(go&&g++<30&&p.length>3){go=false;for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length],ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1],lu=Math.hypot(ux,uy),lv=Math.hypot(vx,vy);
  if(lu>0&&lv>0&&(ux*vx+uy*vy)/(lu*lv)<-.985){p.splice(i,1);go=true;break}}}return p}
function repairOutline(pts){let p=dedupeE(pts,.05);if(p.length<3)return null;p=removeCrossings(p);p=despike(dedupeE(p,.05));if(p.length<3)return null;
 p=orient(p);if(p.length>160)p=resample(p,160);return Math.abs(area(p))<1?null:p}
/* ---------- status + actions ---------- */
function outlineStatus(p){const q=dedupeE(p.pts,.02);
 if(findCross(q))return{kind:'bad',msg:'This outline crosses itself, which twists the 3D shape. '+(autoFix?'Press Fix outline now.':'Turn on auto-fix or press Fix outline now.')};
 return{kind:'ok',msg:'Closed and clean.'}}
function outlineRow(p){const f=document.createElement('div'),st=outlineStatus(p);f.className='field';f.innerHTML='<div class="rl"><span>Outline</span></div><p class="sub" id="ostat"></p>';
 const s=f.querySelector('#ostat');s.textContent=st.msg;s.classList.add(st.kind);f.appendChild(mkBtn('Fix outline now','',fixSel));return f}
function fixSel(){const p=sel&&partById(sel);if(!p)return;const had=!!findCross(dedupeE(p.pts,.02)),q=repairOutline(p.pts);
 if(!q){toast('This outline is too small or flat to fix. Try redrawing it.');return}p.pts=q;commit();requestRender();toast(had?'Outline fixed.':'Outline was already clean.')}
function fixAllParts(){let n=0;for(const p of parts){if(findCross(dedupeE(p.pts,.02))){const q=repairOutline(p.pts);if(q){p.pts=q;n++}}}return n}
$('#autofix').onchange=e=>{autoFix=e.target.checked;if(autoFix){const n=fixAllParts();if(n){toast('Fixed '+n+' part'+(n>1?'s':'')+'.');commit()}else persist()}else persist();refreshUI();requestRender()};
$('#fixAll').onclick=()=>{const n=fixAllParts();if(n){commit();toast('Fixed '+n+' part'+(n>1?'s':'')+'.')}else toast('All outlines are already clean.');requestRender()};
