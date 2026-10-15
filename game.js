'use strict';
// Espace Détente V2 : Rallye 2,5D jouable sans dépendance. Drift V1 conservé.
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d'),W=420,H=600;
let mode=null,running=false,last=0,raf=0,score=0,best=0,frame=0,combo=0,particles=[];
const keys={left:false,right:false,accelerate:false,brake:false};
let player={x:210,y:460,heading:-Math.PI/2};
const rally={s:0,x:0,vx:0,speed:0,time:0,hitCooldown:0,finish:1600,shake:0};
const obstacles=[{s:180,offset:-15,r:13},{s:360,offset:28,r:17},{s:580,offset:-34,r:15},{s:810,offset:7,r:17},{s:1030,offset:35,r:16},{s:1260,offset:-22,r:18},{s:1430,offset:20,r:14}];
function roadCenter(s){return 63*Math.sin(s/145)+33*Math.sin(s/68+.8)+17*Math.sin(s/320+1.6)}
function roadHalf(s){return 73+8*Math.sin(s/190)}
function readBest(){try{return Number(localStorage.getItem('espace-detente-'+mode+'-record'))||0}catch{return 0}}
function saveBest(){try{localStorage.setItem('espace-detente-'+mode+'-record',String(best))}catch{}}
function fmt(t){return Math.floor(t/60).toString().padStart(2,'0')+':'+Math.floor(t%60).toString().padStart(2,'0')}
function hud(){if(mode==='rally'){$('score').textContent=Math.round(rally.speed)+' km/h';$('best').textContent=fmt(rally.time);$('extra').textContent=Math.min(100,Math.round(rally.s/rally.finish*100))+' %'}else{$('score').textContent=Math.floor(score).toLocaleString('fr-FR');$('best').textContent=Math.floor(best).toLocaleString('fr-FR');$('extra').textContent=Math.floor(combo)+'×'}}
function reset(){running=false;frame=0;score=0;combo=0;particles=[];player={x:210,y:460,heading:-Math.PI/2};Object.assign(rally,{s:0,x:roadCenter(0),vx:0,speed:0,time:0,hitCooldown:0,shake:0});best=readBest();hud();draw()}
function choose(next){cancelAnimationFrame(raf);mode=next;Object.keys(keys).forEach(k=>keys[k]=false);$('home').classList.add('hidden');$('play').classList.remove('hidden');$('pedals').classList.toggle('hidden',next!=='rally');$('drive-controls').classList.toggle('drift-controls',next!=='rally');$('mode').textContent=next==='rally'?'RALLYE 2,5D · V2':'DRIFT CHALLENGE';$('extra-label').textContent=next==='rally'?'PARCOURS':'COMBO';$('score').previousElementSibling.textContent=next==='rally'?'VITESSE':'SCORE';$('best').previousElementSibling.textContent=next==='rally'?'CHRONO':'RECORD';$('overlay-title').textContent=next==='rally'?'Prêt pour la spéciale ?':'Prêt à drifter ?';$('overlay-text').textContent=next==='rally'?'Accélère, négocie les virages et rejoins l’arrivée ! Rester sur la piste permet d’aller plus vite.':'Maintiens une direction pour drifter et marque des points. Évite les bords !';$('control-tip').textContent=next==='rally'?'PILOTE TON RALLYE':'Maintiens ← ou → pour drifter';$('game-note').textContent=next==='rally'?'Mobile : maintiens les boutons. PC : flèches, ↑ pour accélérer et ↓ pour freiner.':'Mobile : gauche/droite. PC : flèches gauche/droite.';$('overlay').classList.remove('hidden');$('start').textContent="C'est parti →";reset();window.scrollTo({top:0,behavior:'smooth'})}
function back(){running=false;cancelAnimationFrame(raf);mode=null;Object.keys(keys).forEach(k=>keys[k]=false);$('play').classList.add('hidden');$('home').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
function start(){cancelAnimationFrame(raf);reset();running=true;$('overlay').classList.add('hidden');last=performance.now();raf=requestAnimationFrame(loop)}
function finish(){running=false;cancelAnimationFrame(raf);if(mode==='rally'){$('overlay-title').textContent='Spéciale terminée ! 🏁';$('overlay-text').textContent='Temps : '+fmt(rally.time)+'. Bravo ! Tu peux refaire la course pour améliorer ton chrono.'}else{best=Math.max(best,Math.floor(score));saveBest();$('overlay-title').textContent='Partie terminée !';$('overlay-text').textContent='Score : '+Math.floor(score)+' points. Record : '+best+' points.'}$('start').textContent='Rejouer ↗';$('overlay').classList.remove('hidden');hud()}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function car(x,y,angle,color,scale=1){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.fillStyle='#05071177';ctx.beginPath();ctx.ellipse(5,10,25,39,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#10111d';for(let sy of [-24,21])for(let sx of [-21,15])rounded(sx,sy,8,19,3);ctx.fillStyle=color;rounded(-18,-36,36,72,9);ctx.fillStyle='#142944';rounded(-13,-16,26,25,5);ctx.fillStyle='#a5e3ff';rounded(-12,-15,24,15,3);ctx.fillStyle='#243c58';rounded(-12,15,24,11,3);ctx.fillStyle='#e9f5ff';ctx.fillRect(-14,-34,9,5);ctx.fillRect(5,-34,9,5);ctx.fillStyle='#ef5265';ctx.fillRect(-14,31,8,4);ctx.fillRect(6,31,8,4);ctx.fillStyle='#ffffff88';ctx.fillRect(-3,-34,6,7);ctx.restore()}
function noise(n){let v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v)}
// Échantillonnage perspective : le haut de l'écran représente un terrain plus éloigné.
function distanceAtY(y){const k=Math.max(0,Math.min(1,(H-y)/H));return (Math.pow(k,1.38)*360)-Math.pow((H-460)/H,1.38)*360}
function scaleAtY(y){return .45+1.10*(y/H)}
function sx(wx,y){return W/2+(wx-rally.x)*scaleAtY(y)}
function polygon(a,b,c,d,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineTo(...c);ctx.lineTo(...d);ctx.closePath();ctx.fill()}
function drawTree(x,y,z=1){ctx.save();ctx.translate(x,y);ctx.scale(z,z);ctx.fillStyle='#0006';ctx.beginPath();ctx.ellipse(9,8,13,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#65452e';ctx.fillRect(-2,-10,5,19);ctx.fillStyle='#163b31';ctx.beginPath();ctx.arc(3,-13,15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#236046';ctx.beginPath();ctx.arc(-5,-18,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#397f58';ctx.beginPath();ctx.arc(0,-22,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#78aa74aa';ctx.beginPath();ctx.arc(-5,-25,4,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawRally(){const night=false;ctx.fillStyle='#365d48';ctx.fillRect(0,0,W,H);
// Prairie texturée : herbes et touffes réparties dans le monde, sans scintillement.
for(let i=0;i<450;i++){const n=i+Math.floor(rally.s/10)*7,wx=(noise(n*4.3)-.5)*1300,wy=(noise(n*8.7)*720+Math.floor(rally.s/11)*13)%720-60;
const x=sx(wx,wy),y=wy;if(x<0||x>W||y<0||y>H)continue;const z=scaleAtY(y);
ctx.strokeStyle=i%4===0?'#83a77975':'#173d3277';ctx.lineWidth=Math.max(.6,z*.85);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3*z,y-6*z);ctx.moveTo(x,y);ctx.lineTo(x+2*z,y-5*z);ctx.stroke();}

// Bandes de piste : chaque segment suit le tracé réel, avec élargissement vers le bas.
for(let y=-8;y<H+9;y+=8){let y2=y+9,sa=rally.s+distanceAtY(y),sb=rally.s+distanceAtY(y2);let ca=roadCenter(sa),cb=roadCenter(sb),wa=roadHalf(sa),wb=roadHalf(sb);let l1=sx(ca-wa,y),r1=sx(ca+wa,y),l2=sx(cb-wb,y2),r2=sx(cb+wb,y2);polygon([l1-14,y],[r1+14,y],[r2+14,y2],[l2-14,y2],'#a58b65');
polygon([l1-8,y],[r1+8,y],[r2+8,y2],[l2-8,y2],'#c5ac7b');
polygon([l1,y],[r1,y],[r2,y2],[l2,y2],Math.floor(sa/12)%2?'#8c7257':'#92765b');
const grooves=[-.38,.38];for(const k of grooves){const xa=sx(ca+wa*k,y),xb=sx(cb+wb*k,y2);ctx.strokeStyle='#4d41324d';ctx.lineWidth=8*scaleAtY(y);ctx.beginPath();ctx.moveTo(xa,y);ctx.lineTo(xb,y2);ctx.stroke();}
ctx.strokeStyle='#d9c19b99';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(l1+6,y);ctx.lineTo(l2+6,y2);ctx.moveTo(r1-6,y);ctx.lineTo(r2-6,y2);ctx.stroke();}
// Décor procédural reproductible, ancré dans la piste.
const low=Math.floor((rally.s-60)/27),high=Math.floor((rally.s+340)/27);for(let i=high;i>=low;i--){let s=i*27,dy=s-rally.s,y=460-(dy/360)*600;if(y< -30||y>H+35)continue;let offset=roadHalf(s)+25+noise(i*3)*55;for(let side of [-1,1]){let wx=roadCenter(s)+side*offset;let x=sx(wx,y),z=scaleAtY(y)*(.7+noise(i+side)*.3);if(x>-30&&x<W+30){if(noise(i*5+side)> .18)drawTree(x,y,z);else{ctx.fillStyle='#a0a091';ctx.beginPath();ctx.ellipse(x,y,7*z,4*z,0,0,7);ctx.fill()}}}}
// Poussière et cailloux sur la route.
for(let i=0;i<80;i++){let s=Math.floor(rally.s/9)*9+i*9-90,dy=s-rally.s,y=460-(dy/360)*600;if(y<0||y>600)continue;let wx=roadCenter(s)+(noise(i*19+Math.floor(s/9)*7)-.5)*roadHalf(s)*1.65,x=sx(wx,y);ctx.fillStyle=i%2?'#ae9576aa':'#3f3a35aa';ctx.fillRect(x,y,2*scaleAtY(y),2*scaleAtY(y))}
for(const o of obstacles){let dy=o.s-rally.s,y=460-(dy/360)*600;if(y<-30||y>H+30)continue;let x=sx(roadCenter(o.s)+o.offset,y),z=scaleAtY(y);ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(x+4*z,y+3*z,o.r*z,7*z,0,0,7);ctx.fill();ctx.fillStyle='#a9a59a';ctx.beginPath();ctx.ellipse(x,y,o.r*z,o.r*.7*z,0,0,7);ctx.fill();ctx.fillStyle='#ded3b9';ctx.beginPath();ctx.ellipse(x-4*z,y-4*z,4*z,3*z,0,0,7);ctx.fill()}
// Poussière dynamique derrière les roues.
for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/0.65)*.35;ctx.fillStyle='#e1c9a2';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()}ctx.globalAlpha=1;
if(rally.speed>90){ctx.strokeStyle='#e6e4d21c';ctx.lineWidth=2;for(let i=0;i<18;i++){const x=noise(i*8.1+Math.floor(rally.s/5))*W,y=noise(i*4.7+Math.floor(rally.s/7))*H;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+Math.min(42,rally.speed*.13));ctx.stroke();}}
car(W/2,460,Math.max(-.26,Math.min(.26,rally.vx*.012)),'#43b9f3',1.02);
const off=Math.abs(rally.x-roadCenter(rally.s))>roadHalf(rally.s)-13;if(off){ctx.fillStyle='#ffb46c';ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.fillText('HORS PISTE — RALENTISSEMENT',210,60)}
ctx.fillStyle='#080e24bd';rounded(13,12,394,34,10);ctx.fillStyle='#a8e7ff';ctx.font='bold 12px system-ui';ctx.textAlign='left';ctx.fillText('SPÉCIALE · FORÊT',25,33);ctx.textAlign='right';ctx.fillText(Math.round(rally.s)+' / '+rally.finish+' m',395,33);
// Mini-carte simplifiée du tracé, en haut à droite.
ctx.fillStyle='#0a1225bb';rounded(329,53,78,123,10);ctx.strokeStyle='#9a8df9';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<=24;i++){let s=i*rally.finish/24,x=368+roadCenter(s)*.19,y=163-i*4.05;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();ctx.fillStyle='#60e1ff';ctx.beginPath();ctx.arc(368+roadCenter(rally.s)*.19,163-rally.s/rally.finish*97.2,5,0,7);ctx.fill();}
function tickRally(dt){const steer=(keys.right?1:0)-(keys.left?1:0);const gas=keys.accelerate,brake=keys.brake;let off=Math.abs(rally.x-roadCenter(rally.s))>roadHalf(rally.s)-12;let max=off?85:205;
// Accélération progressive, mais forte : 0 à 100 en ~4 s et pointe ~200 km/h.
const power=gas?(rally.speed<65?31:rally.speed<130?24:16):0;
const resistance=gas?1.8:11;
rally.speed+=(power-resistance-(brake?66:0))*dt;
rally.speed=Math.max(0,Math.min(max,rally.speed));
rally.vx+=((steer*(11+rally.speed*.29))-rally.vx)*Math.min(1,dt*5.0);rally.x+=rally.vx*dt;rally.s+=rally.speed/3.6*dt;rally.time+=dt;rally.hitCooldown=Math.max(0,rally.hitCooldown-dt);for(const o of obstacles){if(rally.hitCooldown===0&&Math.abs(o.s-rally.s)<9&&Math.abs(rally.x-(roadCenter(o.s)+o.offset))<o.r+12){rally.speed*=.36;rally.hitCooldown=1.2;rally.shake=.3}}rally.shake=Math.max(0,rally.shake-dt);if(off&&rally.speed>18&&Math.random()<.5)particles.push({x:W/2+(Math.random()-.5)*30,y:495+Math.random()*20,r:3+Math.random()*8,life:.65});for(const p of particles){p.y+=dt*70;p.life-=dt}particles=particles.filter(p=>p.life>0).slice(-55);if(rally.s>=rally.finish){rally.s=rally.finish;finish()}}
// Drift Challenge V1 : inchangé dans son principe.
function drawDrift(){ctx.fillStyle='#1c1b3e';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#353460';ctx.lineWidth=1;for(let x=0;x<W;x+=35){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=35){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.strokeStyle='#a86effaa';ctx.lineWidth=8;ctx.strokeRect(24,24,W-48,H-48);for(const p of particles){ctx.globalAlpha=p.life/.65;ctx.fillStyle='#c5bcff';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()}ctx.globalAlpha=1;car(player.x,player.y,player.heading+Math.PI/2,'#60c4ff',.78)}
function tickDrift(dt){let steer=(keys.right?1:0)-(keys.left?1:0);player.heading+=steer*3.3*dt;let speed=150;player.x+=Math.cos(player.heading)*speed*dt;player.y+=Math.sin(player.heading)*speed*dt;if(steer){combo=Math.min(12,combo+dt*2.4);score+=dt*(1+combo)*51;for(let i=0;i<2;i++)particles.push({x:player.x-Math.cos(player.heading)*20+(Math.random()-.5)*12,y:player.y-Math.sin(player.heading)*20+(Math.random()-.5)*12,life:.65,r:2+Math.random()*4})}else combo=Math.max(0,combo-dt*3.9);for(const p of particles)p.life-=dt;particles=particles.filter(p=>p.life>0).slice(-170);best=Math.max(best,Math.floor(score));if(player.x<44||player.x>376||player.y<44||player.y>556)finish()}
function draw(){if(mode==='rally')drawRally();else if(mode==='drift')drawDrift()}
function loop(now){if(!running)return;let dt=Math.min((now-last)/1000,.035);last=now;frame+=dt;if(mode==='rally')tickRally(dt);else tickDrift(dt);draw();hud();if(running)raf=requestAnimationFrame(loop)}
document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.game)));
$('brand').addEventListener('click',e=>{e.preventDefault();back()});$('back').addEventListener('click',back);$('start').addEventListener('click',start);
function bindControl(id,key){let el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();keys[key]=true;try{el.setPointerCapture(e.pointerId)}catch{}});for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,e=>{keys[key]=false})}
for(const [id,key] of [['left','left'],['right','right'],['accelerate','accelerate'],['brake','brake']])bindControl(id,key);
const keyMap={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'accelerate',ArrowDown:'brake',a:'left',d:'right',w:'accelerate',s:'brake'};
window.addEventListener('keydown',e=>{const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(k){e.preventDefault();keys[k]=true}});
window.addEventListener('keyup',e=>{const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(k){e.preventDefault();keys[k]=false}});
window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
