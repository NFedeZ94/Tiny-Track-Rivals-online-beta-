/* TTR 14.24 — Fixed-step environment director. Host authoritative online;
   deterministic schedule in time trial; effects shared by humans and AI. */
(()=>{'use strict';
 const TRACKS=['colazione-turbo','box-di-biliardo','desk-drift','bagno-sprint','garage-grid'];
 const MODES=['race','career','elimination','trial','online'];
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=u=>{u=clamp(u,0,1);return u*u*(3-2*u);};
 const DRAG=1.15,SHOT=340,WARNING=1.8;
 const stations=[{x:1350,y:1100,n:12,color:'#a74ebc'},{x:1700,y:1120,n:13,color:'#df8351'}];
 const shotAngles=[Math.PI/2,Math.PI/2-.48,Math.PI/2+.52,Math.PI/2-.75,Math.PI/2+.75,Math.PI/2];
 const trackFor=id=>id==='desk-drift'?window.TTRDeskTrack:id==='bagno-sprint'?window.TTRBathTrack:id==='garage-grid'?window.TTRGarageTrack:window.TTRCore;
 const point=(T,p)=>T.point?T.point(p):T.trackPoint(p);
 const angle=(T,p)=>T.tangent(p);
 function offset(T,p,d){const q=point(T,p),a=angle(T,p);return{x:q.x-Math.sin(a)*d,y:q.y+Math.cos(a)*d,a};}
 function definitions(id){const T=trackFor(id);if(!T)return [];
   if(id==='colazione-turbo')return [{kind:'milk',duration:15,warning:2,x:690,y:1137,rx:142,ry:78,a:.07,sourceX:625,sourceY:960}];
   if(id==='bagno-sprint')return [{kind:'water',duration:8,warning:2.2,x:1840,y:1260,rx:88,ry:182,a:0,sourceX:1840,sourceY:795}];
   if(id==='desk-drift'){const defs=[];for(const p of [.12,.67,.82])defs.push({kind:'pencil',duration:6,warning:2,p,...offset(T,p,0),travel:155,len:128,r:15});for(const p of [.22,.53,.94])defs.push({kind:'ink',duration:17,warning:2,p,...offset(T,p,18),rx:108,ry:76});return defs;}
   if(id==='garage-grid')return [{kind:'tyre',duration:4.5,warning:2,...offset(T,.70,0),travel:170,len:0,r:36}];
   return [];
 }
 function create(r,props,random=Math.random){for(let i=props.length-1;i>=0;i--)if(props[i].eventBall)props.splice(i,1);
   if(!r||!TRACKS.includes(r.trackId)||!MODES.includes(r.mode))return null;
   const fixed=r.mode==='trial',box=r.trackId==='box-di-biliardo',defs=definitions(r.trackId);
   const balls=box?stations.map(q=>({...q,type:'box-ball',r:40,solid:true,movable:true,eventBall:true,homeX:q.x,homeY:q.y,vx:0,vy:0})):[];
   props.push(...balls);
   const order=box?(fixed||random()<.5?[0,1,0,1,0,1]:[1,0,1,0,1,0]):defs.map((_,i)=>i);
   return {track:r.trackId,fixed,random,elapsed:0,next:fixed?8:8+random()*5,index:0,order,defs,balls,lastDeskDef:-1,allBalls:props.filter(o=>o.movable&&o.type==='box-ball'),active:null,shots:0,skipped:0,impacts:0,pocketed:0,activations:0,contacts:0,soundAt:-10,log:[],serial:0,lastRemoteSerial:-1};
 }
 function log(s,kind,b){if(s.log.length<64)s.log.push({kind,t:+s.elapsed.toFixed(3),subject:b?.n??b?.kind??null,...(Number.isFinite(b?.p)?{phase:b.p,x:+b.x.toFixed(1),y:+b.y.toFixed(1)}:{}),...(b?.eventBall&&Number.isFinite(s.active?.angle)?{angle:+s.active.angle.toFixed(3)}:{})});s.serial++;}
 function audible(r,b){return r.player&&!r.player.boxTransit&&dist(r.player,b)<950;}
 function sound(s,r,b,SND,kind){if(s.elapsed-s.soundAt<.12||!audible(r,b))return;s.soundAt=s.elapsed;SND?.sfx(kind);}
 function clearShot(b,r,props,a){if(b.pocketed||Math.hypot(b.vx,b.vy)>3||b.x<240||b.x>2360||b.y<205||b.y>1395)return false;
   const cueDistance=q=>{const dx=q.x-b.x,dy=q.y-b.y,fx=Math.cos(a),fy=Math.sin(a),t=clamp(dx*fx+dy*fy,-215,-b.r);return Math.hypot(dx-fx*t,dy-fy*t);};
   return !r.cars.some(c=>!c.done&&!c.eliminated&&!c.boxTransit&&(dist(c,b)<100||cueDistance(c)<65))&&!props.some(o=>o!==b&&o.solid&&!o.pocketed&&(dist(o,b)<b.r+(o.r||0)+5||cueDistance(o)<(o.r||0)+12));
 }
 function step(s,r,props,dt,SND){if(!s||r.paused||r.finished||r.countdown>0)return;
   s.elapsed+=dt;
   if(s.track==='box-di-biliardo'){
     if(s.active){const a=s.active,b=a.ball;if(!clearShot(b,r,props,a.angle)){s.skipped++;log(s,'cancelled',b);s.active=null;s.index++;s.next=s.elapsed+3;return;}
       if(s.elapsed-a.at>=WARNING){b.vx=Math.cos(a.angle)*SHOT;b.vy=Math.sin(a.angle)*SHOT;s.shots++;s.activations++;log(s,'shot',b);sound(s,r,b,SND,'boxBall');s.active=null;s.index++;s.next=s.elapsed+(s.fixed?9:7+s.random()*4);}return;}
     if(s.elapsed<s.next||s.shots>=6)return;const preferred=s.balls[s.order[s.index%s.order.length]],angle=shotAngles[s.index%shotAngles.length];const b=[preferred,...s.balls.filter(o=>o!==preferred)].find(o=>clearShot(o,r,props,angle));
     if(!b){s.skipped++;log(s,'skipped',preferred);s.index++;s.next=s.elapsed+3;return;}
     s.active={ball:b,at:s.elapsed,angle};log(s,'warning',b);sound(s,r,b,SND,'boxWood');return;
   }
   if(s.active){const a=s.active,d=a.def,age=s.elapsed-a.at;if(!a.started&&age>=d.warning){a.started=true;s.activations++;log(s,'active',d);sound(s,r,d,SND,({milk:'milkFlow',water:'waterFlow',ink:'inkFlow',pencil:'rolling',tyre:'rolling'})[d.kind]);}
     if(a.started&&d.kind==='water'&&s.elapsed-(a.lastFlowSound??a.at)>1.2){a.lastFlowSound=s.elapsed;sound(s,r,d,SND,'waterFlow');}
     if(age>=d.warning+d.duration){log(s,'ended',d);s.active=null;s.index++;s.next=s.elapsed+(s.fixed||s.track==='bagno-sprint'||s.track==='garage-grid'?8:s.track==='desk-drift'?3+s.random()*3:6+s.random()*5);}
     return;
   }
   if(!s.defs.length||s.elapsed<s.next)return;let d=s.defs[s.order[s.index%s.order.length]];
   if(s.track==='desk-drift'){const kind=s.index%2?'ink':'pencil',choices=s.defs.filter(q=>q.kind===kind);if(s.fixed)d=choices[Math.floor(s.index/2)%choices.length];else{const T=trackFor(s.track);let best=null,score=Infinity;for(const q of choices){const qi=s.defs.indexOf(q);for(const c of r.cars){if(c.done||c.eliminated||c.onBridge||c.jump>0||c.speed<65)continue;const p=c.routeStableP??c.p;if(!Number.isFinite(p))continue;const eta=((q.p-p+1)%1)*T.length/Math.max(80,c.speed);if(eta<q.warning+1||eta>q.warning+6)continue;const rank=Math.abs(eta-(q.warning+q.duration*.40))+(qi===s.lastDeskDef?2:0);if(rank<score){score=rank;best=q;}}}if(!best&&s.elapsed<s.next+3)return;d=best||choices[Math.floor(s.index/2)%choices.length];}s.lastDeskDef=s.defs.indexOf(d);}
   s.active={def:d,at:s.elapsed,started:false};log(s,'warning',d);sound(s,r,d,SND,'environmentWarning');
 }
 function impact(s,r,o,SND){if(!s||!o.eventBall||o.pocketed)return;s.impacts++;sound(s,r,o,SND,'boxBall');}
 function capture(s,r,o,p,SND){if(!s||!o.movable||o.pocketed||p.role!=='hazard')return false;
   const dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy);if(d>(p.rimR||p.r)+o.r+1||o.vx*dx+o.vy*dy<=0||Math.hypot(o.vx,o.vy)<12)return false;
   o.pocketed=true;o.fallFromX=o.x;o.fallFromY=o.y;o.fallAt=s.elapsed;o.fallX=p.x;o.fallY=p.y;o.vx=o.vy=0;o.solid=false;s.pocketed++;log(s,'pocket',o);sound(s,r,p,SND,'boxPocket');return true;
 }
 function zone(s,future=0){const a=s?.active;if(!a?.def)return null;const d=a.def,t=s.elapsed+future-a.at-d.warning;if(t<0||t>=d.duration)return null;
   const level=Math.min(smooth(t/.85),smooth((d.duration-t)/(d.kind==='milk'?3:d.kind==='ink'?2.5:.9)));
   if(d.kind==='pencil'||d.kind==='tyre'){const u=smooth(t/d.duration),shift=(2*u-1)*d.travel;return {...d,x:d.x-Math.sin(d.a)*shift,y:d.y+Math.cos(d.a)*shift,a:d.a,level:1,roll:t};}
   return {...d,level,rx:d.rx*level,ry:d.ry*level};
 }
 function distanceTo(z,c){if(z.kind==='pencil'){const dx=c.x-z.x,dy=c.y-z.y,x=dx*Math.cos(z.a)+dy*Math.sin(z.a),y=-dx*Math.sin(z.a)+dy*Math.cos(z.a);return Math.hypot(Math.max(0,Math.abs(x)-z.len*.5),y)-z.r;}
   if(z.kind==='tyre')return dist(z,c)-z.r;
   const dx=c.x-z.x,dy=c.y-z.y,x=dx*Math.cos(z.a)+dy*Math.sin(z.a),y=-dx*Math.sin(z.a)+dy*Math.cos(z.a);return (Math.hypot(x/Math.max(1,z.rx),y/Math.max(1,z.ry))-1)*Math.min(z.rx,z.ry);
 }
 function affected(c,z){if(!z||z.level<.12||c.done||c.eliminated||c.boxTransit>0||c.jump>0||c.tableFalling>0)return false;if(c.onBridge&&z.kind!=='water')return false;return distanceTo(z,c)<(c.width||36)*.36;}
 function effect(s,r,c,dt,SND){const z=zone(s);if(!affected(c,z)){c.environmentContact=null;return;}
   if(c.environmentContact!==z.kind){c.environmentContact=z.kind;s.contacts++;c.environmentContacts=(c.environmentContacts||0)+1;if(c===r.player)SND?.sfx(z.kind==='water'?'waterFlow':z.kind==='pencil'||z.kind==='tyre'?'impact':z.kind==='milk'?'milkFlow':'inkFlow');}
   const drag=z.kind==='water'?.72:z.kind==='milk'?.65:z.kind==='ink'?1.55:2.7;c.speed*=Math.exp(-dt*drag*z.level);
   if(z.kind==='water'){const pool=window.TTRBathTrack.pool,dx=pool.x-c.x,dy=pool.y-c.y,d=Math.hypot(dx,dy)||1;const pull=72*z.level;c.x+=dx/d*pull*dt;c.y+=dy/d*pull*dt;}
   else if(z.kind==='pencil'||z.kind==='tyre'){const dx=c.x-z.x,dy=c.y-z.y,d=Math.hypot(dx,dy)||1;c.x+=dx/d*45*dt;c.y+=dy/d*45*dt;}
 }
 function planSurface(c,r,ctl,tangent,valid){const s=r.environmentEvents;if(!s?.active?.def||c.jump>0||c.boxTransit>0||c.reverseRecovery>0)return ctl;
   const hard=(r.aiFactor||1)>=1.1,horizon=hard?.85:(r.aiFactor||1)>=.95?.65:.40,speed=Math.max(80,Math.abs(c.speed||0));
   const fx=Math.cos(c.a),fy=Math.sin(c.a),a=tangent,dx=Math.cos(a),dy=Math.sin(a);let danger=false;
   for(let i=1;i<=4;i++){const t=horizon*i/4,z=zone(s,t);if(z&&distanceTo(z,{x:c.x+fx*speed*t,y:c.y+fy*speed*t})<(c.width||36)*.5+7){danger=true;break;}}
   if(!danger)return ctl;
   let best=null,bestScore=-Infinity;const reach=Math.max(90,speed*horizon);
   if(!c.onBridge)for(const offset of [-55,55,-85,85]){const q={x:c.x+dx*reach-dy*offset,y:c.y+dy*reach+dx*offset};if(!valid(q)||!valid({x:(c.x+q.x)/2,y:(c.y+q.y)/2}))continue;let score=Infinity;for(let i=1;i<=4;i++){const u=i/4,z=zone(s,u*horizon);if(z)score=Math.min(score,distanceTo(z,{x:c.x+(q.x-c.x)*u,y:c.y+(q.y-c.y)*u}));}if(score>bestScore){best=q;bestScore=score;}}
   if(best&&bestScore>(c.width||36)*.5+5){const d=Math.atan2(best.y-c.y,best.x-c.x)-c.a,turn=Math.atan2(Math.sin(d),Math.cos(d));return {...ctl,steer:clamp(turn*(hard?3.5:2.7),-1,1)};}
   const z=zone(s);if(z?.kind==='water'&&affected(c,z))return ctl; // don't stop in the current
   return {...ctl,gas:c.speed<100,brake:c.speed>140};
 }
 function draw(g,s){if(!s)return;
   if(s.track==='box-di-biliardo'){
     for(const b of s.allBalls)if(b.pocketed&&s.elapsed-b.fallAt<.45){const u=clamp((s.elapsed-b.fallAt)/.45,0,1);g.save();g.globalAlpha=1-u;g.fillStyle=b.color;g.beginPath();g.arc((b.fallFromX??b.x)*(1-u)+b.fallX*u,(b.fallFromY??b.y)*(1-u)+b.fallY*u,b.r*(1-u),0,Math.PI*2);g.fill();g.restore();}
     if(!s.active?.ball)return;const {ball:b,at}=s.active,u=clamp((s.elapsed-at)/WARNING,0,1);g.save();g.translate(b.x,b.y);g.rotate((s.active.angle??Math.PI/2)-Math.PI/2);g.translate(-b.x,-b.y);const pull=u<.75?18+30*u/.75:48*(1-(u-.75)/.25),y=b.y-b.r-3-pull;g.lineCap='round';for(const [x,dy,w,col] of [[b.x+3,4,15,'#201b15aa'],[b.x,0,10,'#b77d42'],[b.x-2,-3,4,'#f5d39c']]){g.strokeStyle=col;g.lineWidth=w;g.beginPath();g.moveTo(x,y-120+dy);g.lineTo(x,y+dy);g.stroke();}g.strokeStyle='#61b1c3';g.lineWidth=8;g.beginPath();g.moveTo(b.x,y-4);g.lineTo(b.x,y);g.stroke();g.globalAlpha=.40+.28*Math.sin(u*Math.PI*6);g.strokeStyle='#ffdf78';g.lineWidth=3;g.beginPath();g.arc(b.x,b.y,b.r+8,0,Math.PI*2);g.stroke();g.restore();return;
   }
   const a=s.active;if(!a?.def)return;const d=a.def,z=zone(s),age=s.elapsed-a.at;
   g.save();if(!z){g.strokeStyle='#ffdf78';g.lineWidth=4;g.globalAlpha=.35+.28*Math.sin(age*12);g.beginPath();if(d.kind==='pencil'||d.kind==='tyre'){const q={x:d.x+Math.sin(d.a)*d.travel,y:d.y-Math.cos(d.a)*d.travel};g.arc(q.x,q.y,(d.len||0)*.5+d.r+9,0,Math.PI*2);}else g.ellipse(d.x,d.y,d.rx,d.ry,d.a,0,Math.PI*2);g.stroke();g.restore();return;}
   if(z.kind==='pencil'||z.kind==='tyre'){g.translate(z.x,z.y);g.rotate(z.a);g.fillStyle='#17212366';g.beginPath();g.ellipse(4,7,(z.len||0)*.5+z.r,z.r,0,0,Math.PI*2);g.fill();if(z.kind==='tyre'){g.fillStyle='#252932';g.beginPath();g.arc(0,0,z.r,0,Math.PI*2);g.fill();g.strokeStyle='#555e69';g.lineWidth=6;g.stroke();g.fillStyle='#b4c1cb';g.beginPath();g.arc(0,0,17,0,Math.PI*2);g.fill();g.strokeStyle='#6c7783';g.lineWidth=3;for(let i=0;i<5;i++){g.beginPath();g.moveTo(0,0);g.lineTo(17*Math.cos(z.roll*6+i*1.257),17*Math.sin(z.roll*6+i*1.257));g.stroke();}}else{g.fillStyle='#473528';g.fillRect(-z.len*.5-2,-z.r-2,z.len+4,z.r*2+4);g.fillStyle='#f6be43';g.fillRect(-z.len*.5,-z.r,z.len,z.r*2);g.fillStyle='#ffe38c';g.fillRect(-z.len*.5,-z.r+3+(Math.sin(z.roll*9)+1)*5,z.len,5);g.fillStyle='#e58c81';g.fillRect(-z.len*.5-12,-z.r,16,z.r*2);g.beginPath();g.moveTo(z.len*.5,-z.r);g.lineTo(z.len*.5+17,0);g.lineTo(z.len*.5,z.r);g.closePath();g.fillStyle='#d2b48c';g.fill();g.fillStyle='#35343b';g.fillRect(z.len*.5+13,-2,6,4);}g.restore();return;}
   if(z.kind==='water'||z.kind==='milk'){g.strokeStyle=z.kind==='water'?'#86d8f1aa':'#fff4d9bb';g.lineWidth=(z.kind==='water'?20:14)*z.level;g.lineCap='round';g.beginPath();g.moveTo(z.sourceX,z.sourceY);g.quadraticCurveTo(z.sourceX+15,(z.sourceY+z.y)/2,z.x,z.y);g.stroke();}
   g.translate(z.x,z.y);g.rotate(z.a);g.fillStyle=z.kind==='milk'?'#f7f4e3d9':z.kind==='ink'?'#243a91ed':'#60c8ed8f';g.strokeStyle=z.kind==='ink'?'#698eeca0':'#e5fdffb0';g.lineWidth=2;g.beginPath();for(let i=0;i<24;i++){const a=i*Math.PI/12,k=1+.06*Math.sin(i*2.9);const x=Math.cos(a)*z.rx*k,y=Math.sin(a)*z.ry*k;i?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.fill();g.stroke();
   if(z.kind==='ink'){g.fillStyle='#97b5ff99';g.beginPath();g.ellipse(-z.rx*.25,-z.ry*.35,z.rx*.40,z.ry*.09,-.22,0,Math.PI*2);g.fill();g.fillStyle='#243a91df';for(const [x,y,r] of [[.91,.32,.09],[-.75,-.54,.07],[.35,.82,.05]]){g.beginPath();g.ellipse(x*z.rx,y*z.ry,r*z.rx,r*z.ry,0,0,Math.PI*2);g.fill();}}
   if(z.kind==='water'){g.strokeStyle='#d5f7ffb0';g.lineWidth=3;for(let i=0;i<5;i++){const t=(s.elapsed*.9+i*.21)%1;g.beginPath();g.moveTo((i-2)*z.rx*.32,-z.ry+2*z.ry*t);g.lineTo((i-2)*z.rx*.32,-z.ry+2*z.ry*t+14);g.stroke();}}
   g.restore();
 }
 function snapshot(s){return s?{shots:s.shots,skipped:s.skipped,impacts:s.impacts,pocketed:s.pocketed,activations:s.activations,contacts:s.contacts,events:s.log.slice()}:null;}
 function net(s,props){if(!s)return null;return {e:+s.elapsed.toFixed(3),i:s.index,n:s.serial,a:s.active?{at:s.active.at,b:s.active.ball?.n??null,d:s.active.def?s.defs.indexOf(s.active.def):-1,angle:s.active.ball?s.active.angle:null,started:!!s.active.started}:null,c:[s.shots,s.skipped,s.impacts,s.pocketed,s.activations,s.contacts],m:props.map((o,i)=>[o,i]).filter(([o])=>o.movable&&o.type!=='box-ball').map(([o,i])=>[i,+o.x.toFixed(1),+o.y.toFixed(1),+(o.a||0).toFixed(4)]),b:props.filter(o=>o.movable&&o.type==='box-ball').map(o=>[o.n,+o.x.toFixed(1),+o.y.toFixed(1),+o.vx.toFixed(1),+o.vy.toFixed(1),!!o.pocketed,o.fallAt||0,o.fallX||0,o.fallY||0])};}
 function applyNet(s,packet,props,r,SND){if(!s||!packet||!Number.isFinite(packet.e)||packet.e<0||packet.e<s.elapsed-.3)return false;s.elapsed=packet.e;s.index=packet.i|0;const prev=s.active,a=packet.a;const ball=a?s.balls.find(b=>b.n===a.b):null,def=a?s.defs[a.d]:null;s.active=a&&Number.isFinite(a.at)&&(ball||def)?{at:a.at,ball,def,angle:Number.isFinite(a.angle)?a.angle:Math.PI/2,started:!!a.started}:null;
   if(Array.isArray(packet.b))for(const row of packet.b){if(!Array.isArray(row)||row.length!==9||!row.every((v,i)=>i===5?typeof v==='boolean':Number.isFinite(v)))continue;const o=props.find(o=>o.type==='box-ball'&&o.movable&&o.n===row[0]);if(!o)continue;Object.assign(o,{x:row[1],y:row[2],vx:row[3],vy:row[4],pocketed:!!row[5],solid:!row[5],fallAt:row[6],fallX:row[7],fallY:row[8]});}
   if(Array.isArray(packet.m))for(const row of packet.m){if(!Array.isArray(row)||row.length!==4||!row.every(Number.isFinite))continue;const o=props[row[0]];if(o?.movable&&o.type!=='box-ball')Object.assign(o,{x:row[1],y:row[2],a:row[3]});}
   if(Array.isArray(packet.c)&&packet.c.length===6&&packet.c.every(Number.isFinite)){[s.shots,s.skipped,s.impacts,s.pocketed,s.activations,s.contacts]=packet.c;}
   if(packet.n!==s.lastRemoteSerial){const d=s.active?.def,b=s.active?.ball;if(d&&s.active.started&&(!prev?.started||prev.at!==s.active.at))sound(s,r,d,SND,({milk:'milkFlow',water:'waterFlow',ink:'inkFlow',pencil:'rolling',tyre:'rolling'})[d.kind]);else if((d||b)&&(!prev||prev.at!==a.at))sound(s,r,d||b,SND,'environmentWarning');else if(prev?.ball&&!s.active)sound(s,r,prev.ball,SND,'boxBall');s.lastRemoteSerial=packet.n;}
   return true;
 }
 function plan(c,r,s,target,tangent,valid){const state=r.environmentEvents;if(!state)return {target,slow:false};const speed=Math.max(80,Math.abs(c.speed||0)),balls=state.balls.filter(o=>!o.pocketed&&dist(c,o)<300&&Math.hypot(o.vx,o.vy)>12);if(!balls.length)return {target,slow:false};const horizon=s.pace>=.999?.85:s.pace>=.9?.65:.45,fx=Math.cos(tangent),fy=Math.sin(tangent),nx=-fy,ny=fx;
   function clearance(q){let best=Infinity;const reach=dist(c,q);for(const b of balls)for(let i=1;i<=6;i++){const t=horizon*i/6,d=speed*t,u=Math.min(1,d/Math.max(1,reach)),extra=Math.max(0,d-reach),k=(1-Math.exp(-DRAG*t))/DRAG;const x=c.x+(q.x-c.x)*u+fx*extra,y=c.y+(q.y-c.y)*u+fy*extra;best=Math.min(best,Math.hypot(x-b.x-b.vx*k,y-b.y-b.vy*k)-b.r-(c.width||36)*.5-6);}return best;}
   if(clearance(target)>=0)return {target,slow:false};let best=null,bestClear=0;for(const offset of [-42,42,-62,62]){const q={x:target.x+nx*offset,y:target.y+ny*offset};if(!valid(q))continue;const score=clearance(q);if(score>bestClear){best=q;bestClear=score;}}return best?{target:best,slow:false}:{target,slow:true};
 }
 function branchHazard(s,T,speed){if(!s?.active||s.active.def?.kind!=='water')return false;for(const t of [.25,.42,.55,.68]){const z=zone(s,T.shortcutLength*t/Math.max(120,speed));if(z&&distanceTo(z,T.shortcutPoint(t))<25)return true;}return false;}
 window.TTREnvironmentEvents=Object.freeze({branchHazard,TRACKS,create,step,draw,effect,zone,planSurface,impact,capture,snapshot,net,applyNet,plan,DRAG});
})();
