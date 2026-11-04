/* ---------- signed-distance model: rounded extrusions, smooth blending, surface nets ---------- */
let blendOn=true;
const BIG=1e4;
/* 2D signed distance grid for one outline, stored relative to the outline's own corner so moving a part reuses it */
function makeField(pts,h,margin){const b=bbox(pts),n=pts.length,nx=Math.ceil((b.w+2*margin)/h)+1,ny=Math.ceil((b.h+2*margin)/h)+1;
 const X=new Float64Array(n),Y=new Float64Array(n),ex=new Float64Array(n),ey=new Float64Array(n),il=new Float64Array(n);
 for(let i=0;i<n;i++){X[i]=pts[i][0]-b.x0;Y[i]=pts[i][1]-b.y0}
 for(let i=0;i<n;i++){const j=(i+1)%n;ex[i]=X[j]-X[i];ey[i]=Y[j]-Y[i];const l2=ex[i]*ex[i]+ey[i]*ey[i];il[i]=l2>0?1/l2:0}
 const d=new Float32Array(nx*ny),gx=-margin,gy=-margin,xs=[];let rin=0;
 for(let j=0;j<ny;j++){const py=gy+(j+.5)*h;xs.length=0;
  for(let i=0;i<n;i++){const k=(i+1)%n;if((Y[i]<=py)!==(Y[k]<=py))xs.push(X[i]+(py-Y[i])*ex[i]/ey[i])}
  xs.sort((a,c)=>a-c);
  for(let i=0;i<nx;i++){const px=gx+(i+.5)*h;let best=1e18;
   for(let e=0;e<n;e++){let t=((px-X[e])*ex[e]+(py-Y[e])*ey[e])*il[e];t=t<0?0:t>1?1:t;const dx=px-X[e]-t*ex[e],dy=py-Y[e]-t*ey[e],q=dx*dx+dy*dy;if(q<best)best=q}
   let inside=false;for(let m=0;m+1<xs.length;m+=2){if(px>=xs[m]&&px<xs[m+1]){inside=true;break}}
   const dist=Math.sqrt(best);d[j*nx+i]=inside?-dist:dist;if(inside&&dist>rin)rin=dist}}
 return{d,nx,ny,h,gx,gy,ox:b.x0,oy:b.y0,margin,rin}}
function fieldAt(F,x,y){x-=F.ox;y-=F.oy;const nx=F.nx,ny=F.ny;let u=(x-F.gx)/F.h-.5,v=(y-F.gy)/F.h-.5;
 if(u<-.5||v<-.5||u>nx-.5||v>ny-.5){const ex=Math.max(F.gx-x,0,x-(F.gx+nx*F.h)),ey=Math.max(F.gy-y,0,y-(F.gy+ny*F.h));return F.margin+Math.hypot(ex,ey)}
 u=u<0?0:u>nx-1?nx-1:u;v=v<0?0:v>ny-1?ny-1:v;let i=u|0,j=v|0;if(i>nx-2)i=nx-2;if(j>ny-2)j=ny-2;if(i<0)i=0;if(j<0)j=0;
 const fu=u-i,fv=v-j,k=j*nx+i,d=F.d;return(d[k]*(1-fu)+d[k+1]*fu)*(1-fv)+(d[k+nx]*(1-fu)+d[k+nx+1]*fu)*fv}
/* Roundness 0..100%: first half rolls the edge into a full radius, second half inflates the whole face into a dome. */
const D2R=Math.PI/180;
/* smooth curve through control values (Catmull-Rom), t in 0..1 */
function crAt(a,t){const n=a.length;t=t<0?0:t>1?1:t;const x=t*(n-1);let i=Math.floor(x);if(i>=n-1)i=n-2;const u=x-i,p0=a[Math.max(0,i-1)],p1=a[i],p2=a[i+1],p3=a[Math.min(n-1,i+2)];
 return .5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u)}
