'use strict';
// Full-game beta: Node owns simulation; room organizer has lobby privileges only.
const http=require('node:http'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {TRACKS,REV,loadScripts,makeFactory,verify}=require('./engine.cjs');
const BUILD='v0.13.6.159-online-authoritative',FEATURE='full-authoritative-153';
const PERF_FEATURE='perf-159';
const CAR_COUNT=20;
const CAPACITIES=[2,4,6,8],ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DT=1000/60,LOOP_MS=8,SNAPSHOT_MS=50,MAX_BATCH=4,MAX_MSG=24000,MAX_ROOMS=24,MAX_PEERS=96;
const capSample=(a,v)=>{if(!Number.isFinite(v))return;if(a.length>=512)a.shift();a.push(v);};
const p95=a=>a.length?+a.slice().sort((x,y)=>x-y)[Math.ceil(a.length*.95)-1].toFixed(3):null;
function dueSnapshots(now,next){return now>=next?Math.floor((now-next)/SNAPSHOT_MS)+1:0;}
function batchSize(debt,avg){const due=Math.floor((debt+1e-6)/DT);return Math.min(due,MAX_BATCH,Math.max(1,Math.floor(12/Math.max(0.25,avg||1))));}
function newRunStats(){return {steps:0,batches:0,stepMs:0,maxStepMs:0,maxBatchMs:0,simulationCpuMs:0,simulationWallMs:0,snapshots:0,skippedSnapshots:0,deadlineMisses:0,duplicateSnapshots:0,resumeSnapshots:0,snapshotBytes:0,maxSnapshotBytes:0,snapshotBuildMs:0,maxSnapshotBuildMs:0,maxDebtMs:0,maxDebtBeforeStepMs:0,droppedMs:0,overloads:0,slowSteps:0,stepP95Ms:null,batchP95Ms:null,loopDelayP95Ms:null,inputQueueP95Ms:null,samples:0};}
function newRunSamples(){return {step:[],batch:[],loop:[],inputQueue:[],lastSummary:0,avgStep:1};}
function summarize(r,now,force=false){const a=r.runSamples,s=r.runStats;if(!a||!s||(!force&&now-a.lastSummary<1000))return;a.lastSummary=now;s.stepP95Ms=p95(a.step);s.batchP95Ms=p95(a.batch);s.loopDelayP95Ms=p95(a.loop);s.inputQueueP95Ms=p95(a.inputQueue);s.samples=a.step.length;}

function createService(factory,{acceptWebSocket,origins=['https://nfedez94.github.io'],maxActive=1}={}){
 if(typeof factory!=='function')throw Error('Authoritative engine required');
 const accept=acceptWebSocket||require('./ws-lite').acceptWebSocket;
 const allowed=new Set(origins),rooms=new Map(),peers=new Set();
 const counters={created:0,steps:0,snapshots:0,inputs:0,rejected:0,overloads:0,engineErrors:0,lastStepMs:0,maxStepMs:0,maxDebtMs:0,slowTicks:0,droppedMs:0,reconnects:0,disconnects:0,skippedSnapshots:0};
 const send=(peer,obj,encoded=null)=>{if(!peer?.ws||peer.ws.closed||peer.ws.closing)return;if(obj.type==='snapshot'&&(peer.ws.socket?.writableLength||0)>32000){counters.skippedSnapshots++;if(peer.room?.runStats)peer.room.runStats.skippedSnapshots++;return;}if(encoded&&typeof peer.ws.frame==='function')peer.ws.frame(1,encoded);else peer.ws.send(obj);};
 const broadcast=(room,obj,encoded=null)=>{for(const p of room.players.values())send(p,obj,encoded);};
 const activeCount=()=>[...rooms.values()].filter(r=>r.sim&&!r.finished).length;
 const members=r=>[...r.players.values()].map(p=>({slot:p.slot,name:p.name,car:p.car,ready:p.ready,host:p===r.organizer,connected:!p.detachedUntil})).sort((a,b)=>a.slot-b.slot);
 const roomState=r=>({type:'room_state',code:r.code,public:r.public,capacity:r.capacity,started:!!r.sim,track:r.track??null,authority:'server',members:members(r)});
 const error=(p,message)=>{counters.rejected++;send(p,{type:'error',message});};
 const code=()=>{let value;do{value=Array.from({length:6},()=>ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');}while(rooms.has(value));return value;};
 const safeName=s=>String(s??'Pilota').replace(/[^\p{L}\p{N}_. -]/gu,'').trim().slice(0,18)||'Pilota';
 const carIndex=n=>Number.isInteger(n)?Math.max(0,Math.min(CAR_COUNT-1,n)):0;
 function closeRoom(r,reason){broadcast(r,{type:'room_closed',reason});for(const p of r.players.values()){p.room=null;p.slot=null;}r.players.clear();r.sim=null;rooms.delete(r.code);}
 function readyToRun(r){if(!r.sim||r.running||r.finished||!r.players.size||![...r.players.values()].every(p=>p.loaded))return;
   try{r.sim.loaded();r.running=true;r.accum=0;r.startedAt=performance.now();r.lastLoop=r.startedAt;r.nextSnapshot=r.startedAt+SNAPSHOT_MS;r.lastSnapshot=0;r.lastSnapshotTick=-1;r.runStats=newRunStats();r.runSamples=newRunSamples();broadcast(r,{type:'all_loaded',track:r.track});snapshot(r);}catch(e){counters.engineErrors++;console.error('TTR load barrier',e);closeRoom(r,'Errore di avvio della simulazione.');}}
 function depart(p){const r=p.room;if(!r)return;const slot=p.slot;r.players.delete(slot);p.room=null;p.slot=null;
   if(!r.players.size){r.sim=null;rooms.delete(r.code);return;}
   if(r.organizer===p)r.organizer=r.players.values().next().value;
   try{if(r.sim&&!r.finished)r.sim.leave(slot);}catch(e){counters.engineErrors++;console.error('TTR leave',e);closeRoom(r,'Errore di simulazione.');return;}
   if(r.sim)broadcast(r,{type:'player_left',slot,replacedByCpu:true});broadcast(r,roomState(r));if(r.sim&&!r.running)readyToRun(r);
 }
 function snapshot(r,force=false,recipient=null){const began=performance.now(),state=r.sim.snapshotState?r.sim.snapshotState():r.sim.state();
   if(!force&&r.running&&r.lastSnapshotTick===state.tick){if(r.runStats)r.runStats.duplicateSnapshots++;return state;}
   state.inputAcks=Array.from({length:r.capacity},(_,i)=>r.players.get(i)?.appliedSeq??-1);
   summarize(r,began,force||state.finished);
   state.server=r.runStats?{...r.runStats,wallMs:+(began-r.startedAt).toFixed(1),debtMs:+(r.accum||0).toFixed(1),engineErrors:counters.engineErrors,metricsVersion:159}:null;
   if(!recipient)r.lastSnapshotTick=state.tick;if(state.trackId!==r.track||!Array.isArray(state.cars)||state.cars.length!==r.capacity||!Number.isFinite(state.time)||!Number.isFinite(state.countdown)||!state.cars.every(c=>[c.x,c.y,c.a,c.s,c.p].every(Number.isFinite)))throw Error('Invalid authoritative state');
   const packet={type:'snapshot',state},encoded=Buffer.from(JSON.stringify(packet));if(encoded.length>MAX_MSG)throw Error('Oversized state');
   if(recipient){send(recipient,packet,encoded);if(r.runStats)r.runStats.resumeSnapshots++;return state;}
   broadcast(r,packet,encoded);r.lastSnapshot=performance.now();counters.snapshots++;
   if(r.runStats){const st=r.runStats,cost=r.lastSnapshot-began;st.snapshots++;st.snapshotBytes+=encoded.length;st.maxSnapshotBytes=Math.max(st.maxSnapshotBytes,encoded.length);st.snapshotBuildMs+=cost;st.maxSnapshotBuildMs=Math.max(st.maxSnapshotBuildMs,cost);}
   return state;}
 function onMessage(p,raw){let d;try{d=JSON.parse(raw);}catch(_){return error(p,'JSON non valido.');}if(!d||typeof d!=='object'||Array.isArray(d))return error(p,'Formato non valido.');
   const now=performance.now();if(now-p.rateAt>=1000){p.rateAt=now;p.rateCount=0;}if(++p.rateCount>80){p.ws.close(1008,'rate limit');return;}
   if(d.type==='ping'){if(Number.isInteger(d.seq))send(p,{type:'pong',seq:d.seq});return;}
   if(d.type==='leave'){depart(p);return;}
   if(d.type==='resume'&&!p.room){
     if(d.protocol!==2||d.eventVersion!==153||typeof d.token!=='string'||d.token.length!==48)return error(p,'Riconnessione non valida.');
     const r=rooms.get(String(d.code||'').toUpperCase());const old=r&&[...r.players.values()].find(x=>x.detachedUntil>now&&x.resumeToken===d.token);
     if(!r||!old||!r.running||r.finished)return error(p,'Posto in gara non più disponibile.');
     const slot=old.slot;Object.assign(p,{room:r,slot,name:old.name,car:old.car,ready:true,loaded:true,lastSeq:old.lastSeq,appliedSeq:old.appliedSeq,lastAction:old.lastAction,lastInput:-Infinity,pendingInputAt:null,resumeToken:old.resumeToken,detachedUntil:0});
     if(r.organizer===old)r.organizer=p;old.room=null;old.slot=null;r.players.set(slot,p);counters.reconnects++;
     send(p,{type:'resumed',slot,lastSeq:p.lastSeq,code:r.code});broadcast(r,roomState(r));snapshot(r,true,p);return;
   }
   // Neither organizer nor guest can supply physics, state, time or finish.
   if(['snapshot','state','finish','remote_input','remote_action'].includes(d.type))return error(p,'Stato calcolato esclusivamente dal server.');
   if(!p.room&&['create','find_public','join'].includes(d.type)){
     if(d.protocol!==2||d.eventVersion!==153)return error(p,'Serve il gioco .153 con Online Beta.');
     const capacity=CAPACITIES.includes(d.capacity)?d.capacity:4;let r;
     if(d.type==='join'){r=rooms.get(String(d.code??'').trim().toUpperCase());if(!r||r.sim||r.players.size>=r.capacity)return error(p,'Sala non disponibile.');}
     else {if(d.type==='find_public')r=[...rooms.values()].find(x=>x.public&&!x.sim&&x.capacity===capacity&&x.players.size<x.capacity);
       if(!r){if(rooms.size>=MAX_ROOMS)return error(p,'Server pieno.');r={code:code(),capacity,public:d.type==='find_public',players:new Map(),organizer:null,track:TRACKS.includes(d.track)?d.track:TRACKS[0],sim:null,running:false,finished:false,createdAt:now,lastActive:now,lastSnapshot:0,accum:0};rooms.set(r.code,r);counters.created++;}}
     const slot=Array.from({length:r.capacity},(_,i)=>i).find(i=>!r.players.has(i));if(slot===undefined)return error(p,'Sala piena.');
     Object.assign(p,{room:r,slot,name:safeName(d.name),car:carIndex(d.car),ready:false,loaded:false,lastSeq:-1,appliedSeq:-1,lastAction:-Infinity,lastInput:-Infinity,resumeToken:crypto.randomBytes(24).toString('hex'),detachedUntil:0});r.players.set(slot,p);r.organizer??=p;r.lastActive=now;
     send(p,{type:'joined',slot,code:r.code,host:p===r.organizer,protocol:2,authority:'server',resumeToken:p.resumeToken});broadcast(r,roomState(r));return;
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
     try{r.sim=factory({track:d.track,capacity:r.capacity,members:members(r)});r.track=d.track;r.loadingAt=now;r.finished=false;r.running=false;for(const x of r.players.values()){x.loaded=false;x.lastSeq=-1;x.appliedSeq=-1;x.lastInput=-Infinity;x.pendingInputAt=null;}
       broadcast(r,{type:'race_start',protocol:2,authority:'server',track:r.track,capacity:r.capacity,code:r.code,mode:'race',tickHz:60,snapshotHz:20,members:members(r)});
       broadcast(r,roomState(r));snapshot(r);
     }catch(e){counters.engineErrors++;console.error('TTR race start',e);closeRoom(r,'Impossibile inizializzare la simulazione.');}return;
   }
   if(d.type==='loaded'&&r.sim&&!r.running&&!r.finished){if(d.track!==r.track)return error(p,'Circuito di caricamento errato.');p.loaded=true;readyToRun(r);return;}
   if(d.type==='input'&&r.running&&!r.finished){
     if(!p.loaded||!Number.isSafeInteger(d.seq)||d.seq<=p.lastSeq||!Number.isFinite(d.steer))return;
     p.lastInput=now;p.lastSeq=d.seq;p.pendingInputAt=now;
     r.sim.input(p.slot,{steer:Math.max(-1,Math.min(1,d.steer)),gas:d.gas===true,brake:d.brake===true});counters.inputs++;return;
   }
   if(d.type==='action'&&r.running&&!r.finished&&p.loaded&&d.action==='item'){if(now-p.lastAction<240)return;p.lastAction=now;r.sim.item(p.slot);return;}
   return error(p,'Operazione non disponibile in questo stato.');
 }
 function health(){return {ok:true,build:BUILD,protocol:2,authority:'server',carCount:CAR_COUNT,engineCommit:REV,tickHz:60,snapshotHz:20,tracks:TRACKS,rooms:rooms.size,activeRaces:activeCount(),maxActiveRaces:maxActive,peers:peers.size,...counters,features:[FEATURE,'rtt_ping','server_authoritative','cpu_on_disconnect','load_barrier','environment_events','input_ack','resume','tick_playback',PERF_FEATURE]};}
 const server=http.createServer((req,res)=>{const route=new URL(req.url,'http://localhost').pathname;const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};if(req.method!=='GET'){res.writeHead(405,headers);return res.end(JSON.stringify({error:'Method not allowed'}));}
   if(route==='/health'||route==='/metrics'){res.writeHead(200,headers);return res.end(JSON.stringify(health()));}if(route==='/'){res.writeHead(200,headers);return res.end(JSON.stringify({service:'Tiny Track Rivals Online Beta',build:BUILD,client:'Compatibile con il client .153 e successivi, /ws-beta',health:'/health'}));}res.writeHead(404,headers);res.end(JSON.stringify({error:'Not found'}));});
 server.on('upgrade',(req,socket,head)=>{const route=new URL(req.url,'http://localhost').pathname;if(route!=='/ws-beta'){socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');return;}
   const origin=String(req.headers.origin||'');if(!allowed.has(origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
   if(peers.size>=MAX_PEERS){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;}
   const p={ws:null,room:null,slot:null,rateAt:performance.now(),rateCount:0};const ws=accept(req,socket,head,{maxMessageBytes:MAX_MSG,onMessage:raw=>{if(p.ws)onMessage(p,raw);},onClose:()=>{try{const r=p.room;if(r?.running&&!r.finished){p.ws=null;p.detachedUntil=performance.now()+15000;counters.disconnects++;r.sim.input(p.slot,{steer:0,gas:false,brake:false});broadcast(r,roomState(r));}else depart(p);}finally{peers.delete(p);}}});if(!ws)return;p.ws=ws;peers.add(p);send(p,{type:'hello',protocol:2,build:BUILD,authority:'server',requiredClient:'0.13.6.153',carCount:CAR_COUNT,tracks:TRACKS,features:[FEATURE,'rtt_ping','server_authoritative','input_ack','resume','tick_playback',PERF_FEATURE],tickHz:60,snapshotHz:20});
 });
 const timer=setInterval(()=>{for(const r of rooms.values()){if(!r.sim||!r.running||r.finished)continue;
   const now=performance.now(),elapsed=Math.max(0,now-r.lastLoop);r.lastLoop=now;
   try{const st=r.runStats,sa=r.runSamples;capSample(sa.loop,Math.max(0,elapsed-LOOP_MS));
     const debt=r.accum+elapsed,discard=Math.max(0,debt-1000);r.accum=Math.min(1000,debt);st.droppedMs+=discard;counters.droppedMs+=discard;st.maxDebtBeforeStepMs=Math.max(st.maxDebtBeforeStepMs,debt);
     const n=batchSize(r.accum,sa.avgStep);
     if(n){const started=performance.now(),cpu=process.cpuUsage();const costs=r.sim.step(n);const cost=performance.now()-started,usage=process.cpuUsage(cpu);
       // Production engine returns per-tick wall costs. Allow old test adapters.
       const measured=Array.isArray(costs)?costs:Array.from({length:n},()=>cost/n),actual=measured.length;
       if(actual){for(const p of r.players.values())if(p.appliedSeq!==p.lastSeq){if(Number.isFinite(p.pendingInputAt))capSample(sa.inputQueue,Math.max(0,started-p.pendingInputAt));p.appliedSeq=p.lastSeq;p.pendingInputAt=null;}
         const sum=measured.reduce((x,y)=>x+y,0),peak=Math.max(...measured);
         st.steps+=actual;st.batches++;st.stepMs+=sum;st.maxStepMs=Math.max(st.maxStepMs,peak);st.maxBatchMs=Math.max(st.maxBatchMs,cost);st.simulationWallMs+=cost;st.simulationCpuMs+=(usage.user+usage.system)/1000;st.slowSteps+=measured.filter(v=>v>DT).length;
         for(const ms of measured)capSample(sa.step,ms);capSample(sa.batch,cost);sa.avgStep=.85*sa.avgStep+.15*(cost/actual);
         counters.lastStepMs=+peak.toFixed(3);counters.maxStepMs=Math.max(counters.maxStepMs,counters.lastStepMs);counters.slowTicks+=measured.filter(v=>v>DT).length;r.accum=Math.max(0,r.accum-actual*DT);counters.steps+=actual;
       }
     }
     st.maxDebtMs=Math.max(st.maxDebtMs,r.accum);counters.maxDebtMs=Math.max(counters.maxDebtMs,+r.accum.toFixed(2));if(r.accum>=DT*8){counters.overloads++;st.overloads++;}
     // Schedule against the clock AFTER simulation, not the stale timestamp from
     // before a possibly long batch. Do not send a burst of obsolete states.
     const after=performance.now(),due=dueSnapshots(after,r.nextSnapshot);
     if(due){st.deadlineMisses+=due-1;r.nextSnapshot+=due*SNAPSHOT_MS;const state=snapshot(r);if(state.finished){r.finished=true;r.running=false;broadcast(r,{type:'finish',time:state.time,results:r.sim.results()});}}
   }catch(e){counters.engineErrors++;console.error('TTR simulation fault',e);closeRoom(r,'Errore del motore di gara.');}
 }},LOOP_MS);timer.unref();
 const sweep=setInterval(()=>{const now=performance.now();for(const r of rooms.values()){
   for(const p of [...r.players.values()])if(p.detachedUntil&&now>=p.detachedUntil)depart(p);
   if(!rooms.has(r.code))continue;
   if(r.sim&&!r.running&&!r.finished&&now-r.loadingAt>90000)closeRoom(r,'Caricamento scaduto.');
   else if(r.running&&now-r.startedAt>600000)closeRoom(r,'Limite di durata della gara raggiunto.');
   else if(!r.running&&(now-r.lastActive>1200000||now-r.createdAt>10800000))closeRoom(r,'Sala scaduta.');
 }},1000);sweep.unref();
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
module.exports={createService,BUILD,FEATURE,batchSize,dueSnapshots};
