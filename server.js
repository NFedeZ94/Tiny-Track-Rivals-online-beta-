'use strict';
// Full-game beta: Node owns simulation; room organizer has lobby privileges only.
const http=require('node:http'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {TRACKS,REV,loadScripts,makeFactory,verify}=require('./engine.cjs');
const BUILD='v0.13.6.151-online-authoritative',FEATURE='full-authoritative-151';
const CAR_COUNT=20;
const CAPACITIES=[2,4,6,8],ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DT=1000/60,MAX_MSG=24000,MAX_ROOMS=24,MAX_PEERS=96;
function createService(factory,{acceptWebSocket,origins=['https://nfedez94.github.io'],maxActive=1}={}){
 if(typeof factory!=='function')throw Error('Authoritative engine required');
 const accept=acceptWebSocket||require('./ws-lite').acceptWebSocket;
 const allowed=new Set(origins),rooms=new Map(),peers=new Set();
 const counters={created:0,steps:0,snapshots:0,inputs:0,rejected:0,overloads:0,engineErrors:0,lastStepMs:0,maxStepMs:0,maxDebtMs:0,slowTicks:0};
 const send=(peer,obj)=>{if(peer?.ws&&!peer.ws.closed)peer.ws.send(obj);};
 const broadcast=(room,obj)=>{for(const p of room.players.values())send(p,obj);};
 const activeCount=()=>[...rooms.values()].filter(r=>r.sim&&!r.finished).length;
 const members=r=>[...r.players.values()].map(p=>({slot:p.slot,name:p.name,car:p.car,ready:p.ready,host:p===r.organizer})).sort((a,b)=>a.slot-b.slot);
 const roomState=r=>({type:'room_state',code:r.code,public:r.public,capacity:r.capacity,started:!!r.sim,track:r.track??null,authority:'server',members:members(r)});
 const error=(p,message)=>{counters.rejected++;send(p,{type:'error',message});};
 const code=()=>{let value;do{value=Array.from({length:6},()=>ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');}while(rooms.has(value));return value;};
 const safeName=s=>String(s??'Pilota').replace(/[^\p{L}\p{N}_. -]/gu,'').trim().slice(0,18)||'Pilota';
 const carIndex=n=>Number.isInteger(n)?Math.max(0,Math.min(CAR_COUNT-1,n)):0;
 function closeRoom(r,reason){broadcast(r,{type:'room_closed',reason});for(const p of r.players.values()){p.room=null;p.slot=null;}r.players.clear();r.sim=null;rooms.delete(r.code);}
 function readyToRun(r){if(!r.sim||r.running||r.finished||!r.players.size||![...r.players.values()].every(p=>p.loaded))return;
   try{r.sim.loaded();r.running=true;r.accum=0;r.startedAt=performance.now();r.lastSnapshot=0;broadcast(r,{type:'all_loaded',track:r.track});snapshot(r);}catch(e){counters.engineErrors++;console.error('TTR load barrier',e);closeRoom(r,'Errore di avvio della simulazione.');}}
 function depart(p){const r=p.room;if(!r)return;const slot=p.slot;r.players.delete(slot);p.room=null;p.slot=null;
   if(!r.players.size){r.sim=null;rooms.delete(r.code);return;}
   if(r.organizer===p)r.organizer=r.players.values().next().value;
   try{if(r.sim&&!r.finished)r.sim.leave(slot);}catch(e){counters.engineErrors++;console.error('TTR leave',e);closeRoom(r,'Errore di simulazione.');return;}
   if(r.sim)broadcast(r,{type:'player_left',slot,replacedByCpu:true});broadcast(r,roomState(r));if(r.sim&&!r.running)readyToRun(r);
 }
 function snapshot(r){const state=r.sim.state();if(state.trackId!==r.track||!Array.isArray(state.cars)||state.cars.length!==r.capacity||!Number.isFinite(state.time)||!Number.isFinite(state.countdown)||!state.cars.every(c=>[c.x,c.y,c.a,c.s,c.p].every(Number.isFinite)))throw Error('Invalid authoritative state');
   const packet={type:'snapshot',state};if(Buffer.byteLength(JSON.stringify(packet))>MAX_MSG)throw Error('Oversized state');broadcast(r,packet);r.lastSnapshot=performance.now();counters.snapshots++;return state;}
 function onMessage(p,raw){let d;try{d=JSON.parse(raw);}catch(_){return error(p,'JSON non valido.');}if(!d||typeof d!=='object'||Array.isArray(d))return error(p,'Formato non valido.');
   const now=performance.now();if(now-p.rateAt>=1000){p.rateAt=now;p.rateCount=0;}if(++p.rateCount>80){p.ws.close(1008,'rate limit');return;}
   if(d.type==='ping'){if(Number.isInteger(d.seq))send(p,{type:'pong',seq:d.seq});return;}
   if(d.type==='leave'){depart(p);return;}
   // Neither organizer nor guest can supply physics, state, time or finish.
   if(['snapshot','state','finish','remote_input','remote_action'].includes(d.type))return error(p,'Stato calcolato esclusivamente dal server.');
   if(!p.room&&['create','find_public','join'].includes(d.type)){
     if(d.protocol!==2||d.eventVersion!==151)return error(p,'Serve il gioco .151 con Online Beta.');
     const capacity=CAPACITIES.includes(d.capacity)?d.capacity:4;let r;
     if(d.type==='join'){r=rooms.get(String(d.code??'').trim().toUpperCase());if(!r||r.sim||r.players.size>=r.capacity)return error(p,'Sala non disponibile.');}
     else {if(d.type==='find_public')r=[...rooms.values()].find(x=>x.public&&!x.sim&&x.capacity===capacity&&x.players.size<x.capacity);
       if(!r){if(rooms.size>=MAX_ROOMS)return error(p,'Server pieno.');r={code:code(),capacity,public:d.type==='find_public',players:new Map(),organizer:null,track:TRACKS.includes(d.track)?d.track:TRACKS[0],sim:null,running:false,finished:false,createdAt:now,lastActive:now,lastSnapshot:0,accum:0};rooms.set(r.code,r);counters.created++;}}
     const slot=Array.from({length:r.capacity},(_,i)=>i).find(i=>!r.players.has(i));if(slot===undefined)return error(p,'Sala piena.');
     Object.assign(p,{room:r,slot,name:safeName(d.name),car:carIndex(d.car),ready:false,loaded:false,lastSeq:-1,lastAction:-Infinity,lastInput:-Infinity});r.players.set(slot,p);r.organizer??=p;r.lastActive=now;
     send(p,{type:'joined',slot,code:r.code,host:p===r.organizer,protocol:2,authority:'server'});broadcast(r,roomState(r));return;
   }
   const r=p.room;if(!r)return error(p,'Entra prima in una sala.');r.lastActive=now;
   if(d.type==='track'&&!r.sim){if(p!==r.organizer||!TRACKS.includes(d.track))return error(p,'Circuito non disponibile.');r.track=d.track;broadcast(r,roomState(r));return;}
   if(d.type==='ready'&&!r.sim){p.ready=d.ready!==false;broadcast(r,roomState(r));return;}
   if(d.type==='car'&&!r.sim){p.car=carIndex(d.car);p.ready=false;broadcast(r,roomState(r));return;}
   if(d.type==='start'&&!r.sim){
     if(p!==r.organizer)return error(p,'Solo l’organizzatore può avviare.');
     if(r.players.size<2||![...r.players.values()].every(x=>x.ready))return error(p,'Servono almeno due giocatori pronti.');
     if(!TRACKS.includes(d.track))return error(p,'Circuito non disponibile.');
     if(activeCount()>=maxActive)return error(p,'Server Beta occupato, riprova a fine gara.');
     try{r.sim=factory({track:d.track,capacity:r.capacity,members:members(r)});r.track=d.track;r.loadingAt=now;r.finished=false;r.running=false;for(const x of r.players.values()){x.loaded=false;x.lastSeq=-1;}
       broadcast(r,{type:'race_start',protocol:2,authority:'server',track:r.track,capacity:r.capacity,code:r.code,mode:'race',tickHz:60,snapshotHz:20,members:members(r)});
       broadcast(r,roomState(r));snapshot(r);
     }catch(e){counters.engineErrors++;console.error('TTR race start',e);closeRoom(r,'Impossibile inizializzare la simulazione.');}return;
   }
   if(d.type==='loaded'&&r.sim&&!r.running&&!r.finished){if(d.track!==r.track)return error(p,'Circuito di caricamento errato.');p.loaded=true;readyToRun(r);return;}
   if(d.type==='input'&&r.running&&!r.finished){
     if(!p.loaded||!Number.isSafeInteger(d.seq)||d.seq<=p.lastSeq||!Number.isFinite(d.steer))return;
     if(now-p.lastInput<12)return;p.lastInput=now;p.lastSeq=d.seq;
     r.sim.input(p.slot,{steer:Math.max(-1,Math.min(1,d.steer)),gas:d.gas===true,brake:d.brake===true});counters.inputs++;return;
   }
   if(d.type==='action'&&r.running&&!r.finished&&p.loaded&&d.action==='item'){if(now-p.lastAction<240)return;p.lastAction=now;r.sim.item(p.slot);return;}
   return error(p,'Operazione non disponibile in questo stato.');
 }
 function health(){return {ok:true,build:BUILD,protocol:2,authority:'server',carCount:CAR_COUNT,engineCommit:REV,tickHz:60,snapshotHz:20,tracks:TRACKS,rooms:rooms.size,activeRaces:activeCount(),maxActiveRaces:maxActive,peers:peers.size,...counters,features:[FEATURE,'rtt_ping','server_authoritative','cpu_on_disconnect','load_barrier','environment_events']};}
 const server=http.createServer((req,res)=>{const route=new URL(req.url,'http://localhost').pathname;const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};if(req.method!=='GET'){res.writeHead(405,headers);return res.end(JSON.stringify({error:'Method not allowed'}));}
   if(route==='/health'||route==='/metrics'){res.writeHead(200,headers);return res.end(JSON.stringify(health()));}if(route==='/'){res.writeHead(200,headers);return res.end(JSON.stringify({service:'Tiny Track Rivals Online Beta',build:BUILD,client:'Usa il gioco .151 e /ws-beta',health:'/health'}));}res.writeHead(404,headers);res.end(JSON.stringify({error:'Not found'}));});
 server.on('upgrade',(req,socket,head)=>{const route=new URL(req.url,'http://localhost').pathname;if(route!=='/ws-beta'){socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');return;}
   const origin=String(req.headers.origin||'');if(!allowed.has(origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
   if(peers.size>=MAX_PEERS){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;}
   const p={ws:null,room:null,slot:null,rateAt:performance.now(),rateCount:0};const ws=accept(req,socket,head,{maxMessageBytes:MAX_MSG,onMessage:raw=>{if(p.ws)onMessage(p,raw);},onClose:()=>{try{depart(p);}finally{peers.delete(p);}}});if(!ws)return;p.ws=ws;peers.add(p);send(p,{type:'hello',protocol:2,build:BUILD,authority:'server',requiredClient:'0.13.6.151',carCount:CAR_COUNT,tracks:TRACKS,features:[FEATURE,'rtt_ping','server_authoritative'],tickHz:60,snapshotHz:20});
 });
 let last=performance.now();const timer=setInterval(()=>{const now=performance.now(),elapsed=Math.min(200,Math.max(0,now-last));last=now;
   for(const r of rooms.values()){if(!r.sim||!r.running||r.finished)continue;
     try{r.accum=Math.min(250,r.accum+elapsed);const n=Math.min(8,Math.floor(r.accum/DT));if(n){const started=performance.now();r.sim.step(n);const cost=performance.now()-started;counters.lastStepMs=+cost.toFixed(3);counters.maxStepMs=Math.max(counters.maxStepMs,counters.lastStepMs);if(cost>n*DT)counters.slowTicks++;r.accum-=n*DT;counters.steps+=n;}counters.maxDebtMs=Math.max(counters.maxDebtMs,+r.accum.toFixed(2));if(r.accum>=DT*8)counters.overloads++;
       if(now-r.lastSnapshot>=50){const st=snapshot(r);if(st.finished){r.finished=true;r.running=false;broadcast(r,{type:'finish',time:st.time,results:r.sim.results()});}}
     }catch(e){counters.engineErrors++;console.error('TTR simulation fault',e);closeRoom(r,'Errore del motore di gara.');}
   }
 },16);timer.unref();
 const sweep=setInterval(()=>{const now=performance.now();for(const r of rooms.values()){
   if(r.sim&&!r.running&&!r.finished&&now-r.loadingAt>90000)closeRoom(r,'Caricamento scaduto.');
   else if(r.running&&now-r.startedAt>600000)closeRoom(r,'Limite di durata della gara raggiunto.');
   else if(!r.running&&(now-r.lastActive>1200000||now-r.createdAt>10800000))closeRoom(r,'Sala scaduta.');
 }},5000);sweep.unref();
 function stop(){clearInterval(timer);clearInterval(sweep);for(const p of peers)p.ws.close(1001,'server shutdown');return new Promise(resolve=>server.close(resolve));}
 return {server,stop,health};
}
if(require.main===module){try{
 const factory=makeFactory(loadScripts());console.log('Engine preflight:',JSON.stringify(verify(factory)));
 const origins=(process.env.TTR_ALLOWED_ORIGINS||'https://nfedez94.github.io').split(',').map(s=>s.trim()).filter(Boolean);
 const maxActive=Math.max(1,Math.min(4,Number.parseInt(process.env.TTR_MAX_ACTIVE_RACES||'1',10)||1));
 const app=createService(factory,{origins,maxActive});app.server.listen(Number(process.env.PORT||8765),'0.0.0.0',()=>console.log(BUILD,'server-authoritative; engine',REV));
 process.on('SIGTERM',()=>app.stop().then(()=>process.exit(0)));process.on('SIGINT',()=>app.stop().then(()=>process.exit(0)));
 }catch(e){console.error('Authoritative engine unavailable; refusing to start:',e);process.exitCode=1;}}
module.exports={createService,BUILD,FEATURE};