const PROF_MIN=.14;
function profHalfC(pr,t){const f=crAt(pr.f,t),b=crAt(pr.b,t);const h=Math.max((f-b)/2,PROF_MIN/2);return[(f+b)/2,h]}
function rotMat(p){const a=(p.rx||0)*D2R,b=(p.ry||0)*D2R,g=(p.rz||0)*D2R;if(!a&&!b&&!g)return null;
 const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);
 /* R = Rz*Ry*Rx (row-major) */
 return[cg*cb,cg*sb*sa-sg*ca,cg*sb*ca+sg*sa, sg*cb,sg*sb*sa+cg*ca,sg*sb*ca-cg*sa, -sb,cb*sa,cb*ca]}
function partWarp(p){const sq=clamp((p.squash||0)/100,-.6,.8),b=1+sq,a=1/Math.sqrt(b),tp=clamp((p.taper||0)/100,-1,1);return{a,b,tp}}
function partBox(p){const b=bbox(p.pts),R=rotMat(p),W=partWarp(p),hDp=p.depth/2,z0=p.z+(p.prof?Math.min(...p.prof.b,-.05):-1)*hDp,z1=p.z+(p.prof?Math.max(...p.prof.f,.05):1)*hDp,warp=W.a!==1||W.b!==1;
 if(!R&&!warp)return{x0:b.x0,x1:b.x1,y0:b.y0,y1:b.y1,z0,z1};
 const o={x0:1e9,x1:-1e9,y0:1e9,y1:-1e9,z0:1e9,z1:-1e9};
 for(const sx of[b.x0,b.x1])for(const sy of[b.y0,b.y1])for(const sz of[z0,z1]){let x=(sx-b.cx)*W.a,y=(sy-b.cy)*W.b,z=(sz-p.z)*W.a;
  if(R){const X=R[0]*x+R[1]*y+R[2]*z,Y=R[3]*x+R[4]*y+R[5]*z,Z=R[6]*x+R[7]*y+R[8]*z;x=X;y=Y;z=Z}
  x+=b.cx;y+=b.cy;z+=p.z;o.x0=Math.min(o.x0,x);o.x1=Math.max(o.x1,x);o.y0=Math.min(o.y0,y);o.y1=Math.max(o.y1,y);o.z0=Math.min(o.z0,z);o.z1=Math.max(o.z1,z)}return o}
function partParams(p,F){const hD=p.depth/2,rin=Math.max(F.rin,.01),rc=Math.min(hD,rin),t=p.cut?0:clamp(p.round,0,1);let rxy,rz;
 if(t<=.5){rxy=rz=rc*2*t}else{const s=2*t-1;rxy=rc+(Math.max(rc,rin*.98)-rc)*s;rz=rc+(hD-rc)*s}
 if(rxy<1e-3||rz<1e-3){rxy=0;rz=0}const k=rz>0?rxy/rz:1;
 const R=rotMat(p),bb=bbox(p.pts),W=partWarp(p),warp=W.a!==1||W.b!==1||W.tp!==0;let PR=null;if(p.prof&&p.prof.f&&p.prof.b){PR={c:new Float32Array(48),h:new Float32Array(48)};for(let i=0;i<48;i++){const q=profHalfC(p.prof,i/47);PR.c[i]=q[0]*hD;PR.h[i]=q[1]*hD}}
 return{F,zc:p.z,hD,rxy,rz,k,ks:k>1?Math.sqrt(k):1,R,cx:bb.cx,cy:bb.cy,W:warp?W:null,PR,hh:Math.max(bb.h/2,.01),X:!!R||warp||!!PR}}
function partSdfD(P,d2,z){
 if(P.rxy===0){const zz=Math.abs(z-P.zc)-P.hD;const ma=d2>0?d2:0,mz=zz>0?zz:0;return Math.min(Math.max(d2,zz),0)+Math.sqrt(ma*ma+mz*mz)}
 const zs=(z-P.zc)*P.k,a=d2+P.rxy,zz=Math.abs(zs)-(P.hD*P.k-P.rxy);
 const ma=a>0?a:0,mz=zz>0?zz:0;return(Math.min(Math.max(a,zz),0)+Math.sqrt(ma*ma+mz*mz)-P.rxy)/P.ks}
