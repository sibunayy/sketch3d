/* ---------- front and side pictures taken from the real 3D mesh, so they always match the model ---------- */
let silStamp=0;const SILC={front:null,side:null};
function silGet(v){if(typeof LOWPERF!=="undefined"&&LOWPERF)return null;const M=curM;if(!M||!M.idx||!M.idx.length)return null;let c=SILC[v];if(c&&c.stamp===silStamp&&c.M===M)return c;
 try{c=silBuild(v,M)}catch(e){console.error(e);c=null}SILC[v]=c;return c}
function silBuild(v,M){const P=M.pos,N=M.nor,C=M.col,I=M.idx,nt=I.length/3,F=v==='front',U=i=>F?P[i*3]:-P[i*3+2];
 let u0=1e9,u1=-1e9,y0=1e9,y1=-1e9;for(let i=0;i<P.length/3;i++){const u=U(i),y=P[i*3+1];if(u<u0)u0=u;if(u>u1)u1=u;if(y<y0)y0=y;if(y>y1)y1=y}
 const pad=2.5;u0-=pad;u1+=pad;y0-=pad;y1+=pad;const ppm=Math.min(8,1500/Math.max(u1-u0,y1-y0)),W=Math.ceil((u1-u0)*ppm),H=Math.ceil((y1-y0)*ppm);
 const sc=document.createElement('canvas');sc.width=W;sc.height=H;const x=sc.getContext('2d');x.lineJoin='round';x.lineWidth=1;
 const L=F?[-.35,.55,.76]:[.76,.55,.35],ll=Math.hypot(...L);L[0]/=ll;L[1]/=ll;L[2]/=ll;
 const key=new Float32Array(nt),face=new Float32Array(nt*3),order=[];
 for(let t=0;t<nt;t++){const a=I[t*3],b=I[t*3+1],c=I[t*3+2];let nx=N[a*3]+N[b*3]+N[c*3],ny=N[a*3+1]+N[b*3+1]+N[c*3+1],nz=N[a*3+2]+N[b*3+2]+N[c*3+2];const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
  const vd=F?nz:nx;if(vd<-.02)continue;key[t]=F?(P[a*3+2]+P[b*3+2]+P[c*3+2]):(P[a*3]+P[b*3]+P[c*3]);
  face[t*3]=nx;face[t*3+1]=ny;face[t*3+2]=nz;order.push(t)}
 order.sort((p,q)=>key[p]-key[q]);const cache=new Map();
 for(const t of order){const a=I[t*3],b=I[t*3+1],c=I[t*3+2],dl=Math.max(0,face[t*3]*L[0]+face[t*3+1]*L[1]+face[t*3+2]*L[2]),sh=.58+.5*dl;
  const r=Math.min(255,(C[a*3]+C[b*3]+C[c*3])/3*255*sh)|0,g=Math.min(255,(C[a*3+1]+C[b*3+1]+C[c*3+1])/3*255*sh)|0,bl=Math.min(255,(C[a*3+2]+C[b*3+2]+C[c*3+2])/3*255*sh)|0,k=r<<16|g<<8|bl;
  let s=cache.get(k);if(!s){s='rgb('+r+','+g+','+bl+')';cache.set(k,s)}
  x.fillStyle=s;x.strokeStyle=s;x.beginPath();x.moveTo((U(a)-u0)*ppm,(y1-P[a*3+1])*ppm);x.lineTo((U(b)-u0)*ppm,(y1-P[b*3+1])*ppm);x.lineTo((U(c)-u0)*ppm,(y1-P[c*3+1])*ppm);x.closePath();x.fill();x.stroke()}
 const o=document.createElement('canvas');o.width=W;o.height=H;const ox=o.getContext('2d'),d=1.4;
 for(let k=0;k<8;k++)ox.drawImage(sc,Math.cos(k*Math.PI/4)*d,Math.sin(k*Math.PI/4)*d);
 ox.globalCompositeOperation='source-in';ox.fillStyle='rgba(30,20,70,.7)';ox.fillRect(0,0,W,H);ox.globalCompositeOperation='source-over';ox.drawImage(sc,0,0);
 return{cv:o,u0,y1,ppm,stamp:silStamp,M}}
function drawSil(x,c,ox){x.save();x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(c.cv,ox+c.u0*V.s,V.oy-c.y1*V.s,c.cv.width/c.ppm*V.s,c.cv.height/c.ppm*V.s);x.restore()}
