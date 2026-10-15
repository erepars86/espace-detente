'use strict';
// Espace Détente V3.9 : nouvelle piste fermée, déplacement libre en coordonnées monde,
// caméra rotative et rendu Canvas autonome. Drift Challenge reste indépendant.
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d'),W=420,H=600;
let mode=null,running=false,last=0,raf=0,score=0,best=0,frame=0,combo=0,particles=[];
let skidMarks=[],rallyEffectClock=0,skidEffectClock=0;
const keys={left:false,right:false,accelerate:false,brake:false};
let player={x:210,y:460,heading:-Math.PI/2};
const PI=Math.PI, TAU=PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const rally={x:0,y:0,heading:0,cameraHeading:0,cameraX:0,cameraY:0,speed:0,side:0,steer:0,time:0,lap:0,progress:0,off:false,hitCooldown:0};
// Piste fermée, points de contrôle suffisamment espacés pour une conduite libre.
const circuits=[
 {name:'Forêt sauvage',knots:[[-40,610],[245,600],[500,445],[670,190],[640,-130],[440,-410],[150,-535],[-190,-500],[-485,-340],[-630,-80],[-560,215],[-340,420]]},
 {name:'Canyon rouge',knots:[[-80,600],[250,550],[550,400],[620,150],[450,-35],[580,-300],[270,-520],[-50,-540],[-370,-380],[-580,-140],[-520,180],[-320,330]]},
 {name:'Montagne enneigée',knots:[[-70,610],[205,590],[440,465],[515,250],[355,75],[490,-155],[300,-390],[80,-480],[-185,-435],[-390,-250],[-550,-20],[-460,260],[-280,440]]}
];
let circuitIndex=0,knots=circuits[0].knots;
const TRACK_WIDTH=136;
const snowy=()=>circuitIndex===2;
let raceMode='chrono',opponents=[],racePosition=1,collisionNotice=0;
const aiColors=['#f16b40','#f6cf49'];
function pointAtDistance(distance){
 const d=((distance%trackLength)+trackLength)%trackLength;
 let lo=0,hi=track.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(lengths[mid+1]<d)lo=mid+1;else hi=mid}
 const i=lo,j=(i+1)%track.length,a=track[i],b=track[j],f=clamp((d-lengths[i])/Math.max(.001,lengths[i+1]-lengths[i]),0,1);
 return {x:lerp(a.x,b.x,f),y:lerp(a.y,b.y,f),heading:Math.atan2(b.y-a.y,b.x-a.x)};
}
function initOpponents(){
 opponents=[];racePosition=1;collisionNotice=0;
 if(raceMode!=='course')return;
 for(let i=0;i<2;i++){
  const progress=-(i+1)*54,pt=pointAtDistance(progress),side=i===0?23:-23;
  opponents.push({progress,speed:0,cruise:i===0?134:147,lane:side,phase:i*2.7,x:pt.x-Math.sin(pt.heading)*side,y:pt.y+Math.cos(pt.heading)*side,heading:pt.heading,color:aiColors[i]});
 }
}
function tickOpponents(dt){
 if(raceMode!=='course')return;
 for(const o of opponents){
  // Chaque adversaire suit la piste avec sa propre vitesse et une ligne variable.
  const target=o.cruise*(.93+.07*Math.sin(o.progress/175+o.phase));
  o.speed+=(target-o.speed)*(1-Math.exp(-1.6*dt));
  o.progress+=o.speed*dt;
  const pt=pointAtDistance(o.progress),side=o.lane+Math.sin(o.progress/150+o.phase)*7;
  o.x=pt.x-Math.sin(pt.heading)*side;o.y=pt.y+Math.cos(pt.heading)*side;o.heading=pt.heading;
  // Choc bref, avec temporisation pour ne pas immobiliser le joueur.
  const dist=Math.hypot(o.x-rally.x,o.y-rally.y);
  if(dist<34&&rally.hitCooldown<=0){
   rally.speed*=.72;rally.hitCooldown=.85;collisionNotice=.9;
   const dx=rally.x-o.x,dy=rally.y-o.y,l=Math.hypot(dx,dy)||1;
   rally.x+=dx/l*14;rally.y+=dy/l*14;
  }
 }
 const playerDistance=nearestRoad(rally.x,rally.y).progress*trackLength;
 racePosition=1+opponents.filter(o=>o.progress>playerDistance).length;
}
function drawOpponent(o){
 ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.heading+PI/2);
 ctx.fillStyle='#0008';ctx.beginPath();ctx.ellipse(7,9,24,41,0,0,TAU);ctx.fill();
 ctx.fillStyle='#111820';for(const sy of [-26,20])for(const sx of [-24,16])rounded(sx,sy,8,20,3);
 ctx.fillStyle='#1d2731';rounded(-21,-39,42,78,10);
 ctx.fillStyle=o.color;rounded(-18,-37,36,74,9);
 ctx.fillStyle='#182f45';rounded(-14,-14,28,28,6);
 ctx.fillStyle='#b6d9e6';rounded(-12,-13,24,13,4);
 ctx.fillStyle='#283a4a';rounded(-12,16,24,11,3);
 ctx.fillStyle='#fff1d5';ctx.fillRect(-15,-34,10,5);ctx.fillRect(5,-34,10,5);
 ctx.fillStyle='#e23e4a';ctx.fillRect(-15,30,10,4);ctx.fillRect(5,30,10,4);
 ctx.fillStyle='#f7f7f7';ctx.fillRect(-3,-36,6,69);
 ctx.restore();
}