function partSdf(P,x,y,z){if(!P.X)return partSdfD(P,fieldAt(P.F,x,y),z);
 let dx=x-P.cx,dy=y-P.cy,dz=z-P.zc;const R=P.R,W=P.W;
 if(R){const lx=R[0]*dx+R[3]*dy+R[6]*dz,ly=R[1]*dx+R[4]*dy+R[7]*dz,lz=R[2]*dx+R[5]*dy+R[8]*dz;dx=lx;dy=ly;dz=lz}
 let f=1;
 if(W){dx/=W.a;dy/=W.b;dz/=W.a;f=Math.min(W.a,W.b);
  if(W.tp){let u=(dy/P.hh+1)*.5;u=u<0?0:u>1?1:u;const s=W.tp>0?1-.9*W.tp*u:1-.9*(-W.tp)*(1-u);dx/=s;dz/=s;f*=s}}
 const PR=P.PR;if(PR){let u=(dy/P.hh+1)*.5;u=u<0?0:u>1?1:u;const g=u*47,i=g|0,j=i>46?47:i+1,w=g-i,c=PR.c[i]+(PR.c[j]-PR.c[i])*w,h=PR.h[i]+(PR.h[j]-PR.h[i])*w,s=h/P.hD;dz=(dz-c)/s;if(s<1)f*=s}
 return partSdfD(P,fieldAt(P.F,P.cx+dx,P.cy+dy),P.zc+dz)*f}
function smin(a,b,k){if(k<=1e-6)return a<b?a:b;const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25}
function getField(p,h,margin,cache){const b=bbox(p.pts);let s=h.toFixed(3)+'|'+margin.toFixed(2)+'|';for(const q of p.pts)s+=(q[0]-b.x0).toFixed(3)+','+(q[1]-b.y0).toFixed(3)+' ';
 const c=cache&&cache.get(p.id);if(c&&c.sig===s)return c.F;const F=makeField(p.pts,h,margin);if(cache)cache.set(p.id,{sig:s,F});return F}
