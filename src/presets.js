/* ---------- starter presets: plain blocked-out bodies, no faces or details ---------- */
const E=(cx,cy,rx,ry)=>SHAPES.circle(cx-rx,cy-ry,cx+rx,cy+ry);
const B=(x0,y0,x1,y1,r)=>{const w=x1-x0,h=y1-y0,rr=Math.min(r??.22,.5)*Math.min(w,h),o=[];
 for(const[cx,cy,a0]of[[x1-rr,y1-rr,0],[x0+rr,y1-rr,90],[x0+rr,y0+rr,180],[x1-rr,y0+rr,270]])for(let k=0;k<=8;k++){const a=(a0+k*90/8)*Math.PI/180;o.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr])}return o};
/* a rough polygon becomes a smooth blob */
const BL=pts=>resample(chaikin(pts,3),80);
/* organic, cute bodies: smooth egg-shaped blobs, stubby splayed legs, small tilted arms */
const egg=(cx,cy,rx,ry,e=0,n=16)=>{const o=[];for(let i=0;i<n;i++){const t=i/n*2*Math.PI,s=Math.sin(t);o.push([cx+rx*Math.cos(t)*(1-e*s),cy+ry*s])}return BL(o)};
const rotP=(pts,d,cx,cy)=>{const a=d*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return pts.map(([x,y])=>[cx+(x-cx)*c-(y-cy)*s,cy+(x-cx)*s+(y-cy)*c])};
const chib=o=>A=>{const{hy,hrx,hry,he=.05,by,brx,bry,be,lx,ly,lrx,lry,ax,ay,arx,ary,ar,hc='#ffd8b0',bc,lc,ac}=o;
 A('Legs left',rotP(egg(-lx,ly,lrx,lry),-9,-lx,ly),lc,16,0,.95,5);A('Legs right',rotP(egg(lx,ly,lrx,lry),9,lx,ly),lc,16,0,.95,5);
 A('Body',egg(0,by,brx,bry,be),bc,28,0,.95,5);
 A('Arm left',rotP(egg(-ax,ay,arx,ary),ar,-ax,ay),ac,14,0,.95,5);A('Arm right',rotP(egg(ax,ay,arx,ary),-ar,ax,ay),ac,14,0,.95,5);
 A('Head',egg(0,hy,hrx,hry,he),hc,42,0,.95,5)};
