'use strict';
// TTR server-side adapter: executes the pinned .148 modules + byte-identical .153 overlays, in a
// separate VM per room, with presentation disabled. No browser or player host.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'.ttr-engine');
const REV='c8b05794a344fab64f83d2f5ad6ca66e530f2b27',BUILD='0.13.6.148';
const TRACKS=Object.freeze(['colazione-turbo','box-di-biliardo','desk-drift','bagno-sprint','garage-grid']);
const MODULES=Object.freeze(['01-core.js','07a-race-grid-logic.js','07b-race-powerups-logic.js','07c-race-driver-logic.js','07d-race-safety-logic.js','08a-race-progress-logic.js','08b-race-timing-logic.js','09a-race-cpu-logic.js','09b-race-oil-logic.js','09c-race-pickup-logic.js','09d-race-collision-logic.js','11b-race-flow.js','15-box-biliardo-track.js','15b-box-biliardo-rules.js','16-desk-drift-track.js','20-garage-grid.js','16b-desk-drift-rules.js','17-bagno-sprint-track.js','17b-bagno-sprint-rules.js','18-diagnostics-history.js','19-environment-events.js','21-online-netcode.js','06-game-legacy.js']);
const blobHash=b=>crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const OVERLAYS=Object.freeze({"19-environment-events.js": "c1099d8a53043ebe42ba60018e7f87b876e9eb42", "15b-box-biliardo-rules.js": "30a34b311b1a680cddb4199e8657d5cfc98265d0", "17b-bagno-sprint-rules.js": "2678c35eed9075ec510c3375c61d183528de3d42", "06-game-legacy.js": "7b7b8c0f17f3e083d5ac659d8ba669c5baed00c6", "07d-race-safety-logic.js": "276e65e212d39a671f6247d314cf3e0a98bd4d6e", "21-online-netcode.js": "43514cc9436c3f803ae9ba9710740daa54d0b7de", "07c-race-driver-logic.js": "2745208f7aab09323115557ccbfef11ec729665c", "16b-desk-drift-rules.js": "506b05c69b04eaff1876ff93152a28c40ce641ae"});
const LEGACY_HASH='7b7b8c0f17f3e083d5ac659d8ba669c5baed00c6';
function patchLegacy(s){
 const replace=(a,b)=>{if(s.split(a).length!==2)throw Error('Engine adapter incompatible: '+a.slice(0,80));s=s.replace(a,b);};
 // Keep worldInit's exact colliders, but skip painting and static sprite work.
 replace('paintWorld();paintBridgeDeck();','');
 replace('function onlineSend(obj){if(onlineSocket?.readyState===WebSocket.OPEN)onlineSocket.send(JSON.stringify(obj));}','function onlineSend(){}');
 replace('for(const o of props)prepareRaceProp(o);','');
 replace('function inputFor(c){const ctl=',"function inputFor(c){if(race?.mode==='online'&&onlineSession?.members[c.id])return onlineHostInput(c);const ctl=");
 replace('v&&performance.now()-v.at<500?{steer:v.steer,gas:v.gas,brake:v.brake}:{steer:0,gas:false,brake:true}','v&&performance.now()-v.at<500?{steer:v.steer,gas:v.gas,brake:v.brake}:{steer:0,gas:false,brake:false}');
 // Execute the same simulation as offline, never the guest rendering loop.
 replace("if(race.mode==='online')return;if(race.paused", "if(race.mode==='online'&&!onlineSession?.host)return;if(race.paused");
 // No network, rendering or audio side effects in the authoritative VM.
 // No client UI startup or debug API in the engine process.
 const marker='onlineWire();worldInit();window.TTRAssets?.ready.then';
 if(s.split(marker).length!==2)throw Error('Engine startup marker missing');
 s=s.slice(0,s.indexOf(marker))+`
 window.__TTRServer=Object.freeze({
   start(config){
     onlineSession={host:true,slot:config.members[0].slot,capacity:config.capacity,members:Array(config.capacity).fill(null),trackId:config.track,allLoaded:false};
     for(const m of config.members)onlineSession.members[m.slot]=m;
     onlineRemoteInputs={};selectedTrackId=config.track;worldInit();initRace('online');
     if(config.members.some(m=>!profiles[m.car]||race.cars[m.slot]?.profile.id!==profiles[m.car].id))throw Error('Incorrect human car profile');
     return {track:race.trackId,carCount:race.cars.length};
   },
   loaded(){onlineSession.allLoaded=true;},
   input(slot,ctl){if(onlineSession.members[slot])onlineRemoteInputs[slot]={steer:ctl.steer,gas:ctl.gas,brake:ctl.brake,at:performance.now()};},
   item(slot){const c=race.cars[slot];if(onlineSession.allLoaded&&onlineSession.members[slot]&&c&&!c.done&&!race.finished&&race.countdown<=0)useItem(c);},
   leave(slot){onlineSession.members[slot]=null;delete onlineRemoteInputs[slot];if(race.player.id===slot){const next=onlineSession.members.find(Boolean);if(next)race.player=race.cars[next.slot];}},
   step(n){const costs=[];for(let i=0;i<n&&!race.finished;i++){const start=__wallNow();globalThis.__clock+=1000/60;update(1/60,false);globalThis.__tick++;costs.push(__wallNow()-start);}return costs;},
   state(){const s=onlineAuthoritativeState();s.tick=globalThis.__tick;return s;},
   results(){return race.cars.map(c=>({id:c.id,done:c.done,finishTime:c.finishTime??null}));}
 });
 })();\n`;
 return s;
}
function loadScripts(root=ROOT){
 const version=fs.readFileSync(path.join(root,'version.txt'),'utf8').trim();if(version!==BUILD)throw Error('Wrong engine source version '+version);
 return MODULES.map(name=>{const file=fs.readFileSync(path.join(root,'js',name));if(OVERLAYS[name]&&blobHash(file)!==OVERLAYS[name])throw Error('Overlay hash mismatch: '+name);if(name==='06-game-legacy.js'&&blobHash(file)!==LEGACY_HASH)throw Error('Legacy source hash differs from verified .153 physics overlay');return new vm.Script(name==='06-game-legacy.js'?patchLegacy(file.toString('utf8')):file.toString('utf8'),{filename:name});});
}
function makeContext(){
 const noop=()=>{},canvas=Object.freeze({clearRect:noop});
 const element=()=>{const o={style:{},dataset:{},hidden:true,innerHTML:'',textContent:'',value:'',classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},getContext:()=>canvas,addEventListener:noop,setAttribute:noop,append:noop,appendChild:noop,replaceChildren:noop,remove:noop,blur:noop,querySelectorAll:()=>[]};o.parentElement=o;o.querySelector=()=>o;o.closest=()=>o;return o;};
 const nodes=new Map(),document={body:element(),hidden:false,visibilityState:'visible',getElementById:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,querySelector:element,querySelectorAll:()=>[],addEventListener:noop,hasFocus:()=>true};
 const muted={sfx:noop,music:noop,stopMusic:noop,syncEngine:noop,setRaceContext:noop,unlock:()=>Promise.resolve(false),status:()=>({muted:true}),getSettings:()=>({muted:true})};
 const context=vm.createContext({document,console,innerWidth:926,innerHeight:428,devicePixelRatio:1,localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},addEventListener:noop,removeEventListener:noop,requestAnimationFrame:noop,cancelAnimationFrame:noop,setTimeout:noop,clearTimeout:noop,Audio:function(){},performance:{now:()=>context.__clock},__clock:0,__tick:0,__wallNow:()=>performance.now(),
 TTRSound:muted,TTRGameParts:{},TTRGameEffectsVisuals:{},TTRCanvasPrimitives:{},TTRBoxVisuals:{render:noop},TTRDeskVisuals:{render:noop},TTRBathVisuals:{render:noop},TTRHudVisuals:{render:noop},TTRMinimapVisuals:{createRaceMiniBase:()=>null},TTRI18N:{t:k=>k,getLang:()=> 'it'},TTRModeTrial:{setTrack:noop},TTRModeElimination:{create:()=>({})},TTRRaceResults:{create:()=>({showResults:noop,cancelMusicTimer:noop})},TTRVehicleVisuals:{TTRShowroomStarts:{},TTRShowroom60:{}}},{name:'TTR race engine',codeGeneration:{strings:false,wasm:false}});
 context.window=context;
 // Contextified global lookups are costly in tight physics loops. Bind only the
 // original, immutable-per-race references, without replacing any math or RNG.
 // All game modules remain pinned, unchanged; the clock stays deterministic.
 new vm.Script('const Math=globalThis.Math, Number=globalThis.Number, Object=globalThis.Object, Array=globalThis.Array, Map=globalThis.Map, Set=globalThis.Set, WeakMap=globalThis.WeakMap, JSON=globalThis.JSON;',{filename:'engine-intrinsics.cjs'}).runInContext(context,{timeout:1000});
 return context;
}
// Wall-clock watchdogs are separate from the fixed 60 Hz simulation step.
// Render's shared CPU can deschedule a process even when the engine is healthy.
const WATCHDOG=Object.freeze({moduleMs:5000,liveMs:500,verificationMs:2000});
function makeFactory(scripts){
 return (config,{verification=false}={})=>{
 const ctx=makeContext();const track=config.track;
 const phase=verification?'preflight':'live';
 for(const [index,script] of scripts.entries()){
  try{script.runInContext(ctx,{timeout:WATCHDOG.moduleMs});}
  catch(e){throw Error(`[${phase}] ${track}: module ${MODULES[index]??index} failed (limit ${WATCHDOG.moduleMs}ms)`,{cause:e});}
 }
 ctx.TTRGarageVisuals={render:()=>{}};
 const api=ctx.__TTRServer;if(!api)throw Error('No authoritative race API');
 const created=api.start(JSON.parse(JSON.stringify(config)));if(created.track!==track||created.carCount!==config.capacity)throw Error('Wrong initialized track or grid');
 const tick=new vm.Script('__TTRServer.step(__steps)',{filename:'authoritative-tick.cjs'});
 const timeout=verification?WATCHDOG.verificationMs:WATCHDOG.liveMs;
 return {loaded:()=>api.loaded(),input:(slot,ctl)=>api.input(slot,ctl),item:slot=>api.item(slot),leave:slot=>api.leave(slot),step:n=>{
  ctx.__steps=n;
  try{return tick.runInContext(ctx,{timeout});}
  catch(e){throw Error(`[${phase}] ${track}: simulation tick ${ctx.__tick}, batch ${n}, limit ${timeout}ms`,{cause:e});}
 },snapshotState:()=>api.state(),state:()=>JSON.parse(JSON.stringify(api.state())),results:()=>JSON.parse(JSON.stringify(api.results()))};
 };
}
function verify(factory){
 const results=[];
 for(const track of TRACKS){const members=[{slot:0,car:19,name:'A',ready:true,host:true},{slot:1,car:18,name:'B',ready:true,host:false}],sim=factory({track,capacity:4,members},{verification:true});
 console.log(`[preflight] testing ${track}`);const benchStart=performance.now();
 const initial=sim.state();sim.step(12);if(sim.state().countdown!==initial.countdown)throw Error('Countdown advanced before load: '+track);
 sim.loaded();for(let i=0;i<600;i++){sim.input(0,{steer:0,gas:true,brake:false});sim.input(1,{steer:.2,gas:true,brake:false});sim.step(2);}
 const st=sim.state();if(st.trackId!==track||st.cars.length!==4||!st.cars.every(c=>[c.x,c.y,c.a,c.s,c.p].every(Number.isFinite))||st.time<15||!st.environment||st.environment.e<15||st.environment.n<1)throw Error('Invalid live simulation '+track);
 if(Math.hypot(st.cars[0].x-initial.cars[0].x,st.cars[0].y-initial.cars[0].y)<1&&st.cars[0].sr===0)throw Error('No human movement '+track);
 sim.leave(0);sim.input(1,{steer:0,gas:true,brake:false});sim.step(2);if(sim.state().tick<=st.tick)throw Error('Host departure stopped simulation '+track);
 results.push({track,tick:st.tick,events:st.environment.n,bytes:Buffer.byteLength(JSON.stringify(st)),elapsedMs:+(performance.now()-benchStart).toFixed(1)});console.log(`[preflight] PASS ${track}: ${st.tick} ticks, ${st.environment.n} events`);}
 return results;
}
module.exports={ROOT,REV,BUILD,TRACKS,MODULES,OVERLAYS,LEGACY_HASH,blobHash,patchLegacy,loadScripts,makeFactory,verify};