/* Build the whole model as one smooth mesh: every part's distance field, blended, then polygonised. */
function buildModel(parts,order,v,opt){const act=order.filter(p=>p.pts.length>2);if(!act.some(p=>!p.cut))return null;
 const on=true,isOff=p=>!p.melt||p.cut,mb=on?Math.max(0,...act.map(p=>isOff(p)?0:p.blend||0)):0;let gv=v,dims;
 const boxes=act.map(partBox);
 const U={x0:1e9,y0:1e9,z0:1e9,x1:-1e9,y1:-1e9,z1:-1e9};
 act.forEach((p,i)=>{if(p.cut)return;const b=boxes[i];U.x0=Math.min(U.x0,b.x0);U.x1=Math.max(U.x1,b.x1);U.y0=Math.min(U.y0,b.y0);U.y1=Math.max(U.y1,b.y1);U.z0=Math.min(U.z0,b.z0);U.z1=Math.max(U.z1,b.z1)});
 if(opt.sculpt)for(const d of opt.sculpt){if(d.t!=='add'&&d.t!=='grab')continue;for(const sx of(d.s?[1,-1]:[1])){const x=d.c[0]*sx+(d.t==='grab'?d.d[0]*sx:0);if(d.t==='grab'){U.x0=Math.min(U.x0,x-d.r*1.3);U.x1=Math.max(U.x1,x+d.r*1.3);U.y0=Math.min(U.y0,d.c[1]+d.d[1]-d.r);U.y1=Math.max(U.y1,d.c[1]+d.d[1]+d.r);U.z0=Math.min(U.z0,d.c[2]+d.d[2]-d.r);U.z1=Math.max(U.z1,d.c[2]+d.d[2]+d.r);continue}U.x0=Math.min(U.x0,x-d.r);U.x1=Math.max(U.x1,x+d.r);U.y0=Math.min(U.y0,d.c[1]-d.r);U.y1=Math.max(U.y1,d.c[1]+d.r);U.z0=Math.min(U.z0,d.c[2]-d.r);U.z1=Math.max(U.z1,d.c[2]+d.r)}}
 for(let tries=0;tries<8;tries++){const pad=mb/2+2*gv+1;dims=[Math.ceil((U.x1-U.x0+2*pad)/gv)+1,Math.ceil((U.y1-U.y0+2*pad)/gv)+1,Math.ceil((U.z1-U.z0+2*pad)/gv)+1];if(dims[0]*dims[1]*dims[2]<=14e6)break;gv*=1.25}
 const pad=mb/2+2*gv+1,h2=clamp(gv*.6,.4,1.5),margin=mb+3*gv+1,[nx,ny,nz]=dims,gx0=U.x0-pad,gy0=U.y0-pad,gz0=U.z0-pad;
 const Ps=act.map(p=>partParams(p,getField(p,h2,margin,opt.cache)));
 const kk=act.map((p,i)=>{if(p.cut)return 0;let k=isOff(p)?0:(p.blend||0);for(let j=0;j<i;j++){if(isOff(act[j]))continue;const a=boxes[i],b=boxes[j];if(a.x0<b.x1+mb&&a.x1>b.x0-mb&&a.y0<b.y1+mb&&a.y1>b.y0-mb&&a.z0<b.z1+mb&&a.z1>b.z0-mb)k=Math.max(k,act[j].blend||0)}return k});
 const N=nx*ny*nz,F=new Float32Array(N).fill(BIG),nxy=nx*ny,H=null,C=act.some(p=>p.cut)?new Float32Array(N).fill(BIG):null;
 let kc=0;for(const p of act)if(p.cut)kc=Math.max(kc,Math.min(p.blend||0,6));
 for(let i=0;i<act.length;i++){const b=boxes[i],P=Ps[i],k=kk[i],T=act[i].cut?C:F,m=k+2*gv+1,thr=(k+2*gv+1)*P.ks+P.rxy;
  const i0=Math.max(0,Math.floor((b.x0-m-gx0)/gv)),i1=Math.min(nx-1,Math.ceil((b.x1+m-gx0)/gv)),j0=Math.max(0,Math.floor((b.y0-m-gy0)/gv)),j1=Math.min(ny-1,Math.ceil((b.y1+m-gy0)/gv)),
   k0=Math.max(0,Math.floor((b.z0-m-gz0)/gv)),k1=Math.min(nz-1,Math.ceil((b.z1+m-gz0)/gv));
  if(i1<i0||j1<j0||k1<k0)continue;
  const zs=[];for(let z=k0;z<=k1;z++)zs.push(gz0+z*gv);
  if(P.X){for(let q=0;q<zs.length;q++){const z=k0+q;for(let y=j0;y<=j1;y++){const wy=gy0+y*gv;let idx=i0+nx*y+nxy*z;for(let x=i0;x<=i1;x++,idx++){const d=partSdf(P,gx0+x*gv,wy,zs[q]),c=T[idx];T[idx]=c>=BIG*.5?d:smin(c,d,k)}}}continue}
  for(let y=j0;y<=j1;y++){const wy=gy0+y*gv;for(let x=i0;x<=i1;x++){const d2=fieldAt(P.F,gx0+x*gv,wy);let idx=x+nx*y+nxy*k0;
   if(d2>thr){for(let q=0;q<zs.length;q++,idx+=nxy){if(T[idx]>=BIG*.5)T[idx]=d2}continue}
   for(let q=0;q<zs.length;q++,idx+=nxy){const d=partSdfD(P,d2,zs[q]),c=T[idx];T[idx]=c>=BIG*.5?d:smin(c,d,k)}}}}
 if(H)for(let q=0;q<N;q++)if(H[q]<F[q])F[q]=H[q];
 if(C)for(let q=0;q<N;q++){const c=C[q];if(c>=BIG*.5)continue;const a=F[q];F[q]=kc>1e-6?-smin(-a,c,kc):(a>-c?a:-c)}
 if(opt.grooves&&opt.grooves.length){const carve=(a,b,r)=>{const m=r+gv*1.5,i0=Math.max(0,Math.floor((Math.min(a[0],b[0])-m-gx0)/gv)),i1=Math.min(nx-1,Math.ceil((Math.max(a[0],b[0])+m-gx0)/gv)),j0=Math.max(0,Math.floor((Math.min(a[1],b[1])-m-gy0)/gv)),j1=Math.min(ny-1,Math.ceil((Math.max(a[1],b[1])+m-gy0)/gv)),k0=Math.max(0,Math.floor((Math.min(a[2],b[2])-m-gz0)/gv)),k1=Math.min(nz-1,Math.ceil((Math.max(a[2],b[2])+m-gz0)/gv));
   const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],L=dx*dx+dy*dy+dz*dz||1e-9;
   for(let z=k0;z<=k1;z++)for(let y=j0;y<=j1;y++){let idx=i0+nx*y+nxy*z;for(let x=i0;x<=i1;x++,idx++){const px=gx0+x*gv,py=gy0+y*gv,pz=gz0+z*gv;let t=((px-a[0])*dx+(py-a[1])*dy+(pz-a[2])*dz)/L;t=t<0?0:t>1?1:t;const ex=a[0]+t*dx-px,ey=a[1]+t*dy-py,ez=a[2]+t*dz-pz,d=Math.sqrt(ex*ex+ey*ey+ez*ez)-r;if(-d>F[idx])F[idx]=-d}}};
  for(const g of opt.grooves){const r=g.r||1.8,P=g.pts;for(let s=0;s<P.length-1;s++)carve(P[s],P[s+1],r);if(g.sym){const Q=P.map(q=>[-q[0],q[1],q[2]]);for(let s=0;s<Q.length-1;s++)carve(Q[s],Q[s+1],r)}}}
 if(opt.sculpt&&opt.sculpt.length){const S=opt.sculpt,rng=(c,m)=>[Math.max(1,Math.floor((c[0]-m-gx0)/gv)),Math.min(nx-2,Math.ceil((c[0]+m-gx0)/gv)),Math.max(1,Math.floor((c[1]-m-gy0)/gv)),Math.min(ny-2,Math.ceil((c[1]+m-gy0)/gv)),Math.max(1,Math.floor((c[2]-m-gz0)/gv)),Math.min(nz-2,Math.ceil((c[2]+m-gz0)/gv))];
  const cen=d=>{const cs=[d.c];if(d.s&&Math.abs(d.c[0])>.05)cs.push([-d.c[0],d.c[1],d.c[2]]);return cs};let A=null;
  for(let q=0;q<S.length;){const d=S[q];
   if(d.t==='add'){let e=q;if(!A)A=new Float32Array(N);A.fill(BIG);let kmax=0;const box=[1e9,-1e9,1e9,-1e9,1e9,-1e9];
    while(e<S.length&&S[e].t==='add'){const D=S[e];kmax=Math.max(kmax,D.r*.5);for(const c of cen(D)){const [i0,i1,j0,j1,k0,k1]=rng(c,D.r*1.5+gv);box[0]=Math.min(box[0],i0);box[1]=Math.max(box[1],i1);box[2]=Math.min(box[2],j0);box[3]=Math.max(box[3],j1);box[4]=Math.min(box[4],k0);box[5]=Math.max(box[5],k1);
      for(let z=k0;z<=k1;z++)for(let y=j0;y<=j1;y++){let idx=i0+nx*y+nxy*z;for(let x=i0;x<=i1;x++,idx++){const dx=gx0+x*gv-c[0],dy=gy0+y*gv-c[1],dz=gz0+z*gv-c[2],dd=Math.sqrt(dx*dx+dy*dy+dz*dz)-D.r;if(dd<A[idx])A[idx]=dd}}}e++}
    const g=0,i0=Math.max(1,box[0]-g),i1=Math.min(nx-2,box[1]+g),j0=Math.max(1,box[2]-g),j1=Math.min(ny-2,box[3]+g),k0=Math.max(1,box[4]-g),k1=Math.min(nz-2,box[5]+g);
    for(let z=k0;z<=k1;z++)for(let y=j0;y<=j1;y++){let idx=i0+nx*y+nxy*z;for(let x=i0;x<=i1;x++,idx++){const a=A[idx];if(a<BIG*.5&&a-F[idx]<kmax)F[idx]=smin(F[idx],a,kmax)}}
    q=e;continue}
   if(d.t==='grab'){const G=F.slice(),samp=(x,y,z)=>{let fx=(x-gx0)/gv,fy=(y-gy0)/gv,fz=(z-gz0)/gv;if(fx<0||fy<0||fz<0||fx>nx-1.001||fy>ny-1.001||fz>nz-1.001)return BIG;const i=fx|0,j=fy|0,k=fz|0,u=fx-i,v=fy-j,w=fz-k,o=i+nx*j+nxy*k;
     const c00=G[o]*(1-u)+G[o+1]*u,c10=G[o+nx]*(1-u)+G[o+nx+1]*u,c01=G[o+nxy]*(1-u)+G[o+nxy+1]*u,c11=G[o+nxy+nx]*(1-u)+G[o+nxy+nx+1]*u;return (c00*(1-v)+c10*v)*(1-w)+(c01*(1-v)+c11*v)*w};
    const ops=[[d.c,d.d]];if(d.s&&Math.abs(d.c[0])>.05)ops.push([[-d.c[0],d.c[1],d.c[2]],[-d.d[0],d.d[1],d.d[2]]]);
    for(const [c,D] of ops){const L=Math.hypot(D[0],D[1],D[2]),r=Math.max(d.r,L*1.6),wf=t=>{if(t>=1)return 0;const q=1-t*t;return q*q},[i0,i1,j0,j1,k0,k1]=rng(c,r+L+gv);
     for(let z=k0;z<=k1;z++)for(let y=j0;y<=j1;y++){let idx=i0+nx*y+nxy*z;for(let x=i0;x<=i1;x++,idx++){const px=gx0+x*gv,py=gy0+y*gv,pz=gz0+z*gv;let qx=px,qy=py,qz=pz;
      for(let it=0;it<3;it++){const w=wf(Math.hypot(qx-c[0],qy-c[1],qz-c[2])/r);qx=px-D[0]*w;qy=py-D[1]*w;qz=pz-D[2]*w}
      if(qx!==px||qy!==py||qz!==pz){const v=samp(qx,qy,qz);if(v<BIG*.5||F[idx]<BIG*.5)F[idx]=Math.min(v,BIG)}}}}
    q++;continue}
   for(const c of cen(d)){const k=d.r*.4,[i0,i1,j0,j1,k0,k1]=rng(c,d.r+k+gv);
    for(let z=k0;z<=k1;z++)for(let y=j0;y<=j1;y++){let idx=i0+nx*y+nxy*z;for(let x=i0;x<=i1;x++,idx++){const dx=gx0+x*gv-c[0],dy=gy0+y*gv-c[1],dz=gz0+z*gv-c[2],dd=Math.sqrt(dx*dx+dy*dy+dz*dz);
     if(d.t==='dent'){if(F[idx]<BIG*.5)F[idx]=-smin(-F[idx],dd-d.r,k)}
     else if(dd<d.r){const a=F[idx-1],b=F[idx+1],e2=F[idx-nx],f=F[idx+nx],g2=F[idx-nxy],h=F[idx+nxy];if(F[idx]>=BIG*.5||a>=BIG*.5||b>=BIG*.5||e2>=BIG*.5||f>=BIG*.5||g2>=BIG*.5||h>=BIG*.5)continue;const w=(d.w||.4)*(1-dd/d.r)*(1-dd/d.r);F[idx]+=((a+b+e2+f+g2+h)/6-F[idx])*w}}}}
   q++}}
 const mesh=surfaceNets(F,nx,ny,nz,gv,gx0,gy0,gz0);if(!mesh.idx.length)return null;
 if(opt.project)projectCreases(mesh.pos,act,Ps,kk,boxes,gv,kc,opt);
 const M={pos:mesh.pos,nor:mesh.nor,idx:mesh.idx,act,Ps,kk,boxes,mb,v:gv};if(opt.colors)colorModel(M,opt.hl);return M}
