'use strict';
(()=>{
 const $=id=>document.getElementById(id),CANVAS=$('game'),CTX=CANVAS.getContext('2d');
 const WS_URL=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws-beta';
 $('serverUrl').textContent=location.host;
 const ui={overlay:$('overlay'),status:$('status'),roomCode:$('roomCode'),members:$('members'),start:$('start'),ready:$('ready'),leave:$('leave')};
 const input={left:false,right:false,brake:false},colors=['#f04446','#2c79e6','#e8ae29','#67da42','#fb882e'];
 let socket=null,session=null,frames=[],seq=0,lastInput=0,lastControl='',lastPing=0,pings=new Map(),rtt=null,
  jitter=null,lastPacket=0,snapshotHz=0,serverTime=0,track=null,lastState=null,finish=false,
  fps=0,lastFps=performance.now(),frameCount=0,ackDelta=0,startedAt=0;
 const setStatus=s=>ui.status.textContent=s;
 const safeSend=d=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(d));};
 const connected=()=>session&&socket?.readyState===WebSocket.OPEN;
 const updateLobby=()=>{
  ui.members.replaceChildren();ui.roomCode.textContent=session?.code?`SALA ${session.code}`:'';
  ui.ready.disabled=!connected()||session.started;
  ui.leave.disabled=!connected();
  const members=session?.members||[];
  ui.start.disabled=!session?.host||members.length<2||members.some(m=>!m.ready)||session.started;
  for(const m of members){const span=document.createElement('span');span.className=m.ready?'ready':'';
   span.textContent=`${m.slot+1}. ${m.name}${m.host?' ★':''} · ${['Scatto GT','Tuono V8','Polvere X','Lampo ZX','Aero R'][m.car]} ${m.ready?'✓':''}`;ui.members.appendChild(span);}
  ui.ready.textContent=session?.members.find(m=>m.slot===session.slot)?.ready?'Annulla pronto':'Sono pronto';
 };
 async function connect(action){
  if(socket&&socket.readyState<2)return setStatus('Sei già collegato a una stanza.');
  const name=$('name').value.trim()||'Pilota',car=Number($('car').value),capacity=Number($('capacity').value);
  const code=$('joinCode').value.trim().toUpperCase();
  if(action==='join'&&!/^[A-Z0-9]{6}$/.test(code))return setStatus('Inserisci un codice di sei caratteri.');
  setStatus('Apertura WebSocket...');
  const s=new WebSocket(WS_URL);socket=s;frames=[];session=null;finish=false;
  s.addEventListener('open',()=>{setStatus('Collegato: accesso alla sala...');safeSend({type:action,name,car,capacity,code});});
  s.addEventListener('message',event=>{let msg;try{msg=JSON.parse(event.data);}catch(_){return;}onMessage(msg);});
  s.addEventListener('close',event=>{if(s!==socket)return;socket=null;session=null;frames=[];updateLobby();
   if(!finish){ui.overlay.style.display='flex';$('hud').style.display='none';$('controls').style.display='none';$('stats').style.display='none';}
   setStatus('Connessione chiusa · codice '+event.code);});
  s.addEventListener('error',()=>setStatus('WebSocket non disponibile: verifica il deploy del server.'));
 }
 function onMessage(d){
  if(d.type==='hello'){setStatus(`Server ${d.build} · fisica ${d.tickHz} Hz`);return;}
  if(d.type==='error'){setStatus(d.message||'Errore server');return;}
  if(d.type==='joined'){session={slot:d.slot,code:d.code,host:d.host,members:[],started:false};setStatus('Stanza creata. Attendi gli altri piloti.');updateLobby();return;}
  if(d.type==='room_state'&&session){session.members=d.members;session.started=d.started;session.host=d.members.find(m=>m.slot===session.slot)?.host||false;updateLobby();return;}
  if(d.type==='pong'&&pings.has(d.seq)){const elapsed=performance.now()-pings.get(d.seq);pings.delete(d.seq);rtt=rtt===null?elapsed:.7*rtt+.3*elapsed;return;}
  if(d.type==='race_start'&&session){session.started=true;startedAt=performance.now();seq=0;frames=[];lastState=null;finish=false;
   $('summary').style.display='none';ui.overlay.style.display='none';$('hud').style.display='flex';$('controls').style.display='flex';$('stats').style.display='block';return;}
  if(d.type==='state'&&session?.started){const now=performance.now();if(lastPacket){const diff=now-lastPacket;const dev=Math.abs(diff-50);jitter=jitter===null?dev:.85*jitter+.15*dev;snapshotHz=snapshotHz===0?1000/diff:.9*snapshotHz+.1*(1000/diff);}lastPacket=now;
   serverTime=d.serverTime;lastState=d;frames.push({receivedAt:now,state:d});if(frames.length>9)frames.shift();
   const mine=d.cars.find(c=>c.id===session.slot);if(mine)ackDelta=Math.max(0,seq-mine.ack);
   if(d.finished&&d.results)showResults(d.results);return;}
  if(d.type==='player_left'&&session){setStatus('Un pilota si è disconnesso; la CPU continua la gara.');return;}
  if(d.type==='finish'){showResults(d.results);return;}
  if(d.type==='room_closed'){setStatus(d.reason||'Sala chiusa');return;}
 }
 function showResults(results){if(finish)return;finish=true;const list=$('finalResults');list.replaceChildren();
  for(const r of results||[]){const li=document.createElement('li');li.textContent=`P${r.slot+1} · ${r.done?r.finishTime.toFixed(1)+'s':r.laps+' giri'} · ${r.penalties} recuperi`;list.appendChild(li);}
  $('summary').style.display='block';}
 $('create').onclick=()=>connect('create');$('join').onclick=()=>connect('join');$('public').onclick=()=>connect('find_public');
 ui.ready.onclick=()=>{const me=session?.members.find(m=>m.slot===session.slot);safeSend({type:'ready',ready:!me?.ready});};
 ui.start.onclick=()=>safeSend({type:'start'});ui.leave.onclick=()=>{safeSend({type:'leave'});socket?.close();session=null;updateLobby();};
 $('back').onclick=()=>{socket?.close();session=null;frames=[];finish=false;$('summary').style.display='none';ui.overlay.style.display='flex';
  $('hud').style.display='none';$('controls').style.display='none';$('stats').style.display='none';updateLobby();};
 function hold(btn,key){let ptr=null;
  btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);ptr=e.pointerId;input[key]=true;btn.classList.add('held');sendInput(true);});
  const release=e=>{if(ptr!==null&&e.pointerId!==ptr)return;ptr=null;input[key]=false;btn.classList.remove('held');sendInput(true);};
  btn.addEventListener('pointerup',release);btn.addEventListener('pointercancel',release);btn.addEventListener('lostpointercapture',release);
 }
 hold($('left'),'left');hold($('right'),'right');hold($('brakeButton'),'brake');
 $('itemButton').addEventListener('pointerdown',e=>{e.preventDefault();safeSend({type:'action',action:'item'});});
 const keys={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowDown:'brake',KeyS:'brake'};
 window.addEventListener('keydown',e=>{if(e.code==='Space'){if(!e.repeat)safeSend({type:'action',action:'item'});e.preventDefault();return;}
  if(keys[e.code]){input[keys[e.code]]=true;sendInput(true);e.preventDefault();}});
 window.addEventListener('keyup',e=>{if(keys[e.code]){input[keys[e.code]]=false;sendInput(true);}});
 window.addEventListener('blur',()=>{input.left=input.right=input.brake=false;sendInput(true);});
 function sendInput(force=false){if(!session?.started||finish||socket?.readyState!==1)return;
  const now=performance.now(),steer=Number(input.right)-Number(input.left);
  const signature=steer+'|'+Number(input.brake);
  if(!force&&now-lastInput<40)return;
  if(!force&&signature===lastControl&&now-lastInput<120)return;
  safeSend({type:'input',seq:++seq,steer,gas:true,brake:input.brake});lastControl=signature;lastInput=now;
 }
 function resize(){const dpr=Math.min(2,devicePixelRatio||1),w=innerWidth,h=innerHeight;
  CANVAS.width=Math.round(w*dpr);CANVAS.height=Math.round(h*dpr);CTX.setTransform(dpr,0,0,dpr,0,0);}
 addEventListener('resize',resize);resize();
 function mix(a,b,t){return a+(b-a)*t;}
 function displayCars(now){if(!frames.length)return[];
  const drawTime=now-105;let a=frames[0],b=frames[frames.length-1];
  for(let i=0;i<frames.length-1;i++)if(frames[i].receivedAt<=drawTime&&frames[i+1].receivedAt>=drawTime){a=frames[i];b=frames[i+1];break;}
  if(drawTime<frames[0].receivedAt){a=frames[0];b=a;}
  if(drawTime>frames[frames.length-1].receivedAt){a=b;}
  const f=a===b?1:Math.max(0,Math.min(1,(drawTime-a.receivedAt)/(b.receivedAt-a.receivedAt)));
  const result=b.state.cars.map(v=>{const prev=a.state.cars.find(c=>c.id===v.id)||v;
    let delta=Math.atan2(Math.sin(v.a-prev.a),Math.cos(v.a-prev.a));
    return {...v,x:mix(prev.x,v.x,f),y:mix(prev.y,v.y,f),a:prev.a+delta*f};
  });
  // Cosmetic local anticipation (not trusted gameplay physics); server remains final authority.
  const own=result.find(c=>c.id===session?.slot);
  if(own){const extra=Math.min(0.09,Math.max(0,(now-b.receivedAt)/1000));
   const base=lastState.cars.find(c=>c.id===session.slot);
   if(base){const p=(track?.profiles||[])[own.car],speed=Math.max(-110,Math.min(p?.max||260,base.s));
     const turn=(p?.turn||2.5)*(.24+Math.min(Math.abs(speed)/160,1)*.76);
     const theta=base.a+(Number(input.right)-Number(input.left))*turn*extra;
     const px=base.x+Math.cos(theta)*speed*extra,py=base.y+Math.sin(theta)*speed*extra;
     own.x=mix(own.x,px,.6);own.y=mix(own.y,py,.6);own.a=base.a+Math.atan2(Math.sin(theta-base.a),Math.cos(theta-base.a))*.6;
   }}
  return result;
 }
 function drawTrack(ctx){if(!track)return;
  const pts=track.centerline;if(!pts?.length)return;
  ctx.save();ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();
  ctx.strokeStyle='#855133';ctx.lineWidth=275;ctx.lineJoin='round';ctx.stroke();
  ctx.strokeStyle='#e9b36a';ctx.lineWidth=263;ctx.setLineDash([5,11]);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#f6e1b6';ctx.lineWidth=245;ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=5;ctx.stroke();
  // Start-finish plane and pickup tokens.
  const start=pts[0],d=pts[1],a=Math.atan2(d.y-start.y,d.x-start.x);ctx.save();ctx.translate(start.x,start.y);ctx.rotate(a);
  for(let i=-5;i<5;i++){ctx.fillStyle=i%2?'#1a1c22':'#fff';ctx.fillRect(-8,i*20,16,20);}ctx.restore();
  for(const p of track.pickups||[]){ctx.beginPath();ctx.arc(p.x,p.y,18,0,Math.PI*2);ctx.fillStyle='#40d4e7';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#fff';ctx.stroke();
    ctx.font='bold 26px system-ui';ctx.textAlign='center';ctx.fillStyle='#073e68';ctx.fillText('?',p.x,p.y+9);}
  ctx.restore();
 }
 function drawCar(ctx,c,isOwn){ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.a);ctx.globalAlpha=c.done?.48:1;
  ctx.fillStyle='#1a1720aa';ctx.beginPath();ctx.ellipse(4,4,38,23,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#0a1020';ctx.fillRect(-24,-24,17,7);ctx.fillRect(14,-24,17,7);ctx.fillRect(-24,17,17,7);ctx.fillRect(14,17,17,7);
  ctx.fillStyle=colors[c.car]||'#f06';ctx.strokeStyle=isOwn?'#fff':'#1c2d40';ctx.lineWidth=isOwn?4:2;
  const p=new Path2D();p.moveTo(32,-13);p.lineTo(18,-20);p.lineTo(-29,-19);p.lineTo(-34,-11);p.lineTo(-34,11);p.lineTo(-29,19);p.lineTo(18,20);p.lineTo(32,13);p.closePath();ctx.fill(p);ctx.stroke(p);
  ctx.fillStyle='#1c2b37';ctx.fillRect(-2,-14,19,28);ctx.fillStyle='#a0dbd7';ctx.fillRect(3,-11,10,22);ctx.fillStyle='#ffefb7';ctx.fillRect(28,-12,3,8);ctx.fillRect(28,4,3,8);
  if(c.boost>0){ctx.fillStyle='#ffc257';ctx.beginPath();ctx.moveTo(-36,-7);ctx.lineTo(-57,0);ctx.lineTo(-36,7);ctx.fill();}
  ctx.restore();ctx.save();ctx.font='bold 24px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#121b39';ctx.fillStyle='#fff';
  const caption=(isOwn?'TU':'P'+(c.id+1))+(c.cpu?' ·CPU':'');ctx.strokeText(caption,c.x,c.y-35);ctx.fillText(caption,c.x,c.y-35);ctx.restore();
 }
 function draw(now){requestAnimationFrame(draw);
  const w=innerWidth,h=innerHeight;CTX.clearRect(0,0,w,h);CTX.fillStyle='#c69386';CTX.fillRect(0,0,w,h);
  const cars=displayCars(now),mine=cars.find(c=>c.id===session?.slot);
  if(track){CTX.save();const scale=Math.min(w/1170,h/760)*1.11;
    CTX.translate(w*.5,h*.52);CTX.scale(scale,scale);CTX.translate(-(mine?.x??1100),-(mine?.y??720));
    // Tablecloth checks are intentionally simplified for authoritative network testing.
    CTX.fillStyle='#b46d6b';CTX.fillRect(0,0,track.width,track.height);
    for(let y=0;y<track.height;y+=110)for(let x=0;x<track.width;x+=110)if(((x/110+y/110)&1)===0){CTX.fillStyle='#d59a91';CTX.fillRect(x,y,110,110);}
    drawTrack(CTX);
    for(const oil of lastState?.oils||[]){CTX.beginPath();CTX.fillStyle='#30323bba';CTX.arc(oil.x,oil.y,oil.r,0,Math.PI*2);CTX.fill();}
    for(const c of cars)drawCar(CTX,c,c.id===session?.slot);
    CTX.restore();}
  if(mine&&lastState){const rank=cars.slice().sort((a,b)=>(b.lap+b.p)-(a.lap+a.p)).findIndex(x=>x.id===mine.id)+1;
    $('pos').textContent=`POS ${rank}/${cars.length}`;
    $('onlineHud').textContent=`ONLINE · ${session.code} · RTT ${rtt===null?'—':Math.round(rtt)} ms`;
    $('lap').textContent=`GIRO ${Math.min(3,mine.lap+1)}/3`;
    $('time').textContent=`${lastState.countdown>0?'PARTENZA '+Math.ceil(lastState.countdown):'TEMPO '+Math.floor(serverTime/60)+':'+String(Math.floor(serverTime%60)).padStart(2,'0')}`;
    $('pinghud').textContent=mine.item?`⚡ ${mine.item}`:'30 Hz';
  }
  if(now-lastFps>=1000){fps=Math.round(frameCount*1000/(now-lastFps));lastFps=now;frameCount=0;
    $('stats').innerHTML=`FPS ${fps} · JITTER ${jitter===null?'—':jitter.toFixed(0)} ms<br>SNAPSHOT ${snapshotHz.toFixed(0)} Hz · ACK ${ackDelta}`;}
  frameCount++;
  if(session?.started&&!finish){sendInput(false);if(now-lastPing>2600){const id=Math.round(now);pings.set(id,now);safeSend({type:'ping',seq:id});lastPing=now;for(const [k,v] of pings)if(now-v>9000)pings.delete(k);}}
 }
 fetch('/track',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Track '+r.status);return r.json();}).then(x=>track=x).catch(e=>setStatus('Impossibile caricare pista: '+e.message));
 requestAnimationFrame(draw);
})();