function spline(p0,p1,p2,p3,t){let t2=t*t,t3=t2*t;return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3)}
const track=[];
let trackLength=0;const lengths=[0];
function buildTrack(){
 track.length=0;lengths.length=0;lengths.push(0);trackLength=0;
 for(let i=0;i<knots.length;i++)for(let k=0;k<20;k++){
  const a=knots[(i+knots.length-1)%knots.length],b=knots[i],c=knots[(i+1)%knots.length],d=knots[(i+2)%knots.length],t=k/20;
  track.push({x:spline(a[0],b[0],c[0],d[0],t),y:spline(a[1],b[1],c[1],d[1],t)});
 }
 for(let i=0;i<track.length;i++){const a=track[i],b=track[(i+1)%track.length];trackLength+=Math.hypot(b.x-a.x,b.y-a.y);lengths.push(trackLength)}
}
function trackAt(t){t=((t%1)+1)%1;let f=t*track.length,i=Math.floor(f),a=track[i],b=track[(i+1)%track.length];return {x:lerp(a.x,b.x,f-i),y:lerp(a.y,b.y,f-i)}}
function nearestRoad(x,y){let bestD=Infinity,bestI=0,bestT=0;
 for(let i=0;i<track.length;i++){const a=track[i],b=track[(i+1)%track.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1),px=a.x+t*dx,py=a.y+t*dy,d=(x-px)**2+(y-py)**2;if(d<bestD){bestD=d;bestI=i;bestT=t}}
 return {distance:Math.sqrt(bestD),progress:(lengths[bestI]+bestT*(lengths[bestI+1]-lengths[bestI]))/trackLength};
}
function noise(n){let v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v)}
const scenery=[],groundDetails=[],roadDetails=[],trackMarkers=[],roadPatches=[],circuitProps=[];
function buildEnvironment(){
 for(const arr of [scenery,groundDetails,roadDetails,trackMarkers,roadPatches,circuitProps])arr.length=0;
 for(let i=0;i<track.length;i+=2){
  const a=track[i],b=track[(i+1)%track.length],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;
  for(const side of [-1,1]){
   const seed=i*7+side*17,r=115+noise(seed+4)*140;
   scenery.push({x:a.x+nx*r*side+(noise(seed+9)-.5)*55,y:a.y+ny*r*side+(noise(seed+12)-.5)*55,
    type:circuitIndex===1?(noise(seed+21)>.67?'tree':'rock'):(snowy()?(noise(seed+21)>.38?'tree':'rock'):(noise(seed+21)>.23?'tree':'rock')),seed});
  }
  for(let j=0;j<3;j++){
   const seed=i*31+j*13+101,offset=(noise(seed)*2-1)*(TRACK_WIDTH*.43);
   roadDetails.push({x:a.x+nx*offset+dx/l*noise(seed+3)*16,y:a.y+ny*offset+dy/l*noise(seed+3)*16,r:1+noise(seed+7)*3.3,shade:noise(seed+11)});
   if(j===0&&i%4===0){const t=noise(seed+23),side=t>.5?1:-1;
    roadPatches.push({x:a.x+nx*side*TRACK_WIDTH*.34,y:a.y+ny*side*TRACK_WIDTH*.34,angle:Math.atan2(dy,dx),w:17+t*24,h:4+t*8,seed});
   }
  }
  for(const side of [-1,1]){
   const seed=i*41+side*29+211,r=TRACK_WIDTH*.5+19+noise(seed+1)*105;
   groundDetails.push({x:a.x+nx*side*r,y:a.y+ny*side*r,type:noise(seed+8)>.58?'bush':'grass',seed});
  }
  if(i%22===0){
   const seed=i*19+17,side=i%44===0?1:-1;
   trackMarkers.push({x:a.x+nx*side*(TRACK_WIDTH*.5+22),y:a.y+ny*side*(TRACK_WIDTH*.5+22),angle:Math.atan2(dy,dx),seed});
  }
 }
 for(let i=12;i<track.length;i+=12){
  const a=track[i],before=track[(i+track.length-5)%track.length],after=track[(i+5)%track.length];
  const dx=after.x-before.x,dy=after.y-before.y,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;
  const side=i%24===12?1:-1,dist=TRACK_WIDTH*.5+29;
  const curve=angleDelta(Math.atan2(after.y-a.y,after.x-a.x),Math.atan2(a.y-before.y,a.x-before.x));
  const type=Math.abs(curve)>.14?'chevron':(i%36===12?'tires':'fence');
  circuitProps.push({x:a.x+nx*side*dist,y:a.y+ny*side*dist,angle:Math.atan2(dy,dx),type,side,seed:i});
 }
}
function loadCircuit(index){
 circuitIndex=clamp(index|0,0,circuits.length-1);
 knots=circuits[circuitIndex].knots;buildTrack();buildEnvironment();
}
loadCircuit(0);
function drawCircuitProp(o){
 ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.angle);
 if(o.type==='chevron'){
  ctx.fillStyle='#14251d88';ctx.fillRect(-3,-9,8,29);
  ctx.fillStyle='#f3ddaa';ctx.fillRect(-21,-25,42,19);
  ctx.fillStyle='#d34c32';
  for(let j=-1;j<=1;j++){ctx.beginPath();ctx.moveTo(j*12-5,-22);ctx.lineTo(j*12+1,-15);ctx.lineTo(j*12-5,-9);ctx.lineTo(j*12+1,-9);ctx.lineTo(j*12+8,-15);ctx.lineTo(j*12+1,-22);ctx.fill()}
  ctx.strokeStyle='#543d27';ctx.lineWidth=2;ctx.strokeRect(-21,-25,42,19);
 }else if(o.type==='tires'){
  for(let j=-1;j<=1;j++){ctx.fillStyle='#101719';ctx.beginPath();ctx.ellipse(j*16,1,10,13,0,0,TAU);ctx.fill();
   ctx.fillStyle=j===0?'#e5e1d4':'#c84d36';ctx.beginPath();ctx.ellipse(j*16,-2,6,6,0,0,TAU);ctx.fill();
   ctx.fillStyle='#303b3b';ctx.beginPath();ctx.ellipse(j*16,-2,3,3,0,0,TAU);ctx.fill();
  }
 }else{
  ctx.strokeStyle='#352e24';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-25,-9);ctx.lineTo(-25,13);ctx.moveTo(25,-9);ctx.lineTo(25,13);ctx.stroke();
  ctx.strokeStyle='#c8a879';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-29,-7);ctx.lineTo(29,-7);ctx.moveTo(-29,5);ctx.lineTo(29,5);ctx.stroke();
 }
 ctx.restore();
}
function drawStartArch(){
 const a=track[0],b=track[1],h=Math.atan2(b.y-a.y,b.x-a.x);
 ctx.save();ctx.translate(a.x,a.y);ctx.rotate(h);
 // Poteaux de l'arche hors de la chaussée, barre de départ au-dessus.
 for(const y of [-TRACK_WIDTH*.5-12,TRACK_WIDTH*.5+12]){
  ctx.fillStyle='#1b2930';ctx.fillRect(-9,y-8,18,16);
  ctx.fillStyle='#f1e9d9';ctx.fillRect(-6,y-7,12,14);
 }
 ctx.fillStyle='#152c34';ctx.fillRect(-17,-TRACK_WIDTH*.5-17,25,TRACK_WIDTH+34);
 ctx.fillStyle='#f2d6a3';ctx.font='bold 11px system-ui';ctx.textAlign='center';
 ctx.translate(-18,0);ctx.rotate(-PI/2);
 ctx.fillText('ESPACE DÉTENTE  •  RALLYE',0,4);
 ctx.restore();
}
function drawGroundDetail(o){
 ctx.save();ctx.translate(o.x,o.y);const n=noise(o.seed+3);
 if(o.type==='bush'){
  ctx.fillStyle=snowy()?'#8aa8a888':(circuitIndex===1?'#6c3c2888':'#102e22aa');ctx.beginPath();ctx.ellipse(5,8,15+n*7,8+n*3,0,0,TAU);ctx.fill();
  for(let k=0;k<4;k++){ctx.fillStyle=(snowy()?['#54766e','#688a81','#a7c2b8','#d5e2d8']:(circuitIndex===1?['#79532e','#97713c','#aa8b49','#c0a05c']:['#1c4b30','#32663a','#4a7c44','#668b48']))[k];ctx.beginPath();ctx.arc((k-1.5)*7,-n*5+(k%2)*4,7+n*4,0,TAU);ctx.fill()}
 }else{
  ctx.strokeStyle=snowy()?'#90ada2':(circuitIndex===1?(n>.5?'#c19a5b':'#8c7340'):(n>.5?'#779253':'#567746'));ctx.lineWidth=2;
  for(let k=0;k<5;k++){ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo((k-2)*3,-5-noise(o.seed+k)*9);ctx.stroke()}
 }
 ctx.restore();
}
function drawMarker(o){
 ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.angle);
 ctx.fillStyle='#0a1712aa';ctx.beginPath();ctx.ellipse(7,6,14,8,0,0,TAU);ctx.fill();
 ctx.fillStyle='#e8e4c7';ctx.fillRect(-4,-5,8,21);ctx.fillStyle='#d94b34';ctx.fillRect(-4,-5,8,7);
 ctx.restore();
}
function drawRoadPatch(o){
 ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.angle);
 ctx.fillStyle=snowy()?(noise(o.seed+5)>.5?'#526b7280':'#d9eef080'):(circuitIndex===1?(noise(o.seed+5)>.5?'#6f382e55':'#f1b68c4c'):(noise(o.seed+5)>.5?'#58462d50':'#e0c69c42'));
 ctx.beginPath();ctx.ellipse(0,0,o.w,o.h,0,0,TAU);ctx.fill();
 ctx.strokeStyle=snowy()?'#ecffff80':'#edce9a44';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-o.w*.6,-o.h*.35);ctx.lineTo(o.w*.4,-o.h*.3);ctx.stroke();ctx.restore();
}
function drawSkidMarks(){
 ctx.lineCap='round';
 for(const m of skidMarks){
  if(Math.abs(m.x-rally.cameraX)>650||Math.abs(m.y-rally.cameraY)>650)continue;
  ctx.globalAlpha=m.alpha;ctx.strokeStyle=snowy()?'#465a67':(m.off?'#4a3726':'#3c3026');ctx.lineWidth=m.width;
  ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(m.x2,m.y2);ctx.stroke();
 }
 ctx.globalAlpha=1;
}
function spawnRallyEffects(dt){
 // Particules en coordonnées monde, avec un budget réduit pour mobile.
 rallyEffectClock+=dt;skidEffectClock+=dt;
 const active=rally.speed>42&&(rally.off||Math.abs(rally.side)>5||keys.brake);
 if(active&&rallyEffectClock>.045){
  rallyEffectClock=0;
  const rearX=rally.x-Math.cos(rally.heading)*35,rearY=rally.y-Math.sin(rally.heading)*35;
  for(let j=0;j<(rally.off?3:2);j++){
   const side=(Math.random()-.5)*37;
   particles.push({x:rearX-Math.sin(rally.heading)*side,y:rearY+Math.cos(rally.heading)*side,
    vx:-Math.cos(rally.heading)*(15+Math.random()*18)+(Math.random()-.5)*22,
    vy:-Math.sin(rally.heading)*(15+Math.random()*18)+(Math.random()-.5)*22,
    life:.45+Math.random()*.42,maxLife:.87,r:3+Math.random()*7,kind:'dust'});
  }
 }
 if(rally.speed>65&&(Math.abs(rally.side)>7||keys.brake)&&skidEffectClock>.09){
  skidEffectClock=0;
  for(const side of [-1,1]){
   const bx=rally.x-Math.cos(rally.heading)*23-Math.sin(rally.heading)*side*18;
   const by=rally.y-Math.sin(rally.heading)*23+Math.cos(rally.heading)*side*18;
   const lx=bx-Math.cos(rally.heading)*8,ly=by-Math.sin(rally.heading)*8;
   skidMarks.push({x:lx,y:ly,x2:bx,y2:by,alpha:rally.off?.23:.30,width:2.2,off:rally.off});
  }
 }
 if(skidMarks.length>320)skidMarks.splice(0,skidMarks.length-320);
 for(const part of particles){part.life-=dt;if(part.kind==='dust'){
  part.x+=part.vx*dt;part.y+=part.vy*dt;part.r+=dt*18;
 }}
 particles=particles.filter(part=>part.life>0).slice(-85);
}
function readBest(){try{return Number(localStorage.getItem('espace-detente-'+mode+(mode==='rally'?'-circuit-'+circuitIndex:'')+'-record'))||0}catch{return 0}}
function saveBest(){try{localStorage.setItem('espace-detente-'+mode+(mode==='rally'?'-circuit-'+circuitIndex:'')+'-record',String(best))}catch{}}
function fmt(t){return Math.floor(t/60).toString().padStart(2,'0')+':'+Math.floor(t%60).toString().padStart(2,'0')}
function hud(){if(mode==='rally'){$('score').textContent=Math.round(rally.speed)+' km/h';$('best').textContent=fmt(rally.time);$('extra').textContent=raceMode==='course'?racePosition+' / 3':(rally.lap+1)+' / 1'}else{$('score').textContent=Math.floor(score).toLocaleString('fr-FR');$('best').textContent=Math.floor(best).toLocaleString('fr-FR');$('extra').textContent=Math.floor(combo)+'×'}}
function reset(){running=false;frame=0;score=0;combo=0;particles=[];skidMarks=[];rallyEffectClock=0;skidEffectClock=0;player={x:210,y:460,heading:-Math.PI/2};let a=track[0],b=track[1],h=Math.atan2(b.y-a.y,b.x-a.x);Object.assign(rally,{x:a.x,y:a.y,heading:h,cameraHeading:h,cameraX:a.x,cameraY:a.y,speed:0,side:0,steer:0,time:0,lap:0,progress:0,off:false,hitCooldown:0});initOpponents();best=readBest();hud();draw()}
function choose(next){heldTouches.clear();cancelAnimationFrame(raf);mode=next;Object.keys(keys).forEach(k=>keys[k]=false);$('home').classList.add('hidden');$('play').classList.remove('hidden');$('pedals').classList.toggle('hidden',next!=='rally');$('circuit-choice').classList.toggle('hidden',next!=='rally');$('race-choice').classList.toggle('hidden',next!=='rally');$('drive-controls').classList.toggle('drift-controls',next!=='rally');$('mode').textContent=next==='rally'?'RALLYE · COURSES V3.9':'DRIFT CHALLENGE';$('extra-label').textContent=next==='rally'?'POSITION':'COMBO';$('score').previousElementSibling.textContent=next==='rally'?'VITESSE':'SCORE';$('best').previousElementSibling.textContent=next==='rally'?'CHRONO':'RECORD';$('overlay-title').textContent=next==='rally'?'Prêt pour le circuit ?':'Prêt à drifter ?';$('overlay-text').textContent=next==='rally'?'Choisis un circuit et affronte deux pilotes, ou roule contre la montre !':'Maintiens une direction pour drifter et marque des points. Évite les bords !';$('control-tip').textContent=next==='rally'?'3 CIRCUITS · 2 ADVERSAIRES':'Maintiens ← ou → pour drifter';$('game-note').textContent=next==='rally'?'Mobile : accélère à gauche et tourne à droite. PC : flèches.':'Mobile : gauche/droite. PC : flèches gauche/droite.';$('overlay').classList.remove('hidden');$('start').textContent="C'est parti →";reset();window.scrollTo({top:0,behavior:'smooth'})}
function back(){heldTouches.clear();running=false;cancelAnimationFrame(raf);mode=null;Object.keys(keys).forEach(k=>keys[k]=false);$('play').classList.add('hidden');$('home').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
function start(){cancelAnimationFrame(raf);if(mode==='rally'){loadCircuit(Number($('circuit-select').value));raceMode=$('race-select').value;$('extra-label').textContent=raceMode==='course'?'POSITION':'TOUR';}reset();running=true;$('overlay').classList.add('hidden');last=performance.now();raf=requestAnimationFrame(loop)}
function finish(){running=false;cancelAnimationFrame(raf);if(mode==='rally'){$('overlay-title').textContent=raceMode==='course'?'Course terminée ! 🏁':'Tour terminé ! 🏁';$('overlay-text').textContent=raceMode==='course'?'Position : '+racePosition+'/3 · Temps : '+fmt(rally.time)+'. Rejoue pour progresser !':'Chrono : '+fmt(rally.time)+'. Rejoue pour améliorer ton temps !';if(raceMode==='chrono'&&(!best||rally.time<best)){best=rally.time;saveBest()}}else{best=Math.max(best,Math.floor(score));saveBest();$('overlay-title').textContent='Partie terminée !';$('overlay-text').textContent='Score : '+Math.floor(score)+' points. Record : '+best+' points.'}$('start').textContent='Rejouer ↗';$('overlay').classList.remove('hidden');hud()}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function car(x,y,angle,color,scale=1){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.fillStyle='#05071177';ctx.beginPath();ctx.ellipse(5,10,25,39,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#10111d';for(let sy of [-24,21])for(let sx of [-21,15])rounded(sx,sy,8,19,3);ctx.fillStyle=color;rounded(-18,-36,36,72,9);ctx.fillStyle='#142944';rounded(-13,-16,26,25,5);ctx.fillStyle='#a5e3ff';rounded(-12,-15,24,15,3);ctx.fillStyle='#243c58';rounded(-12,15,24,11,3);ctx.fillStyle='#e9f5ff';ctx.fillRect(-14,-34,9,5);ctx.fillRect(5,-34,9,5);ctx.fillStyle='#ef5265';ctx.fillRect(-14,31,8,4);ctx.fillRect(6,31,8,4);ctx.fillStyle='#ffffff88';ctx.fillRect(-3,-34,6,7);ctx.restore()}
function noise(n){let v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v)}

function strokeTrack(width,color){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(track[0].x,track[0].y);for(let i=1;i<track.length;i++)ctx.lineTo(track[i].x,track[i].y);ctx.closePath();ctx.stroke()}
function treeWorld(o){
 ctx.save();ctx.translate(o.x,o.y);
 const n=noise(o.seed+8),scale=.72+n*.68;ctx.scale(scale,scale);
 ctx.fillStyle='#091b1499';ctx.beginPath();ctx.ellipse(13,16,29,14,-.18,0,TAU);ctx.fill();
 ctx.fillStyle=snowy()?'#53696c':(circuitIndex===1?'#6d452d':'#4a3224');ctx.fillRect(-4,-10,8,32);
 if(noise(o.seed+17)>.48){
  // Conifère en trois étages : silhouette différente des feuillus.
  for(let j=0;j<3;j++){const w=25-j*4,y=8-j*15;
   ctx.fillStyle=(snowy()?['#274d50','#3b686a','#648b86']:(circuitIndex===1?['#5b5830','#77733a','#9b9151']:['#173c31','#245941','#39744d']))[j];ctx.beginPath();ctx.moveTo(0,y-48);ctx.lineTo(-w,y);ctx.lineTo(w,y);ctx.closePath();ctx.fill();
   if(snowy()){ctx.fillStyle='#eaf6f3';ctx.beginPath();ctx.moveTo(0,y-48);ctx.lineTo(-w*.45,y-24);ctx.lineTo(0,y-29);ctx.lineTo(w*.45,y-24);ctx.closePath();ctx.fill();}
   ctx.strokeStyle=snowy()?'#f6ffff88':'#79a06a55';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-w*.6,y-4);ctx.lineTo(0,y-33);ctx.stroke();
  }
 }else{
  for(let j=0;j<5;j++){const x=[-14,13,0,-9,12][j],y=[-16,-16,-29,-35,-32][j],r=[18,18,22,15,15][j];
   ctx.fillStyle=(snowy()?['#2b5654','#3f7771','#6e9992','#b2cbc0','#e2ebe1']:(circuitIndex===1?['#65522b','#7e6835','#948348','#a79a58','#b6aa6b']:['#163d2b','#245c38','#367847','#4b8751','#67975a']))[j];ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  }
 }
 ctx.restore();
}
function rockWorld(o){ctx.save();ctx.translate(o.x,o.y);ctx.fillStyle='#07171199';ctx.beginPath();ctx.ellipse(6,8,18,10,0,0,TAU);ctx.fill();ctx.fillStyle=snowy()?'#7e9ca4':(circuitIndex===1?'#a36b4b':'#707b6e');ctx.beginPath();ctx.moveTo(-16,2);ctx.lineTo(-8,-13);ctx.lineTo(8,-16);ctx.lineTo(18,-1);ctx.lineTo(10,9);ctx.lineTo(-10,9);ctx.fill();ctx.fillStyle=snowy()?'#e7f4f3':(circuitIndex===1?'#d3a079':'#a8aa95');ctx.beginPath();ctx.moveTo(-8,-13);ctx.lineTo(8,-16);ctx.lineTo(1,-4);ctx.lineTo(-12,1);ctx.fill();ctx.restore()}
function drawCarWorld(){ctx.save();ctx.translate(rally.x,rally.y);ctx.rotate(rally.heading+PI/2); // la carrosserie est dessinée nez vers -Y
 // ombre et carrosserie légèrement inclinées pour la sensation de poids
 ctx.fillStyle='#0008';ctx.beginPath();ctx.ellipse(11,13,28,46,0,0,TAU);ctx.fill();
 // Carrosserie légèrement animée lors du braquage, sans changer la physique.
 ctx.rotate(-rally.steer*.035);
 // Bas de caisse et ailes foncées.
 ctx.fillStyle='#0a283d';rounded(-23,-32,46,67,11);
 ctx.fillStyle='#051e30';rounded(-24,-26,8,24,4);rounded(16,-26,8,24,4);
 for(let sy of [-29,20])for(let sx of [-25,17]){ctx.fillStyle='#0b1115';rounded(sx,sy,9,20,3);ctx.fillStyle='#7d8281';ctx.fillRect(sx+2,sy+5,3,10)}
 const body=ctx.createLinearGradient(-22,0,22,0);body.addColorStop(0,'#0e3b60');body.addColorStop(.28,'#18a1d4');body.addColorStop(.52,'#79def3');body.addColorStop(.8,'#2280b7');body.addColorStop(1,'#0b345a');ctx.fillStyle=body;rounded(-21,-40,42,81,10);
 ctx.fillStyle='#e5f6ff';ctx.fillRect(-5,-38,10,18);ctx.fillRect(-5,16,10,18);
 ctx.fillStyle='#0c273c';rounded(-16,-15,32,27,6);ctx.fillStyle='#68a9c3';rounded(-13,-12,26,18,4);
 ctx.fillStyle='#183d53';rounded(-15,16,30,11,4);
 // Vitres en dégradé, montant central et essuie-glace.
 const glass=ctx.createLinearGradient(-12,-15,13,10);
 glass.addColorStop(0,'#b8e6ec');glass.addColorStop(.55,'#3d8ba8');glass.addColorStop(1,'#153b58');
 ctx.fillStyle=glass;rounded(-13,-12,26,18,4);
 ctx.strokeStyle='#e2f8ff9c';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-11,4);ctx.lineTo(11,-8);ctx.stroke();
 ctx.fillStyle='#103248';rounded(-13,18,26,6,3);
 ctx.fillStyle='#e8f8ff';ctx.fillRect(-16,-37,10,5);ctx.fillRect(6,-37,10,5);
 ctx.fillStyle='#ef4557';ctx.fillRect(-16,34,10,4);ctx.fillRect(6,34,10,4);
 ctx.fillStyle='#112b43';rounded(-24,32,48,7,3);
 // Prises d'air, lignes de carrosserie, rétroviseurs et reflets.
 ctx.fillStyle='#0c2c41';rounded(-24,-11,6,13,2);rounded(18,-11,6,13,2);
 ctx.strokeStyle='#e2f8ff99';ctx.lineWidth=1.4;
 ctx.beginPath();ctx.moveTo(-17,-23);ctx.lineTo(-17,23);ctx.moveTo(17,-23);ctx.lineTo(17,23);ctx.stroke();
 ctx.fillStyle='#102c40';rounded(-13,-29,26,4,2);
 ctx.fillStyle='#ffffffbb';ctx.fillRect(-15,-36,8,2);ctx.fillRect(7,-36,8,2);
 ctx.fillStyle='#0a2134';rounded(-18,27,36,4,2);
 // Calandre, aération de capot et rivets du spoiler.
 ctx.fillStyle='#08263b';rounded(-11,-33,22,5,2);
 ctx.strokeStyle='#c0ecfaaa';ctx.lineWidth=1;for(let k=-6;k<=6;k+=6){ctx.beginPath();ctx.moveTo(k,-32);ctx.lineTo(k,-29);ctx.stroke()}
 ctx.fillStyle='#d7e5ea';ctx.fillRect(-19,33,4,2);ctx.fillRect(15,33,4,2);
 ctx.fillStyle='#0b2433';rounded(-19,27,38,4,2);
 ctx.restore()}
