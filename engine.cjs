'use strict';
// TTR server-side adapter: executes the exact published .148 race engine, in a
// separate VM per room, with presentation disabled. No browser or player host.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'.ttr-engine');
const REV='c8b05794a344fab64f83d2f5ad6ca66e530f2b27',BUILD='0.13.6.148';
const TRACKS=Object.freeze(['colazione-turbo','box-di-biliardo','desk-drift','bagno-sprint','garage-grid']);
const MODULES=Object.freeze(['01-core.js','07a-race-grid-logic.js','07b-race-powerups-logic.js','07c-race-driver-logic.js','07d-race-safety-logic.js','08a-race-progress-logic.js','08b-race-timing-logic.js','09a-race-cpu-logic.js','09b-race-oil-logic.js','09c-race-pickup-logic.js','09d-race-collision-logic.js','11b-race-flow.js','15-box-biliardo-track.js','15b-box-biliardo-rules.js','16-desk-drift-track.js','20-garage-grid.js','16b-desk-drift-rules.js','17-bagno-sprint-track.js','17b-bagno-sprint-rules.js','18-diagnostics-history.js','19-environment-events.js','06-game-legacy.js']);
const blobHash=b=>crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const LEGACY_HASH='796cd80f457a7fb4977c267deff8db350dd572c2';
function patchLegacy(s){
 const replace=(a,b)=>{if(s.split(a).length!==2)throw Error('Engine adapter incompatible: '+a.slice(0,80));s=s.replace(a,b);};
 // Keep worldInit's exact colliders, but skip painting and static sprite work.
 replace('paintWorld();paintBridgeDeck();','');
 replace('function onlineSend(obj){if(onlineSocket?.readyState===WebSocket.OPEN)onlineSocket.send(JSON.stringify(obj));}','function onlineSend(){}');
 replace('for(const o of props)prepareRaceProp(o);','');
 replace('const carIndex=own?own.car:i===0?pr:mode===\'online\'?i%7:opponents[i-1]','const carIndex=own?own.car:mode===\'online\'?i%7:i===0?pr:opponents[i-1]');
 replace('function inputFor(c){const ctl=',"function inputFor(c){if(race?.mode==='online'&&onlineSession?.members[c.id])return onlineHostInput(c);const ctl=");
 replace('v&&performance.now()-v.at<500?{steer:v.steer,gas:v.gas,brake:v.brake}:{steer:0,gas:false,brake:true}','v&&performance.now()-v.at<500?{steer:v.steer,gas:v.gas,brake:v.brake}:{steer:0,gas:false,brake:false}');
 // Reuse the original network serialization. Capture it internally instead of
 // transmitting it over an imaginary WebSocket. The server owns race.time.
 replace('function onlineBroadcast(dt){','function authoritativeSnapshot(){');
 replace('if(performance.now()-onlineLastSnapshot<TTR_NET.snapshotIntervalMs)return;\n onlineLastSnapshot=performance.now();','');
 replace("onlineSend({type:'snapshot',state:{trackId:race.trackId,environment:","return {trackId:race.trackId,environment:");
 replace('bathBrushOil:!!o.bathBrushOil}))}});','bathBrushOil:!!o.bathBrushOil})),finished:race.finished};');
 // No client UI startup or debug API in the engine process.
 const marker='onlineWire();worldInit();window.TTRAssets?.ready.then';
 if(s.split(marker).length!==2)throw Error('Engine startup marker missing');
 s=s.slice(0,s.indexOf(marker))+`
 window.__TTRServer=Object.freeze({
   start(config){
     onlineSession={host:true,slot:config.members[0].slot,capacity:config.capacity,members:Array(config.capacity).fill(null),trackId:config.track,allLoaded:false};
     for(const m of config.members)onlineSession.members[m.slot]=m;
     onlineRemoteInputs={};selectedTrackId=config.track;worldInit();initRace('online');
     return {track:race.trackId,carCount:race.cars.length};
   },
   loaded(){onlineSession.allLoaded=true;},
   input(slot,ctl){if(onlineSession.members[slot])onlineRemoteInputs[slot]={steer:ctl.steer,gas:ctl.gas,brake:ctl.brake,at:performance.now()};},
   item(slot){const c=race.cars[slot];if(onlineSession.allLoaded&&onlineSession.members[slot]&&c&&!c.done&&!race.finished&&race.countdown<=0)useItem(c);},
   leave(slot){onlineSession.members[slot]=null;delete onlineRemoteInputs[slot];if(race.player.id===slot){const next=onlineSession.members.find(Boolean);if(next)race.player=race.cars[next.slot];}},
   step(n){for(let i=0;i<n&&!race.finished;i++){globalThis.__clock+=1000/60;update(1/60,false);globalThis.__tick++;}},
   state(){const s=authoritativeSnapshot();s.tick=globalThis.__tick;return s;},
   results(){return race.cars.map(c=>({id:c.id,done:c.done,finishTime:c.finishTime??null}));}
 });
 })();\n`;
 return s;
}
function loadScripts(root=ROOT){
 const version=fs.readFileSync(path.join(root,'version.txt'),'utf8').trim();if(version!==BUILD)throw Error('Wrong engine source version '+version);
 return MODULES.map(name=>{const file=fs.readFileSync(path.join(root,'js',name));if(name==='06-game-legacy.js'&&blobHash(file)!==LEGACY_HASH)throw Error('Legacy source hash differs from verified .148 package');return new vm.Script(name==='06-game-legacy.js'?patchLegacy(file.toString('utf8')):file.toString('utf8'),{filename:name});});
}
function makeContext(){
 const noop=()=>{},canvas=Object.freeze({clearRect:noop});
 const element=()=>{const o={style:{},dataset:{},hidden:true,innerHTML:'',textContent:'',value:'',classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},getContext:()=>canvas,addEventListener:noop,setAttribute:noop,append:noop,appendChild:noop,replaceChildren:noop,remove:noop,blur:noop,querySelectorAll:()=>[]};o.parentElement=o;o.querySelector=()=>o;o.closest=()=>o;return o;};
 const nodes=new Map(),document={body:element(),hidden:false,visibilityState:'visible',getElementById:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,querySelector:element,querySelectorAll:()=>[],addEventListener:noop,hasFocus:()=>true};
 const muted={sfx:noop,music:noop,stopMusic:noop,syncEngine:noop,setRaceContext:noop,unlock:()=>Promise.resolve(false),status:()=>({muted:true}),getSettings:()=>({muted:true})};
 const context=vm.createContext({document,console,innerWidth:926,innerHeight:428,devicePixelRatio:1,localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},addEventListener:noop,removeEventListener:noop,requestAnimationFrame:noop,cancelAnimationFrame:noop,setTimeout:noop,clearTimeout:noop,Audio:function(){},performance:{now:()=>context.__clock},__clock:0,__tick:0,
 TTRSound:muted,TTRGameParts:{},TTRGameEffectsVisuals:{},TTRCanvasPrimitives:{},TTRBoxVisuals:{render:noop},TTRDeskVisuals:{render:noop},TTRBathVisuals:{render:noop},TTRHudVisuals:{render:noop},TTRMinimapVisuals:{createRaceMiniBase:()=>null},TTRI18N:{t:k=>k,getLang:()=> 'it'},TTRModeTrial:{setTrack:noop},TTRModeElimination:{create:()=>({})},TTRRaceResults:{create:()=>({showResults:noop,cancelMusicTimer:noop})},TTRVehicleVisuals:{TTRShowroomStarts:{},TTRShowroom60:{}}},{name:'TTR race engine',codeGeneration:{strings:false,wasm:false}});
 context.window=context;
 return context;
}
function makeFactory(scripts){
 return config=>{const ctx=makeContext();for(const script of scripts)script.runInContext(ctx,{timeout:1000});
 // Garage visual function is defined in its geometry script. Replace only the renderer.
 ctx.TTRGarageVisuals={render:()=>{}};
 const api=ctx.__TTRServer;if(!api)throw Error('No authoritative race API');
 const created=api.start(JSON.parse(JSON.stringify(config)));if(created.track!==config.track||created.carCount!==config.capacity)throw Error('Wrong initialized track or grid');
 const tick=new vm.Script('__TTRServer.step(__steps)');
 return {loaded:()=>api.loaded(),input:(slot,ctl)=>api.input(slot,ctl),item:slot=>api.item(slot),leave:slot=>api.leave(slot),step:n=>{ctx.__steps=n;tick.runInContext(ctx,{timeout:150});},state:()=>JSON.parse(JSON.stringify(api.state())),results:()=>JSON.parse(JSON.stringify(api.results()))};};
}
function verify(factory){
 const results=[];
 for(const track of TRACKS){const members=[{slot:0,car:0,name:'A',ready:true,host:true},{slot:1,car:1,name:'B',ready:true,host:false}],sim=factory({track,capacity:4,members});
 const initial=sim.state();sim.step(12);if(sim.state().countdown!==initial.countdown)throw Error('Countdown advanced before load: '+track);
 sim.loaded();for(let i=0;i<600;i++){sim.input(0,{steer:0,gas:true,brake:false});sim.input(1,{steer:.2,gas:true,brake:false});sim.step(2);}
 const st=sim.state();if(st.trackId!==track||st.cars.length!==4||!st.cars.every(c=>[c.x,c.y,c.a,c.s,c.p].every(Number.isFinite))||st.time<15||!st.environment||st.environment.e<15||st.environment.n<1)throw Error('Invalid live simulation '+track);
 if(Math.hypot(st.cars[0].x-initial.cars[0].x,st.cars[0].y-initial.cars[0].y)<1&&st.cars[0].sr===0)throw Error('No human movement '+track);
 sim.leave(0);sim.input(1,{steer:0,gas:true,brake:false});sim.step(2);if(sim.state().tick<=st.tick)throw Error('Host departure stopped simulation '+track);
 results.push({track,tick:st.tick,events:st.environment.n,bytes:Buffer.byteLength(JSON.stringify(st))});}
 return results;
}
module.exports={ROOT,REV,BUILD,TRACKS,MODULES,LEGACY_HASH,blobHash,patchLegacy,loadScripts,makeFactory,verify};
