'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {acceptWebSocket}=require('./ws-lite');
const {Simulation,DT,K}=require('./simulation');
const PORT=Number(process.env.PORT||8765),BUILD='beta-authoritative-prototype-0.1.0';
const ORIGINS=new Set((process.env.TTR_ALLOWED_ORIGINS||'https://nfedez94.github.io').split(',').map(x=>x.trim()).filter(Boolean));
const ROOMS=new Map(),PEERS=new Set(),CODES='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS=40,MAX_PEERS=240,MAX_ROOM_AGE=3*3600*1000;
const counters={created:0,connections:0,inputs:0,steps:0,frames:0,errors:0};
function code(){let c;do{c=Array.from({length:6},()=>CODES[crypto.randomInt(CODES.length)]).join('');}while(ROOMS.has(c));return c;}
function safeName(n){return String(n??'Pilota').replace(/[^\p{L}\p{N}_. -]/gu,'').trim().slice(0,18)||'Pilota';}
function integer(n,def=0){return Number.isInteger(n)?n:def;}
function members(room){return [...room.players.values()].map(p=>({slot:p.slot,name:p.name,car:p.car,ready:p.ready,host:p===room.host})).sort((a,b)=>a.slot-b.slot);}
function status(room){return {type:'room_state',code:room.code,public:room.public,capacity:room.capacity,started:!!room.sim,members:members(room)};}
function broadcast(room,msg){for(const p of room.players.values())p.ws.send(msg);}
function closeRoom(room,reason){for(const p of room.players.values()){p.room=null;p.slot=null;p.ws.send({type:'room_closed',reason});}ROOMS.delete(room.code);}
function depart(peer){const r=peer.room;if(!r)return;
  r.players.delete(peer.slot);if(r.sim)r.sim.replaceWithCpu(peer.slot);
  const wasHost=r.host===peer,departedSlot=peer.slot;peer.room=null;peer.slot=null;
  if(!r.players.size){ROOMS.delete(r.code);return;}
  if(wasHost)r.host=r.players.values().next().value;
  if(r.sim){broadcast(r,{type:'player_left',slot:departedSlot,replacedByCpu:true});broadcast(r,status(r));}
  else broadcast(r,status(r));
}
function emitError(p,message){counters.errors++;p.ws.send({type:'error',message});}
function onMessage(peer,raw){let d;try{d=JSON.parse(raw);}catch(_){return emitError(peer,'Messaggio JSON non valido');}
  if(!d||typeof d!=='object'||Array.isArray(d))return emitError(peer,'Formato non valido');
  const now=Date.now();peer.window??={start:now,n:0};if(now-peer.window.start>1000)peer.window={start:now,n:0};
  if(++peer.window.n>80){peer.ws.close(1008,'rate limit');return;}
  const op=d.type;
  if(op==='ping'){peer.ws.send({type:'pong',seq:integer(d.seq),serverTime:Date.now()});return;}
  if(op==='leave'){depart(peer);return;}
  if((op==='create'||op==='find_public'||op==='join')&&!peer.room){
    const capacity=[2,4,6,8].includes(d.capacity)?d.capacity:4;
    const name=safeName(d.name),car=Math.min(4,Math.max(0,integer(d.car)));
    let r;
    if(op==='join'){
      const joinCode=String(d.code||'').toUpperCase().trim();r=ROOMS.get(joinCode);
      if(!r||r.sim||r.players.size>=r.capacity)return emitError(peer,'Sala non disponibile o piena.');
    } else {
      if(op==='find_public')r=[...ROOMS.values()].find(t=>t.public&&!t.sim&&t.players.size<t.capacity);
      if(!r){if(ROOMS.size>=MAX_ROOMS)return emitError(peer,'Server pieno.');
        r={code:code(),public:op==='find_public',capacity,players:new Map(),sim:null,host:null,created:Date.now(),lastSnapshot:0,lastActive:Date.now(),accum:0};
        ROOMS.set(r.code,r);counters.created++;
      }
    }
    const slot=Array.from({length:r.capacity},(_,i)=>i).find(i=>!r.players.has(i));
    if(slot===undefined)return emitError(peer,'Sala piena.');
    Object.assign(peer,{room:r,slot,car,name,ready:false,lastAction:0});r.players.set(slot,peer);
    if(!r.host)r.host=peer;r.lastActive=now;
    peer.ws.send({type:'joined',slot,code:r.code,host:r.host===peer,protocol:2});broadcast(r,status(r));return;
  }
  const r=peer.room;if(!r)return emitError(peer,'Devi prima entrare in una stanza.');
  r.lastActive=now;
  if(op==='ready'&&!r.sim){peer.ready=d.ready!==false;broadcast(r,status(r));return;}
  if(op==='car'&&!r.sim){peer.car=Math.min(4,Math.max(0,integer(d.car)));peer.ready=false;broadcast(r,status(r));return;}
  if(op==='start'&&!r.sim){
    if(peer!==r.host)return emitError(peer,'Solo il creatore della sala può avviare.');
    if(r.players.size<2||![...r.players.values()].every(p=>p.ready))return emitError(peer,'Servono almeno due giocatori pronti.');
    r.sim=new Simulation(members(r),r.capacity);r.lastSnapshot=0;
    broadcast(r,{type:'race_start',protocol:2,code:r.code,capacity:r.capacity,
      mode:'race',track:'colazione-turbo',members:members(r),tickHz:30,snapshotHz:20,authority:'server'});
    broadcast(r,{type:'state',...r.sim.publicState()});return;
  }
  if(op==='input'&&r.sim&&!r.sim.finished){
    const valid=r.sim.setInput(peer.slot,d,integer(d.seq,-1));if(valid)counters.inputs++;
    return;
  }
  if(op==='action'&&r.sim&&!r.sim.finished){
    if(d.action!=='item')return emitError(peer,'Azione non valida.');
    if(now-peer.lastAction<240)return;
    peer.lastAction=now;r.sim.useItem(peer.slot);return;
  }
  emitError(peer,'Operazione non valida in questo stato.');
}
const publicDir=path.resolve(__dirname);
function respond(res,code,body,mime){res.writeHead(code,{'Content-Type':mime,'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: ws:; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"});res.end(body);}
const httpServer=http.createServer((req,res)=>{
  if(req.method!=='GET'){respond(res,405,'Method not allowed','text/plain');return;}
  const route=new URL(req.url,'http://localhost').pathname;
  if(route==='/health'){respond(res,200,JSON.stringify({ok:true,build:BUILD,protocol:2,authority:'server',
    rooms:ROOMS.size,peers:PEERS.size,tickHz:30,snapshotHz:20,features:['rtt_ping','cpu_fill','cpu_on_disconnect','private_rooms','public_rooms'],
    limitations:['prototype_track_props_not_ported','no_persistent_ratings','no_anti_cheat_identity']},null,2),'application/json');return;}
  if(route==='/metrics'){respond(res,200,JSON.stringify({...counters,rooms:ROOMS.size,peers:PEERS.size,uptime:Math.round(process.uptime())}),'application/json');return;}
  if(route==='/track'){respond(res,200,JSON.stringify({width:K.WORLD_W,height:K.WORLD_H,
    centerline:Array.from({length:420},(_,i)=>K.trackPoint(i/420)),
    pickups:[.22,.825,.48].map(p=>K.trackPoint(p)),
    profiles:K.profiles.map(p=>({name:p.name,color:p.color,max:p.max,acc:p.acc,turn:p.turn}))}),'application/json');return;}
  if(route==='/'||route==='/beta'||route==='/beta/'){respond(res,200,fs.readFileSync(path.join(publicDir,'beta.html')),'text/html; charset=utf-8');return;}
  if(route==='/beta.js'){respond(res,200,fs.readFileSync(path.join(publicDir,'beta.js')),'application/javascript; charset=utf-8');return;}
  respond(res,404,'Not Found','text/plain');
});
httpServer.on('upgrade',(req,socket,head)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname!=='/ws-beta'){socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');return;}
  const origin=String(req.headers.origin||'');
  const ownOrigin=`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;
  // Render terminates TLS at its proxy, so its own https:// origin must be allowed as well.
  const selfOrigin=`https://${req.headers.host}`;
  if(!origin||(origin!==selfOrigin&&origin!==ownOrigin&&!ORIGINS.has(origin))){
    console.warn('[TTR Beta] Origin rejected:',JSON.stringify(origin));
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
  }
  if(PEERS.size>=MAX_PEERS){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;}
  const peer={ws:null,room:null,slot:null,ready:false,window:null};
  const ws=acceptWebSocket(req,socket,head,{maxMessageBytes:24000,
    onMessage:raw=>onMessage(peer,raw),
    onClose:()=>{depart(peer);PEERS.delete(peer);}});
  if(!ws)return;
  peer.ws=ws;PEERS.add(peer);counters.connections++;
  ws.send({type:'hello',protocol:2,build:BUILD,features:['server_authoritative','rtt_ping','input_ack'],
    tickHz:30,snapshotHz:20,requiredClient:'beta-v2'});
});
// Fixed authoritative tick; no client clock can accelerate or slow simulation.
let last=performance.now();const fixed=DT*1000;
setInterval(()=>{
  const now=performance.now(),elapsed=Math.min(180,now-last);last=now;
  for(const r of ROOMS.values()){
    if(!r.sim||r.sim.finished)continue;
    r.accum=Math.min(180,r.accum+elapsed);let steps=0;
    while(r.accum>=fixed&&steps<5){r.sim.step();r.accum-=fixed;steps++;counters.steps++;}
    if(r.sim.finished&&!r.sim.finishAnnounced){
      r.sim.finishAnnounced=true;
      broadcast(r,{type:'state',...r.sim.publicState()});counters.frames++;
      broadcast(r,{type:'finish',results:r.sim.results,serverTime:r.sim.time});
    }
  }
},Math.round(fixed)).unref();
// A separate 50ms scheduler is important: sampling a 30Hz tick every >=50ms
// otherwise quantizes at 66ms (15Hz), producing the exact stutter we need to avoid.
setInterval(()=>{
  for(const r of ROOMS.values())if(r.sim&&!r.sim.finished){
    broadcast(r,{type:'state',...r.sim.publicState()});counters.frames++;
  }
},50).unref();
setInterval(()=>{
  const now=Date.now();for(const r of [...ROOMS.values()]){
    if(now-r.created>MAX_ROOM_AGE||(!r.sim&&now-r.lastActive>20*60*1000))closeRoom(r,'Sala scaduta.');
  }
},30000).unref();
function stop(){for(const p of PEERS)p.ws.close(1001,'server shutdown');httpServer.close(()=>process.exit(0));}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
httpServer.listen(PORT,'0.0.0.0',()=>console.log(`[TTR Beta] ${BUILD} port=${PORT}; origins=${[...ORIGINS].join(',')}`));