/* Pull each mesh point onto the true surface of the parts, so hard joins (an eye on a face) stay crisp
   instead of being rounded off by the grid. Skipped near melted joins, creases and sculpting. */
function projectCreases(pos,act,Ps,kk,boxes,gv,kc,opt){const nv=pos.length/3,mg=gv*3,skip=[];
 for(const g of(opt.grooves||[]))for(const q of g.pts){const r=(g.r||1.8)+gv*2;for(const sx of(g.sym?[1,-1]:[1]))skip.push([q[0]*sx-r,q[0]*sx+r,q[1]-r,q[1]+r,q[2]-r,q[2]+r])}
 for(const d of(opt.sculpt||[])){const r=d.r*(d.t==='grab'?1.6:1.5)+gv*2+(d.d?Math.hypot(d.d[0],d.d[1],d.d[2]):0);for(const sx of(d.s?[1,-1]:[1])){const x=d.c[0]*sx;skip.push([x-r,x+r,d.c[1]-r,d.c[1]+r,d.c[2]-r,d.c[2]+r])}}
 const C=[],X=[];const f=(x,y,z)=>{let v=1e9;for(const j of C){const s=partSdf(Ps[j],x,y,z);if(s<v)v=s}for(const j of X){const s=-partSdf(Ps[j],x,y,z);if(s>v)v=s}return v};
 const h=gv*.3,lim=gv*.9;
 outer:for(let i=0;i<nv;i++){const x0=pos[i*3],y0=pos[i*3+1],z0=pos[i*3+2];
  for(const b of skip)if(x0>b[0]&&x0<b[1]&&y0>b[2]&&y0<b[3]&&z0>b[4]&&z0<b[5])continue outer;
  C.length=0;X.length=0;for(let j=0;j<act.length;j++){const b=boxes[j];if(x0<b.x0-mg||x0>b.x1+mg||y0<b.y0-mg||y0>b.y1+mg||z0<b.z0-mg||z0>b.z1+mg)continue;if(act[j].cut){if(kc>1e-6)continue outer;X.push(j)}else{if(kk[j]>0||act[j].melt)continue outer;C.push(j)}}
  if(!C.length)continue;let x=x0,y=y0,z=z0;
  for(let it=0;it<3;it++){const v=f(x,y,z);if(Math.abs(v)<.002)break;const gx=(f(x+h,y,z)-v)/h,gy=(f(x,y+h,z)-v)/h,gz=(f(x,y,z+h)-v)/h,g2=gx*gx+gy*gy+gz*gz;if(g2<1e-6)break;const s=v/g2;x-=gx*s;y-=gy*s;z-=gz*s}
  const dx=x-x0,dy=y-y0,dz=z-z0,dd=Math.sqrt(dx*dx+dy*dy+dz*dz);if(!isFinite(dd))continue;const k=dd>lim?lim/dd:1;pos[i*3]=x0+dx*k;pos[i*3+1]=y0+dy*k;pos[i*3+2]=z0+dz*k}}
