'use strict';
// Espace Détente V3.3 : nouvelle piste fermée, déplacement libre en coordonnées monde,
// caméra rotative et rendu Canvas autonome. Drift Challenge reste indépendant.
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d'),W=420,H=600;
let mode=null,running=false,last=0,raf=0,score=0,best=0,frame=0,combo=0,particles=[];
const keys={left:false,right:false,accelerate:false,brake:false};
let player={x:210,y:460,heading:-Math.PI/2};
const PI=Math.PI, TAU=PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const rally={x:0,y:0,heading:0,cameraHeading:0,cameraX:0,cameraY:0,speed:0,side:0,steer:0,time:0,lap:0,progress:0,off:false,hitCooldown:0};
// Piste fermée, points de contrôle suffisamment espacés pour une conduite libre.
const knots=[[-40,610],[245,600],[500,445],[670,190],[640,-130],[440,-410],[150,-535],[-190,-500],[-485,-340],[-630,-80],[-560,215],[-340,420]];
const TRACK_WIDTH=136;
function spline(p0,p1,p2,p3,t){let t2=t*t,t3=t2*t;return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3)}
const track=[];
for(let i=0;i<knots.length;i++)for(let k=0;k<20;k++){
 const a=knots[(i+knots.length-1)%knots.length],b=knots[i],c=knots[(i+1)%knots.length],d=knots[(i+2)%knots.length],t=k/20;
 track.push({x:spline(a[0],b[0],c[0],d[0],t),y:spline(a[1],b[1],c[1],d[1],t)});
}
let trackLength=0;const lengths=[0];
for(let i=0;i<track.length;i++){let a=track[i],b=track[(i+1)%track.length];trackLength+=Math.hypot(b.x-a.x,b.y-a.y);lengths.push(trackLength)}
function trackAt(t){t=((t%1)+1)%1;let f=t*track.length,i=Math.floor(f),a=track[i],b=track[(i+1)%track.length];return {x:lerp(a.x,b.x,f-i),y:lerp(a.y,b.y,f-i)}}
function nearestRoad(x,y){let bestD=Infinity,bestI=0,bestT=0;
 for(let i=0;i<track.length;i++){const a=track[i],b=track[(i+1)%track.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1),px=a.x+t*dx,py=a.y+t*dy,d=(x-px)**2+(y-py)**2;if(d<bestD){bestD=d;bestI=i;bestT=t}}
 return {distance:Math.sqrt(bestD),progress:(lengths[bestI]+bestT*(lengths[bestI+1]-lengths[bestI]))/trackLength};
}
function noise(n){let v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v)}
const scenery=[];
for(let i=0;i<track.length;i+=2){let a=track[i],b=track[(i+1)%track.length],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;
 for(let side of [-1,1]){let seed=i*7+side*17;let r=115+noise(seed+4)*140;
 scenery.push({x:a.x+nx*r*side+(noise(seed+9)-.5)*55,y:a.y+ny*r*side+(noise(seed+12)-.5)*55,type:noise(seed+21)>.23?'tree':'rock',seed});
 }}
