/* ---------- workflow steps and quick actions ---------- */
function autoSel(){if(sel||!parts.length)return;let best=null,ba=-1;for(const p of parts){if(p.cut)continue;const b=bbox(p.pts),a=(b.x1-b.x0)*(b.y1-b.y0);if(a>ba){ba=a;best=p}}if(best){sel=best.id;paintColor=best.color;try{$('#colDot i').style.background=paintColor}catch(e){}}}
let paintColor='#f76808';
function wireUX(){

 window.closePops=keep=>{const H=(sel,btn,attr)=>{const p=$(sel);if(p&&!p.hidden&&keep!==sel){p.hidden=true;const b=btn&&$(btn);if(b)b.setAttribute(attr,'false')}};
  H('#vPop','#vMenuBtn','aria-expanded');H('#scenePop','#sceneBtn','aria-pressed');H('#colPop','#colDot','aria-expanded');
  if(keep!=='#pcPop'&&typeof pcOpen!=='undefined'&&pcOpen){pcOpen=false;const p=$('#pcPop');if(p){p.hidden=true;const b=p.previousSibling;if(b&&b.setAttribute)b.setAttribute('aria-expanded','false')}}
  if(keep!=='#xfPop'){const x=$('#xfPop');if(x&&!x.hidden){x.hidden=true;document.querySelectorAll('#vScale,#vRot,#railScale,#railRot').forEach(b=>b.setAttribute('aria-pressed','false'))}}};
 addEventListener('keydown',e=>{if(e.key==='Escape')closePops()});
 
 window.openXf=(k,anchor)=>{const pop=$('#xfPop');if(!sel){toast('Tap a part first.');return}closePops('#xfPop');
  const same=!pop.hidden&&pop.dataset.k===k&&pop.dataset.a===(anchor?anchor.id:'');
  document.querySelectorAll('#vScale,#vRot,#railScale,#railRot').forEach(b=>b.setAttribute('aria-pressed','false'));
  if(same){pop.hidden=true;return}
  pop.dataset.k=k;pop.dataset.a=anchor?anchor.id:'';pop.hidden=false;
  if(anchor&&anchor.closest('#rail')){const r=anchor.getBoundingClientRect();pop.classList.add('fromrail');pop.style.left=(r.right+14)+'px';pop.style.top=Math.max(8,Math.min(r.top,innerHeight-330))+'px';anchor.setAttribute('aria-pressed','true')}
  else{pop.classList.remove('fromrail');pop.style.left=pop.style.top='';const bt=$(k==='scale'?'#vScale':'#vRot');bt.setAttribute('aria-pressed','true')}
  xfRender()};
 for(const [id,k] of [['vScale','scale'],['vRot','rotate']]){const b=$('#'+id);if(b)b.onclick=()=>openXf(k,b)}
 for(const [id,k] of [['railScale','scale'],['railRot','rotate']]){const b=$('#'+id);if(b)b.onclick=()=>openXf(k,b)}
 addEventListener('pointerdown',e=>{const pop=$('#xfPop');if(!pop.hidden&&pop.classList.contains('fromrail')&&!e.target.closest('#xfPop,#railScale,#railRot')){pop.hidden=true;document.querySelectorAll('#railScale,#railRot').forEach(b=>b.setAttribute('aria-pressed','false'))}});
 const dot=$('#colDot'),cp=$('#colPop');
 if(dot){for(const c of COLORS){const b=document.createElement('button');b.type='button';b.className='sw';b.style.background=c;b.title=c;b.setAttribute('aria-label','Colour '+c);b.onclick=()=>{pickPaint(c)};cp.appendChild(b)}
  const cu=document.createElement('label');cu.className='sw custom';cu.title='Any colour';cu.innerHTML='<input type="color" aria-label="Any colour">';cu.querySelector('input').onchange=e=>pickPaint(e.target.value);cp.appendChild(cu);
  dot.onclick=e=>{e.stopPropagation();closePops('#colPop');cp.hidden=!cp.hidden;dot.setAttribute('aria-expanded',cp.hidden?'false':'true')};
  document.addEventListener('click',e=>{if(!cp.hidden&&!e.target.closest('#paint')){cp.hidden=true;dot.setAttribute('aria-expanded','false')}})}
 const tb=$('#texBtn');if(tb){tb.onclick=()=>{setLayers(!sceneCfg.tex);sceneCfg.texUser=true;saveScene()};setLayers(sceneCfg.tex!==false)}
 const sb=$('#sceneBtn'),sp=$('#scenePop');if(sb){sb.onclick=e=>{e.stopPropagation();closePops('#scenePop');sp.hidden=!sp.hidden;sb.setAttribute('aria-pressed',sp.hidden?'false':'true');if(!sp.hidden)sceneRender()};document.addEventListener('pointerdown',e=>{if(!sp.hidden&&!e.target.closest('#scenePop,#sceneBtn')){sp.hidden=true;sb.setAttribute('aria-pressed','false')}});applyScene()}
 for(const b of document.querySelectorAll('#perfSeg button')){b.setAttribute('aria-pressed',(b.dataset.p==='low')===LOWPERF?'true':'false');b.onclick=()=>{const hi=b.dataset.p==='high';if(hi===!LOWPERF)return;try{localStorage.setItem('sketch3d.perf',hi?'high':'low')}catch(e){}try{persist()}catch(e){}location.reload()}}
 
 const ac=$('#advClose');if(ac)ac.onclick=()=>{$('#adv').hidden=true;$('#advBtn').setAttribute('aria-expanded','false')};
 addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#adv').hidden){$('#adv').hidden=true;$('#advBtn').setAttribute('aria-expanded','false')}});
 const vb=$('#vMenuBtn'),vp=$('#vPop');if(vb){vb.onclick=e=>{e.stopPropagation();closePops('#vPop');vp.hidden=!vp.hidden;vb.setAttribute('aria-expanded',vp.hidden?'false':'true')};vp.addEventListener('click',()=>{vp.hidden=true;vb.setAttribute('aria-expanded','false')});document.addEventListener('click',e=>{if(!vp.hidden&&!e.target.closest('.vmenu')){vp.hidden=true}})}
 const nb=$('#newBtn');if(nb)nb.onclick=()=>$('#preBtn').click();
 $('#qCopy').onclick=()=>{if(sel)dupSel();else toast('Tap a part first.')};
 $('#qDel').onclick=()=>{if(sel)delSel();else toast('Tap a part first.')};
 $('#qCopy').disabled=$('#qDel').disabled=!sel}