/* naive surface nets: one vertex per cell the surface passes through, one quad per crossed grid edge */
function surfaceNets(F,nx,ny,nz,v,gx0,gy0,gz0){const cx=nx-1,cy=ny-1,cz=nz-1,nxy=nx*ny,cell=new Int32Array(cx*cy*cz).fill(-1),pos=[],nor=[],f=new Float64Array(8),
 off=[0,1,nx,nx+1,nxy,nxy+1,nxy+nx,nxy+nx+1],EP=[];for(let k=0;k<8;k++)for(let b=0;b<3;b++)if(!((k>>b)&1))EP.push([k,k|(1<<b)]);let nv=0;
 for(let z=0;z<cz;z++)for(let y=0;y<cy;y++)for(let x=0;x<cx;x++){const base=x+nx*y+nxy*z;let mask=0;
  for(let k=0;k<8;k++){f[k]=F[base+off[k]];if(f[k]<0)mask|=1<<k}if(mask===0||mask===255)continue;
  let sx=0,sy=0,sz=0,cnt=0;for(const[a,b]of EP){const fa=f[a],fb=f[b];if((fa<0)!==(fb<0)){const t=fa/(fa-fb);sx+=(a&1)+((b&1)-(a&1))*t;sy+=((a>>1)&1)+(((b>>1)&1)-((a>>1)&1))*t;sz+=((a>>2)&1)+(((b>>2)&1)-((a>>2)&1))*t;cnt++}}
  pos.push(gx0+(x+sx/cnt)*v,gy0+(y+sy/cnt)*v,gz0+(z+sz/cnt)*v);
  let gx=f[1]+f[3]+f[5]+f[7]-f[0]-f[2]-f[4]-f[6],gy=f[2]+f[3]+f[6]+f[7]-f[0]-f[1]-f[4]-f[5],gz=f[4]+f[5]+f[6]+f[7]-f[0]-f[1]-f[2]-f[3];const gl=Math.hypot(gx,gy,gz)||1;
  nor.push(gx/gl,gy/gl,gz/gl);cell[x+cx*(y+cy*z)]=nv++}
 const idx=[],C=(x,y,z)=>cell[x+cx*(y+cy*z)],dim=[cx,cy,cz];
 for(let a=0;a<3;a++){const u=(a+1)%3,w=(a+2)%3;const p=[0,0,0];
  for(p[w]=1;p[w]<dim[w];p[w]++)for(p[u]=1;p[u]<dim[u];p[u]++)for(p[a]=0;p[a]<dim[a];p[a]++){
   const i0=p[0]+nx*p[1]+nxy*p[2],step=a===0?1:a===1?nx:nxy,f0=F[i0],f1=F[i0+step];if((f0<0)===(f1<0))continue;
   const q=[p[0],p[1],p[2]],c00=C(q[0],q[1],q[2]);q[u]--;const c10=C(q[0],q[1],q[2]);q[w]--;const c11=C(q[0],q[1],q[2]);q[u]++;const c01=C(q[0],q[1],q[2]);
   if(c00<0||c10<0||c11<0||c01<0)continue;
   if(f0<0)idx.push(c00,c10,c11,c00,c11,c01);else idx.push(c00,c11,c10,c00,c01,c11)}}
 return{pos:new Float32Array(pos),nor:new Float32Array(nor),idx:new Uint32Array(idx)}}
