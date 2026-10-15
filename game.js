'use strict';
// Espace Détente V2 : Rallye 2,5D jouable sans dépendance. Drift V1 conservé.
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d'),W=420,H=600;
let mode=null,running=false,last=0,raf=0,score=0,best=0,frame=0,combo=0,particles=[];
const keys={left:false,right:false,accelerate:false,brake:false};
let player={x:210,y:460,heading:-Math.PI/2};
const rally={s:0,x:0,vx:0,speed:0,time:0,hitCooldown:0,finish:1600,shake:0,steer:0,slip:0,bodyRoll:0,skid:0};
const obstacles=[{s:180,offset:-15,r:13},{s:360,offset:28,r:17},{s:580,offset:-34,r:15},{s:810,offset:7,r:17},{s:1030,offset:35,r:16},{s:1260,offset:-22,r:18},{s:1430,offset:20,r:14}];
function roadCenter(s){return 63*Math.sin(s/145)+33*Math.sin(s/68+.8)+17*Math.sin(s/320+1.6)}
function roadHalf(s){return 73+8*Math.sin(s/190)}
function readBest(){try{return Number(localStorage.getItem('espace-detente-'+mode+'-record'))||0}catch{return 0}}
function saveBest(){try{localStorage.setItem('espace-detente-'+mode+'-record',String(best))}catch{}}
function fmt(t){return Math.floor(t/60).toString().padStart(2,'0')+':'+Math.floor(t%60).toString().padStart(2,'0')}
function hud(){if(mode==='rally'){$('score').textContent=Math.round(rally.speed)+' km/h';$('best').textContent=fmt(rally.time);$('extra').textContent=Math.min(100,Math.round(rally.s/rally.finish*100))+' %'}else{$('score').textContent=Math.floor(score).toLocaleString('fr-FR');$('best').textContent=Math.floor(best).toLocaleString('fr-FR');$('extra').textContent=Math.floor(combo)+'×'}}
function reset(){running=false;frame=0;score=0;combo=0;particles=[];player={x:210,y:460,heading:-Math.PI/2};Object.assign(rally,{s:0,x:roadCenter(0),vx:0,speed:0,time:0,hitCooldown:0,shake:0,steer:0,slip:0,bodyRoll:0,skid:0});best=readBest();hud();draw()}
function choose(next){heldTouches.clear();cancelAnimationFrame(raf);mode=next;Object.keys(keys).forEach(k=>keys[k]=false);$('home').classList.add('hidden');$('play').classList.remove('hidden');$('pedals').classList.toggle('hidden',next!=='rally');$('drive-controls').classList.toggle('drift-controls',next!=='rally');$('mode').textContent=next==='rally'?'RALLYE 2,5D · V2.6':'DRIFT CHALLENGE';$('extra-label').textContent=next==='rally'?'PARCOURS':'COMBO';$('score').previousElementSibling.textContent=next==='rally'?'VITESSE':'SCORE';$('best').previousElementSibling.textContent=next==='rally'?'CHRONO':'RECORD';$('overlay-title').textContent=next==='rally'?'Prêt pour la spéciale ?':'Prêt à drifter ?';$('overlay-text').textContent=next==='rally'?'Accélère, négocie les virages et rejoins l’arrivée ! Rester sur la piste permet d’aller plus vite.':'Maintiens une direction pour drifter et marque des points. Évite les bords !';$('control-tip').textContent=next==='rally'?'PILOTE TON RALLYE':'Maintiens ← ou → pour drifter';$('game-note').textContent=next==='rally'?'Mobile : maintiens les boutons. PC : flèches, ↑ pour accélérer et ↓ pour freiner.':'Mobile : gauche/droite. PC : flèches gauche/droite.';$('overlay').classList.remove('hidden');$('start').textContent="C'est parti →";reset();window.scrollTo({top:0,behavior:'smooth'})}
function back(){heldTouches.clear();running=false;cancelAnimationFrame(raf);mode=null;Object.keys(keys).forEach(k=>keys[k]=false);$('play').classList.add('hidden');$('home').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
function start(){cancelAnimationFrame(raf);reset();running=true;$('overlay').classList.add('hidden');last=performance.now();raf=requestAnimationFrame(loop)}
function finish(){running=false;cancelAnimationFrame(raf);if(mode==='rally'){$('overlay-title').textContent='Spéciale terminée ! 🏁';$('overlay-text').textContent='Temps : '+fmt(rally.time)+'. Bravo ! Tu peux refaire la course pour améliorer ton chrono.'}else{best=Math.max(best,Math.floor(score));saveBest();$('overlay-title').textContent='Partie terminée !';$('overlay-text').textContent='Score : '+Math.floor(score)+' points. Record : '+best+' points.'}$('start').textContent='Rejouer ↗';$('overlay').classList.remove('hidden');hud()}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function car(x,y,angle,color,scale=1){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.fillStyle='#05071177';ctx.beginPath();ctx.ellipse(5,10,25,39,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#10111d';for(let sy of [-24,21])for(let sx of [-21,15])rounded(sx,sy,8,19,3);ctx.fillStyle=color;rounded(-18,-36,36,72,9);ctx.fillStyle='#142944';rounded(-13,-16,26,25,5);ctx.fillStyle='#a5e3ff';rounded(-12,-15,24,15,3);ctx.fillStyle='#243c58';rounded(-12,15,24,11,3);ctx.fillStyle='#e9f5ff';ctx.fillRect(-14,-34,9,5);ctx.fillRect(5,-34,9,5);ctx.fillStyle='#ef5265';ctx.fillRect(-14,31,8,4);ctx.fillRect(6,31,8,4);ctx.fillStyle='#ffffff88';ctx.fillRect(-3,-34,6,7);ctx.restore()}
function noise(n){let v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v)}
// Échantillonnage perspective : le haut de l'écran représente un terrain plus éloigné.
// Perspective courte : à 200 km/h le sol défile réellement à ~190 px/s.
// Les objets et la piste utilisent la MÊME projection pour rester synchronisés.
const METERS_PER_PIXEL=.29;
function distanceAtY(y){return (460-y)*METERS_PER_PIXEL}
function yAtDistance(distance){return 460-distance/METERS_PER_PIXEL}
function scaleAtY(y){return .45+1.10*(y/H)}
function sx(wx,y){return W/2+(wx-rally.x)*scaleAtY(y)}
function polygon(a,b,c,d,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineTo(...c);ctx.lineTo(...d);ctx.closePath();ctx.fill()}
// Décors stylisés détaillés : silhouettes de conifères et feuillus avec lumière et ombres.
function drawTree(x,y,z=1,seed=0){
 ctx.save();ctx.translate(x,y);ctx.scale(z,z);
 const pine=noise(seed*7.17)>.34, height=32+noise(seed*3.91)*18;
 ctx.fillStyle='#091e1a88';ctx.beginPath();ctx.ellipse(13,7,21,9,-.2,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#493d29';ctx.fillRect(-2,-height*.64,5,height*.70);
 if(pine){
  for(let k=0;k<4;k++){
   const yy=-height+ k*10, width=9+k*5;
   ctx.fillStyle=['#12382f','#164e3b','#206044','#2e7351'][k];
   ctx.beginPath();ctx.moveTo(0,yy-10);ctx.lineTo(-width,yy+17);ctx.lineTo(width,yy+17);ctx.closePath();ctx.fill();
   ctx.strokeStyle='#a0c18b22';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-width*.55,yy+10);ctx.lineTo(-1,yy-4);ctx.stroke();
  }
 }else{
  const leaves=[[-10,-height+13,13,'#1b503b'],[9,-height+14,15,'#286347'],[-1,-height+3,15,'#347955'],[-8,-height+6,8,'#4b9061']];
  for(const [cx,cy,r,c] of leaves){ctx.fillStyle=c;ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.fill()}
 }
 ctx.restore();
}
function drawBoulder(x,y,z=1){ctx.save();ctx.translate(x,y);ctx.scale(z,z);ctx.fillStyle='#081e1c66';ctx.beginPath();ctx.ellipse(6,5,16,6,0,0,7);ctx.fill();ctx.fillStyle='#696e63';ctx.beginPath();ctx.moveTo(-12,0);ctx.lineTo(-8,-9);ctx.lineTo(5,-13);ctx.lineTo(14,-5);ctx.lineTo(12,4);ctx.lineTo(-8,5);ctx.closePath();ctx.fill();ctx.fillStyle='#9ba08b';ctx.beginPath();ctx.moveTo(-8,-9);ctx.lineTo(5,-13);ctx.lineTo(1,-5);ctx.lineTo(-10,-3);ctx.closePath();ctx.fill();ctx.restore()}
function drawRallyCar(x,y,angle){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(1.12,1.12);
 ctx.fillStyle='#05131088';ctx.beginPath();ctx.ellipse(8,13,25,43,-.1,0,7);ctx.fill();
 // Pneus et passages de roues.
 ctx.fillStyle='#101719';for(const sy of [-27,21])for(const sx of [-23,16]){rounded(sx,sy,9,19,3);ctx.fillStyle='#39454a';ctx.fillRect(sx+2,sy+4,2,10);ctx.fillStyle='#101719'}
 // Aileron arrière.
 ctx.fillStyle='#142333';rounded(-23,32,46,7,2);ctx.fillStyle='#9aa7ac';ctx.fillRect(-20,33,40,1.5);
 const body=ctx.createLinearGradient(-22,0,23,0);body.addColorStop(0,'#174c74');body.addColorStop(.23,'#29a8dc');body.addColorStop(.52,'#6bd9ee');body.addColorStop(.82,'#2580ae');body.addColorStop(1,'#143b62');ctx.fillStyle=body;rounded(-20,-38,40,78,11);
 ctx.strokeStyle='#a7f1ff88';ctx.lineWidth=1.3;ctx.strokeRect(-16,-30,32,60);
 // Capot et bandes de course.
 ctx.fillStyle='#f5f4dc';ctx.beginPath();ctx.moveTo(-5,-37);ctx.lineTo(1,-37);ctx.lineTo(3,-15);ctx.lineTo(-4,-15);ctx.closePath();ctx.fill();
 ctx.fillStyle='#ffac40';ctx.fillRect(6,-34,4,18);
 ctx.fillStyle='#153349';rounded(-15,-13,30,25,5);const glass=ctx.createLinearGradient(-12,-12,12,11);glass.addColorStop(0,'#7dc6d4');glass.addColorStop(.5,'#1c4565');glass.addColorStop(1,'#0d223a');ctx.fillStyle=glass;rounded(-13,-11,26,20,4);
 ctx.strokeStyle='#b7f2f9aa';ctx.beginPath();ctx.moveTo(-10,-8);ctx.lineTo(8,-8);ctx.stroke();
 ctx.fillStyle='#112c43';rounded(-13,15,26,15,4);ctx.fillStyle='#4a92b2';ctx.fillRect(-11,17,22,2);
 // Portières et rétroviseurs.
 ctx.fillStyle='#102d41';rounded(-25,-8,6,12,2);rounded(19,-8,6,12,2);
 ctx.fillStyle='#fff1c9';rounded(-16,-35,9,5,2);rounded(7,-35,9,5,2);
 ctx.fillStyle='#ff3d4f';rounded(-16,33,10,4,1);rounded(6,33,10,4,1);
 ctx.fillStyle='#122c40';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText('07',0,3);
 ctx.restore();
}
function drawRally(){
 // Fond forestier en dégradé et légère brume à l'horizon.
 const forest=ctx.createLinearGradient(0,0,0,H);forest.addColorStop(0,'#2b5947');forest.addColorStop(.5,'#284e3a');forest.addColorStop(1,'#203e32');ctx.fillStyle=forest;ctx.fillRect(0,0,W,H);
 const mist=ctx.createLinearGradient(0,0,0,210);mist.addColorStop(0,'#d8d9a31e');mist.addColorStop(1,'#d8d9a300');ctx.fillStyle=mist;ctx.fillRect(0,0,W,210);
// Brins d'herbe ancrés dans le monde : défilement continu, sans téléportation.
const grassStep=7, grassStart=Math.floor((rally.s-45)/grassStep), grassEnd=Math.ceil((rally.s+145)/grassStep);
for(let n=grassEnd;n>=grassStart;n--){
  const worldS=n*grassStep, y=yAtDistance(worldS-rally.s);
  if(y<-15||y>H+15)continue;
  for(let j=0;j<4;j++){
    const seed=n*17+j*23,side=j<2?-1:1;
    const worldX=roadCenter(worldS)+side*(roadHalf(worldS)+18+noise(seed+4)*120);
    const x=sx(worldX,y),z=scaleAtY(y);
    if(x<0||x>W)continue;
    ctx.strokeStyle=j%2?'#a3ba7a77':'#1b4e3d99';
    ctx.lineWidth=Math.max(1,z);
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3*z,y-7*z);ctx.moveTo(x,y);ctx.lineTo(x+3*z,y-5*z);ctx.stroke();
  }
}

// Bandes de piste : chaque segment suit le tracé réel, avec élargissement vers le bas.
for(let y=-8;y<H+9;y+=8){let y2=y+9,sa=rally.s+distanceAtY(y),sb=rally.s+distanceAtY(y2);let ca=roadCenter(sa),cb=roadCenter(sb),wa=roadHalf(sa),wb=roadHalf(sb);let l1=sx(ca-wa,y),r1=sx(ca+wa,y),l2=sx(cb-wb,y2),r2=sx(cb+wb,y2);polygon([l1-18,y],[r1+18,y],[r2+18,y2],[l2-18,y2],'#635842');
polygon([l1-12,y],[r1+12,y],[r2+12,y2],[l2-12,y2],'#b99a69');
polygon([l1,y],[r1,y],[r2,y2],[l2,y2],Math.floor(sa/4)%3===0?'#886b4d':'#80654c');
const grooves=[-.38,.38];for(const k of grooves){const xa=sx(ca+wa*k,y),xb=sx(cb+wb*k,y2);ctx.strokeStyle='#46382988';ctx.lineWidth=10*scaleAtY(y);ctx.beginPath();ctx.moveTo(xa,y);ctx.lineTo(xb,y2);ctx.stroke();}
ctx.strokeStyle='#f3c88a8a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(l1+6,y);ctx.lineTo(l2+6,y2);ctx.moveTo(r1-6,y);ctx.lineTo(r2-6,y2);ctx.stroke();}
// Décor procédural reproductible, ancré dans la piste.
const low=Math.floor((rally.s-48)/18),high=Math.floor((rally.s+145)/18);for(let i=high;i>=low;i--){let s=i*18,dy=s-rally.s,y=yAtDistance(dy);if(y< -30||y>H+35)continue;let offset=roadHalf(s)+25+noise(i*3)*55;for(let side of [-1,1]){let wx=roadCenter(s)+side*offset;let x=sx(wx,y),z=scaleAtY(y)*(.7+noise(i+side)*.3);if(x>-30&&x<W+30){if(noise(i*5+side)> .17)drawTree(x,y,z,i*3+side);else drawBoulder(x,y,z)}}}
// Graviers, pierres et irrégularités ancrés au sol (ne scintillent pas).
const firstStone=Math.floor((rally.s-48)/2.8),lastStone=Math.ceil((rally.s+145)/2.8);
for(let i=lastStone;i>=firstStone;i--){const worldS=i*2.8,y=yAtDistance(worldS-rally.s);if(y<0||y>H)continue;
 for(let j=0;j<3;j++){const seed=i*31+j*13;const wx=roadCenter(worldS)+(noise(seed+1)-.5)*roadHalf(worldS)*1.65,x=sx(wx,y),z=scaleAtY(y);if(x<0||x>W)continue;
 ctx.fillStyle=noise(seed+3)>.6?'#c5a17a99':'#4c413688';ctx.beginPath();ctx.ellipse(x,y,(.6+noise(seed+4)*2)*z,(.6+noise(seed+5)*1.4)*z,0,0,7);ctx.fill();}
}
for(const o of obstacles){let dy=o.s-rally.s,y=yAtDistance(dy);if(y<-30||y>H+30)continue;let x=sx(roadCenter(o.s)+o.offset,y),z=scaleAtY(y);ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(x+4*z,y+3*z,o.r*z,7*z,0,0,7);ctx.fill();ctx.fillStyle='#a9a59a';ctx.beginPath();ctx.ellipse(x,y,o.r*z,o.r*.7*z,0,0,7);ctx.fill();ctx.fillStyle='#ded3b9';ctx.beginPath();ctx.ellipse(x-4*z,y-4*z,4*z,3*z,0,0,7);ctx.fill()}
// Poussière dynamique derrière les roues.
for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/0.65)*.35;ctx.fillStyle='#e1c9a2';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()}ctx.globalAlpha=1;
if(rally.speed>65){
 const intensity=Math.min(1,(rally.speed-65)/120);
 ctx.save();ctx.globalAlpha=.14+intensity*.30;
 const stripeGap=11, first=Math.floor((rally.s-38)/stripeGap);
 for(let i=0;i<24;i++){
   const worldS=(first+i)*stripeGap, y=yAtDistance(worldS-rally.s);
   if(y<30||y>H)continue;
   const z=scaleAtY(y), len=(5+intensity*18)*z;
   for(const side of [-1,1]){
     const x=sx(roadCenter(worldS)+side*(roadHalf(worldS)+11),y);
     ctx.strokeStyle='#f3e5b4';ctx.lineWidth=1.5*z;
     ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+len);ctx.stroke();
   }
 }
 ctx.restore();
}
// La carrosserie pivote légèrement en virage et prend du roulis en appui.
const carYaw=Math.max(-.34,Math.min(.34,rally.slip*.005+rally.steer*.060));
ctx.save();ctx.translate(W/2,460);
ctx.rotate(carYaw);
ctx.translate(rally.bodyRoll*3,Math.abs(rally.bodyRoll)*1.2);
drawRallyCar(0,0,0);
ctx.restore();
const off=Math.abs(rally.x-roadCenter(rally.s))>roadHalf(rally.s)-13;if(off){ctx.fillStyle='#ffb46c';ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.fillText('HORS PISTE — RALENTISSEMENT',210,60)}
ctx.fillStyle='#080e24bd';rounded(13,12,394,34,10);ctx.fillStyle='#a8e7ff';ctx.font='bold 12px system-ui';ctx.textAlign='left';ctx.fillText('SPÉCIALE · FORÊT',25,33);ctx.textAlign='right';ctx.fillText(Math.round(rally.s)+' / '+rally.finish+' m',395,33);
// Mini-carte simplifiée du tracé, en haut à droite.
ctx.fillStyle='#0a1225bb';rounded(329,53,78,123,10);ctx.strokeStyle='#9a8df9';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<=24;i++){let s=i*rally.finish/24,x=368+roadCenter(s)*.19,y=163-i*4.05;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();ctx.fillStyle='#60e1ff';ctx.beginPath();ctx.arc(368+roadCenter(rally.s)*.19,163-rally.s/rally.finish*97.2,5,0,7);ctx.fill();}
function tickRally(dt){
 const input=(keys.right?1:0)-(keys.left?1:0);
 const gas=keys.accelerate,brake=keys.brake;
 // Les roues tournent progressivement, pas instantanément au toucher.
 rally.steer+=(input-rally.steer)*Math.min(1,dt*9);
 const offset=rally.x-roadCenter(rally.s);
 const off=Math.abs(offset)>roadHalf(rally.s)-11;
 const topSpeed=off?120:215;
 const power=gas?(rally.speed<65?48:rally.speed<130?32:21):0;
 const resistance=gas?2.2:9;
 rally.speed=Math.max(0,Math.min(topSpeed,rally.speed+(power-resistance-(brake?66:0))*dt));
 const speedMS=rally.speed/3.6;
 // La direction dépend de la vitesse : manœuvres douces à basse vitesse,
 // davantage d'inertie et de glisse lorsque l'on attaque un virage rapide.
 const steeringGain=5.0+Math.min(19,speedMS*.37);
 const desiredVx=rally.steer*steeringGain;
 const grip=off?5.2:(rally.speed>115?9.2:11.0);
 const brakingSlide=brake&&rally.speed>65?.88:1;
 rally.vx+=(desiredVx-rally.vx)*Math.min(1,grip*brakingSlide*dt);
 // Dérive latérale : décalage entre la trajectoire et les roues braquées.
 rally.slip+=(rally.vx-desiredVx-rally.slip)*Math.min(1,dt*8.5);
 rally.bodyRoll+=(rally.steer*Math.min(1,rally.speed/95)-rally.bodyRoll)*Math.min(1,dt*6);
 rally.x+=rally.vx*dt;
 rally.s+=speedMS*dt;
 rally.time+=dt;
 rally.hitCooldown=Math.max(0,rally.hitCooldown-dt);
 // Freinage et sorties de piste restent lisibles, sans immobiliser la voiture.
 if(off&&rally.speed>40)rally.speed=Math.max(40,rally.speed-22*dt);
 for(const o of obstacles){
   if(rally.hitCooldown===0&&Math.abs(o.s-rally.s)<9&&Math.abs(rally.x-(roadCenter(o.s)+o.offset))<o.r+12){
     rally.speed*=.48;rally.hitCooldown=1.2;rally.shake=.3;
   }
 }
 rally.shake=Math.max(0,rally.shake-dt);
 // Poussière plus dense dans les glissades et hors-piste, sans coût graphique élevé.
 const sliding=Math.abs(rally.slip)>5.5&&rally.speed>75;
 if(rally.speed>25&&(off||sliding||Math.random()<.15)){
   const amount=(off||sliding)?2:1;
   for(let i=0;i<amount;i++)particles.push({
     x:W/2+(Math.random()-.5)*28-rally.bodyRoll*4,
     y:498+Math.random()*13,r:2+Math.random()*(off?10:6),life:.65
   });
 }
 for(const p of particles){p.y+=dt*(45+rally.speed*.26);p.life-=dt}
 particles=particles.filter(p=>p.life>0).slice(-70);
 if(rally.s>=rally.finish){rally.s=rally.finish;finish()}
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