const PRESETS=[
 {id:'blank',name:'Blank',desc:'An empty build plate. Draw anything!',build(){}},
 {id:'chibi',name:'Chibi buddy',desc:'Round, soft and cuddly.',build:chib({hy:62,hrx:31,hry:27,he:.04,by:28,brx:17,bry:20,be:.18,lx:8,ly:10,lrx:7.5,lry:10,ax:22,ay:30,arx:6.5,ary:11,ar:22,bc:'#ff8a65',lc:'#5b7cfa',ac:'#ffc857'})},
 {id:'chibiPear',name:'Pear pal',desc:'Small head, wide cosy bottom.',build:chib({hy:58,hrx:26,hry:23,he:.06,by:26,brx:22,bry:22,be:.3,lx:9,ly:10,lrx:8,lry:10,ax:26,ay:28,arx:6,ary:10,ar:25,bc:'#7bd0c1',lc:'#3d8f84',ac:'#ffd8b0'})},
 {id:'chibiTall',name:'Tall tot',desc:'Long and slim with a big head.',build:chib({hy:74,hrx:26,hry:24,he:.04,by:42,brx:14,bry:26,be:.1,lx:7,ly:13,lrx:6,lry:13,ax:19,ay:44,arx:5,ary:13,ar:15,bc:'#b69cff',lc:'#6b55c9',ac:'#ffd8b0'})},
 {id:'chibiBun',name:'Chubby bun',desc:'Super wide and squishy.',build:chib({hy:56,hrx:34,hry:28,he:.05,by:26,brx:26,bry:22,be:.12,lx:11,ly:9,lrx:9,lry:9.5,ax:30,ay:26,arx:7,ary:9,ar:30,bc:'#ffc857',lc:'#f76808',ac:'#ffd8b0'})},
 {id:'chibiBean',name:'Bean baby',desc:'Head and body in one big bean.',build:chib({hy:58,hrx:30,hry:30,he:.02,by:30,brx:24,bry:30,be:.15,lx:9,ly:6,lrx:7,lry:7,ax:28,ay:36,arx:6,ary:9,ar:35,hc:'#ffe0c2',bc:'#9ad1ff',lc:'#3b82c4',ac:'#ffe0c2'})},
 {id:'robot',name:'Robo bot',desc:'Boxy robot with antenna.',build(A){
  A('Feet left',B(-16,0,-3,12,.25),'#5c6b7a',18,0,.4,2);A('Feet right',B(3,0,16,12,.25),'#5c6b7a',18,0,.4,2);
  A('Torso',B(-20,10,20,50,.15),'#0091ff',30,0,.45,2);
  A('Arm left',B(-32,16,-21,46,.3),'#889096',14,0,.5,2);A('Arm right',B(21,16,32,46,.3),'#889096',14,0,.5,2);
  A('Head',B(-16,50,16,76,.18),'#ece7df',28,0,.5,2);
  A('Antenna',E(0,86,4,6),'#e5484d',8,0,1,2);A('Antenna stalk',B(-1.5,74,1.5,84,.5),'#889096',4,0,.3,2)}},
 {id:'dino',name:'Dino',desc:'Long tail, stompy legs.',build(A){
  A('Tail',BL([[-52,26],[-30,14],[-12,18],[-12,38],[-30,34]]),'#46a758',18,0,.8,5);
  A('Back leg',B(-14,0,2,24,.4),'#2f8f4a',16,-8,.8,5);A('Front leg',B(10,0,26,24,.4),'#2f8f4a',16,8,.8,5);
  A('Body',E(4,36,28,16),'#46a758',36,0,.9,5);
  A('Neck',BL([[22,34],[36,32],[42,60],[32,64]]),'#46a758',20,0,.8,5);
  A('Head',E(40,66,14,10),'#46a758',24,0,.9,5);
  A('Spike 1',BL([[-6,48],[0,62],[8,48]]),'#f76808',6,0,.7,3);A('Spike 2',BL([[8,48],[14,62],[22,48]]),'#f76808',6,0,.7,3)}},
 {id:'rocket',name:'Rocket',desc:'Ready for blast-off.',build(A){
  A('Fin left',BL([[-16,6],[-34,0],[-14,34]]),'#e5484d',6,0,.6,3);A('Fin right',BL([[16,6],[34,0],[14,34]]),'#e5484d',6,0,.6,3);
  A('Nose',BL([[-14,60],[0,92],[14,60]]),'#e5484d',28,0,.9,4);
  A('Body',E(0,40,15,34),'#ece7df',30,0,1,4);
  A('Flame',BL([[-8,4],[0,-14],[8,4]]),'#f5c518',12,0,.9,3)}},
 {id:'cat',name:'Kitty',desc:'Round cat with pointy ears.',build(A){
  A('Tail',BL([[14,10],[34,14],[40,34],[34,46],[28,36],[30,24],[14,22]]),'#f76808',10,-6,.9,4);
  A('Body',E(0,22,20,22),'#f76808',30,0,.9,4);
  A('Paw left',E(-9,4,7,5),'#f76808',14,6,.9,3);A('Paw right',E(9,4,7,5),'#f76808',14,6,.9,3);
  A('Ear left',BL([[-24,60],[-24,86],[-8,68]]),'#f76808',10,0,.6,3);A('Ear right',BL([[24,60],[24,86],[8,68]]),'#f76808',10,0,.6,3);
  A('Head',E(0,58,26,22),'#f76808',36,0,.9,4)}},
 {id:'monster',name:'Blob monster',desc:'Squishy and friendly.',build(A){
  A('Foot left',E(-12,3,10,5),'#6e56cf',18,4,.9,4);A('Foot right',E(12,3,10,5),'#6e56cf',18,4,.9,4);
  A('Body',BL([[-30,12],[-34,40],[-24,66],[0,74],[24,66],[34,40],[30,12],[0,6]]),'#8e6bf0',44,0,1,5);
  A('Horn left',BL([[-24,66],[-30,90],[-12,72]]),'#f5c518',10,0,.7,3);A('Horn right',BL([[24,66],[30,90],[12,72]]),'#f5c518',10,0,.7,3);
  A('Arm left',E(-38,38,8,14),'#6e56cf',16,0,.9,4);A('Arm right',E(38,38,8,14),'#6e56cf',16,0,.9,4)}},
 {id:'car',name:'Racer',desc:'Low car with chunky wheels.',build(A){
  A('Body',B(-48,10,48,30,.4),'#e5484d',32,0,.6,3);
  A('Cabin',BL([[-24,28],[-16,48],[14,48],[28,28]]),'#0091ff',26,0,.6,3);
  A('Wheel back',E(-28,10,12,12),'#1c2024',38,0,.9,0);A('Wheel front',E(28,10,12,12),'#1c2024',38,0,.9,0)}}
];
function applyPreset(id){const P=PRESETS.find(x=>x.id===id);if(!P)return;parts=[];grooves=[];sculpt=[];sculptVer++;counters={};nid=1;sel=null;
 P.build((name,pts,color,depth,z,round,blend)=>{parts.push({id:uid(),name,pts,color,depth,round,z,blend})});linkTwins();normalizeParts();clampAll();autoSel();
 commit();fit2d();frame3d(false);requestRender();return P}
/* tiny front-view picture of a preset for the picker */
function presetThumb(P,size){const keep=[parts,nid];parts=[];nid=1;P.build((name,pts,color,depth,z)=>{parts.push({name,pts,color,z})});const L=parts;[parts,nid]=keep;
 const c=document.createElement('canvas');c.width=c.height=size*2;const g=c.getContext('2d');
 if(!L.length){const m=size*2;g.strokeStyle='#8a86b0';g.lineWidth=3;g.setLineDash([8,6]);g.strokeRect(14,14,m-28,m-28);g.setLineDash([]);g.lineWidth=6;g.lineCap='round';g.beginPath();g.moveTo(m/2,m/2-18);g.lineTo(m/2,m/2+18);g.moveTo(m/2-18,m/2);g.lineTo(m/2+18,m/2);g.stroke();return c.toDataURL()}let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
 for(const p of L){const b=bbox(p.pts);x0=Math.min(x0,b.x0);x1=Math.max(x1,b.x1);y0=Math.min(y0,b.y0);y1=Math.max(y1,b.y1)}
 const s=(size*2-16)/Math.max(x1-x0,y1-y0),ox=size-(x0+x1)/2*s,oy=size+(y0+y1)/2*s;
 for(const p of L.slice().sort((a,b)=>a.z-b.z)){g.beginPath();p.pts.forEach((q,i)=>{const X=ox+q[0]*s,Y=oy-q[1]*s;i?g.lineTo(X,Y):g.moveTo(X,Y)});g.closePath();g.fillStyle=p.color;g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1.5;g.stroke()}
 return c.toDataURL()}