function readBest(){try{return Number(localStorage.getItem('espace-detente-'+mode+'-record'))||0}catch{return 0}}
function saveBest(){try{localStorage.setItem('espace-detente-'+mode+'-record',String(best))}catch{}}
function fmt(t){return Math.floor(t/60).toString().padStart(2,'0')+':'+Math.floor(t%60).toString().padStart(2,'0')}
function hud(){if(mode==='rally'){$('score').textContent=Math.round(rally.speed)+' km/h';$('best').textContent=fmt(rally.time);$('extra').textContent=(rally.lap+1)+' / 1'}else{$('score').textContent=Math.floor(score).toLocaleString('fr-FR');$('best').textContent=Math.floor(best).toLocaleString('fr-FR');$('extra').textContent=Math.floor(combo)+'×'}}
function reset(){running=false;frame=0;score=0;combo=0;particles=[];player={x:210,y:460,heading:-Math.PI/2};let a=track[0],b=track[1],h=Math.atan2(b.y-a.y,b.x-a.x);Object.assign(rally,{x:a.x,y:a.y,heading:h,cameraHeading:h,cameraX:a.x,cameraY:a.y,speed:0,side:0,steer:0,time:0,lap:0,progress:0,off:false,hitCooldown:0});best=readBest();hud();draw()}
function choose(next){heldTouches.clear();cancelAnimationFrame(raf);mode=next;Object.keys(keys).forEach(k=>keys[k]=false);$('home').classList.add('hidden');$('play').classList.remove('hidden');$('pedals').classList.toggle('hidden',next!=='rally');$('drive-controls').classList.toggle('drift-controls',next!=='rally');$('mode').textContent=next==='rally'?'RALLYE · ACCÉLÉRATION V3.3':'DRIFT CHALLENGE';$('extra-label').textContent=next==='rally'?'TOUR':'COMBO';$('score').previousElementSibling.textContent=next==='rally'?'VITESSE':'SCORE';$('best').previousElementSibling.textContent=next==='rally'?'CHRONO':'RECORD';$('overlay-title').textContent=next==='rally'?'Prêt pour le circuit ?':'Prêt à drifter ?';$('overlay-text').textContent=next==='rally'?'Accélérations plus franches et relances plus rapides. Maîtrise les virages !':'Maintiens une direction pour drifter et marque des points. Évite les bords !';$('control-tip').textContent=next==='rally'?'UN TOUR DE CIRCUIT · CAMÉRA SUIVEUSE':'Maintiens ← ou → pour drifter';$('game-note').textContent=next==='rally'?'Mobile : accélère à gauche et tourne à droite. PC : flèches.':'Mobile : gauche/droite. PC : flèches gauche/droite.';$('overlay').classList.remove('hidden');$('start').textContent="C'est parti →";reset();window.scrollTo({top:0,behavior:'smooth'})}
function back(){heldTouches.clear();running=false;cancelAnimationFrame(raf);mode=null;Object.keys(keys).forEach(k=>keys[k]=false);$('play').classList.add('hidden');$('home').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
function start(){cancelAnimationFrame(raf);reset();running=true;$('overlay').classList.add('hidden');last=performance.now();raf=requestAnimationFrame(loop)}
function finish(){running=false;cancelAnimationFrame(raf);if(mode==='rally'){$('overlay-title').textContent='Tour terminé ! 🏁';$('overlay-text').textContent='Chrono : '+fmt(rally.time)+'. Rejoue pour améliorer ton temps !';if(!best||rally.time<best){best=rally.time;saveBest()}}else{best=Math.max(best,Math.floor(score));saveBest();$('overlay-title').textContent='Partie terminée !';$('overlay-text').textContent='Score : '+Math.floor(score)+' points. Record : '+best+' points.'}$('start').textContent='Rejouer ↗';$('overlay').classList.remove('hidden');hud()}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function car(x,y,angle,color,scale=1){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.fillStyle='#05071177';ctx.beginPath();ctx.ellipse(5,10,25,39,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#10111d';for(let sy of [-24,21])for(let sx of [-21,15])rounded(sx,sy,8,19,3);ctx.fillStyle=color;rounded(-18,-36,36,72,9);ctx.fillStyle='#142944';rounded(-13,-16,26,25,5);ctx.fillStyle='#a5e3ff';rounded(-12,-15,24,15,3);ctx.fillStyle='#243c58';rounded(-12,15,24,11,3);ctx.fillStyle='#e9f5ff';ctx.fillRect(-14,-34,9,5);ctx.fillRect(5,-34,9,5);ctx.fillStyle='#ef5265';ctx.fillRect(-14,31,8,4);ctx.fillRect(6,31,8,4);ctx.fillStyle='#ffffff88';ctx.fillRect(-3,-34,6,7);ctx.restore()}
function noise(n){let v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v)}

function strokeTrack(width,color){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(track[0].x,track[0].y);for(let i=1;i<track.length;i++)ctx.lineTo(track[i].x,track[i].y);ctx.closePath();ctx.stroke()}
function treeWorld(o){ctx.save();ctx.translate(o.x,o.y);let scale=.8+noise(o.seed+8)*.65;ctx.scale(scale,scale);
 ctx.fillStyle='#091a14aa';ctx.beginPath();ctx.ellipse(12,13,25,15,-.2,0,TAU);ctx.fill();
 ctx.fillStyle='#553b28';ctx.fillRect(-4,-10,8,28);
 for(let j=0;j<3;j++){ctx.fillStyle=['#163c2c','#23543a','#37704a'][j];ctx.beginPath();ctx.arc([-12,11,0][j],[-15,-12,-25][j],[19,21,22][j],0,TAU);ctx.fill()}
 ctx.fillStyle='#75a66b55';ctx.beginPath();ctx.arc(-10,-32,8,0,TAU);ctx.fill();ctx.restore()}
function rockWorld(o){ctx.save();ctx.translate(o.x,o.y);ctx.fillStyle='#07171199';ctx.beginPath();ctx.ellipse(6,8,18,10,0,0,TAU);ctx.fill();ctx.fillStyle='#707b6e';ctx.beginPath();ctx.moveTo(-16,2);ctx.lineTo(-8,-13);ctx.lineTo(8,-16);ctx.lineTo(18,-1);ctx.lineTo(10,9);ctx.lineTo(-10,9);ctx.fill();ctx.fillStyle='#a8aa95';ctx.beginPath();ctx.moveTo(-8,-13);ctx.lineTo(8,-16);ctx.lineTo(1,-4);ctx.lineTo(-12,1);ctx.fill();ctx.restore()}
function drawCarWorld(){ctx.save();ctx.translate(rally.x,rally.y);ctx.rotate(rally.heading+PI/2); // la carrosserie est dessinée nez vers -Y
 // ombre et carrosserie légèrement inclinées pour la sensation de poids
 ctx.fillStyle='#0008';ctx.beginPath();ctx.ellipse(8,10,25,43,0,0,TAU);ctx.fill();
 for(let sy of [-29,20])for(let sx of [-25,17]){ctx.fillStyle='#0b1115';rounded(sx,sy,9,20,3);ctx.fillStyle='#7d8281';ctx.fillRect(sx+2,sy+5,3,10)}
 const body=ctx.createLinearGradient(-22,0,22,0);body.addColorStop(0,'#0e3b60');body.addColorStop(.28,'#18a1d4');body.addColorStop(.52,'#79def3');body.addColorStop(.8,'#2280b7');body.addColorStop(1,'#0b345a');ctx.fillStyle=body;rounded(-21,-40,42,81,10);
 ctx.fillStyle='#e5f6ff';ctx.fillRect(-5,-38,10,18);ctx.fillRect(-5,16,10,18);
 ctx.fillStyle='#0c273c';rounded(-16,-15,32,27,6);ctx.fillStyle='#68a9c3';rounded(-13,-12,26,18,4);
 ctx.fillStyle='#183d53';rounded(-15,16,30,11,4);
 ctx.fillStyle='#e8f8ff';ctx.fillRect(-16,-37,10,5);ctx.fillRect(6,-37,10,5);
 ctx.fillStyle='#ef4557';ctx.fillRect(-16,34,10,4);ctx.fillRect(6,34,10,4);
 ctx.fillStyle='#112b43';rounded(-24,32,48,7,3);ctx.restore()}
function drawRally(){
 ctx.fillStyle='#284a35';ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(W/2,H*.65);ctx.scale(.86,.76);ctx.rotate(-PI/2-rally.cameraHeading);ctx.translate(-rally.cameraX,-rally.cameraY);
 // Terrain végétal texturé uniquement dans la zone proche de la caméra.
 const span=620;const minx=Math.floor((rally.cameraX-span)/65),maxx=Math.ceil((rally.cameraX+span)/65),miny=Math.floor((rally.cameraY-span)/65),maxy=Math.ceil((rally.cameraY+span)/65);
 for(let i=minx;i<=maxx;i++)for(let j=miny;j<=maxy;j++){let n=noise(i*19+j*71);ctx.fillStyle=n>.5?'#396346':'#1f4433';ctx.globalAlpha=.24;ctx.beginPath();ctx.ellipse(i*65+n*25,j*65+noise(i*33+j)*22,13+n*22,5+n*9,n*4,0,TAU);ctx.fill()}ctx.globalAlpha=1;
 strokeTrack(TRACK_WIDTH+34,'#554832');strokeTrack(TRACK_WIDTH+20,'#826847');strokeTrack(TRACK_WIDTH,'#9b825b');strokeTrack(TRACK_WIDTH-14,'#ac936b');
 // Traces des pneus suivent réellement les courbes du circuit.
 for(let lane of [-26,26]){ctx.strokeStyle='#56463177';ctx.lineWidth=7;ctx.beginPath();for(let i=0;i<=track.length;i++){let p=track[i%track.length],prev=track[(i+track.length-1)%track.length],next=track[(i+1)%track.length],dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy)||1,x=p.x-dy/len*lane,y=p.y+dx/len*lane;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}
 // Bordures discrètes en pointillés, plus lisibles dans les virages.
 ctx.setLineDash([15,21]);strokeTrack(TRACK_WIDTH-5,'#dfcba177');ctx.setLineDash([]);
 // Départ : damier perpendiculaire à la tangente.
 {let a=track[0],b=track[1],h=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.translate(a.x,a.y);ctx.rotate(h);for(let r=0;r<2;r++)for(let c=0;c<10;c++){ctx.fillStyle=(r+c)%2?'#182021':'#f1ebdc';ctx.fillRect(-9+r*9,-TRACK_WIDTH/2+c*TRACK_WIDTH/10,9,TRACK_WIDTH/10)}ctx.restore()}
 // Décors triés selon Y pour l'effet de profondeur.
 for(let o of scenery){if(Math.abs(o.x-rally.cameraX)>700||Math.abs(o.y-rally.cameraY)>700)continue;if(o.type==='tree')treeWorld(o);else rockWorld(o)}
 // Poussière dans le monde (ne colle plus à l'écran).
 for(let p of particles){ctx.globalAlpha=clamp(p.life/.65,0,1)*.45;ctx.fillStyle='#d5bd8c';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill()}ctx.globalAlpha=1;
 drawCarWorld();ctx.restore();
 // HUD intégré : piste complète + position du véhicule.
 ctx.fillStyle='#0b1b22d8';rounded(10,10,120,96,12);ctx.strokeStyle='#b4c3a0';ctx.lineWidth=1.5;ctx.beginPath();for(let i=0;i<track.length;i++){let p=track[i],x=70+p.x*.06,y=57+p.y*.06;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.stroke();ctx.fillStyle='#70eaff';ctx.beginPath();ctx.arc(70+rally.x*.06,57+rally.y*.06,4,0,TAU);ctx.fill();
 ctx.fillStyle='#10262acb';rounded(293,10,117,52,12);ctx.textAlign='center';ctx.fillStyle='#f7f6e8';ctx.font='bold 22px system-ui';ctx.fillText(Math.round(rally.speed)+' km/h',351,35);ctx.font='bold 10px system-ui';ctx.fillStyle='#b7d8bd';ctx.fillText('TOUR 1 / 1',351,51);
 if(rally.off){ctx.fillStyle='#ffcc7b';ctx.font='bold 13px system-ui';ctx.fillText('HORS PISTE',210,88)}
}
function tickRally(dt){
 const steerInput=(keys.right?1:0)-(keys.left?1:0),gas=keys.accelerate,brake=keys.brake;
 rally.time+=dt;
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
 if((rally.off||Math.abs(rally.side)>7)&&rally.speed>60){for(let j=0;j<(rally.off?2:1);j++)particles.push({x:rally.x-Math.cos(rally.heading)*28+(Math.random()-.5)*20,y:rally.y-Math.sin(rally.heading)*28+(Math.random()-.5)*20,life:.65,r:3+Math.random()*7})}
 for(let p of particles)p.life-=dt;particles=particles.filter(p=>p.life>0).slice(-65);
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