function pickPaint(c){paintColor=c;saveWS();try{$('#colDot i').style.background=c;$('#colPop').hidden=true}catch(e){}
 if(tool==='select'){let ch=0;for(const i of selIds()){const p=partById(i);if(p&&!p.cut){p.color=c;ch=1}}if(ch){commit();requestRender()}}
 setTool('fill')}
function scalePart(f){const p=sel&&partById(sel);if(!p)return;const b=bbox(p.pts),cx=b.cx,cy=b.cy;p.pts=p.pts.map(q=>[cx+(q[0]-cx)*f,cy+(q[1]-cy)*f]);if(p.depth)p.depth=clamp(p.depth*f,2,p.cut?200:80);commit();requestRender()}
function xfRender(){const pop=$('#xfPop');if(!pop||pop.hidden)return;const p=sel&&partById(sel);if(!p){pop.hidden=true;return}
 const k=pop.dataset.k;pop.innerHTML='';const h=document.createElement('div');h.className='xfh';h.textContent=(k==='scale'?'Size: ':'Turn: ')+p.name;pop.appendChild(h);
 const mk=(t,fn,cls)=>{const b=document.createElement('button');b.type='button';b.className='btn '+(cls||'');b.textContent=t;b.onclick=fn;return b};
 if(k==='scale'){const r=document.createElement('div');r.className='xfrow';r.append(mk('Smaller',()=>scalePart(1/1.1)),mk('Bigger',()=>scalePart(1.1)));pop.appendChild(r);
  const n=document.createElement('p');n.className='sub';n.textContent='Each tap changes the size by about 10%, keeping the shape.';pop.appendChild(n)}
 else{const list=[];for(const d of RDEF)pop.appendChild(paramCtl(d,'x',list));for(const c of list){const v=c.d.get(p);c.i.value=v;c.o.textContent=c.d.fmt(v)}
  pop.appendChild(mk('Reset turn',()=>{p.rx=p.ry=p.rz=0;commit();requestRender()}))}}

function sceneRender(){const pop=$('#scenePop');if(!pop)return;pop.innerHTML='';
 const sec=(t,ic)=>{const h=document.createElement('div');h.className='sc-h';h.innerHTML=pico(ic)+t;pop.appendChild(h)};
 const chips=(obj,key,ic)=>{const w=document.createElement('div');w.className='sc-chips';for(const k in obj){const b=document.createElement('button');b.type='button';b.className='sc-chip';b.setAttribute('aria-pressed',sceneCfg[key]===k?'true':'false');b.innerHTML='<b>'+obj[k].n+'</b>'+(obj[k].d?'<span>'+obj[k].d+'</span>':'');b.onclick=()=>{sceneCfg[key]=k;if(key==='light')sceneCfg.ang=null;applyScene();saveScene();sceneRender()};w.appendChild(b)}pop.appendChild(w)};
 sec('Environment','shape');chips(ENVS,'env');
 sec('Lighting','blend');chips(LIGHTS,'light');
 const sl=(lab,ic,min,max,get,set,fmt)=>{const f=document.createElement('div');f.className='field cs';f.innerHTML='<label><span>'+pico(ic)+lab+'</span><output></output></label><input type="range" min="'+min+'" max="'+max+'">';const i=f.querySelector('input'),o=f.querySelector('output');i.value=get();o.textContent=fmt(+i.value);i.oninput=()=>{set(+i.value);o.textContent=fmt(+i.value);applyScene()};i.onchange=saveScene;pop.appendChild(f)};
 sl('Brightness','blend',50,150,()=>Math.round(sceneCfg.bright*100),v=>{sceneCfg.bright=v/100},v=>v+'%');
 sl('Light from','move',-180,180,()=>Math.round(sceneCfg.ang==null?LIGHTS[sceneCfg.light].ang:sceneCfg.ang),v=>{sceneCfg.ang=v},v=>v+'°')}