/* colour each vertex by the parts it sits closest to; the selected part gets a warm tint */
const _rgb={};function rgbOf(h){let c=_rgb[h];if(!c){let x=String(h||'#888').replace('#','');if(x.length===3)x=x.split('').map(d=>d+d).join('');const n=parseInt(x.slice(0,6),16)||0;c=_rgb[h]=[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}return c}
function colorModel(M,hl){const{pos,act,Ps,boxes}=M,nv=pos.length/3,col=new Float32Array(nv*3),pid=new Int16Array(nv),tau=M.mb>0?.6+.35*M.mb:.2,m=M.mb+3,d=new Float64Array(act.length);
 for(let i=0;i<nv;i++){const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];let dmin=1e9;
  for(let j=0;j<act.length;j++){if(act[j].cut){d[j]=1e9;continue}const b=boxes[j];if(x<b.x0-m||x>b.x1+m||y<b.y0-m||y>b.y1+m||z<b.z0-m||z>b.z1+m){d[j]=1e9;continue}d[j]=partSdf(Ps[j],x,y,z);if(d[j]<dmin)dmin=d[j]}
  if(dmin>=1e8){for(let j=0;j<act.length;j++){if(act[j].cut){d[j]=1e9;continue}d[j]=partSdf(Ps[j],x,y,z);if(d[j]<dmin)dmin=d[j]}}
  {let bj=0;for(let j=1;j<act.length;j++)if(d[j]<d[bj])bj=j;pid[i]=bj}
  let r=0,g=0,bl=0,ws=0,hw=0;for(let j=0;j<act.length;j++){if(d[j]>=1e8)continue;const w=Math.exp(-(d[j]-dmin)/tau),c=rgbOf(act[j].color);r+=w*c[0];g+=w*c[1];bl+=w*c[2];ws+=w;if(hl&&hl.has?hl.has(act[j].id):act[j].id===hl)hw=w}
  if(ws<=0)ws=1;r/=ws;g/=ws;bl/=ws;const t=.3*(hw/ws);col[i*3]=r+(1-r)*t;col[i*3+1]=g+(.52-g)*t;col[i*3+2]=bl+(.12-bl)*t}
 M.col=col;M.pid=pid}