function drawRally(){
 ctx.fillStyle=snowy()?'#c4d9d9':(circuitIndex===1?'#88503a':'#284a35');ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(W/2,H*.65);ctx.scale(.86,.76);ctx.rotate(-PI/2-rally.cameraHeading);ctx.translate(-rally.cameraX,-rally.cameraY);
 // Terrain végétal texturé uniquement dans la zone proche de la caméra.
 const span=620;const minx=Math.floor((rally.cameraX-span)/65),maxx=Math.ceil((rally.cameraX+span)/65),miny=Math.floor((rally.cameraY-span)/65),maxy=Math.ceil((rally.cameraY+span)/65);
 for(let i=minx;i<=maxx;i++)for(let j=miny;j<=maxy;j++){let n=noise(i*19+j*71);ctx.fillStyle=snowy()?(n>.5?'#f1f9f6':'#8baeb2'):(circuitIndex===1?(n>.5?'#b46c47':'#73432f'):(n>.5?'#396346':'#1f4433'));ctx.globalAlpha=.24;ctx.beginPath();ctx.ellipse(i*65+n*25,j*65+noise(i*33+j)*22,13+n*22,5+n*9,n*4,0,TAU);ctx.fill()}ctx.globalAlpha=1;
 if(circuitIndex===2){
 strokeTrack(TRACK_WIDTH+34,'#9dbbbf');strokeTrack(TRACK_WIDTH+20,'#edf6f2');strokeTrack(TRACK_WIDTH,'#71888e');strokeTrack(TRACK_WIDTH-14,'#8fa3a7');
 }else if(circuitIndex===1){
 strokeTrack(TRACK_WIDTH+34,'#643c30');strokeTrack(TRACK_WIDTH+20,'#9a5b3d');strokeTrack(TRACK_WIDTH,'#ba8060');strokeTrack(TRACK_WIDTH-14,'#cf9770');
 }else{
 strokeTrack(TRACK_WIDTH+34,'#554832');strokeTrack(TRACK_WIDTH+20,'#826847');strokeTrack(TRACK_WIDTH,'#9b825b');strokeTrack(TRACK_WIDTH-14,'#ac936b');
 }
 // Gravier irrégulier incrusté dans la piste, fixe d'une image à l'autre.
 for(const o of roadDetails){if(Math.abs(o.x-rally.cameraX)>610||Math.abs(o.y-rally.cameraY)>610)continue;
  ctx.fillStyle=snowy()?(o.shade>.55?'#e8f6f780':'#354e5966'):(circuitIndex===1?(o.shade>.55?'#f1c99b80':'#773f3066'):(o.shade>.55?'#d9c39b80':'#57463166'));ctx.beginPath();ctx.ellipse(o.x,o.y,o.r*1.6,o.r*.65,o.shade*TAU,0,TAU);ctx.fill();
 }
 // Petites zones de terre usée sur les bords et variation de texture.
 for(const o of roadPatches){if(Math.abs(o.x-rally.cameraX)<610&&Math.abs(o.y-rally.cameraY)<610)drawRoadPatch(o)}
 // Traces des pneus suivent réellement les courbes du circuit.
 for(let lane of [-26,26]){ctx.strokeStyle=snowy()?'#425b6877':'#56463177';ctx.lineWidth=7;ctx.beginPath();for(let i=0;i<=track.length;i++){let p=track[i%track.length],prev=track[(i+track.length-1)%track.length],next=track[(i+1)%track.length],dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy)||1,x=p.x-dy/len*lane,y=p.y+dx/len*lane;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}
 // Bordures discrètes en pointillés, plus lisibles dans les virages.
 ctx.setLineDash([15,21]);strokeTrack(TRACK_WIDTH-5,snowy()?'#f1ffff99':'#dfcba177');ctx.setLineDash([]);
 // Accents lumineux très discrets sur les bordures de piste.
 ctx.setLineDash([5,28]);strokeTrack(TRACK_WIDTH+13,snowy()?'#e9ffffaa':'#d6b78155');ctx.setLineDash([]);
 // Marques laissées par le joueur, sans effet sur l'adhérence.
 drawSkidMarks();
 // Départ : damier perpendiculaire à la tangente.
 {let a=track[0],b=track[1],h=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.translate(a.x,a.y);ctx.rotate(h);for(let r=0;r<2;r++)for(let c=0;c<10;c++){ctx.fillStyle=(r+c)%2?'#182021':'#f1ebdc';ctx.fillRect(-9+r*9,-TRACK_WIDTH/2+c*TRACK_WIDTH/10,9,TRACK_WIDTH/10)}ctx.restore()}
 // Touffes, buissons et bornes : lisibles pendant le défilement.
 for(const o of groundDetails){if(Math.abs(o.x-rally.cameraX)<610&&Math.abs(o.y-rally.cameraY)<610)drawGroundDetail(o)}
 for(const o of trackMarkers){if(Math.abs(o.x-rally.cameraX)<610&&Math.abs(o.y-rally.cameraY)<610)drawMarker(o)}
 for(const o of circuitProps){if(Math.abs(o.x-rally.cameraX)<610&&Math.abs(o.y-rally.cameraY)<610)drawCircuitProp(o)}
 if(Math.abs(track[0].x-rally.cameraX)<610&&Math.abs(track[0].y-rally.cameraY)<610)drawStartArch();

 // Décors triés selon Y pour l'effet de profondeur.
 for(let o of scenery){if(Math.abs(o.x-rally.cameraX)>700||Math.abs(o.y-rally.cameraY)>700)continue;if(o.type==='tree')treeWorld(o);else rockWorld(o)}
 // Poussière dans le monde (ne colle plus à l'écran).
 for(let p of particles){
  ctx.globalAlpha=clamp(p.life/(p.maxLife||.65),0,1)*.40;
  ctx.fillStyle=snowy()?'#eaf8f4':(p.kind==='dust'?'#dbc69b':'#d5bd8c');ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();
 }ctx.globalAlpha=1;
 if(raceMode==='course')for(const o of opponents){if(Math.abs(o.x-rally.cameraX)<620&&Math.abs(o.y-rally.cameraY)<620)drawOpponent(o)}
 drawCarWorld();ctx.restore();
 // Léger vignettage fixe pour donner du contraste, sans masquer le pilotage.
 const vignette=ctx.createRadialGradient(W*.5,H*.48,H*.24,W*.5,H*.48,H*.73);
 vignette.addColorStop(0,'#081a1500');vignette.addColorStop(1,'#07150e55');
 ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
 // HUD intégré : piste complète + position du véhicule.
 ctx.fillStyle='#0b1b22d8';rounded(10,10,120,96,12);ctx.strokeStyle='#b4c3a0';ctx.lineWidth=1.5;ctx.beginPath();for(let i=0;i<track.length;i++){let p=track[i],x=70+p.x*.06,y=57+p.y*.06;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.stroke();if(raceMode==='course')for(const o of opponents){ctx.fillStyle=o.color;ctx.beginPath();ctx.arc(70+o.x*.06,57+o.y*.06,3.5,0,TAU);ctx.fill()}
 ctx.fillStyle='#70eaff';ctx.beginPath();ctx.arc(70+rally.x*.06,57+rally.y*.06,4,0,TAU);ctx.fill();
 ctx.fillStyle='#10262acb';rounded(293,10,117,52,12);ctx.textAlign='center';ctx.fillStyle='#f7f6e8';ctx.font='bold 22px system-ui';ctx.fillText(Math.round(rally.speed)+' km/h',351,35);ctx.font='bold 10px system-ui';ctx.fillStyle='#b7d8bd';ctx.fillText(raceMode==='course'?'POSITION '+racePosition+' / 3':'TOUR 1 / 1',351,51);
 if(collisionNotice>0){ctx.fillStyle='#ffdb91';ctx.font='bold 14px system-ui';ctx.fillText('CONTACT !',210,112)}
 if(rally.off){ctx.fillStyle='#ffcc7b';ctx.font='bold 13px system-ui';ctx.fillText('HORS PISTE',210,88)}
}
function tickRally(dt){
 const steerInput=(keys.right?1:0)-(keys.left?1:0),gas=keys.accelerate,brake=keys.brake;
 rally.time+=dt;rally.hitCooldown=Math.max(0,rally.hitCooldown-dt);collisionNotice=Math.max(0,collisionNotice-dt);
 // Braquage progressif : rapide à basse vitesse, plus stable quand on accélère.
 // Le retour au centre est volontairement plus vif pour faciliter les corrections.
 const steeringResponse=steerInput===0?12:7.5;
 rally.steer+=(steerInput-rally.steer)*(1-Math.exp(-steeringResponse*dt));
 const road=nearestRoad(rally.x,rally.y);rally.off=road.distance>TRACK_WIDTH*.5-11;
 // Courbe de puissance arcade : départ énergique, relances franches,
 // puis accélération progressivement plus douce près de la vitesse de pointe.
 // Le compteur reste en km/h ; la projection du monde n'est pas modifiée.
 const maxSpeed=rally.off?115:225;
 const throttlePower=rally.speed<65?195:rally.speed<140?148:rally.speed<190?103:66;
 const acceleration=gas?throttlePower*(rally.off?.68:1):0;
 const drag=gas?14:34;
 const braking=brake?225:0;
 rally.speed=clamp(rally.speed+(acceleration-drag-braking)*dt,0,maxSpeed);
 // Même échelle et même sensation de vitesse que la V3.1 validée.
 const meters=rally.speed/3.6;
 const worldSpeed=meters*2.65;
 // Limiter l'angle de braquage à haute vitesse évite les demi-tours instantanés.
 const speedFactor=clamp(rally.speed/225,0,1);
 const turnRate=(.35+1.22*Math.min(1,meters/23))*(1-.38*speedFactor);
 rally.heading+=rally.steer*turnRate*dt;
 // Petite dérive latérale, avec une adhérence forte et un retour rapide.
 // side représente la vitesse latérale en unités du monde / seconde.
 const desiredSide=-rally.steer*worldSpeed*(rally.off?.12:.055)*speedFactor;
 const grip=rally.off?5.8:(brake?7.5:11.5);
 rally.side+=(desiredSide-rally.side)*(1-Math.exp(-grip*dt));
 const lateralX=-Math.sin(rally.heading),lateralY=Math.cos(rally.heading);
 rally.x+=(Math.cos(rally.heading)*worldSpeed+lateralX*rally.side)*dt;
 rally.y+=(Math.sin(rally.heading)*worldSpeed+lateralY*rally.side)*dt;
 // Caméra amortie, sans retard excessif dans les virages.
 rally.cameraHeading+=angleDelta(rally.heading,rally.cameraHeading)*(1-Math.exp(-6.8*dt));
 rally.cameraX+=(rally.x-rally.cameraX)*Math.min(1,dt*9);
 rally.cameraY+=(rally.y-rally.cameraY)*Math.min(1,dt*9);
 spawnRallyEffects(dt);tickOpponents(dt);
 // La ligne ne valide le tour qu'après avoir parcouru une grande partie du circuit.
 if(rally.progress<.2&&road.progress>.2&&road.progress<.75)rally.progress=.5;
 if(rally.progress>=.5&&road.progress>.83)rally.progress=.9;
 if(rally.progress>=.9&&road.progress<.04&&rally.time>12){rally.lap=1;finish()}
}
// Drift Challenge V1 : inchangé dans son principe.
function drawDrift(){ctx.fillStyle='#1c1b3e';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#353460';ctx.lineWidth=1;for(let x=0;x<W;x+=35){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=35){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.strokeStyle='#a86effaa';ctx.lineWidth=8;ctx.strokeRect(24,24,W-48,H-48);for(const p of particles){ctx.globalAlpha=p.life/.65;ctx.fillStyle='#c5bcff';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()}ctx.globalAlpha=1;car(player.x,player.y,player.heading+Math.PI/2,'#60c4ff',.78)}
function tickDrift(dt){let steer=(keys.right?1:0)-(keys.left?1:0);player.heading+=steer*3.3*dt;let speed=150;player.x+=Math.cos(player.heading)*speed*dt;player.y+=Math.sin(player.heading)*speed*dt;if(steer){combo=Math.min(12,combo+dt*2.4);score+=dt*(1+combo)*51;for(let i=0;i<2;i++)particles.push({x:player.x-Math.cos(player.heading)*20+(Math.random()-.5)*12,y:player.y-Math.sin(player.heading)*20+(Math.random()-.5)*12,life:.65,r:2+Math.random()*4})}else combo=Math.max(0,combo-dt*3.9);for(const p of particles)p.life-=dt;particles=particles.filter(p=>p.life>0).slice(-170);best=Math.max(best,Math.floor(score));if(player.x<44||player.x>376||player.y<44||player.y>556)finish()}
function draw(){if(mode==='rally')drawRally();else if(mode==='drift')drawDrift()}
function loop(now){if(!running)return;let dt=Math.min((now-last)/1000,.035);last=now;frame+=dt;if(mode==='rally')tickRally(dt);else tickDrift(dt);draw();hud();if(running)raf=requestAnimationFrame(loop)}
document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.game)));
$('brand').addEventListener('click',e=>{e.preventDefault();back()});$('back').addEventListener('click',back);$('start').addEventListener('click',start);
// Multi-touch iOS/Android : un pouce peut accélérer pendant que l'autre tourne.
// On désactive explicitement les gestes natifs (sélection, zoom, défilement).
const heldTouches = new Map();
function refreshTouchKeys(){for(const k of Object.keys(keys))keys[k]=[...heldTouches.values()].includes(k)}
function bindControl(id,key){
 const el=$(id);
 el.setAttribute('draggable','false');
 el.addEventListener('dragstart',e=>e.preventDefault());
 el.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('selectstart',e=>e.preventDefault());
 el.addEventListener('touchstart',e=>{
   e.preventDefault();
   for(const t of e.changedTouches)heldTouches.set('t'+t.identifier,key);
   refreshTouchKeys();
 },{passive:false});
 for(const event of ['touchend','touchcancel'])el.addEventListener(event,e=>{
   e.preventDefault();for(const t of e.changedTouches)heldTouches.delete('t'+t.identifier);refreshTouchKeys();
 },{passive:false});
 // Souris et stylet : les évènements tactiles sont déjà gérés ci-dessus.
 el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;e.preventDefault();heldTouches.set('p'+e.pointerId,key);refreshTouchKeys();try{el.setPointerCapture(e.pointerId)}catch{} });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,e=>{if(e.pointerType==='touch')return;heldTouches.delete('p'+e.pointerId);refreshTouchKeys()});
}
for(const [id,key] of [['left','left'],['right','right'],['accelerate','accelerate'],['brake','brake']])bindControl(id,key);
const keyMap={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'accelerate',ArrowDown:'brake',a:'left',d:'right',w:'accelerate',s:'brake'};
window.addEventListener('keydown',e=>{const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(k){e.preventDefault();keys[k]=true}});
window.addEventListener('keyup',e=>{const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(k){e.preventDefault();keys[k]=false}});
window.addEventListener('blur',()=>{heldTouches.clear();Object.keys(keys).forEach(k=>keys[k]=false)});
