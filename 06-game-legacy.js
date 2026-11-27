

/* Tiny Track Rivals — indipendent playable 2.5D HTML Canvas vertical slice. MIT-like original project code. */
(()=>{'use strict';
const Base=window.TTRCore,B=window.TTRBoxTrack,BR=window.TTRBoxRules,Desk=window.TTRDeskTrack,Bath=window.TTRBathTrack,Garage=window.TTRGarageTrack;
let D=Desk,DR=window.TTRDeskRules;
let circuitId='colazione-turbo';const isBox=()=>circuitId==='box-di-biliardo',isBath=()=>circuitId==='bagno-sprint',isGarage=()=>circuitId==='garage-grid',isDesk=()=>circuitId==='desk-drift'||isBath()||isGarage(),isBreakfast=()=>!isBox()&&!isDesk();
let WORLD_W=Base.WORLD_W,WORLD_H=Base.WORLD_H,TRACK_LENGTH=Base.TRACK_LENGTH,LANE_HALF=Base.LANE_HALF,shortcutFrom=Base.shortcutFrom,shortcutTo=Base.shortcutTo,pickupSegments=Base.pickupSegments,shortcutSamples=Base.shortcutSamples,sectionNames=Base.sectionNames,sectionRanges=Base.sectionRanges;
const breakfastPoints=Array.from({length:520},(_,i)=>Base.trackPoint(i/520));
const trackPoint=p=>isDesk()?D.point(p):isBox()?B.point(p):Base.trackPoint(p),tangent=p=>isDesk()?D.tangent(p):isBox()?B.tangent(p):Base.tangent(p);
const nearestTrack=(p,unused)=>Base.nearestTrack(p,isDesk()?D.points:isBox()?B.points:breakfastPoints),nearestTrackWindow=(p,unused,a,w)=>Base.nearestTrackWindow(p,isDesk()?D.points:isBox()?B.points:breakfastPoints,a,w);
const nearestCourse=(p,unused)=>!isBreakfast()?{...nearestTrack(p),shortcut:false}:Base.nearestCourse(p,breakfastPoints);
const shortcutPoint=t=>isDesk()?D.shortcutPoint(t):isBox()?B.point(B.entry+(B.exit-B.entry)*t):Base.shortcutPoint(t),shortcutNearest=p=>isDesk()?D.shortcutNearest(p):isBox()?{...nearestTrack(p),distance:Infinity,t:0}:Base.shortcutNearest(p);
const edgeOfTable=c=>Base.edgeOfTable(c,WORLD_W,WORLD_H),bridgeLaneViolation=(...a)=>isBreakfast()&&Base.bridgeLaneViolation(...a);
const K={...Base,trackPoint,tangent,nearestTrack,nearestTrackWindow,nearestCourse,shortcutPoint,shortcutNearest,edgeOfTable,bridgeLaneViolation};
for(const k of ['WORLD_W','WORLD_H','TRACK_LENGTH','LANE_HALF','shortcutFrom','shortcutTo'])Object.defineProperty(K,k,{get:()=>({WORLD_W,WORLD_H,TRACK_LENGTH,LANE_HALF,shortcutFrom,shortcutTo})[k]});
const {clamp,mod,angleDiff,distance,junctionPhaseHop,phaseGap,circleRotatedRect,clawTarget,jamHit,profiles,pickupCount,rampEntryVisual,rampLaunch,resolveCarContacts,resolveCarObstacle,resolveBorderContact,stepDriveSpeed,pickupType,offTrackDynamics,wideCornerRecovery,spoonContactZone,insideTrackLoop,shortcutViolation,illegalRouteGain,mugBendGate,finishGateCrossing,finishLinePlane,stuckRecoveryStep,oilHit,clawPullStep,ttrCalibratedProfile}=K;
const {drawKnife,drawRamp}=window.TTRGameParts;
const {drawClawCable,renderOil,renderEffect}=window.TTRGameEffectsVisuals;
const $=id=>document.getElementById(id);
const canvas=$('game'),g=canvas.getContext('2d',{alpha:false}),mini=$('mini'),mg=mini.getContext('2d');
let sw=0,sh=0,dpr=0,scale=1,camX=WORLD_W/2,camY=WORLD_H/2,world=null;
let elimCameraId=null,elimCameraProgress=0,elimFocusWeight=0,elimCandidateId=null,elimCandidateSince=0,renderDelta=1/60;
let elimGridCamera={x:WORLD_W/2,y:WORLD_H/2};
let race=null,lastRaceSettings=null,frameTime=performance.now(),clock=0,lastHint=0,hint='';
const SND=window.TTRSound;
let qualityMode='auto',perfEnabled=false;try{const q=localStorage.getItem('ttr_quality');if(['auto','high','balanced','low'].includes(q))qualityMode=q;perfEnabled=localStorage.getItem('ttr_perf')==='1';}catch(_){}
function emptyPerf(){return {frames:0,elapsed:0,physics:0,render:0,steps:0,slow:0,maxFrameMs:0,slowFrames:[],slowFramesDropped:0,bins:[0,0,0,0,0,0]};}
let perfContext={},perfCars={},perfStats=emptyPerf(),perfTotal=emptyPerf(),perfReport='',perfLast=0,perfTouchAt=0,perfInputDelay=null,perfInputSamples=[],perfRecoveries=[],perfRecoveryDropped=0,perfLastAudio=0,perfAudioPlaying=null;
const perfHistory=window.TTRDiagnosticHistory.create((()=>{try{return localStorage;}catch(_){return null;}})());
const perfArchived=new WeakSet();
function perfArchiveCompleted(session){if(!session||(!session.finished&&session.mode!=='online')||!perfTotal.frames||perfArchived.has(session))return;try{if(perfHistory.add(perfSnapshot(session))){perfArchived.add(session);refreshPerfHistoryUI();}}catch(e){console.warn('Diagnostic archive failed',e);}}
function refreshPerfHistoryUI(){const el=$('ttrPerfHistoryStatus');if(!el)return;const st=perfHistory.status();el.textContent=`Report: ${st.count}/${st.limit}${st.trimmed?' · rimossi: '+st.trimmed:''}${st.persistent?'':' · solo memoria (salvataggio non disponibile)'}`;const b=$('ttrPerfHistoryExport');if(b)b.disabled=!st.count;}
function recordPerf(bucket,raw,sim,draw,steps,detail=null){bucket.frames++;bucket.elapsed+=raw;bucket.physics+=sim;bucket.render+=draw;bucket.steps+=steps;const ms=raw*1000;bucket.maxFrameMs=Math.max(bucket.maxFrameMs,ms);if(ms>40)bucket.slow++;if(detail&&ms>35){if(bucket.slowFrames.length<160)bucket.slowFrames.push({ms:+ms.toFixed(2),simMs:+sim.toFixed(3),renderJsMs:+draw.toFixed(3),steps,...detail});else bucket.slowFramesDropped++;}bucket.bins[ms<=18?0:ms<=25?1:ms<=35?2:ms<=45?3:ms<=60?4:5]++;}
function summarizePerf(b){if(!b.frames)return null;const n=b.frames;return {frames:n,seconds:+b.elapsed.toFixed(2),fps:+(n/Math.max(.001,b.elapsed)).toFixed(2),simMs:+(b.physics/n).toFixed(3),renderJsMs:+(b.render/n).toFixed(3),simulationSteps:b.steps,framesOver40ms:b.slow,maxFrameMs:+b.maxFrameMs.toFixed(2),slowFrames:b.slowFrames,slowFramesDropped:b.slowFramesDropped,frameBins:{le18:b.bins[0],le25:b.bins[1],le35:b.bins[2],le45:b.bins[3],le60:b.bins[4],gt60:b.bins[5]}};}
function markPerfInput(){if(perfEnabled&&race&&!race.paused&&!race.finished&&race.countdown<=0&&!document.hidden&&innerWidth>=innerHeight&&!perfTouchAt)perfTouchAt=performance.now();}
function measurePerfInput(){if(!perfTouchAt)return;const delta=performance.now()-perfTouchAt;perfTouchAt=0;if(delta>=0&&delta<500){perfInputDelay=delta;if(perfInputSamples.length<4096)perfInputSamples.push(delta);}else perfInputDelay=null;}
function resetPerf(){perfCars={};perfStats=emptyPerf();perfTotal=emptyPerf();perfReport='';perfTouchAt=0;perfInputDelay=null;perfInputSamples=[];perfRecoveries=[];perfRecoveryDropped=0;}

const perfPanel=document.createElement('div');perfPanel.className='ttr-perf';perfPanel.hidden=true;document.body.appendChild(perfPanel);
// Diagnostics only: elimination resets the car state between rounds, not the report.
function perfSyncCounters(c,m,session=race){
 const round=session?.mode==='elimination'?session.elim.round:0;
 if(m._round!==round){if(m._round!==undefined)for(const k of Object.keys(m))if(k.startsWith('_last_'))m[k]=0;m._round=round;m._baseRespawns=m.respawns||0;m._basePasses=m.passAttempts||0;m._crossAt=null;m._crossRamp=m.ramps||0;m._crossRecovery=m.respawns||0;}
 m.respawns=(m._baseRespawns||0)+(c.shortcutRespawns||0);
 m.passAttempts=(m._basePasses||0)+(c.aiPassAttempts||0);
 if(c.lastPenaltyReason){m.lastPenalty=c.lastPenaltyReason;m.reason=c.lastPenaltyReason;}
 for(const k of ['aiOilEncounters','aiOilDetours','aiOilCautions','oilHits','items_turbo','items_oil','items_claw','rampBoosts','cupApexVisits','cupGraceFrames','environmentBallHits','environmentContacts','environmentShortcutAvoids']){const v=c[k]||0,prev=m['_last_'+k]||0;m[k]=(m[k]||0)+(v>=prev?v-prev:v);m['_last_'+k]=v;}
 m.decisions=c.shortcutDecisionCount||0;m.attempts=c.shortcutAttemptCount||0;
 if(['desk-drift','bagno-sprint','garage-grid'].includes(session?.trackId)){const names=['shortcutEntered','shortcutCompleted','shortcutFailed','towelJumps'];for(const k of names){const v=c[k]||0,prev=m['_last_'+k]||0;m[k]=(m[k]||0)+(v>=prev?v-prev:v);m['_last_'+k]=v;}}
}
function perfRecordLap(m){
 if(race.mode==='elimination'){
  const round=race.elim.round,now=race.time;
  (m.lineCrossings??=[]).push({round,time:+now.toFixed(3),roundTime:+race.elim.roundTime.toFixed(3),fullLap:m._crossAt!=null});
  if(m._crossAt!=null){const time=+(now-m._crossAt).toFixed(3);m.lapTimes.push(time);(m.lapDetails??=[]).push({round,time,ramps:m.ramps-m._crossRamp,respawns:m.respawns-m._crossRecovery});}
  m._crossAt=now;m._crossRamp=m.ramps;m._crossRecovery=m.respawns;return;
 }
 const lapTime=+(race.time-m.lapStart).toFixed(3);m.lapTimes.push(lapTime);const detail={time:lapTime,ramps:m.ramps-(m.lapRampStart||0),respawns:m.respawns-(m.lapRecoveryStart||0)};for(const k of ['shortcutEntered','shortcutCompleted','shortcutFailed','towelJumps'])if(k in m){detail[k]=m[k]-(m['_lap_'+k]||0);m['_lap_'+k]=m[k];}(m.lapDetails??=[]).push(detail);m.lapRampStart=m.ramps;m.lapRecoveryStart=m.respawns;m.lapStart=race.time;
}
function perfPublicCar(m){const out=Object.fromEntries(Object.entries(m).filter(([k])=>!k.startsWith('_')));return {...out,average:+(m.sum/Math.max(m.seconds,.001)).toFixed(1)};}
function perfSnapshot(session=race){if(session&&perfEnabled)for(const c of session.cars){const m=perfCars[c.id];if(m)perfSyncCounters(c,m,session);}const input=perfInputSamples.slice().sort((a,b)=>a-b);return {runtimeFault:session?session.runtimeFault??null:perfContext.runtimeFault??null,completed:session?.finished??perfContext.completed??false,diagnosticCoverage:perfContext.coverage===false?'partial':'full',playerId:session?.player?.id??perfContext.playerId??0,build:"v0.13.6.153 · 14.25d-android-ai",htmlBuild:document.querySelector('meta[name="ttr-build"]')?.content??null,quality:perfContext.quality??qualityMode,metrics:perfReport,wholeRace:summarizePerf(perfTotal),inputLatency:{kind:(session?.mode??perfContext.mode)==='online'?'input-to-render-step':'input-to-local-simulation',samples:input.length,medianMs:input.length?+input[Math.floor(input.length/2)].toFixed(2):null,p95Ms:input.length?+input[Math.ceil(input.length*.95)-1].toFixed(2):null},environmentEvents:session?window.TTREnvironmentEvents.snapshot(session.environmentEvents):perfContext.environmentEvents??null,recoveries:session?.recoveryHistory??perfRecoveries,recoveriesDropped:session?.recoveryHistoryDropped??perfRecoveryDropped,cars:Object.values(perfCars).map(perfPublicCar),trackId:session?.trackId??perfContext.trackId,raceMode:session?.mode??perfContext.mode,serverAuthority:session?.serverAuthority??perfContext.serverAuthority??null,serverTick:session?.serverTick??perfContext.serverTick??null,network:session?.mode==='online'?(session.networkFinal||onlineReport()):perfContext.mode==='online'?onlineLastReport:null,bridgeEvents:session?.bridgeEvents??perfContext.bridgeEvents??[],bridgeEventsDropped:session?.bridgeEventsDropped??perfContext.bridgeEventsDropped??0,difficulty:session?.aiFactor??perfContext.difficulty};}
function perfAnomalies(snapshot){
 const {build,htmlBuild,trackId,raceMode,difficulty,wholeRace,inputLatency,recoveriesDropped}=snapshot;
 const events=snapshot.recoveries||[],counts={};for(const e of events)counts[e.reason]=(counts[e.reason]||0)+1;
 // Every recovery is represented; detailed trajectories are retained in the full JSON file.
 return {build,htmlBuild,trackId,raceMode,difficulty,wholeRace,inputLatency,recoveriesDropped,counts,
  cars:(snapshot.cars||[]).map(({id,model,respawns,lastPenalty,lapTimes,shortcutEntered,shortcutCompleted,shortcutFailed,towelJumps})=>({id,model,respawns,lastPenalty,lapTimes,shortcutEntered,shortcutCompleted,shortcutFailed,towelJumps})),
  columns:['car','reason','time','lap','round','x','y','phase','stablePhase','lastNear','lastDistance','decision'],
  recoveries:events.map(({car,reason,time,lap,round,x,y,phase,stablePhase,decision,trajectory})=>{const t=trajectory?.at(-1),r=v=>Number.isFinite(v)?+v.toFixed(5):null;return [car,reason,r(time),lap,round,r(x),r(y),r(phase),r(stablePhase),r(t?.near),r(t?.d),typeof decision==='string'?decision:decision?.kind??t?.decision??null];}),
  note:'Sintesi compatta: ogni riga segue columns; traiettorie complete nel report JSON.'};
}
async function perfExportJSON(){
 const button=$('ttrPerfExport'),snap=perfSnapshot(),name='TTR_'+(snap.trackId||'report')+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 return perfShareJSON(snap,name,button,'Esporta JSON');
}
async function perfExportHistory(){const snap=perfHistory.snapshot();if(!snap.races.length)return;return perfShareJSON(snap,'TTR_storico_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',$('ttrPerfHistoryExport'),'Esporta storico');}
async function perfShareJSON(snap,name,button,label){
 const data=JSON.stringify(snap,null,2),blob=new Blob([data],{type:'application/json'});
 if(typeof File==='function'&&navigator.share&&navigator.canShare){try{const file=new File([blob],name,{type:'application/json'});if(navigator.canShare({files:[file]})){await navigator.share({files:[file]});if(button)button.textContent=label;return;}}catch(e){if(e?.name==='AbortError')return;}}
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 if(button)button.textContent=label;
}
async function perfCopyAnomalies(){const report=JSON.stringify(perfAnomalies(perfSnapshot()));try{await navigator.clipboard.writeText(report);$('ttrPerfAnomalies').textContent='Anomalie copiate';}catch(_){window.prompt('Copia anomalie',report);}}
window.TTRPerformance={snapshot:()=>perfSnapshot(),anomalies:()=>perfAnomalies(perfSnapshot()),history:()=>perfHistory.snapshot()};
const points=breakfastPoints.slice();
const controls={left:false,right:false,brake:false};

// TTR Online Beta: server owns race simulation; clients send controls only.
// The organizer has lobby privileges, not physics authority.
const ONLINE_BETA_URL="wss://tiny-track-rivals-online-beta.onrender.com/ws-beta";
let onlineJoinRequest=null,onlineLobbyPending=false,onlineHandshakeTimer=null,onlineInputSeq=0,onlineEnvironmentSupported=false,onlinePendingSnapshot=null;
let onlineSocket=null,onlineSession=null,onlineRemoteInputs={},onlineLatest=null,onlineLastSend=0,onlineLastSnapshot=0,onlineFinishDeadline=0;
// v0.13.6.37: client-side VISUAL prediction and timestamped snapshot interpolation.
// Authoritative results, collision, pickups, lap count and respawn are server-owned.
// Requires the full-authoritative-153 capability on /ws-beta.
const TTR_NET={inputIntervalMs:33,snapshotIntervalMs:50};
const Net=window.TTROnlineNet;
let onlineTimeline=Net.timeline(),onlineInputHistory=[],onlineResumeTimer=null,onlineResumeUntil=0,onlineLastReport=null;
let onlineLastInputSignature='',onlineNetStats={};
function onlineResetSmooth(){onlineLastInputSignature='';onlineTimeline=Net.timeline();onlineInputHistory=[];onlineNetStats={snapshots:0,lastArrival:0,arrivalGapMs:null,jitterMs:null,maxCorrection:0,corrections:[],gaps:[],acks:[],rtts:[],disconnects:[],reconnects:0,teleports:0,inputs:0,server:null,firstTick:null,firstAt:null,lastTick:null,lastAck:null,staleFrames:0};}
onlineResetSmooth();
function onlineReport(){const n=onlineNetStats,t=onlineTimeline,span=n.firstAt==null?0:(n.lastArrival-n.firstAt)/1000;return {rttMs:onlineRttMs,rttP95Ms:Net.quantile(n.rtts,.95),snapshots:n.snapshots,snapshotHz:span>0?+(Math.max(0,n.snapshots-1)/span).toFixed(2):null,serverTickHz:span>0?+((n.lastTick-n.firstTick)/span).toFixed(2):null,arrivalGapP95Ms:Net.quantile(n.gaps,.95),jitterMs:t.jitter,bufferMs:t.delay,lateGaps:t.gaps,duplicateTicks:t.duplicates,maxCorrection:n.maxCorrection,correctionP95:Net.quantile(n.corrections,.95),inputAckP95Ms:Net.quantile(n.acks,.95),inputAcks:n.acks.length,inputs:n.inputs,lastAck:n.lastAck,teleports:n.teleports,staleFrames:n.staleFrames,disconnects:n.disconnects.slice(),reconnects:n.reconnects,server:n.server};}
function onlinePreserveReport(){if(race?.mode==='online'){race.networkFinal=onlineSocket||!race.networkFinal?onlineReport():race.networkFinal;race.serverAuthority=!!race.serverAuthority;onlineLastReport=race.networkFinal;}}
// Independent application RTT over WebSocket, measured client->Render->client.
// Not an estimate of host simulation latency. Missing replies remain unknown, never 0 ms.
let onlineRttMs=null,onlinePingSeq=0,onlinePingPending=null,onlineNextPing=0,onlinePingSupported=false;
function onlineRttDisplay(){
 const label=$('onlineLatency');if(!label)return;
 label.textContent=onlineRttMs==null?'RTT — ms':`RTT ${Math.round(onlineRttMs)} ms`;
 label.dataset.quality=onlineRttMs==null?'waiting':onlineRttMs<90?'good':onlineRttMs<180?'high':'poor';
}
function onlinePingTick(now){
 if(!onlinePingSupported||!onlineSocket||onlineSocket.readyState!==WebSocket.OPEN)return;
 if(onlinePingPending&&now-onlinePingPending.sent>6000){onlinePingPending=null;onlineRttMs=null;onlineRttDisplay();}
 if(now<onlineNextPing||onlinePingPending)return;
 const seq=++onlinePingSeq;onlinePingPending={seq,sent:now};onlineNextPing=now+3000;
 onlineSend({type:'ping',seq});
}
const onlineCarNames=profiles.map(p=>p.name);
let onlineRetryTimer=null,onlineDeadline=0,onlineAckTimer=null,onlineOutstanding=null;
function onlineClearAttempt(){clearTimeout(onlineRetryTimer);clearTimeout(onlineAckTimer);onlineRetryTimer=onlineAckTimer=null;onlineOutstanding=null;onlineDeadline=0;}
function onlineStatus(text){const el=$('onlineStatus');if(el)el.textContent=String(text);}
function onlineSend(obj){if(onlineSocket?.readyState===WebSocket.OPEN)onlineSocket.send(JSON.stringify(obj));}
function onlineCloseConnection(){
 onlinePreserveReport();clearTimeout(onlineResumeTimer);onlineResumeTimer=null;onlineResumeUntil=0;const sock=onlineSocket;onlineSocket=null;onlineSession=null;onlineLatest=null;onlineRemoteInputs={};
 clearTimeout(onlineHandshakeTimer);onlineHandshakeTimer=null;onlineLobbyPending=false;onlineClearAttempt();
 onlinePingPending=null;onlineRttMs=null;onlineNextPing=0;onlinePingSupported=false;onlineEnvironmentSupported=false;onlinePendingSnapshot=null;onlineJoinRequest=null;onlineRttDisplay();onlineResetSmooth();
 if(sock){if(sock.readyState===WebSocket.OPEN)try{sock.send(JSON.stringify({type:'leave'}))}catch(e){};sock.onclose=null;sock.onmessage=null;sock.onerror=null;sock.onopen=null;sock.close();}
 $('onlineGameTag').style.display='none';
}
function onlineOpenPanel(connect=true){
 $('onlineModal').hidden=false;
 // Retire obsolete manual server preferences; never use them for connection.
 try{localStorage.removeItem('ttr_online_beta_server');}catch(_){}
 $('onlineName').value=localStorage.getItem('ttr_online_name')||'';
 $('onlineCar').value=String(selectedCar<onlineCarNames.length?selectedCar:0);
 onlineRefreshRoom();
 if(connect&&!onlineSession)onlineEnsureConnection();
}
function onlineRefreshRoom(){
 const r=onlineSession,body=$('onlineMembers');body.replaceChildren();
 $('onlineRoomCode').textContent=r?.code?`SALA ${r.code}`:'';
 $('onlineCopy').hidden=!r?.code;
 $('onlineReady').disabled=!r||r.started;
 $('onlineStart').disabled=!r||!r.organizer||r.started||r.members.filter(Boolean).length<2||!r.members.filter(Boolean).every(m=>m.ready);
 $('onlineLeave').disabled=!r;$('onlineTrack').disabled=!!r&&(!r.organizer||!!r.started);
 if(!r)return;
 for(const m of r.members.filter(Boolean)){
  const chip=document.createElement('span');chip.className='online-member'+(m.ready?' ready':'');
  chip.textContent=`${m.slot+1}. ${m.name}${m.host?' ★':''} · ${onlineCarNames[m.car]} ${m.ready?'✓':''}`;
  body.appendChild(chip);
 }
 const me=r.members[r.slot];$('onlineReady').textContent=me?.ready?'✓ Pronto — annulla':'✓ Sono pronto';
 onlineStatus(`${r.members.filter(Boolean).length}/${r.capacity} giocatori reali · ${r.public?'pubblica':'privata'}. CPU riempiranno i posti liberi.`);
}
// One fixed endpoint, one connection, and at most one outstanding lobby request.
function onlineFlushLobbyRequest(){
 if(!onlineEnvironmentSupported||onlineSocket?.readyState!==WebSocket.OPEN||!onlineJoinRequest)return;
 const request=onlineJoinRequest;onlineJoinRequest=null;onlineOutstanding=request;
 onlineStatus('Accesso alla sala…');onlineSend(request);clearTimeout(onlineAckTimer);onlineAckTimer=setTimeout(()=>{if(onlineLobbyPending&&!onlineSession)onlineRetryLobby('Nessuna risposta dalla sala');},12000);
}
function onlineRetryLobby(reason){
 const req=onlineJoinRequest||onlineOutstanding,deadline=onlineDeadline;
 onlineCloseConnection();onlineRefreshRoom();
 if($('onlineModal').hidden||!deadline||Date.now()>=deadline){onlineStatus(reason+'. Riprova con un pulsante Online.');return;}
 onlineJoinRequest=req;onlineLobbyPending=!!req;onlineDeadline=deadline;onlineStatus('Server in risveglio o rete instabile… nuovo tentativo automatico.');
 onlineRetryTimer=setTimeout(()=>{onlineRetryTimer=null;if(!$('onlineModal').hidden)onlineEnsureConnection();},2500);
}
function onlineEnsureConnection(){
 if(onlineSocket&&onlineSocket.readyState<2){onlineFlushLobbyRequest();return;}
 // Preserve an action selected while the server is waking up.
 const request=onlineJoinRequest,pending=onlineLobbyPending,deadline=onlineDeadline||Date.now()+105000;
 onlineCloseConnection();onlineJoinRequest=request;onlineLobbyPending=pending;onlineDeadline=deadline;
 // HTTP wake-up in parallel; no response body or CORS permission needed.
 try{fetch('https://tiny-track-rivals-online-beta.onrender.com/health',{mode:'no-cors',cache:'no-store',signal:AbortSignal.timeout(65000)}).catch(()=>{});}catch(_){}
 onlineStatus('Connessione automatica al server… Se inattivo, può richiedere circa un minuto.');
 let sock;
 try{sock=new WebSocket(ONLINE_BETA_URL);}catch(e){onlineJoinRequest=null;onlineLobbyPending=false;onlineStatus('Connessione non disponibile. Riprova.');return;}
 onlineSocket=sock;
 onlineHandshakeTimer=setTimeout(()=>{if(onlineSocket!==sock||onlineEnvironmentSupported)return;onlineRetryLobby('Il server non ha risposto');},Math.max(1000,Math.min(35000,onlineDeadline-Date.now())));
 sock.onopen=()=>{if(onlineSocket!==sock)return;onlineStatus('Verifica compatibilità server…');onlineNextPing=performance.now()+450;};
 sock.onmessage=e=>{if(onlineSocket!==sock)return;let d;try{d=JSON.parse(e.data)}catch(_){return;}onlineOnMessage(d);};
 sock.onerror=()=>{if(onlineSocket===sock)onlineStatus('Server non raggiungibile. Controlla la connessione internet.');};
 sock.onclose=e=>{if(onlineSocket!==sock)return;if(race?.mode==='online'&&!race.finished&&onlineSession?.resumeToken){onlineResume(e);return;}const inGame=race?.mode==='online'||!!onlineSession?.started;if(!onlineSession){onlineRetryLobby('Connessione chiusa');return;}onlineCloseConnection();onlineRefreshRoom();if(inGame){mainMenu();onlineOpenPanel(false);onlineStatus('Connessione interrotta durante la gara.');}else onlineStatus('Connessione chiusa. Riprova con un pulsante Online.');};
}
function onlineConnect(kind){
 if(onlineSession){onlineStatus('Esci prima dalla sala corrente.');return;}
 if(onlineLobbyPending){onlineStatus('Accesso in corso…');return;}
 const name=$('onlineName').value.trim().slice(0,18)||'Pilota';
 const request={type:kind,name,eventVersion:153,protocol:2,track:$('onlineTrack').value,car:Number($('onlineCar').value),capacity:Number($('onlineCapacity').value)};
 if(kind==='join')request.code=$('onlineCode').value.trim().toUpperCase();
 if(kind==='join'&&!/^[A-Z0-9]{6}$/.test(request.code)){onlineStatus('Inserisci il codice della sala (6 caratteri).');return;}
 try{localStorage.setItem('ttr_online_name',name);}catch(e){}
 onlineJoinRequest=request;onlineLobbyPending=true;onlineDeadline=Date.now()+105000;onlineEnsureConnection();
}
function onlineOnMessage(d){
 if(d.type==='hello'){onlineEnvironmentSupported=d.protocol===2&&Array.isArray(d.features)&&d.features.includes('full-authoritative-153')&&d.carCount===profiles.length&&Array.isArray(d.tracks)&&window.TTREnvironmentEvents.TRACKS.every(t=>d.tracks.includes(t));onlinePingSupported=Array.isArray(d.features)&&d.features.includes('rtt_ping');if(!onlineEnvironmentSupported){onlineCloseConnection();onlineRefreshRoom();onlineStatus('Server non compatibile. Riprova dopo un aggiornamento.');return;}clearTimeout(onlineHandshakeTimer);onlineHandshakeTimer=null;onlineStatus('Server connesso. Scegli come giocare.');onlineFlushLobbyRequest();return;}
 if(d.type==='pong'){
  if(onlinePingPending && d.seq===onlinePingPending.seq){
   const elapsed=performance.now()-onlinePingPending.sent;
   if(elapsed>=0&&elapsed<6000){onlineRttMs=onlineRttMs==null?elapsed:onlineRttMs*.6+elapsed*.4;Net.append(onlineNetStats.rtts,elapsed);onlineRttDisplay();}
   onlinePingPending=null;
  }
  return;
 }
 if(d.type==='error'){if(onlineResumeUntil){onlineAbortResume(d.message||'Riconnessione rifiutata');return;}onlineClearAttempt();onlineLobbyPending=false;onlineJoinRequest=null;onlineStatus(d.message||'Errore di rete');return;}
 if(d.type==='joined'){onlineClearAttempt();onlineLobbyPending=false;onlineJoinRequest=null;onlineSession={slot:d.slot,code:d.code,resumeToken:d.resumeToken,host:false,organizer:!!d.host,public:false,capacity:4,members:[],started:false};onlineRefreshRoom();return;}
 if(d.type==='room_state'&&onlineSession){
  Object.assign(onlineSession,{code:d.code,public:d.public,capacity:d.capacity,started:d.started});
  const arr=Array(d.capacity).fill(null);
  for(const m of d.members)arr[m.slot]=m;
  onlineSession.members=arr;onlineSession.organizer=!!arr[onlineSession.slot]?.host;if(d.track&&window.TTREnvironmentEvents.TRACKS.includes(d.track))$('onlineTrack').value=d.track;
  onlineRefreshRoom();return;
 }
 if(d.type==='player_left'&&onlineSession){
  if(onlineSession.members[d.slot])onlineSession.members[d.slot]=null;
  delete onlineRemoteInputs[d.slot];
  onlineStatus('Un giocatore si è disconnesso: la CPU prende il suo posto.');return;
 }
 if(d.type==='race_start'&&onlineSession){
  if(!onlineEnvironmentSupported||d.authority!=='server'||!window.TTREnvironmentEvents.TRACKS.includes(d.track)){onlineStatus('Aggiorna il server /ws-beta e tutti i giocatori alla .153.');onlineSend({type:'leave'});onlineCloseConnection();onlineRefreshRoom();return;}
  onlineSession.trackId=d.track;onlineSession.allLoaded=false;onlinePendingSnapshot=null;
  onlineSession.started=true;onlineSession.members=Array(d.capacity).fill(null);
  for(const m of d.members)onlineSession.members[m.slot]=m;
  onlineSession.capacity=d.capacity;
  onlineLatest=null;onlineLastReport=null;onlineLastSnapshot=0;onlineLastSend=0;onlineInputSeq=0;onlineResetSmooth();
  $('onlineModal').hidden=true;
  $('onlineGameLabel').textContent=`ONLINE · ${onlineSession.code}`;
  $('onlineGameRole').textContent='SERVER · P'+(onlineSession.slot+1);
  onlineRttDisplay();$('onlineGameTag').style.display='flex';
  SND.unlock();openCircuitLoading('online');return;
 }
 if(d.type==='all_loaded'&&onlineSession&&d.track===onlineSession.trackId){onlineSession.allLoaded=true;onlineGuestSendInput(true);return;}
 if(d.type==='snapshot'&&onlineSession&&!onlineSession.host){
  if(!race){onlinePendingSnapshot=d.state;return;}onlineApplySnapshot(d.state);return;
 }
 if(d.type==='finish'&&onlineSession&&!onlineSession.host&&race?.mode==='online'&&!race.finished){
  race.time=Math.max(0,Number(d.time)||race.time);
  for(const res of d.results||[]){const c=race.cars[res.id];if(c){c.done=!!res.done;c.finishTime=res.finishTime??null;}}
  race.finished=true;onlinePreserveReport();SND.stopMusic();SND.sfx('finish');syncAudio();showResults();return;
 }
 if(d.type==='room_closed'){
  if(race?.mode==='online')onlineNetStats.disconnects.push({at:race.time,reason:d.reason||'room_closed'});
  const inGame=race?.mode==='online'||!!onlineSession?.started;onlineCloseConnection();if(inGame)mainMenu();onlineOpenPanel(false);onlineStatus(d.reason||'Sala chiusa. Riprova con un pulsante Online.');
 }
}
function onlineAbortResume(reason){if(!race||race.mode!=='online')return;onlineNetStats.disconnects.push({at:race.time,reason});onlinePreserveReport();onlineCloseConnection();mainMenu();onlineOpenPanel(false);onlineStatus(reason);}
function onlineResume(e){
 if(!onlineResumeUntil){onlineResumeUntil=Date.now()+14000;onlineNetStats.disconnects.push({at:race.time,code:e?.code??null,reason:String(e?.reason||'transport closed').slice(0,100),clean:e?.wasClean??false});releaseAllControls();}
 onlineSocket=null;onlinePingPending=null;onlinePingSupported=false;onlineEnvironmentSupported=false;$('onlineGameRole').textContent='RICONNESSIONE…';
 clearTimeout(onlineResumeTimer);if(Date.now()>=onlineResumeUntil){onlineAbortResume('Riconnessione scaduta');return;}
 onlineResumeTimer=setTimeout(()=>{if(!onlineResumeUntil||!onlineSession)return;let sock;try{sock=new WebSocket(ONLINE_BETA_URL);}catch(_){onlineResume();return;}onlineSocket=sock;
  const timeout=setTimeout(()=>{if(onlineSocket===sock&&onlineResumeUntil){onlineSocket=null;sock.close();onlineResume();}},3500);
  sock.onmessage=e=>{if(onlineSocket!==sock)return;let d;try{d=JSON.parse(e.data);}catch(_){return;}
   if(d.type==='hello'){if(d.protocol!==2||!d.features?.includes('full-authoritative-153')){clearTimeout(timeout);onlineAbortResume('Server non compatibile');return;}sock.send(JSON.stringify({type:'resume',code:onlineSession.code,token:onlineSession.resumeToken,protocol:2,eventVersion:153}));return;}
   if(d.type==='resumed'){clearTimeout(timeout);onlineResumeUntil=0;onlineNetStats.reconnects++;onlineEnvironmentSupported=true;onlinePingSupported=true;onlineNextPing=0;onlineSession.allLoaded=true;onlineInputSeq=Math.max(onlineInputSeq,d.lastSeq||0);onlineLastSend=0;onlineLastInputSignature='';onlineTimeline=Net.timeline();for(const c of race.cars){c.netFrames=[];c.netPrediction=null;c.netCorrection=null;c.netRender=null;c.netSpecialCorrection=null;c.netAt=0;} $('onlineGameRole').textContent='SERVER · P'+(onlineSession.slot+1);onlineGuestSendInput(true);return;}
   onlineOnMessage(d);
  };sock.onclose=e=>{clearTimeout(timeout);if(onlineSocket===sock)onlineResume(e);};sock.onerror=()=>{};
 },500);
}
function onlineLocalInput(){
 const steer=(controls.right||keyDown('right')?1:0)-(controls.left||keyDown('left')?1:0);
 return {steer,gas:true,brake:!!(controls.brake||keyDown('brake'))};
}
function onlineHostInput(c){
 if(!onlineSession?.members[c.id])return null; // vacant slot => CPU
 const v=onlineRemoteInputs[c.id];
 return v&&performance.now()-v.at<500?{steer:v.steer,gas:v.gas,brake:v.brake}:{steer:0,gas:false,brake:true};
}
// Send steering changes at the INPUT EVENT rather than waiting for a future frame.
// Periodic refresh at 25Hz also recovers when a touch or packet is lost.
function onlineGuestSendInput(change=false){
 if(!race||race.mode!=='online'||!onlineSession||!onlineSession.allLoaded||onlineSession.host||race.finished||!onlineSocket||onlineSocket.readyState!==WebSocket.OPEN)return;
 const now=performance.now(),input=onlineLocalInput();
 const sig=`${input.steer}|${+input.gas}|${+input.brake}`;
 if(change){if(sig===onlineLastInputSignature)return;}
 else if(now-onlineLastSend<TTR_NET.inputIntervalMs)return;
 if(onlineSocket.bufferedAmount>16000)return;onlineLastSend=now;onlineLastInputSignature=sig;const seq=++onlineInputSeq;onlineInputHistory.push({seq,at:now,ctl:input});if(onlineInputHistory.length>180)onlineInputHistory.shift();onlineNetStats.inputs++;onlineSend({type:'input',seq,...input});
}
function onlineApplySnapshot(state){
 if(!race||race.mode!=='online'||!state||!Array.isArray(state.cars)||state.trackId!==race.trackId)return;
 const now=performance.now(),n=onlineNetStats,previous=onlineLatest;
 if(!Net.observe(onlineTimeline,state.tick,now))return;
 if(n.lastArrival){n.arrivalGapMs=now-n.lastArrival;Net.append(n.gaps,n.arrivalGapMs);}
 if(n.firstAt===null){n.firstAt=now;n.firstTick=state.tick;}n.lastArrival=now;n.lastTick=state.tick;n.snapshots++;n.jitterMs=onlineTimeline.jitter;n.server=state.server??n.server;
 const ack=state.inputAcks?.[onlineSession?.slot];if(Number.isSafeInteger(ack)&&ack>=0&&ack!==n.lastAck){const applied=onlineInputHistory.find(x=>x.seq===ack);if(applied)Net.append(n.acks,now-applied.at);n.lastAck=ack;onlineInputHistory=onlineInputHistory.filter(x=>x.seq>ack);}
 onlineLatest=state;race.serverAuthority=true;race.serverTick=state.tick;race.time=Number(state.time)||0;
 const prevCount=race.countdown;race.countdown=Number(state.countdown)||0;
 if(prevCount>0&&race.countdown<=0){SND.unlock().then(ok=>{if(ok){SND.sfx('go');SND.music('race');}});}else if(race.countdown>0&&Math.ceil(prevCount)!==Math.ceil(race.countdown))SND.sfx('count');
 if(Array.isArray(state.bridgeEvents))race.bridgeEvents=state.bridgeEvents;
 if(Array.isArray(state.recoveries))race.recoveryHistory=state.recoveries;
 const delta=previous&&state.tick>previous.tick?Math.min(.5,(state.tick-previous.tick)/60):0;
 for(const r of state.cars){const c=race.cars[r.i];if(!c||![r.x,r.y,r.a,r.s].every(Number.isFinite))continue;
  const first=c.netX===undefined,prior=c.netState,teleport=!!prior&&(r.sr||0)>(prior.sr||0);
  const visual={x:c.x,y:c.y,a:c.a};
  const sample={x:r.x,y:r.y,a:r.a,s:r.tf||r.bt?0:r.s,ms:state.tick*1000/60,visual:{jump:r.j,jumpTotal:r.jt,boost:r.bo,onBridge:!!r.db,rampEntryVisual:!!r.rev,bridgeExitVisual:r.bev||0,deskExitRamp:!!r.de,boxTransit:r.bt||0,boxEntryPose:r.bp||null,tableFalling:r.tf||0,tableSpin:r.ts||0,tableFallImpact:!!r.tfi,oilSpin:r.os||0,wheelPhase:r.wp||0,hitYaw:r.hy||0,bridgeFalling:r.bf||0},vx:(r.svx||0)+(r.hvx||0),vy:(r.svy||0)+(r.hvy||0)};
  const frames=c.netFrames||(c.netFrames=[]);if(teleport||first){frames.length=0;c.netPrediction=null;c.netCorrection=null;c.netRender=null;c.netSpecialCorrection=null;c.x=r.x;c.y=r.y;c.a=r.a;if(teleport)n.teleports++;}
  frames.push(sample);if(frames.length>20)frames.shift();
  c.netX=r.x;c.netY=r.y;c.netA=r.a;c.netAt=now;c.netState=r;c.netSteer=r.st||0;
  c.speed=r.s;c.p=r.p;c.lastP=r.p;c.lapsCompleted=r.l;c.jump=r.j;c.jumpTotal=r.jt;c.boost=r.bo;
  c.item=r.it;c.done=r.d;c.finishTime=r.ft??null;c.tableFalling=r.tf;c.tableSpin=r.ts;c.tableFallImpact=r.tfi;
  c.onBridge=!!r.db;c.deskExitRamp=!!r.de;c.boxTransit=Number(r.bt)||0;c.boxEntryPose=r.bp&&Number.isFinite(r.bp.x)&&Number.isFinite(r.bp.y)?r.bp:null;c.bridgeExitVisual=Number(r.bev)||0;c.rampEntryVisual=!!r.rev;
  c.oilSpin=r.os;c.oilSpinDir=r.od;c.wheelPhase=r.wp;c.hitYaw=r.hy;c.steer=r.st;c.skidVX=r.svx;c.skidVY=r.svy;c.shortcutRespawns=r.sr??0;c.lastPenaltyReason=r.pe||'';c.bridgeFalling=r.bf||0;c.claw=r.cl||0;c.clawTarget=Number.isInteger(r.ct)?race.cars[r.ct]||null:null;
  c.rampBoosts=r.rb||0;c.environmentContacts=r.ec||0;c.environmentBallHits=r.eb||0;c.items_turbo=r.ut||0;c.items_oil=r.uo||0;c.items_claw=r.uc||0;
  if(c===race.player&&prior&&race.countdown<=0){if(teleport)SND.sfx('respawn');else if(r.tf>0&&!prior.tf)SND.sfx('fall');else if(r.tfi&&!prior.tfi)SND.sfx('fallImpact');else if(r.rb>prior.rb)SND.sfx('ramp');else if(r.j>0&&!prior.j)SND.sfx('spoon');else if(!r.j&&prior.j)SND.sfx('landing');else if(r.os>0&&!prior.os)SND.sfx('oilSkid');else if(r.jm>0&&!prior.jm)SND.sfx('jamSurface');else if(r.uc>prior.uc)SND.sfx('claw');else if(r.uo>prior.uo)SND.sfx('oil');else if(r.l>prior.l)SND.sfx('lap');else if(r.bo>0&&!prior.bo)SND.sfx('turbo');else if(r.it&&!prior.it)SND.sfx('pickup');else if((r.hvx||r.hvy)&&Math.hypot(r.hvx||0,r.hvy||0)>Math.hypot(prior.hvx||0,prior.hvy||0)+25)SND.sfx('impact');}
  if(c===race.player&&onlineCanPredict(c)&&!onlineResumeUntil){
   const base={x:r.x,y:r.y,a:r.a,speed:r.s,jam:r.jm||0,boost:r.bo||0,slip:r.sl||0,hitYaw:r.hy||0,hvx:r.hvx||0,hvy:r.hvy||0,svx:r.svx||0,svy:r.svy||0,exit:r.ex||0,p:r.p,miss:r.bm||0};
   // Replay only a bounded visual lead; command acknowledgements identify the
   // controls already consumed by the server. Never replay authoritative effects.
   const lead=Math.min(150,Math.max(0,(onlineRttMs??90)/2+10));const start=now-lead;
   let ctl={steer:r.st||0,gas:r.gas!==false,brake:!!r.br};const pending=onlineInputHistory;
   for(let ms=0;ms<lead;ms+=1000/60){const at=start+ms;for(const h of pending){if(h.at<=at)ctl=h.ctl;else break;}onlineAdvanceDrive(base,c,ctl,Math.min(1000/60,lead-ms)/1000);}
   c.netRender=null;c.netSpecialCorrection=null;c.netPrediction=base;const err=first||teleport?0:Math.hypot(visual.x-base.x,visual.y-base.y);n.maxCorrection=Math.max(n.maxCorrection,err);Net.append(n.corrections,err);
   c.netCorrection=first||teleport?{x:0,y:0,a:0}:Net.correction(visual,base);
  }else {if(c===race.player&&c.netPrediction)c.netSpecialCorrection=null;c.netPrediction=null;c.netCorrection=null;}
  // These are snapshot observations, not authoritative per-step telemetry.
  if(perfEnabled&&race.countdown<=0){const m=perfCars[c.id]??={id:c.id,model:c.profile.name,seconds:0,sum:0,max:0,ramps:0,lapTimes:[],lapStart:0,source:'server-snapshots'};m.seconds+=delta;m.sum+=Math.abs(r.s)*delta;m.max=Math.max(m.max,Math.abs(r.s));m.ramps=c.rampBoosts;perfSyncCounters(c,m);if(prior&&r.l>prior.l){m.lapTimes.push(+(race.time-m.lapStart).toFixed(3));m.lapStart=race.time;}}
 }
 if(Array.isArray(state.pickups))race.pickups.forEach((p,i)=>{p.cool=state.pickups[i]??p.cool});
 if(Array.isArray(state.oils))race.oils=state.oils;if(Array.isArray(state.effects))race.effects=state.effects;window.TTREnvironmentEvents.applyNet(race.environmentEvents,state.environment,props,race,SND);
 syncAudio();
}
function onlineCanPredict(c){return !c.done&&race.countdown<=0&&!(c.tableFalling>0)&&!c.boxTransit&&!c.onBridge&&!(c.oilSpin>0)&&!(c.jump>0)&&!(c.deskExitRamp);}
function onlineAdvanceDrive(p,c,ctl,dt){
 const pr=c.profile,inJam=isBreakfast()&&jamHit(p,jamPatch);p.jam=inJam?.85:Math.max(0,p.jam-dt);
 const vmax=pr.max,acc=pr.acc*(p.jam>0?.4:1),boost=p.boost>0;p.boost=Math.max(0,p.boost-dt);p.slip=Math.max(0,p.slip-dt);p.miss=Math.max(0,p.miss-dt);
 p.speed=stepDriveSpeed(p.speed,ctl,dt,{max:vmax,acc},boost&&p.jam<=0);
 if(p.jam>0)p.speed=Math.sign(p.speed)*Math.min(Math.abs(p.speed),Math.max(Math.max(54,vmax*.46),Math.abs(p.speed)-385*dt));
 if(p.miss>0)p.speed=Math.sign(p.speed)*Math.min(Math.abs(p.speed),100);
 const exit=Math.max(0,p.exit||0),dur=isDesk()?DR.exitAssistDuration:BR.exitAssistDuration;
 if(exit>0&&p.speed>0){const u=clamp(1-exit/dur,0,1);p.speed=Math.min(p.speed,vmax*(.40+.60*u*u*(3-2*u)));}
 const surface=offTrackDynamics(!isBreakfast()?nearestTrackWindow(p,points,p.p,.047).distance:nearestCourse(p,points).distance);
 if(surface.outside)p.speed*=Math.max(.93,1-(1-surface.speedFactor)*dt*1.9);
 const bathGrip=isBath()?Bath.wetGrip(p):1,oldA=p.a;
 if(isBath()&&p.speed>0)p.speed=Math.max(0,p.speed-95*Bath.gradeAt(p.p)*dt);
 const turn=pr.turn*(.24+clamp(Math.abs(p.speed)/160,0,1)*.76)*(p.slip>0?.38:1)*surface.grip*bathGrip*(pr.gripFactor||1);
 if(exit>0&&p.speed>0&&!ctl.brake){const blend=clamp(1-exit/dur,0,1),target=(isDesk()?D:B).tangent(p.p+.005),corr=clamp(angleDiff(target,p.a),-.55,.55);p.a+=corr*Math.min(1,dt*4*(1-blend)*(1-.65*Math.min(1,Math.abs(ctl.steer))));p.a+=ctl.steer*turn*(.65+.35*blend)*dt;}else p.a+=ctl.steer*turn*(p.speed>=0?1:-.7)*dt;
 p.exit=Math.max(0,exit-dt);p.a+=p.hitYaw*dt;p.hitYaw*=Math.exp(-4*dt);
 if(isBath()&&bathGrip<1&&p.speed>0){const lat=Math.sin(oldA-p.a)*p.speed*(1-bathGrip)*1.35;p.svx-=Math.sin(p.a)*lat;p.svy+=Math.cos(p.a)*lat;const skid=Math.hypot(p.svx,p.svy),cap=Math.max(18,p.speed*.27);if(skid>cap){p.svx*=cap/skid;p.svy*=cap/skid;}}
 const slide=Math.exp(-(p.slip>0?.95:5.6)*(pr.gripFactor||1)*(pr.stabilityFactor||1)*bathGrip*dt);p.svx*=slide;p.svy*=slide;
 p.x+=(Math.cos(p.a)*p.speed+p.hvx+p.svx)*dt;p.y+=(Math.sin(p.a)*p.speed+p.hvy+p.svy)*dt;const hit=Math.exp(-6*(pr.stabilityFactor||1)*dt);p.hvx*=hit;p.hvy*=hit;
}
function onlineGuestStep(dt){
 if(!race||race.mode!=='online')return;
 if(!race.finished){const now=performance.now(),target=Net.playback(onlineTimeline,now,dt);
  for(const c of race.cars){if(c.netX===undefined)continue;const stale=now-c.netAt>350||!!onlineResumeUntil;
   if(c===race.player&&stale)onlineNetStats.staleFrames++;
   if(c===race.player&&onlineCanPredict(c)&&!stale&&c.netPrediction){const p=c.netPrediction;onlineAdvanceDrive(p,c,onlineLocalInput(),Math.min(.05,dt));const correction=c.netCorrection||{x:0,y:0,a:0};Net.decay(correction,dt);c.x=p.x+correction.x;c.y=p.y+correction.y;c.a=p.a+correction.a;continue;}
   if(c===race.player&&stale){c.netPrediction=null;continue;}
   const localTarget=onlineTimeline.lastTick*1000/60+Math.min(50,Math.max(0,(onlineRttMs??90)/2));
   const pose=Net.pose(c.netFrames,c===race.player?localTarget:target);if(!pose)continue;
   if(c===race.player){const correction=c.netSpecialCorrection??=Net.correction(c,pose);Net.decay(correction,dt);c.x=pose.x+correction.x;c.y=pose.y+correction.y;c.a=pose.a+correction.a;}else{c.x=pose.x;c.y=pose.y;c.a=pose.a;}c.netRender=pose.visual||null;
  }onlineGuestSendInput(false);
 }syncAudio();
}
function onlineAuthoritativeState(){
 const cars=race.cars.map(c=>({i:c.id,x:+c.x.toFixed(2),y:+c.y.toFixed(2),a:+c.a.toFixed(5),s:+c.speed.toFixed(2),p:c.p,l:c.lapsCompleted,j:c.jump,jt:c.jumpTotal,bo:c.boost,it:c.item,d:c.done,ft:c.finishTime,tf:c.tableFalling||0,ts:c.tableSpin||0,tfi:!!c.tableFallImpact,os:c.oilSpin||0,od:c.oilSpinDir||0,wp:c.wheelPhase||0,hy:c.hitYaw||0,st:c.steer||0,svx:c.skidVX||0,svy:c.skidVY||0,sr:c.shortcutRespawns||0,pe:c.lastPenaltyReason||'',db:!!c.onBridge,de:!!c.deskExitRamp,bt:c.boxTransit||0,bp:c.boxEntryPose||null,bev:c.bridgeExitVisual||0,rev:!!c.rampEntryVisual,hvx:c.hitVX||0,hvy:c.hitVY||0,sl:c.slip||0,jm:c.jamTimer||0,ex:c.boxExitAssist||c.deskExitAssist||0,bm:c.bridgeMissPenalty||0,rb:c.rampBoosts||0,ec:c.environmentContacts||0,eb:c.environmentBallHits||0,ut:c.items_turbo||0,uo:c.items_oil||0,uc:c.items_claw||0,bf:c.bridgeFalling||0,cl:c.claw||0,ct:c.clawTarget?.id??null,gas:onlineRemoteInputs[c.id]?.gas??true,br:onlineRemoteInputs[c.id]?.brake??false}));
 return {trackId:race.trackId,environment:window.TTREnvironmentEvents.net(race.environmentEvents,props),time:race.time,countdown:race.countdown,cars,pickups:race.pickups.map(p=>p.cool),oils:race.oils.map(o=>({x:o.x,y:o.y,t:o.t,r:o.r,owner:o.owner,phase:o.phase,deskDeck:!!o.deskDeck,bathBrushOil:!!o.bathBrushOil})),finished:race.finished,effects:race.effects.slice(-16).map(({kind,x,y,t,ttl,nx,ny,intensity})=>({kind,x,y,t,ttl,nx,ny,intensity})),bridgeEvents:(race.bridgeEvents||[]).slice(-24),recoveries:(race.recoveryHistory||[]).slice(-8).map(({car,reason,time,lap,x,y,phase})=>({car,reason,time,lap,x,y,phase}))};
}

function onlineFinish(){} // only the server decides results
function onlineQuit(){
 onlineCloseConnection();$('onlineModal').hidden=true;
 if($('pauseBtn')){$('pauseBtn').textContent='Ⅱ';$('pauseBtn').setAttribute('aria-label','Pausa');}
}
function onlineWire(){
 $('onlineClose').onclick=()=>onlineQuit();
 $('onlineCreate').onclick=()=>onlineConnect('create');
 $('onlineJoin').onclick=()=>onlineConnect('join');
 $('onlinePublic').onclick=()=>onlineConnect('find_public');
 $('onlineReady').onclick=()=>{const p=onlineSession?.members[onlineSession.slot];if(p)onlineSend({type:'ready',ready:!p.ready});};
 $('onlineStart').onclick=()=>{if(!onlineEnvironmentSupported){onlineStatus('Server non aggiornato: serve Online Beta .153 su /ws-beta.');return;}onlineSend({type:'start',track:$('onlineTrack').value});};
 $('onlineLeave').onclick=()=>{onlineQuit();onlineRefreshRoom();onlineStatus('Hai lasciato la sala.')};
 $('onlineCar').onchange=()=>{if(onlineSession)onlineSend({type:'car',car:Number($('onlineCar').value)});};
 $('onlineTrack').onchange=()=>{if(onlineSession?.organizer&&!onlineSession.started)onlineSend({type:'track',track:$('onlineTrack').value});};
 $('onlineCopy').onclick=()=>{const code=onlineSession?.code;if(!code)return;const fld=$('onlineCode');fld.value=code;fld.focus();fld.select();try{navigator.clipboard?.writeText(code)}catch(e){}};
}

const keys={};

const keyDefaults={left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],brake:['ArrowDown','KeyS'],power:['KeyE','Enter'],pause:['Escape']};
const keyLabels={left:'Sinistra',right:'Destra',brake:'Freno / Retro',power:'Power-up',pause:'Pausa'};
let keyMap=JSON.parse(JSON.stringify(keyDefaults));
const allowedKey=k=>typeof k==='string'&&/^(Arrow(Left|Right|Up|Down)|Key[A-Z]|Digit[0-9]|Space|Enter|Escape|Numpad[0-9])$/.test(k);
try{const m=JSON.parse(localStorage.getItem('ttr_keys_v1')||'null');if(m&&Object.keys(keyDefaults).every(k=>Array.isArray(m[k])&&m[k].length===keyDefaults[k].length&&m[k].every(allowedKey))&&new Set(Object.keys(keyDefaults).flatMap(k=>m[k])).size===Object.keys(keyDefaults).flatMap(k=>m[k]).length)keyMap=Object.fromEntries(Object.keys(keyDefaults).map(k=>[k,m[k]]));}catch(_){}
const keyDown=action=>!!keyMap[action]?.some(k=>keys[k]);
window.TTRKeyboard={down:keyDown};
function openKeyboardPanel(){
 if(document.querySelector('.ttr-key-panel'))return;
 releaseAllControls();for(const k in keys)delete keys[k];
 const el=document.createElement('section');el.className='ttr-key-panel';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Comandi tastiera');el.innerHTML='<div class="panel"><h2>COMANDI TASTIERA</h2><p>Seleziona un tasto, poi premi il nuovo comando.</p><div data-rows></div><p data-msg aria-live="polite"></p><div class="menu-row"><button class="btn" data-reset>PREDEFINITI</button><button class="btn secondary" data-close>INDIETRO</button></div></div>';
 document.body.append(el);let pending=null;const msg=el.querySelector('[data-msg]');
 function save(){try{localStorage.setItem('ttr_keys_v1',JSON.stringify(keyMap));}catch(_){msg.textContent='Salvataggio non disponibile';}}
 function draw(){const rows=el.querySelector('[data-rows]');rows.replaceChildren();for(const k of Object.keys(keyDefaults)){const row=document.createElement('div');row.className='ttr-key-row';const label=document.createElement('span');label.textContent=keyLabels[k];row.append(label);keyMap[k].forEach((code,i)=>{const b=document.createElement('button');b.className='btn secondary';b.textContent=code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Arrow/,'');b.onclick=()=>{pending=[k,i];msg.textContent='Premi un tasto per '+keyLabels[k];};row.append(b);});rows.append(row);}}
 function close(){window.removeEventListener('keydown',capture,true);el.remove();for(const k in keys)delete keys[k];$('ttrKeyboardSettings')?.focus();}
 function capture(e){if(!pending&&e.code==='Tab'){const items=[...el.querySelectorAll('button')];const i=items.indexOf(document.activeElement);if(items.length){e.preventDefault();e.stopImmediatePropagation();items[(i+(e.shiftKey?-1:1)+items.length)%items.length].focus();}return;}if(!pending&&(e.code==='Enter'||e.code==='Space')&&el.contains(document.activeElement)){e.stopImmediatePropagation();return;}e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(!pending){if(e.code==='Escape')close();return;}if(!allowedKey(e.code)){msg.textContent='Tasto non supportato';return;}const [k,i]=pending;if(Object.keys(keyMap).some(a=>keyMap[a].some((v,j)=>v===e.code&&(a!==k||j!==i)))){msg.textContent='Tasto già assegnato';return;}keyMap[k][i]=e.code;pending=null;msg.textContent='Comando aggiornato';save();draw();}
 window.addEventListener('keydown',capture,true);el.querySelector('[data-close]').onclick=close;el.querySelector('[data-reset]').onclick=()=>{keyMap=JSON.parse(JSON.stringify(keyDefaults));pending=null;msg.textContent='Predefiniti ripristinati';save();draw();};draw();el.querySelector('[data-close]').focus();
}

const vehiclePalette=['#ef3d3d','#2987ee','#f4b942','#31ce98','#9447b4','#ef8f35','#f2f0e8','#2ca6bb'];
const typeNames={turbo:'TURBO',oil:'OLIO',claw:'PINZA'};
const track=(()=>{const c=document.createElement('canvas');c.width=WORLD_W;c.height=WORLD_H;return c;})();
const trackCtx=track.getContext('2d');
// Cached transparent deck: draw above road cars and below shortcut cars to express elevation.
const bridgeLayer=document.createElement('canvas');bridgeLayer.width=WORLD_W;bridgeLayer.height=WORLD_H;
const bridgeCtx=bridgeLayer.getContext('2d');
const props=[];
const milkCerealSpills=[]; // Static environmental hazards. Owner -1 means all cars can slip.
const knifePhase=.747;
const stickyAt=trackPoint(.758),stickyAngle=tangent(.758);
const jamNormal={x:-Math.sin(stickyAngle),y:Math.cos(stickyAngle)};
const jamPatch={x:stickyAt.x+jamNormal.x*32,y:stickyAt.y+jamNormal.y*32,rx:59,ry:96,r:110,angle:stickyAngle,coverage:192,laneWidth:256}; // covers -64..+128 from road center, leaving 64 for a longer outer line
// Fase 6g: primitive grafiche importate dal modulo dedicato.
const {drawPoly,capsule,rounded,colorMix,shadow}=window.TTRCanvasPrimitives;
function route(ctx){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
function addProp(p,t,side,r,solid=true){const at=trackPoint(p),a=tangent(p),nx=-Math.sin(a),ny=Math.cos(a);props.push({x:at.x+nx*side,y:at.y+ny*side,r,type:t,solid});}
function drawCrumb(ctx,x,y,r,seed){ctx.save();ctx.translate(x,y);ctx.rotate((seed*1.731)%Math.PI);ctx.fillStyle='#472816bd';ctx.beginPath();ctx.ellipse(2,4,r*1.12,r*.69,0,0,Math.PI*2);ctx.fill();drawPoly(ctx,[[-r*.97,-r*.3],[-r*.43,-r*.92],[r*.55,-r*.70],[r,.08],[r*.32,r*.78],[-r*.82,r*.66]],seed%3===0?'#d49448':seed%3===1?'#f2c276':'#b66d2c','#784321',1.15);ctx.strokeStyle='#fff3b8ba';ctx.lineWidth=1.05;ctx.beginPath();ctx.moveTo(-r*.5,-r*.28);ctx.lineTo(r*.28,-r*.54);ctx.stroke();ctx.restore();}
function worldInit(){
  props.length=0;milkCerealSpills.length=0;
  if(isDesk()){props.push(...D.props.map(o=>({...o})),...(!isBath()?D.movable.map(o=>({...o})):[]));(isBath()?window.TTRBathVisuals:isGarage()?window.TTRGarageVisuals:window.TTRDeskVisuals).render(trackCtx,bridgeCtx);return;}
  if(isBox()){props.push(...BR.obstacles());const original=B.balls.slice();try{B.balls.splice(0,B.balls.length,...original.filter(o=>!BR.movableBall(o)));window.TTRBoxVisuals.render(trackCtx);}finally{B.balls.splice(0,B.balls.length,...original);}bridgeCtx.clearRect(0,0,WORLD_W,WORLD_H);return;}
  // Interactive props are deliberately few: props not marked solid never obstruct racing.
  addProp(.231,'mug',-188,58,true);props.at(-1).tall=true;        // Mug Bend
  // Removed confusing spiral/cereal decoration at the end of the second bend.
  addProp(.512,'orange',163,49,false);    // Orange Jump background
  const op=trackPoint(.502),oa=tangent(.502);props.push({type:'orange_bump',x:op.x+Math.sin(oa)*32,y:op.y-Math.cos(oa)*32,r:29,solid:false,jump:false,interactive:true});
  // v0.13.6.68: upright physical bowl; TWO irregular, rounded-edge milk stains.
  // Left stain is small; right stain is elongated and extends further from the bowl.
  // Neither milk puddle is an occluding sprite or a solid obstacle.
  props.push({type:'milk_cereal_cup',x:570,y:927,r:73,solid:true,scenery:false,interactive:true,tall:true});
  const cerealPatches=[
    {x:490,y:1016,rx:53,ry:28,angle:-.10,spillShape:'left'},
    {x:690,y:1028,rx:117,ry:37,angle:.07,spillShape:'right'}
  ];
  for(const p of cerealPatches){
    const spot={...p,r:Math.max(p.rx,p.ry),type:'milk_cereal_spill',owner:-1,
      solid:false,scenery:true,interactive:false};
    milkCerealSpills.push(spot);props.push(spot);
  }
  // Tipped jar attached to the jam spill, not a standing jar floating elsewhere.
  const jnx=-Math.sin(stickyAngle),jny=Math.cos(stickyAngle);
  props.push({type:'jam_spill_jar',x:jamPatch.x+jnx*198,y:jamPatch.y+jny*198,r:64,solid:true,scenery:false,interactive:true,tall:true});
  addProp(.913,'cookie',168,44,true);    // Placemat Return
  // A low breakfast knife lies transversally across the lane just before the jam.
  const sp=knifePhase,at=trackPoint(sp),a=tangent(sp),nx=-Math.sin(a),ny=Math.cos(a);
  const knifeLength=168,knifeBladeInLane=102.4; // 2/5 of 256-unit lane; stainless handle outside
  props.push({type:'knife',x:at.x+nx*126,y:at.y+ny*126,r:11,angle:Math.atan2(-ny,-nx),solid:true,interactive:true,segment:sp,length:knifeLength,bladeInLane:knifeBladeInLane,jumpBladeStart:0,jumpBladeEnd:102.4,jumpTriggerHalfAcross:10});
  // v80: locate the entrance ramp at the BEGINNING of the optional shortcut,
  // not eight percent down the toast where a car has already entered it.
  const launch=shortcutPoint(.018),next=shortcutPoint(.055),ang=Math.atan2(next.y-launch.y,next.x-launch.x);
  props.push({type:'ramp',x:launch.x,y:launch.y,r:44,a:ang,solid:false,jump:true,shortcut:true,segment:shortcutFrom});
  // World building: oversize breakfast props, not random obstacles in the lane.
  const scenery=[
    ['cookie',725,860,34],['cookie_alt',1100,890,36],
    ['mug',1750,1040,51],['toast',1530,950,49],['cereal',1770,440,57],
    ['orange',1250,165,48],
    ['glass',2050,1130,42],['cookie',585,160,39],
    ['plate_croissant',1190,65,62],['toast',2000,280,55],['mug',200,1150,53]
  ];
  for(const [type,x,y,r] of scenery){
    // Move decorative pieces if they would overlap a lane: clearance uses real route/shortcut.
    const near=nearestCourse({x,y},points);
    if(near.distance<r*.70+97)continue;
    const tall=['mug','glass','plate_croissant','cereal'].includes(type),solid=tall||['cookie','cookie_alt','toast'].includes(type);props.push({type,x,y,r,solid,tall,scenery:!solid,interactive:solid});
  }
  props.filter(o=>o.type==='cookie'||o.type==='cookie_alt').forEach((o,i)=>{o.cookieKind=o.type==='cookie_alt'?'cookie_alt':i%2?'cookie_alt':'cookie';o.collisionR=o.r*.83;});
  props.filter(o=>o.type==='toast').forEach(o=>{o.collisionR=o.r*.77;});
  paintWorld();paintBridgeDeck();
  // Prepare static sprites outside the race loop; assets-ready rebuild replaces fallbacks.
  for(const o of props)prepareRaceProp(o);
}

function drawMug(ctx,x,y,r,fill='#f3efe7'){
 if(window.TTRAssets?.draw(ctx,'mug',x-r*1.23,y-r*1.10,r*2.45,r*2.45))return;
 ctx.save();ctx.translate(x,y);ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(0,0,r,r*.76,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawCookie(ctx,x,y,r,rot=0,variant='cookie'){
 ctx.save();ctx.translate(x,y);ctx.rotate(rot);
 // Soft, tightly grounded shadow, never the old doubled black oval.
 ctx.save();ctx.translate(2.2,3.7);ctx.scale(1,.73);
 const shade=ctx.createRadialGradient(0,0,r*.19,0,0,r*.87);
 shade.addColorStop(0,'rgba(58,32,20,.20)');shade.addColorStop(1,'rgba(58,32,20,0)');
 ctx.fillStyle=shade;ctx.beginPath();ctx.arc(0,0,r*.87,0,Math.PI*2);ctx.fill();ctx.restore();
 ctx.save();ctx.beginPath();ctx.ellipse(0,-r*.028,r*.83,r*.79,0,0,Math.PI*2);ctx.clip();
 if(!window.TTRAssets?.draw(ctx,variant,-r*1.18,-r*.95,r*2.36,r*1.9)){
  ctx.fillStyle='#c38d4d';ctx.beginPath();ctx.ellipse(0,0,r*.81,r*.75,0,0,Math.PI*2);ctx.fill();
 }ctx.restore();ctx.restore();
}
function drawToast(ctx,x,y,w=56,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);
 if(!window.TTRAssets?.draw(ctx,'toast',-w*.5,-w*.48,w,w*.96)){ctx.fillStyle='#c8894c';ctx.fillRect(-w/2,-w*.38,w,w*.76);}ctx.restore();}
// v0.13.6.82: restore world/bridge/milk drawing helpers accidentally removed in v81.
function paintBridgeDeck(){return window.TTRCircuitVisuals.paintBridgeDeck({bridgeCtx,WORLD_W,WORLD_H,shortcutSamples});}
 // Entire burgundy puddle: tangent is X, jarward track normal is +Y.
 // Single silhouette extends from the drivable lane to the tipped jar mouth.
 function jamSpillPath(ctx){
   ctx.beginPath();ctx.moveTo(-5,-98);
   ctx.bezierCurveTo(-39,-103,-64,-74,-63,-31);
   ctx.bezierCurveTo(-69,5,-59,48,-45,84);
   ctx.bezierCurveTo(-53,108,-43,139,-27,165);
   ctx.bezierCurveTo(-12,158,9,153,27,165);
   ctx.bezierCurveTo(44,136,42,108,49,83);
   ctx.bezierCurveTo(65,39,69,-10,57,-48);
   ctx.bezierCurveTo(51,-87,20,-102,-5,-98);
   ctx.closePath();
 }
 function paintWorld(){return window.TTRCircuitVisuals.paintWorld({trackCtx,WORLD_W,WORLD_H,K,points,drawCrumb,jamPatch,jamSpillPath,trackPoint,tangent,drawPoly});}

// The milk is drawn from smoothly joined asymmetric lobes, not circles.
// Rotation and deterministic waviness make the scattered splashes look poured.

function drawMilkCerealSpill(ctx,o){return window.TTRObstacleVisuals.drawMilkCerealSpill(ctx,o);}
function drawMilkOverflow(ctx,o){return window.TTRObstacleVisuals.drawMilkOverflow(ctx,o);}
function drawMilkCerealCup(ctx,o){return window.TTRObstacleVisuals.drawMilkCerealCup(ctx,o,clock);}

function drawCoffeeAnimation(ctx,o){return window.TTRObstacleVisuals.drawCoffeeAnimation(ctx,o,clock);}
function drawJamPour(ctx){return window.TTRObstacleVisuals.drawJamPour(ctx,jamPatch,jamSpillPath,clock);}
function drawObstacle(ctx,o){
 if(o.type!=='crumb'&&o.type!=='ramp'&&o.type!=='cookie'&&o.type!=='jam_spill_jar'&&o.type!=='milk_cereal_spill'&&o.type!=='milk_cereal_cup'){
  // Ground contact shadow and subtle tabletop bounce light anchor object volume.
  ctx.save();ctx.translate(o.x+Math.max(2,o.r*.10),o.y+Math.max(4,o.r*.24));
  ctx.scale(1,.53);const rad=Math.max(12,o.r*1.25);
  const grad=ctx.createRadialGradient(0,0,1,0,0,rad);
  grad.addColorStop(0,'rgba(30,17,9,.44)');grad.addColorStop(.58,'rgba(42,23,14,.19)');grad.addColorStop(1,'rgba(55,31,17,0)');
  ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,rad,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 if(o.type==='milk_cereal_spill'){drawMilkCerealSpill(ctx,o);}
 else if(o.type==='milk_cereal_cup'){drawMilkCerealCup(ctx,o);}
 else if(o.type==='jam_spill_jar'){
  ctx.save();ctx.translate(o.x,o.y);ctx.rotate(stickyAngle+Math.PI/2+Math.sin(clock*.6)*.006);
  window.TTRAssets?.draw(ctx,'jam_tipped',-76,-62,152,124);
  // Same dark, pulpy marmalade as on the ground, inside the open jar mouth.
  ctx.save();ctx.beginPath();ctx.ellipse(-45.1,-.6,8.45,18.4,-.04,0,Math.PI*2);ctx.clip();
  const jelly=ctx.createLinearGradient(-54,-17,-37,20);
  jelly.addColorStop(0,'#84183b');jelly.addColorStop(.50,'#b02b52');jelly.addColorStop(1,'#8b1943');
  ctx.fillStyle=jelly;ctx.fillRect(-56,-23,24,46);
  for(let k=0;k<23;k++){
   const y=-17+k*1.6+Math.sin(k*4.71+clock*.57)*.65;
   const x=-45+Math.sin(k*2.91)*5.7;
   const rx=1.3+(k*7%5)*.44,ry=1+(k*3%4)*.55;
   ctx.fillStyle=k%3===0?'#df6576ab':k%2?'#721735bd':'#c33d5da9';
   ctx.beginPath();ctx.ellipse(x,y,rx,ry,Math.sin(k)*.3,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();ctx.restore();
 }
 else if(o.type==='crumb')drawCrumb(ctx,o.x,o.y,o.r,o.x|0);else if(o.type==='cookie'||o.type==='cookie_alt')drawCookie(ctx,o.x,o.y,o.r,(o.x+o.y)*.004,o.cookieKind||'cookie');else if(o.type==='mug'){drawMug(ctx,o.x,o.y,o.r,'#f1ddd6');if(!race||qualityMode==='high'||(!ttrLowGraphics&&qualityMode!=='low'&&qualityMode!=='balanced'))drawCoffeeAnimation(ctx,o);}else if(o.type==='toast')drawToast(ctx,o.x,o.y,o.r*1.7,.35);else if(o.type==='orange_bump'){window.TTRAssets?.draw(ctx,'orange',o.x-33,o.y-30,66,60);}else if(['plate_croissant','cereal','orange','jam','glass'].includes(o.type)){const width=o.r*2.8;if(o.type==='jam'){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(.93);window.TTRAssets?.draw(ctx,o.type,-width/2,-width*.52,width,width*.92);ctx.restore();}else window.TTRAssets?.draw(ctx,o.type,o.x-width/2,o.y-width*.52,width,width*.92);}else if(o.type==='knife'){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.angle??0);if(o.interactive)drawKnife(ctx,0,0,o.length||120,28);else drawKnife(ctx,0,0,157,38);ctx.restore();}else if(o.type==='ramp')drawRamp(ctx,o);
}

// A knife near the jam is a low, visible obstacle. A fast, centred crossing
// triggers a short hop over the sticky patch; only the knife and ramp launch cars.
function prepareRaceProp(o){
 const cacheable=['cookie','cookie_alt','orange','orange_bump','toast','glass','plate_croissant','cereal','knife','ramp'].includes(o.type);
 if(!cacheable)return;
 if(!o.staticSprite){const pad=Math.ceil(Math.max(96,o.r*2.25,(o.length||0)+22)),density=1.5;const cv=document.createElement('canvas');cv.width=cv.height=Math.ceil(pad*2*density);const cx=cv.getContext('2d');cx.scale(density,density);cx.translate(pad-o.x,pad-o.y);drawObstacle(cx,o);o.staticSprite={cv,pad};}
}
function drawRaceProp(ctx,o){
 if(isBox()&&o.movable){if(!o.pocketed)BR.drawBall(ctx,o);return;}
 if(isDesk()&&!isBath()&&o.movable){window.TTRDeskVisuals.stationery(ctx,o);return;}
 if(!isBreakfast())return;
 if(!o.staticSprite){drawObstacle(ctx,o);return;}const {cv,pad}=o.staticSprite;ctx.drawImage(cv,o.x-pad,o.y-pad,pad*2,pad*2);
}
function contactWithProp(c,o,previous=null){
 if(isBox()&&o.type==='box-proxy')return false;
  // Both the high bowl and the tipped glass jar must be solid, even to a jumping car.
  if(o.tall&&o.solid&&c.jump>0){
    if(K.segmentCircle(previous||c,c,o,(o.r||70)+(c.width||36)*.42)){
      c.jump=0;c.jumpTotal=0;c.jumpCd=Math.max(c.jumpCd,.4);
    }else return false;
  }
 // Both rinds are floor obstacles, not solid walls.
 if(o.type==='orange_bump'||o.type==='orange'){if(c.jump<=0&&K.segmentCircle(previous||c,c,o,(o.r||29)+(c.width||36)*.30)){c.speed*=.982;if(c===race?.player&&race.time-(c.lastRindSound??-10)>.7){c.lastRindSound=race.time;SND.sfx('rindSurface');}}return false;}
 if(!o.solid||c.jump>0||(!isBath()&&isDesk()&&c.onBridge))return false;
 if(isBox()&&o.movable){const hit=BR.hitBall(c,o,previous);if(hit&&o.eventBall&&race?.environmentEvents&&race.time-(c.lastEnvironmentHit??-10)>.4){c.lastEnvironmentHit=race.time;c.environmentBallHits=(c.environmentBallHits||0)+1;window.TTREnvironmentEvents.impact(race.environmentEvents,race,o,SND);}return hit;}
 if(isDesk()&&!isBath()&&o.movable)return DR.hitObject(c,o,resolveCarObstacle);
 if(o.type!=='knife')return resolveCarObstacle(c,o.collisionR?{...o,r:o.collisionR}:o);
 if(o.interactive!==true)return false;
 const ca=Math.cos(o.angle),sa=Math.sin(o.angle),dx=c.x-o.x,dy=c.y-o.y;
 const along=dx*ca+dy*sa,across=-dx*sa+dy*ca;
 const oldX=previous?.x??c.x, oldY=previous?.y??c.y;
 const odx=oldX-o.x,ody=oldY-o.y;
 const beforeAlong=odx*ca+ody*sa,beforeAcross=-odx*sa+ody*ca;
 const halfWidth=(c.width||36)*.50,halfLength=(c.length||61)*.5;
 const handleStart=-66,handleEnd=0,bladeEnd=o.bladeInLane??102.4,triggerHalf=o.jumpTriggerHalfAcross??18,jumpBladeStart=o.jumpBladeStart??0,jumpBladeEnd=o.jumpBladeEnd??bladeEnd;
 // Steel handle is a *solid low obstacle*, never transparent or a jump trigger.
 // One physical handle collider centred on the visible 66px grip.
 const handle={x:o.x-ca*33,y:o.y-sa*33,r:18,solid:true};
 const inHandle=along>=handleStart-halfWidth&&along<=handleEnd+halfWidth&&Math.abs(across)<13+halfLength;
 const sweptHandle=K.segmentPointDistance(oldX,oldY,c.x,c.y,handle.x,handle.y)<handle.r+halfWidth;
 if(inHandle||sweptHandle){
   // A solid bar, not a cosmetic circle: stop at the front surface of the steel grip.
   const fx=-sa,fy=ca,travelDir=Math.cos(c.a)*fx+Math.sin(c.a)*fy;
   const contactMargin=13+halfLength+2;
   if(travelDir>.3&&beforeAcross<0&&across>-contactMargin){
     const correction=-contactMargin-across;
     c.x+=fx*correction;c.y+=fy*correction;
     c.speed=Math.min(c.speed,35);c.hitVX*=.18;c.hitVY*=.18;
     return true;
   }
   if(travelDir<-.3&&beforeAcross>0&&across<contactMargin){
     const correction=contactMargin-across;
     c.x+=fx*correction;c.y+=fy*correction;
     c.speed=Math.max(c.speed,-35);c.hitVX*=.18;c.hitVY*=.18;
     return true;
   }
   return resolveCarObstacle(c,handle);
 }
 // Match the visible blade: use the actual front bumper crossing, not a wide circular trigger.
 const knifeForward={x:-sa,y:ca};
 const heading=Math.cos(c.a)*knifeForward.x+Math.sin(c.a)*knifeForward.y;
 const impactLine=-(halfLength+triggerHalf),deltaAcross=across-beforeAcross;
 const crossed=deltaAcross>0&&beforeAcross<=impactLine&&across>=impactLine;
 const alpha=crossed?(impactLine-beforeAcross)/deltaAcross:0;
 const hitAlong=beforeAlong+(along-beforeAlong)*alpha;
 const bladeRange=hitAlong>=jumpBladeStart&&hitAlong<=jumpBladeEnd;
 const bladeTouched=along>=jumpBladeStart-halfWidth&&along<=jumpBladeEnd+halfWidth&&Math.abs(across)<=triggerHalf+halfLength;
 if(c.speed>72&&heading>.24&&crossed&&bladeRange&&c.jumpCd<=0&&(c.knifeCd||0)<=0){
   c.jump=1.13;c.jumpTotal=1.13;c.jumpCd=1.54;c.knifeCd=1.2;
   c.speed=Math.max(c.speed,113);
   if(race&&c===race.player)SND.sfx('spoon');
   return true;
 }
 if(!bladeTouched&&!(crossed&&bladeRange))return false;
 // Non-qualifying contacts slow/deflect rather than awarding a free jump.
 const bladeCollider={x:o.x+ca*Math.max(8,Math.min(bladeEnd-8,along)),y:o.y+sa*Math.max(8,Math.min(bladeEnd-8,along)),r:13,solid:true};
 return resolveCarObstacle(c,bladeCollider);
}

function gameObstacles(ctx){
 if(isBox()){props.filter(o=>o.movable).forEach(o=>BR.drawBall(ctx,o));return;}
 if(isDesk()){ctx.drawImage(bridgeLayer,0,0);return;}
 if(!isBreakfast())return;
 props.filter(o=>o.type==='milk_cereal_cup').forEach(o=>drawMilkOverflow(ctx,o));
  props.filter(o=>o.type==='milk_cereal_spill').forEach(o=>drawObstacle(ctx,o));
  drawJamPour(ctx);
  ctx.drawImage(bridgeLayer,0,0);
 props.filter(o=>o.type!=='milk_cereal_spill').forEach(o=>drawObstacle(ctx,o));
}
function drawBox(ctx,p){if(p.cool>0)return;
 const assets=window.TTRAssets;
 const phase=clock*2.5+p.phase;
 const hover=11+Math.sin(clock*3.3+p.phase)*2.5;
 ctx.save();ctx.translate(p.x,p.y);
 // Separate grounded shadow: the pickup is visibly in the air, not glued to the tablecloth.
 ctx.fillStyle='rgba(41,32,37,.38)';ctx.beginPath();ctx.ellipse(0,9,12,5,0,0,Math.PI*2);ctx.fill();
 if(assets?.has('pickup_sheet')){
   const tile=160, exact=(((phase%(Math.PI*2)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*16),frame=Math.floor(exact)%16,next=(frame+1)%16,blend=exact-frame;
   // Smooth interpolation between adjacent cube views: no more hard 16-frame jumps.
   ctx.globalAlpha=1-blend;ctx.drawImage(assets.images.pickup_sheet,(frame%4)*tile,Math.floor(frame/4)*tile,tile,tile,-20,-hover-20,40,40);
   ctx.globalAlpha=blend;ctx.drawImage(assets.images.pickup_sheet,(next%4)*tile,Math.floor(next/4)*tile,tile,tile,-20,-hover-20,40,40);ctx.globalAlpha=1;
 }else{ctx.fillStyle='#29b4d4';ctx.fillRect(-10,-hover-10,20,20);}
 ctx.restore();
}
// Four genuinely independent silhouettes; Canvas 2D paints light and side depth consistently.
function glass(ctx,shape){drawPoly(ctx,shape,'#15314a','#a1d6e055',1);}
function carSprite(ctx,car){
 if(!window.TTRAssets?.has(car.profile.id))return;
 const pose=car;
 if(isBox()&&car.boxTransit>0){const scale=BR.visualScale(car);if(scale<=0)return;ctx.save();ctx.translate(car.x,car.y);ctx.scale(scale,scale);ctx.translate(-car.x,-car.y);ctx.globalAlpha*=Math.min(1,scale*1.4);window.TTRVehicleVisuals.carSprite(ctx,pose,clock);ctx.restore();return;}
 if(isDesk()&&!isBath()){const lift=DR.rampPose(car).hop;if(lift>0){ctx.save();ctx.translate(car.x,car.y-lift);ctx.scale(1+lift*.003,1+lift*.003);ctx.translate(-car.x,-car.y);window.TTRVehicleVisuals.carSprite(ctx,pose,clock);ctx.restore();return;}}
 return window.TTRVehicleVisuals.carSprite(ctx,pose,clock);
}

// ELIMINAZIONE PROTOTIPO v0.1 — not canonical rules.
// The master design bible (2026-11-17) confirms points, jingle, side flip and a longer final victory,
// but explicitly says exact scoring/win conditions must be recovered before declaring them canonical.
const ELIM_RULES_TEST={defaultGoal:5,minimumRoundSeconds:6,trailGap:320,physicalSeparation:175,sustainedTrailSeconds:.55,respawnProtectionSeconds:2.0,edgeMargin:16,leaderSwitchGrace:.75,recoveryLoopSeconds:16,recoveryLoopCount:3,recoveryLoopProgress:220};
const elimBoard=document.createElement('div');elimBoard.id='elimBoard';elimBoard.setAttribute('aria-label','Punteggi Eliminazione');document.body.appendChild(elimBoard);
const elimBanner=document.createElement('div');elimBanner.id='elimBanner';elimBanner.innerHTML='<div class="elim-message"><strong id="elimBannerTitle">PUNTO!</strong><span id="elimBannerSub"></span></div>';document.body.appendChild(elimBanner);
function hideEliminationUI(){elimBoard.style.display='none';elimBanner.style.display='none';$('hud')?.classList.remove('hud-elimination');}
function elimDisplayName(c){return c.id===race?.player?.id?'TU':'';}
function elimColor(c){return c.variantAccent||c.profile.color||'#82bfe9';}
function refreshEliminationBoard(){
 if(!race||race.mode!=='elimination'){hideEliminationUI();return;}
 const e=race.elim;elimBoard.style.display='flex';
 elimBoard.innerHTML=race.cars.map(c=>`<span class="e-score ${c.eliminated?'is-out':''} ${c===race.player?'is-me':''}" title="${c.profile.name} · ${e.points[c.id]} punti" aria-label="${c===race.player?'Tu':c.profile.name}: ${e.points[c.id]} punti" style="--car-color:${elimColor(c)}"><i class="e-color"></i>${c===race.player?'<b>TU</b>':''}<strong>${e.points[c.id]}</strong></span>`).join('');
}
// v84 - Small, non-overlapping two-column launch grid, anchored to the scoring location.
// A fresh elimination match launches fully BEHIND the finish plane; later rounds
// restart on a nearby safe road segment rather than teleporting to the finish.
const ELIM_ROW_SPACING=84,ELIM_START_OFFSET=65;
// Never line up a new heat ON the takeoff, knife jump or their short approach.
// Phase is arc length around the *main* track; the ramp is an optional branch.
const ELIM_JUMP_RUNUP=360,ELIM_JUMP_EXIT=190;
function eliminationSignedArc(from,to){return (((mod(from-to,1)+.5)%1)-.5)*TRACK_LENGTH;}
function eliminationJumpHazards(){
 if(isBath())return [{name:'bath-deck',phase:Bath.entry},{name:'bath-exit',phase:Bath.exit}];
 if(isDesk())return [];
 if(isBox())return [{name:"box-pocket",phase:B.entry},{name:"box-cue",phase:nearestTrack(B.propWorld(B.cues[1],B.cues[1].len/2,0)).p}];
 return [{name:'toast-ramp',phase:shortcutFrom},{name:'jam-knife',phase:knifePhase}];
}
function eliminationJumpSafeGrid(grid){
 return grid.every(pt=>eliminationJumpHazards().every(h=>{
   const ahead=eliminationSignedArc(pt.p,h.phase);
   // Avoid both the approach (negative) and landing area (positive).
   // For a grid after the jump, EVERY rear row must have cleared the hazard.
   return ahead<-ELIM_JUMP_RUNUP || ahead>ELIM_JUMP_EXIT;
 }));
}
function eliminationSafeRestartAnchor(p){
 // If a score happens in/around a jump, rewind the grid rather than placing
 // cars just ahead of the takeoff. All four/eight cars retain a full approach.
 for(const hazard of eliminationJumpHazards()){
   const delta=eliminationSignedArc(p,hazard.phase);
   if(delta>=-ELIM_JUMP_RUNUP && delta<=ELIM_JUMP_EXIT+75){
     return {phase:mod(hazard.phase-(ELIM_JUMP_RUNUP+90)/TRACK_LENGTH,1),jump:hazard.name};
   }
 }
 return {phase:mod(p,1),jump:null};
}
function eliminationGridPosition(p,index,offset=0){
 const row=Math.floor(index/2),phase=mod(p-(offset+row*ELIM_ROW_SPACING)/TRACK_LENGTH,1);
 const spot=trackPoint(phase),angle=tangent(phase),side=index%2===0?-32:32;
 return {x:spot.x-Math.sin(angle)*side,y:spot.y+Math.cos(angle)*side,p:phase,a:angle};
}
function eliminationGridValid(anchor,count,offset){
 const proposed=Array.from({length:count},(_,i)=>eliminationGridPosition(anchor,i,offset));
 return eliminationJumpSafeGrid(proposed)&&proposed.every((pt,i)=>{
   if(pt.x<48||pt.x>WORLD_W-48||pt.y<48||pt.y>WORLD_H-48)return false;
   const nearest=nearestTrackWindow(pt,points,pt.p,.022);
   if(nearest.distance>LANE_HALF-41)return false;
   const clearance=33+(race?.cars[i]?.length||68)*.42;
   return !props.some(o=>(o.solid||o.type==='ramp')&&
      Math.hypot(pt.x-o.x,pt.y-o.y)<(o.r||25)+clearance);
 })&&proposed.every((a,i)=>proposed.slice(i+1).every(b=>Math.hypot(a.x-b.x,a.y-b.y)>57));
}
function eliminationChooseGrid(p,count,first=false){
 if(first)return {phase:0,offset:ELIM_START_OFFSET,grid:Array.from({length:count},(_,i)=>eliminationGridPosition(0,i,ELIM_START_OFFSET))};
 const safe=eliminationSafeRestartAnchor(p);
 // Prefer the score location for ordinary heats, but only use a jump-safe
 // position before a nearby ramp/knife. Search backward first if blocked.
 const offsets=safe.jump?[0,50,80,105,125,145,-35,-70,-110,-160,-230,-310,-420,-550,-700,220,320,470]:
     [0,-25,25,-50,50,-80,80,-115,115,-155,155,-210,210,-275,275,-350,350];
 for(const metres of offsets){const at=mod(safe.phase+metres/TRACK_LENGTH,1);
   if(eliminationGridValid(at,count,0))return {phase:at,offset:0,grid:Array.from({length:count},(_,i)=>eliminationGridPosition(at,i)),jumpAdjusted:safe.jump};
 }
 // Exhaustive safe fallback. No unsafe return near either jump.
 for(let j=0;j<Math.ceil(TRACK_LENGTH/30);j++){
   const at=mod(safe.phase-j*30/TRACK_LENGTH,1);
   if(eliminationGridValid(at,count,0))return {phase:at,offset:0,grid:Array.from({length:count},(_,i)=>eliminationGridPosition(at,i)),jumpAdjusted:safe.jump};
 }
 const at=0,offset=ELIM_START_OFFSET;
 return {phase:at,offset,grid:Array.from({length:count},(_,i)=>eliminationGridPosition(at,i,offset)),jumpAdjusted:'fallback'};
}
function eliminationApplyGrid(fresh,point,index){
 Object.assign(fresh,{x:point.x,y:point.y,a:point.a,p:point.p,lastP:point.p,
  auditP:point.p,routeStableP:point.p,orangeLine:null,aiPassUntil:0,aiPassCooldown:0,aiPassSide:0,aiItemCheckAt:0,aiProgressWindow:null,aiRecoveryUntil:0,lastCheckpoint:point.p});
 fresh.elimDistance=-Math.floor(index/2)*ELIM_ROW_SPACING;fresh.mugApexPassed=point.p>.306&&point.p<.93;
 fresh.elimPrevP=point.p;fresh.elimPrevX=point.x;fresh.elimPrevY=point.y;
 fresh.elimTravelSinceCredit=0;fresh.elimLag=0;fresh.elimProtection=0;
 fresh.lastValidPosition={x:point.x,y:point.y,p:point.p,a:point.a,speed:46,laps:0,flags:[false,false,false],mugApexPassed:fresh.mugApexPassed,elimDistance:fresh.elimDistance};fresh.previousValidPosition=null;
 fresh.elimLastMeaningfulProgress=fresh.elimDistance;fresh.elimRecoveryCount=0;
 fresh.elimRecoveryWindowStart=-999;fresh.elimRecoveryStartDistance=fresh.elimDistance;
 fresh.elimStallSeconds=0;fresh.elimLastRecoveryAt=-999;
 return fresh;
}
function eliminationGridCameraPosition(grid){
 const mx=grid.reduce((sum,p)=>sum+p.x,0)/grid.length;
 const my=grid.reduce((sum,p)=>sum+p.y,0)/grid.length;
 return {x:mx,y:my};
}
function eliminationActive(){return ttrEliminationMode.eliminationActive();}
function knockOutElimination(c,reason='distacco'){return ttrEliminationMode.knockOutElimination(c,reason);}
function awardEliminationPoint(winner){return ttrEliminationMode.awardEliminationPoint(winner);}
function eliminationNewRound(){
 const e=race.elim;if(perfEnabled)for(const c of race.cars){const m=perfCars[c.id];if(m)perfSyncCounters(c,m);}e.state='race';e.timer=0;e.winner=null;e.round++;e.roundTime=0;
 if(isDesk()&&!isBath())DR.resetObjects(props);
 race.oils=[];race.effects=[];race.countdown=2.15;race.pickups.forEach(p=>p.cool=0);
 const placement=eliminationChooseGrid(e.restartPhase??0,race.cars.length);
 race.cars.forEach((c,i)=>{
  const profileIndex=profiles.findIndex(pr=>pr.id===c.profile.id);
  const fresh=eliminationApplyGrid(createCar(i,profileIndex,placement.grid[i].p),placement.grid[i],i);
  const keep={variantAccent:c.variantAccent,variantLabel:c.variantLabel,variantSprite:c.variantSprite,shortcutDecisionCount:c.shortcutDecisionCount||0,shortcutAttemptCount:c.shortcutAttemptCount||0};
  // Reuse the object identity (player and UI references), not stale recovery/bridge state.
   for(const key of Object.keys(c))if(!(key in fresh))delete c[key];
   Object.assign(c,fresh,keep);c.eliminated=false;c.elimCelebration=0;
 });
 elimGridCamera=eliminationGridCameraPosition(placement.grid);
 camX=elimGridCamera.x;camY=elimGridCamera.y;
 elimCameraId=null;elimCameraProgress=0;elimFocusWeight=0;elimCandidateId=null;elimCandidateSince=0;elimBanner.style.display='none';refreshEliminationBoard();
 // The round number is already visible in the upper HUD; do not cover the race with a duplicate announcement.
 hud();
}
function eliminationProgressUpdate(c,pr,dt){return ttrEliminationMode.eliminationProgressUpdate(c,pr,dt);}
// A point is awarded only after every rival has genuinely left the leader's visible camera
// for a sustained interval. Progress alone and recoveries never knock a car out.
function eliminationViewBounds(){
 // Use the ACTUAL camera and zoom used by the renderer, not a second prediction.
 const zoom=scale||.65;
 return {x:camX,y:camY,halfW:(sw||innerWidth)/(2*zoom),halfH:(sh||innerHeight)/(2*zoom)};
}
// A shallow, legal corner cut may put a car physically ahead while nearest-track
// phase stalls or momentarily regresses. Resolve *close* overtakes from geometry,
// independently of accumulated progress, only when the two cars share a bend.
// Read the main track near a car's last known legal phase. A small inside bend cut
// can be 150–225 units off the centreline and nearestCourse may temporarily latch
// onto a different segment, so geometry beats that unstable projection.
function eliminationLegalMainPosition(c){
 const anchor=Number.isFinite(c.p)?c.p:nearestTrack(c,points).p;
 const local=nearestTrackWindow(c,points,anchor,.092);
 const global=nearestTrack(c,points);
 return local.distance<=245?local:global;
}
function eliminationPhysicalOvertake(challenger,incumbent){
 if(!challenger||!incumbent||challenger===incumbent)return false;
 const bad=c=>c.done||c.eliminated||c.onBridge||c.bridgeMissActive||c.bridgeLandingActive||
   c.routePinch||c.tableFalling>0||c.respawnGrace>0||
   ((c.offtrackSeconds||0)>2.2&&!(c.offtrackReturnGrace>0));
 if(bad(challenger)||bad(incumbent))return false;
 const dx=challenger.x-incumbent.x,dy=challenger.y-incumbent.y;
 if(Math.hypot(dx,dy)>335)return false; // only compare drivers sharing the same local bend
 const a=eliminationLegalMainPosition(challenger),b=eliminationLegalMainPosition(incumbent);
 if(a.distance>228||b.distance>228||phaseGap(a.p,b.p)>.065)return false;
 const t0=tangent(b.p),t1=tangent(a.p);
 // Opposing turns or unrelated hairpin branches are NOT overtakes.
 if(Math.cos(angleDiff(t0,t1))<.60)return false;
 const courseAdvance=eliminationSignedArc(a.p,b.p);
 if(courseAdvance < -140 || courseAdvance > 360)return false;
 if((challenger.elimDistance||0)+115<(incumbent.elimDistance||0))return false;
 const fx0=Math.cos(t0)+Math.cos(t1),fy0=Math.sin(t0)+Math.sin(t1);
 const norm=Math.hypot(fx0,fy0)||1,fx=fx0/norm,fy=fy0/norm;
 const forward=dx*fx+dy*fy,across=-dx*fy+dy*fx;
 if(forward<=29||Math.abs(across)>195)return false;
 const heading=Math.atan2(fy,fx);
 return challenger.speed>9&&Math.cos(angleDiff(challenger.a,heading))>.14&&
        Math.cos(angleDiff(incumbent.a,heading))>-.08;
}
function eliminationProjectedAhead(challenger,incumbent){
 if(!challenger||!incumbent||challenger===incumbent)return false;
 const unsafe=c=>c.eliminated||c.done||c.tableFalling>0||c.routePinch||c.respawnGrace>0||
  c.bridgeMissActive||c.bridgeLandingActive||((c.offtrackSeconds||0)>2.2&&!(c.offtrackReturnGrace>0));
 if(unsafe(challenger)||unsafe(incumbent))return false;
 const a=nearestTrackWindow(challenger,points,challenger.p,.055);
 const b=nearestTrackWindow(incumbent,points,incumbent.p,.055);
 if(a.distance>188||b.distance>188)return false;
 if(Math.cos(angleDiff(tangent(a.p),tangent(b.p)))<.60)return false;
 const ahead=mod(a.p-b.p,1);
 if(ahead<=.012||ahead>=.085)return false;
 if((incumbent.elimDistance||0)-(challenger.elimDistance||0)>65)return false;
 if(Math.cos(angleDiff(challenger.a,tangent(a.p)))<.38)return false;
 return true;
}
function eliminationCameraLeader(){
 const active=eliminationActive();if(!active.length)return race.player;
 const ranked=ttrEliminationMode.eliminationRanking();
 // A car in the pocket tunnel cannot anchor a visible race camera.
 // On exit it becomes eligible again, with the normal credited race progress.
 const leader=isBox()?(ranked.find(c=>!(c.boxTransit>0))||ranked[0]):ranked[0];
 if(elimCameraId!==leader.id){race.elim.lastLeaderSwitchTime=race.time;elimFocusWeight=0;}
 elimCameraId=leader.id;elimCameraProgress=leader.elimDistance||0;
 return leader;
}
// The leader is always the anchor; a tightly packed group can share the image
// without pulling the lens all the way back towards a cluster of slower cars.
function eliminationCameraTarget(){
 const active=eliminationActive();if(!active.length)return {x:camX,y:camY};
 const leader=eliminationCameraLeader();
 const near=active.filter(c=>c!==leader&&!(c.boxTransit>0)&&Math.hypot(c.x-leader.x,c.y-leader.y)<165&&
   Math.abs((leader.elimDistance||0)-(c.elimDistance||0))<195);
 const closest=active.filter(c=>c!==leader&&!(c.boxTransit>0)).reduce((best,c)=>
   Math.min(best,Math.max(0,(leader.elimDistance||0)-(c.elimDistance||0))),Infinity);
 const requested=clamp((closest-110)/135,0,1);
 const smoothing=1-Math.exp(-Math.min(.05,renderDelta)*6.5);
 elimFocusWeight+=(requested-elimFocusWeight)*smoothing;
 let x=leader.x*2.8,y=leader.y*2.8,weight=2.8;
 for(const c of near){
   const dist=Math.hypot(c.x-leader.x,c.y-leader.y);
   const w=Math.max(.10,(1-dist/175)*.54);
   x+=c.x*w;y+=c.y*w;weight+=w;
 }
 x/=weight;y/=weight;
 const blend=1-elimFocusWeight;
 // Even an eight-car pileup cannot push the actual leader off the centre area.
 return {x:leader.x+clamp((x-leader.x)*blend,-48,48),
         y:leader.y+clamp((y-leader.y)*blend,-48,48)};
}
// A single atomic pass can eliminate ALL cars outside the actual camera on the
// same frame. Individual timers are independent: never early-return after 1 KO.
function eliminationEvaluate(dt){return ttrEliminationMode.eliminationEvaluate(dt);}
function eliminationEndPoint(dt){return ttrEliminationMode.eliminationEndPoint(dt);}
// Results hotfix: preserve each model's approved garage angle and distinguish
// same-model racers by the actual race paint, not artificial name suffixes.
// Fase 11a: i risultati sono ora renderizzati nel modulo dedicato.
function showEliminationResults(){return ttrRaceResults.showEliminationResults();}

function createCar(index,p,t=0){return ttrRaceGrid.createCar(index,p,t);}


function assignDuplicateAccents(){return ttrRaceGrid.assignDuplicateAccents();}
const TTRLoadingCopy={"it":["CIRCUITO","MAPPA DEL CIRCUITO","PARTENZA","SCORCIATOIA","SCORCIATOIE E OSTACOLI","CIRCUITO PRONTO","AVVIA GARA","TURBO","Aumenta la velocità","OLIO","Fa sbandare chi segue","PINZA","Ti avvicina a chi precede","Non disponibile in Prova a tempo","Rampa sul toast","Allinea la vettura per sfruttare il salto.","Latte e marmellata","Controlla la traiettoria sulle superfici scivolose o appiccicose.","Buca A → C","Entra nel verso corretto; evita le altre buche.","Stecche e biglie","La punta della stecca permette un saltello; evita gli ostacoli.","Record personale"],"en":["TRACK","TRACK MAP","START","SHORTCUT","SHORTCUTS & OBSTACLES","TRACK READY","START RACE","TURBO","Boost your speed","OIL","Makes following cars skid","CLAW","Pulls you toward the car ahead","Unavailable in Time Trial","Toast ramp","Line up the car for the jump.","Milk and jam","Control your line on slippery or sticky surfaces.","Pocket A → C","Enter in the correct direction; avoid other pockets.","Cues and balls","Jump over the cue tip; avoid obstacles.","Personal best"],"es":["CIRCUITO","MAPA DEL CIRCUITO","SALIDA","ATAJO","ATAJOS Y OBSTÁCULOS","CIRCUITO LISTO","INICIAR CARRERA","TURBO","Aumenta la velocidad","ACEITE","Hace derrapar a quien sigue","PINZA","Te acerca al coche de delante","No disponible en contrarreloj","Rampa de tostada","Alinea el coche para saltar.","Leche y mermelada","Controla la trayectoria en superficies resbaladizas o pegajosas.","Tronera A → C","Entra en el sentido correcto; evita las demás.","Tacos y bolas","Salta por la punta del taco; evita obstáculos.","Récord personal"],"de":["STRECKE","STRECKENKARTE","START","ABKÜRZUNG","ABKÜRZUNGEN & HINDERNISSE","STRECKE BEREIT","RENNEN STARTEN","TURBO","Erhöht das Tempo","ÖL","Lässt Verfolger rutschen","GREIFER","Zieht dich zum Vordermann","Im Zeitfahren nicht verfügbar","Toastrampe","Richte das Auto für den Sprung aus.","Milch und Marmelade","Vorsicht auf rutschigen und klebrigen Flächen.","Tasche A → C","Fahre richtig hinein; meide die anderen Taschen.","Queues und Kugeln","Springe über die Queue-Spitze; meide Hindernisse.","Persönliche Bestzeit"],"fr":["CIRCUIT","CARTE DU CIRCUIT","DÉPART","RACCOURCI","RACCOURCIS ET OBSTACLES","CIRCUIT PRÊT","LANCER LA COURSE","TURBO","Augmente la vitesse","HUILE","Fait déraper les poursuivants","PINCE","Te rapproche de la voiture devant","Indisponible en contre-la-montre","Rampe de pain grillé","Aligne la voiture pour sauter.","Lait et confiture","Contrôle la trajectoire sur les surfaces glissantes ou collantes.","Poche A → C","Entre dans le bon sens ; évite les autres poches.","Queues et billes","Saute sur la pointe de la queue ; évite les obstacles.","Record personnel"],"pt":["PISTA","MAPA DA PISTA","PARTIDA","ATALHO","ATALHOS E OBSTÁCULOS","PISTA PRONTA","INICIAR CORRIDA","TURBO","Aumenta a velocidade","ÓLEO","Faz os seguidores derraparem","GARRA","Aproxima-te do carro à frente","Indisponível no contrarrelógio","Rampa de torrada","Alinha o carro para saltar.","Leite e geleia","Controla a trajetória em superfícies escorregadias ou pegajosas.","Caçapa A → C","Entra no sentido correto; evita as outras.","Tacos e bolas","Salta sobre a ponta do taco; evita os obstáculos.","Recorde pessoal"]};
const TTRLoadText=()=>TTRLoadingCopy[I18N.getLang()]||TTRLoadingCopy.it;
let loadingToken=0;
function loadingAssetFailure(mode,token,button){if(token!==loadingToken)return;$('loadingStateLabel').textContent=assetCopy()[1];button.hidden=false;button.disabled=false;button.textContent=assetCopy()[2];button.onclick=()=>openCircuitLoading(mode);}

async function openCircuitLoading(mode){
 if(mode==='online')selectedTrackId=onlineSession?.trackId||'colazione-turbo';
 ttrRaceResults.cancelMusicTimer();
 const token=++loadingToken,wrap=$('loadingTrack');
 if(!wrap){initRace(mode);return;}
 const startButton=$('ttrLaunchRace'),copy=TTRLoadText(),chosen=TTRCircuitCatalog.find(c=>c.id===selectedTrackId);
 startButton.hidden=false;startButton.disabled=true;
 $('loadingStateLabel').textContent=t('loading');
 startButton.textContent=copy[6];const back=$('ttrLoadingBack');if(back){back.textContent=assetCopy()[3];back.onclick=()=>{if(mode==='online')onlineQuit();mainMenu();};}
 startButton.onclick=()=>{if(token!==loadingToken||startButton.disabled)return;startButton.disabled=true;wrap.hidden=true;initRace(mode);};
 race=null;syncAudio();wrap.hidden=false;$('screen').hidden=true;$('screen').style.display='none';$('garageScreen').hidden=true;if($('careerScreen'))$('careerScreen').hidden=true;if($('careerMissionsScreen'))$('careerMissionsScreen').hidden=true;
 const bar=$('loadingRaceFill'),paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 // The presentation has a minimum visible duration, but resource work starts immediately.
 bar.classList.remove('ttr-loading-pending');bar.style.transition='none';bar.style.width='0%';
 let progress=0,target=16,frame=0,last=performance.now(),resolveFinished;
 const finished=new Promise(resolve=>{resolveFinished=resolve;});
 const stop=()=>{cancelAnimationFrame(frame);resolveFinished(false);};
 const animate=now=>{
  if(token!==loadingToken||wrap.hidden){resolveFinished(false);return;}
  const dt=Math.max(0,Math.min(50,now-last));last=now;
  progress=Math.min(target,progress+dt*100/1600);
  bar.style.width=progress.toFixed(2)+'%';
  if(progress>=100){resolveFinished(true);return;}
  frame=requestAnimationFrame(animate);
 };
 frame=requestAnimationFrame(animate);
 try{
 await paint();if(token!==loadingToken){stop();return;}
 selectCircuit(selectedTrackId);target=52;
 $('loadingMode').textContent=mode==='online'?'ONLINE · BETA':t(mode==='career'?'career':mode==='trial'?'timeTrial':mode==='elimination'?'elimination':'quickRace');
 $('loadingTrackIndex').textContent='· '+copy[0]+' '+String(chosen?.index||1).padStart(2,'0')+' / '+TTRCircuitCatalog.length;
 $('loadingTrackName').textContent=chosen?.name.toUpperCase()||t('trackName');
 $('loadingMapLabel').textContent=copy[1];
 $('loadingMapKey').textContent='▦ '+copy[2]+'   ◆ POWER-UP   '+((isBox()?'● → ● ':'━ ')+copy[3]);
 $('loadingTipsTitle').textContent=copy[4];
 const guide=$('loadingTips');guide.replaceChildren();
 if(isDesk()){const row=document.createElement('div'),title=document.createElement('b');title.textContent=isBath()?'LAVABO · SCORCIATOIA':isGarage()?'PONTE OFFICINA · SCORCIATOIA':'RIGHELLO · SCORCIATOIA';const detail=document.createElement('span');detail.textContent=isBath()?'Lo spazzolino fa parte del percorso normale. Dopo la discesa scegli la curva dello scarico o il taglio interno umido. Guida manuale: cadere in acqua provoca respawn.':'Imbocca la rampa e guida sulla scorciatoia rialzata: mantieni la traiettoria fino alla rampa di uscita. Nessun automatismo.';row.append(title,detail);guide.append(row);}
 for(const n of (isDesk()?[]:isBox()?[18,20]:[14,16])){const row=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('span');title.textContent=copy[n];detail.textContent=copy[n+1];row.append(title,detail);guide.append(row);}
 const power=$('loadingPowerups');power.replaceChildren();
 for(const [i,k] of ['turbo','oil','claw'].entries()){
  const off=mode==='trial'&&i>0,chip=document.createElement('div');chip.className='power-chip'+(off?' unavailable':'');
  const ico=document.createElement('span');ico.className='up-icon';ico.innerHTML=window.TTRHudVisuals.icon(k);
  const label=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=copy[7+i*2];detail.textContent=off?copy[13]:copy[8+i*2];label.append(name,detail);chip.append(ico,label);power.append(chip);
 }
 TTRDrawSelectedTrack($('loadingCircuitMap'),chosen,true);
 target=90;SND.music('garage');
 await paint();if(token!==loadingToken){stop();return;}
 const [vehiclesReady,deskReady]=await Promise.all([window.TTRAssets.ensureRaceReady(),isDesk()&&!isBath()?(isGarage()?window.TTRGarageVisuals.ready:window.TTRDeskVisuals.ready):true]);
  if(token!==loadingToken){stop();return;}
  if(!vehiclesReady||!deskReady){stop();loadingAssetFailure(mode,token,startButton);return;}
  target=100;if(!await finished||token!==loadingToken)return;
  $('loadingStateLabel').textContent=copy[5];startButton.hidden=false;startButton.disabled=false;
 }catch(err){stop();if(token===loadingToken){console.warn('Track loading failed',err);loadingAssetFailure(mode,token,startButton);}}
}
let offlineGridCursor=0;
function initRace(mode){
 if(mode==='online')selectedTrackId=onlineSession?.trackId||'colazione-turbo';selectCircuit(selectedTrackId);
 releaseAllControls();
 const cfg=TTRModeConfigs[mode]||null;
 const modeSettings=window.TTRRaceFlow.modeSettings(mode,cfg,selectedCar,onlineSession,mode==='career'?TTRCareerDifficulty():1);
 const {num,pr,aiFactor,auto}=modeSettings;
 lastRaceSettings={num,pr,aiFactor,auto};
 onlineFinishDeadline=0;race={mode,trackId:circuitId,trackIndex:isGarage()?4:isBath()?3:isDesk()?2:isBox()?1:0,cars:[],player:null,pickups:[],oils:[],effects:[],time:0,countdown:3,paused:false,auto,aiFactor,finished:false,pauseOverlay:false,collisionCount:0,lastImpactSound:-10,careerStats:{pickups:0,turbos:0,oils:0,claws:0},careerRecorded:false};
 SND.setRaceContext(circuitId,mode);
 if(isBox())BR.resetBalls(props);race.environmentEvents=window.TTREnvironmentEvents.create(race,props);if(isBox())race.boxBalls=props.filter(o=>o.movable);
 if(isDesk()&&!isBath()){DR.resetObjects(props);race.deskProps=props;}
 if(mode==='elimination')race.elim=window.TTRModeElimination.initialState(num,TTRModeConfigs.elimination.elimGoal,ELIM_RULES_TEST.defaultGoal);
 const opponents=mode==='online'?null:window.TTRRaceGrid.offlineOpponents(profiles.length,pr,num-1,mode==='trial'?0:offlineGridCursor);
 if(mode!=='online'&&mode!=='trial')offlineGridCursor=(offlineGridCursor+Math.max(1,num-1))%profiles.length;
 for(let i=0;i<num;i++){const own=mode==='online'&&onlineSession?.members[i];const carIndex=own?own.car:mode==='online'?i%7:i===0?pr:opponents[i-1];race.cars.push(createCar(i,carIndex,mod(-(ELIM_START_OFFSET+Math.floor(i/2)*ELIM_ROW_SPACING)/TRACK_LENGTH,1)));}
 assignDuplicateAccents();
 race.player=race.cars[mode==='online'&&onlineSession?onlineSession.slot:0];
 if(mode==='trial'){const p=race.player.profile;race.trialSession=window.TTRTrialSession.create({trackId:circuitId,carId:p.id,carName:p.name});race.trialRecovery=race.player.shortcutRespawns||0;race.trialSession.sample(0,race.player,{force:true});race.trialGhost=window.TTRModeTrial.ghost(p.id,race.trialSession);}
 if(mode==='elimination'){
   const placement=eliminationChooseGrid(0,num,true);
   race.cars.forEach((c,i)=>{eliminationApplyGrid(c,placement.grid[i],i);c.eliminated=false;c.elimCelebration=0;});
 }
 const refLap=TRACK_LENGTH/155;const count=isBath()?Math.min(D.pickupPhases.length,Math.max(3,pickupCount(refLap))):isDesk()?3:pickupCount(refLap);for(let i=0;i<count;i++){const p=pickupSegments[i],pt=trackPoint(p);race.pickups.push({x:pt.x,y:pt.y,size:22,r:16.5,cool:0,phase:i*1.7,segment:p});}
 for(const k of Object.keys(controls))controls[k]=false;
 $('loadingTrack').hidden=true;$('pauseOverlay').hidden=true;$('screen').hidden=true;$('screen').style.display='none';$('hud').style.display='block';$('controls').style.display='flex';$('hint').classList.remove('show');
 if(mode==='elimination'){elimBanner.style.display='none';refreshEliminationBoard();}else hideEliminationUI();
 if(mode==='online'){$('pauseBtn').textContent='ESCI';$('pauseBtn').setAttribute('aria-label','Esci dalla gara online');}else{$('pauseBtn').textContent='Ⅱ';$('pauseBtn').setAttribute('aria-label','Pausa');}
 $('position').parentElement.querySelector('small').textContent=mode==='elimination'?'IN PISTA':t('position');
 $('lap').parentElement.querySelector('small').textContent=mode==='elimination'?'MANCHE':t('lap');
 $('hud').classList.toggle('hud-elimination',mode==='elimination');
 SND.unlock().then(ok=>{if(ok)SND.sfx('start');});SND.stopMusic();frameTime=performance.now();camX=race.player.x;camY=race.player.y;
 elimGridCamera=mode==='elimination'?eliminationGridCameraPosition(race.cars):{x:camX,y:camY};
 if(mode==='elimination'){camX=elimGridCamera.x;camY=elimGridCamera.y;}
 elimCameraId=null;elimFocusWeight=0;elimCandidateId=null;elimCandidateSince=0;hud();
 if(mode==='online'){if(!onlineSession?.host&&onlinePendingSnapshot){onlineApplySnapshot(onlinePendingSnapshot);onlinePendingSnapshot=null;}onlineSend({type:'loaded',track:race.trackId});}
}
// One recovery path for excessive shortcut, tabletop edge and blocked obstacles.
// All recoveries are silent on the HUD; the audio cue is subtle and never prints text.
function recoverCar(c,reason='edge'){
 if(isBox())c.boxRailRejoin=null;
 if(isDesk()&&!isBath()){c.deskExitRamp=false;if(reason==='desk-bridge-fall'&&c!==race.player){c.deskRetryUntil=race.time+5;c.aiPassUntil=0;c.aiPassCooldown=race.time+4;}}
 c.aiOilSeen=null;
 if(isBath()){
  c.bathBrushOff=0;c.bathBrush=false;c.bridgeOffSeconds=0;c.bathBrushSpinHeading=null;c.bathChoicePending=false;
  if(reason==='bath-toothbrush-fall'&&c!==race.player){c.bathRejoinUntil=race.time+5;c.aiPassUntil=0;c.aiPassCooldown=race.time+5;c.reverseRecovery=0;}
  // A valid completed lap is committed; stale pre-finish checkpoints cannot undo it.
  const committed=c.lapsCompleted||0;
  const safe=c.routePinch?.safe||c.offtrackEntry||c.lastValidPosition;
  if(safe&&Number.isFinite(safe.laps)&&safe.laps<committed){
   const p=.002,q=trackPoint(p),snapshot={...q,p,a:tangent(p),laps:committed,flags:[false,false,false],elimDistance:c.elimDistance};
   c.lastValidPosition=snapshot;c.lastCheckpoint=p;c.offtrackEntry=null;c.routePinch={phase:p,safe:snapshot};
  }
 }
 return ttrRaceSafety.recoverCar(c,reason);
}
// Guard a real geometric crossing between two non-adjacent curves.
// An abrupt phase jump is only suspicious at the known adjacent hairpin pair.
// Legitimate inside lines are allowed until the car physically commits to the other arm.
function junctionContinuity(c,near,oldX,oldY,dt){return ttrRaceSafety.junctionContinuity(c,near,oldX,oldY,dt);}
function hud(){if(!race)return;const c=race.player;const rank=race.cars.slice().sort((a,b)=>K.racePosition(b)-K.racePosition(a)).indexOf(c)+1;
 const position=race.mode==='elimination'?`${eliminationActive().length} / ${race.cars.length}`:`${rank} / ${race.cars.length}`;
 const lap=race.mode==='elimination'?`${race.elim.round}ª`:`${Math.min(3,c.lapsCompleted+1)} / 3`;
 window.TTRHudVisuals.render({position,lap,time:fmtTime(race.time),item:c.item,typeNames,trial:race.trialSession?.hud(race.time)});
}
function fmtTime(s){const m=Math.floor(s/60).toString().padStart(2,'0'),ss=Math.floor(s%60).toString().padStart(2,'0'),ms=Math.floor(s*10%10);return `${m}:${ss}.${ms}`;}
function showHint(s,t=1.1){hint=s;lastHint=clock+t;$('hint').textContent=s;$('hint').classList.add('show');}
function syncAudio(){const playing=!!(race&&!race.paused&&!race.finished&&race.countdown<=0&&innerWidth>=innerHeight&&!(race.elim&&race.elim.state!=='race')&&!race.player?.eliminated),now=performance.now();if(playing!==perfAudioPlaying||now-perfLastAudio>=50){perfAudioPlaying=playing;perfLastAudio=now;const player=race?.player;SND.syncEngine(race?.mode==='online'&&player?.netPrediction?{...player,speed:player.netPrediction.speed}:player,playing&&!(race?.mode==='online'&&(onlineResumeUntil||performance.now()-(player?.netAt||0)>350)));}}
function ping(freq=660,dur=.09,vol=.1){SND.sfx(freq>800?'pickup':freq<300?'impact':'select');}
function refreshAudioUI(){const st=SND.status(),el=$('audioStatus');if(el)el.textContent=st.supported?(st.context==='running'?t('audioReady'):t('audioBlocked')):t('audioUnavailable');
 const mute=$('menuMute');if(mute){mute.textContent=t(st.muted?'audioOff':'audioOn');mute.setAttribute('aria-pressed',String(!st.muted));}const pMute=$('pauseMute');if(pMute){pMute.textContent=t(st.muted?'audioOff':'audioOn');pMute.setAttribute('aria-pressed',String(!st.muted));}}
function enableSound(){return SND.unlock().then(ok=>{refreshAudioUI();return ok;});}
function useItem(c){
 const desk=isDesk()&&!isBath(),bath=isBath(),count=(desk||bath)?race?.oils.length||0:0;
 const item=c?.item;const result=ttrRacePowerups.useItem(c);
 if(item&&!c.item&&['turbo','oil','claw'].includes(item)){const k='items_'+item;c[k]=(c[k]||0)+1;}
 if((desk||bath)&&c&&race?.oils.length>count){for(let i=count;i<race.oils.length;i++)DR.markOil(c,race.oils[i]);}
 return result;
}
function inputFor(c){const ctl=ttrRaceDrivers.inputFor(c);if(c===race.player||race.mode==='online'&&onlineSession?.members[c.id]||isBox()||c.onBridge)return ctl;const p=c.routeStableP??c.p,a=tangent(p+.008);return window.TTREnvironmentEvents.planSurface(c,race,ctl,a,q=>nearestTrackWindow(q,points,p,.045).distance<LANE_HALF-(c.width||36)*.5-8&&!props.some(o=>o.solid&&distance(q,o)<(o.r||20)+30)&&!race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&distance(q,o)<48)&&!race.oils.some(o=>o.owner!==c.id&&distance(q,o)<(o.r||34)+24)&&(!isBath()||!Bath.wet(q)));}
function bridgeFall(c){return ttrRaceSafety.bridgeFall(c);}
function startTableFall(c){return ttrRaceSafety.startTableFall(c);}

 // v0.13.6.71 — A short, controlled crossing just beyond the crumb border is legal.
 // Outside the respawn/safety corridor, the old checkpoint and shortcut rules remain.
 function finishEdgeTolerance(c,near){return ttrRaceSafety.finishEdgeTolerance(c,near);}

// Fase 7 — adapter per la closure privata: stato condiviso, dipendenze esplicite, nessuna copia di race.
const ttrRaceGrid=window.TTRRaceGrid.create({
 profiles,ttrCalibratedProfile,trackPoint,tangent,mod,getRace:()=>race
});
const ttrRacePowerups=window.TTRRacePowerups.create({
 getRace:()=>race,getOnlineSession:()=>onlineSession,onlineSend,SND,clawTarget,props,distance,showHint,t:(...args)=>t(...args)
});
let ttrRaceDrivers=window.TTRRaceDrivers.create({
 getRace:()=>race,getOnlineSession:()=>onlineSession,onlineHostInput,controls,keys,trackPoint,mod,angleDiff,clamp,nearestTrack,points,K,props
});
const ttrRaceSafety=window.TTRRaceSafety.create({
 getRace:()=>race,setLastHint:value=>{lastHint=value;},trackPoint,tangent,mod,ELIM_RULES_TEST,SND,$,junctionPhaseHop,nearestTrackWindow,phaseGap,points
});

// Fase 8 — stessa closure privata della gara: dipendenze esplicite, nessuna copia dello stato.
const ttrRaceProgress=window.TTRRaceProgress.create({
 getRace:()=>race,nearestCourse,points,eliminationProgressUpdate,finishEdgeTolerance,
 finishLinePlane,trackPoint,tangent,showHint,t:(...args)=>t(...args),SND
});
// Commit a new-lap checkpoint immediately after the real finish-plane crossing.
function updateCommittedProgress(c,dt,oldX,oldY){
 const laps=c.lapsCompleted;ttrRaceProgress.updateCarProgress(c,dt,oldX,oldY);
 if((isBath()||isGarage())&&c.lapsCompleted>laps){const p=.002,q=trackPoint(p);c.lastCheckpoint=p;c.lastValidPosition={...q,p,a:tangent(p),laps:c.lapsCompleted,flags:c.flags.slice(),elimDistance:c.elimDistance};c.previousValidPosition=null;c.offtrackEntry=null;c.routePinch=null;}
}
const ttrRaceTiming=window.TTRRaceTiming.create({
 getRace:()=>race,showHint,t:(...args)=>t(...args),SND
});

// Fase 9 — blocchi di comportamento estratti senza alterare l'ordine in update(dt).
const ttrRaceCPU=window.TTRRaceCPU.create({
 getRace:()=>race,getOnlineSession:()=>onlineSession,distance,recoverCar,clawTarget,props,useItem
});
const ttrRaceOil=window.TTRRaceOil.create({
 getRace:()=>race,milkCerealSpills,oilHit:(c,x,y,o)=>{const hit=(!isDesk()||isBath()||DR.sameOilSurface(c,o))&&oilHit(c,x,y,o);if(hit&&race.oils.includes(o))c.oilHits=(c.oilHits||0)+1;return hit;},SND
});
const ttrRacePickups=window.TTRRacePickups.create({
 getRace:()=>race,circleRotatedRect,pickupType,K,SND
});
const ttrRaceCollisions=window.TTRRaceCollisions.create({
 getRace:()=>race,props,contactWithProp,stuckRecoveryStep,recoverCar,
 resolveCarContacts,eliminationActive,edgeOfTable,startTableFall,SND
});


// Fase 10 — adapter Eliminazione: stato gara condiviso, nessuna copia di race.
let ttrEliminationMode=makeEliminationMode();
function makeEliminationMode(){return window.TTRModeElimination.create({
 getRace:()=>race,getI18N:()=>I18N,K,SND,$,LANE_HALF,TRACK_LENGTH,
 nearestTrack,nearestTrackWindow,nearestCourse,tangent,points,
 elimBanner,elimDisplayName,refreshEliminationBoard,eliminationNewRound,
 eliminationCameraLeader,eliminationViewBounds,eliminationPhysicalOvertake,
 eliminationProjectedAhead,ELIM_RULES_TEST,hideEliminationUI,showResults
});}

function update(dt,refreshHud=true){clock+=dt;if(!race)return;if(race.mode==='online')return;if(race.paused||race.finished||innerHeight>innerWidth){syncAudio();return;}
 if(race.mode==='elimination'&&eliminationEndPoint(dt)){syncAudio();return;}
 if(race.mode==='online'&&onlineSession?.host&&!onlineSession.allLoaded){syncAudio();return;}
 if(race.countdown>0){ttrRaceTiming.advanceCountdown(dt);syncAudio();return;}
 ttrRaceTiming.advanceLiveFrame(dt);
 const events=window.TTREnvironmentEvents;events.step(race.environmentEvents,race,props,dt,SND);if(isBox())BR.stepBalls(props,dt,o=>events.impact(race.environmentEvents,race,o,SND),(o,p)=>events.capture(race.environmentEvents,race,o,p,SND));
 if(isDesk()&&!isBath())DR.stepObjects(props,dt);
 for(const c of race.cars){if(c.done)continue;
  if(isDesk()&&c.deskBridge){const old={x:c.x,y:c.y};DR.transit(c,dt,race,SND,c===race.player&&inputFor(c).brake);updateCommittedProgress(c,dt,old.x,old.y);if(!c.deskBridge){c.lastCheckpoint=c.p;c.lastValidPosition={x:c.x,y:c.y,p:c.p,a:c.a,laps:c.lapsCompleted,flags:c.flags.slice(),elimDistance:c.elimDistance};if(perfEnabled&&perfCars[c.id])perfCars[c.id].ramps++;}continue;}
  if(isBox()&&BR.transit(c,dt,race,SND)){if(perfEnabled&&perfCars[c.id]){const m=perfCars[c.id];if(!c.boxTransit&&Number.isFinite(c.boxEntryTime)){m.ramps++;(m.boxTunnelTimes??=[]).push(+(race.time-c.boxEntryTime).toFixed(3));if(m.boxTunnelTimes.length>30)m.boxTunnelTimes.shift();}}continue;}
  if((c.tableFalling||0)>0){
    c.tableFalling=Math.max(0,c.tableFalling-dt);
    if(c.tableFalling>.56){c.a+=(c.tableSpin||8.2)*dt;c.speed=Math.max(0,c.speed*(1-dt*2.2));}
    // Impact happens after a visible fall, followed by a pronounced smoke cloud.
    if(!c.tableFallImpact&&c.tableFalling<=.63){
      c.tableFallImpact=true;c.speed=0;
      race.effects.push({kind:'fallCloud',x:c.x,y:c.y,t:1.05,ttl:1.05});
      if(c===race.player)SND.sfx('fallImpact');
    }
    if(c.tableFalling<=0){recoverCar(c,'table-fall');}
    continue;
  }const ctl=inputFor(c),mul=1;let vmax=c.profile.max*mul,accelerate=c.profile.acc*mul;if(perfEnabled){const m=perfCars[c.id]??=( {id:c.id,model:c.profile.name,seconds:0,sum:0,max:0,gas:0,brake:0,mul,cap:vmax,acc:accelerate,ramps:0} );m.lapTimes??=[];m.lapStart??=0;perfSyncCounters(c,m);m.personality=c.aiPersonality??null;m.lastPenalty??='';m.reason??='';m.seconds+=dt;m.sum+=Math.abs(c.speed)*dt;m.max=Math.max(m.max,Math.abs(c.speed));m.gas+=ctl.gas?dt:0;m.brake+=ctl.brake?dt:0;}
 // Sticky jam has a lasting, measurable slowdown and reduced acceleration.
 // It is not another oil patch: grip remains predictable, speed is limited.
 const inJam=isBreakfast()&&c.jump<=0&&jamHit(c,jamPatch);
 if(inJam&&!c.wasInJam&&c===race.player)SND.sfx('jamSurface');c.wasInJam=inJam;
 c.jamTimer=inJam?.85:Math.max(0,(c.jamTimer||0)-dt);
 if(c.jamTimer>0){accelerate*=.40;}
 const boost=c.boost>0;c.reverseRecovery=Math.max(0,c.reverseRecovery-dt);c.boost=Math.max(0,c.boost-dt);c.slip=Math.max(0,c.slip-dt);const wasAirborne=c.jump>0;c.jump=Math.max(0,c.jump-dt);c.jumpCd=Math.max(0,c.jumpCd-dt);if(wasAirborne&&c.jump===0&&c===race.player&&!c.bridgeTakeoff)SND.sfx('landing');
 // Brake takes absolute priority over automatic throttle, including after impacts.
 c.speed=stepDriveSpeed(c.speed,ctl,dt,{max:vmax,acc:accelerate},boost&&c.jamTimer<=0);
 if(c.jamTimer>0){const target=Math.max(54,vmax*.46);
   c.speed=Math.sign(c.speed)*Math.min(Math.abs(c.speed),Math.max(target,Math.abs(c.speed)-385*dt));
 }
 // A fall from the toast bridge costs time; it is neither a free shortcut nor a respawn.
 if(c.bridgeMissActive){const cap=c.bridgeFalling>0?32:100;c.speed=Math.sign(c.speed)*Math.min(Math.abs(c.speed),cap);}
 // The pocket exit is a short, controllable merge, not a launch.
 const boxExitAssist=isBox()?Math.max(0,c.boxExitAssist||0):isDesk()?Math.max(0,c.deskExitAssist||0):0;
 const exitAssistDuration=isDesk()?DR.exitAssistDuration:BR.exitAssistDuration;
 if(boxExitAssist>0&&c.speed>0){
   const u=clamp(1-boxExitAssist/exitAssistDuration,0,1);
   const cap=vmax*(.40+.60*u*u*(3-2*u));
   c.speed=Math.min(c.speed,cap);
 }
 c.steer=ctl.steer;
 c.knifeCd=Math.max(0,(c.knifeCd||0)-dt);
 c.bridgeMissGrace=Math.max(0,(c.bridgeMissGrace||0)-dt);
 c.bridgeMissPenalty=Math.max(0,(c.bridgeMissPenalty||0)-dt);
 if(c.bridgeMissActive&&c.bridgeMissPenalty<=0)c.bridgeMissActive=false;
 c.bridgeFalling=Math.max(0,(c.bridgeFalling||0)-dt);
  c.bridgeExitVisual=Math.max(0,(c.bridgeExitVisual||0)-dt);c.bridgeContactGrace=Math.max(0,(c.bridgeContactGrace||0)-dt);
 c.oilCooldown=Math.max(0,(c.oilCooldown||0)-dt);
 c.respawnGrace=Math.max(0,(c.respawnGrace||0)-dt);
 c.impactGrace=Math.max(0,(c.impactGrace||0)-dt);
 const preSurface=offTrackDynamics(isDesk()&&c.onBridge?D.shortcutNearest(c).distance:!isBreakfast()?nearestTrackWindow(c,points,c.routeStableP??c.p,.047).distance:nearestCourse(c,points).distance);
 // Jam slowing is handled before acceleration; no fake tiny per-frame drag.

 if(preSurface.outside)c.speed*=Math.max(.93,1-(1-preSurface.speedFactor)*dt*1.9);

 const headingBeforeTurn=c.a,bathGrip=isBath()?Bath.wetGrip(c):1;
 if(isBath()&&c.jump<=0&&c.speed>0&&!c.onBridge)c.speed=Math.max(0,c.speed-95*Bath.gradeAt(c.routeStableP??c.p)*dt);
 let turn=c.profile.turn*(.24+clamp(Math.abs(c.speed)/160,0,1)*.76)*(c.slip>0?.38:1)*preSurface.grip*bathGrip*(c.profile.gripFactor||1);
 if((c.oilSpin||0)>0){const step=Math.min(dt,c.oilSpin);c.a+=c.oilSpinDir*2*Math.PI*(step/1.16);c.oilSpin-=step;c.speed=Math.sign(c.speed)*Math.min(Math.abs(c.speed),isBath()&&Number.isFinite(c.bathBrushSpinHeading)?110:145);}
 else {
   const assist=boxExitAssist;
   if(assist>0&&c.speed>0&&!ctl.brake){
     // Follow the immediate road curvature, without fighting deliberate input.
     const blend=clamp(1-assist/exitAssistDuration,0,1);
     const target=(isDesk()?D:B).tangent((c.routeStableP??c.p)+.005);
     const correction=clamp(angleDiff(target,c.a),-.55,.55);
     c.a+=correction*Math.min(1,dt*4*(1-blend)*(1-.65*Math.min(1,Math.abs(ctl.steer))));
     c.a+=ctl.steer*turn*(.65+.35*blend)*dt;
   }else c.a+=ctl.steer*turn*(c.speed>=0?1:-.7)*dt;
   if(assist>0){if(isDesk())c.deskExitAssist=Math.max(0,assist-dt);else c.boxExitAssist=Math.max(0,assist-dt);}
 }
 c.a+=(c.hitYaw||0)*dt;c.hitYaw=(c.hitYaw||0)*Math.exp(-4.0*dt);
 if(c.claw>0){
   c.claw-=dt;const t=c.clawTarget,d=t?distance(c,t):0;
   const front=t?Math.abs(angleDiff(Math.atan2(t.y-c.y,t.x-c.x),c.a)):99;
   const obstructed=t?props.some(o=>o.solid&&K.segmentCircle(c,t,o,(o.r||18)+2)):true;
   if(!t||t.done||t.boxTransit>0||d>164||front>.65||obstructed||c.jump>0||t.jump>0){c.claw=0;c.clawTarget=null;}
   else{
     const result=clawPullStep(c,t,dt);
     if(!result.connected){c.claw=0;c.clawTarget=null;}
   }
 }
 const oldX=c.x,oldY=c.y;
 // Grip and stability govern lateral drift recovery, unlike top speed/acceleration.
 const slideDrag=(c.slip>0?.95:5.6)*(c.profile.gripFactor||1)*(c.profile.stabilityFactor||1)*bathGrip;
 // On wet ceramic, retain a bounded component of the previous velocity when steering.
 // No snap to centreline, no hidden guidance. Dry surfaces remain unchanged.
 if(isBath()&&bathGrip<1&&c.jump<=0&&c.speed>0&&!(c.oilSpin>0)){
   const lateral=Math.sin(headingBeforeTurn-c.a)*c.speed*(1-bathGrip)*1.35;
   c.skidVX=(c.skidVX||0)-Math.sin(c.a)*lateral;c.skidVY=(c.skidVY||0)+Math.cos(c.a)*lateral;
   const skid=Math.hypot(c.skidVX,c.skidVY),cap=Math.max(18,c.speed*.27);
   if(skid>cap){c.skidVX*=cap/skid;c.skidVY*=cap/skid;}
 }
 c.skidVX=(c.skidVX||0)*Math.exp(-slideDrag*dt);
 c.skidVY=(c.skidVY||0)*Math.exp(-slideDrag*dt);
 const travelHeading=isBath()?DR.spinTravelHeading(c):c.a;
 c.x+=(Math.cos(travelHeading)*c.speed+(c.hitVX||0)+c.skidVX)*dt;
 c.y+=(Math.sin(travelHeading)*c.speed+(c.hitVY||0)+c.skidVY)*dt;events.effect(race.environmentEvents,race,c,dt,SND);
 if(isBath()&&!(c.oilSpin>0))c.bathBrushSpinHeading=null;
 const hitDrag=(c.impactGrace>0?2.65:6.0)*(c.profile.stabilityFactor||1);
 c.hitVX=(c.hitVX||0)*Math.exp(-hitDrag*dt);c.hitVY=(c.hitVY||0)*Math.exp(-hitDrag*dt);
 c.wheelPhase=(c.wheelPhase||0)+Math.abs(c.speed)*dt/11.5;
 // v80: treat a real entrance contact as an immediate jump. Running this
 // before route audits avoids declaring a legitimate pre-lip approach illegal.
 c.rampEntryVisual=false;
 if(!c.onBridge && c.jump<=0){
   for(const o of props){if(o.type!=='ramp')continue;
     const previous={x:oldX,y:oldY};
     const valid=!c.bridgeFallAudit&&!c.bridgeMissActive&&!(c.bridgeMissGrace>0)&&!(c.respawnGrace>0);
     if(valid&&rampEntryVisual(c,o,previous))c.rampEntryVisual=true;
     if(valid&&rampLaunch(c,o,previous)){
       c.jump=.96;c.jumpTotal=.96;c.jumpCd=1.85;
       c.speed=Math.min(vmax*1.36,Math.max(Math.min(152,vmax),c.speed)*1.17);
       c.boost=Math.max(c.boost,.68);c.rampBoosts=(c.rampBoosts||0)+1;
       c.bridgeEntrySafe=c.lastValidPosition?{...c.lastValidPosition,flags:c.lastValidPosition.flags.slice()}:null;ttrRaceSafety.bridgeLog(c,'launch',{anchor:c.bridgeEntrySafe?.p??c.p});c.onBridge=true;c.bridgeTakeoff=true;c.rampEntryVisual=false;c.bridgeOffSeconds=0;c.offtrack=false;c.offtrackEntry=null;c.offtrackSeconds=0;c.routePinch=null;if(perfEnabled&&perfCars[c.id]){perfCars[c.id].ramps++;if(c!==race.player&&!c.tryShortcut)perfCars[c.id].unplannedRamps=(perfCars[c.id].unplannedRamps||0)+1;}
       if(c===race.player)SND.sfx('ramp');
       break;
     }
   }
 }
 const beforeCPURecovery=c.shortcutRespawns||0;ttrRaceCPU.updateRecovery(c,dt);if(!isBreakfast()&&(c.shortcutRespawns||0)!==beforeCPURecovery)continue;
 // On-road snapshots are only written after complete frame of verified lane contact.
 // No penalty for a normal outside detour at the finish-line seam (p=1 -> p=0).
 if(isDesk()){if(DR.enter(c,{x:oldX,y:oldY},race,SND)){updateCommittedProgress(c,dt,oldX,oldY);continue;}const deskWasOnBridge=c.onBridge;if(!DR.environment(c,{x:oldX,y:oldY},dt,race,recoverCar,SND)){continue;}if(deskWasOnBridge&&!c.onBridge&&perfEnabled&&perfCars[c.id])perfCars[c.id].ramps++;if(edgeOfTable(c)){startTableFall(c);continue;}}else if(isBox()){if(!BR.environment(c,{x:oldX,y:oldY},dt,race,recoverCar,SND)){continue;}}else{
 const bridgeGuard=c.bridgeFallAudit?ttrRaceSafety.bridgeFallGuard(c,nearestTrack(c,points),dt,shortcutFrom):'none';
 if(bridgeGuard==='recover')continue;
 if(bridgeGuard==='pending'){c.routeResolvedNear=null;continue;}
 let near=c.onBridge?{...shortcutNearest(c),shortcut:true}:nearestCourse(c,points);
 if(near.shortcut&&!c.onBridge&&!c.bridgeTakeoff&&!c.bridgeLandingActive&&!c.bridgeMissActive)near={...nearestTrack(c,points),shortcut:false};
 const routeCheck=junctionContinuity(c,near,oldX,oldY,dt);
 if(routeCheck.penalty){recoverCar(c,'junction-cut');continue;}
 near=routeCheck.near;c.routeResolvedNear=near;
 let surface=offTrackDynamics(near.distance);
 if(c.onBridge)surface={...surface,outside:false};
 // In the first two bends, the cloth is visually continuous but nearest-track
 // projection can briefly overshoot its nominal 138u centreline distance.
 // A 20u edge cushion avoids false respawns on legitimate inside racing lines.
 const protectedEarlyBend=near.p>.015&&near.p<.335&&near.distance<=165;
 if(protectedEarlyBend&&surface.outside)surface={outside:false,grip:surface.grip,speedFactor:surface.speedFactor};
 // Bridge return is validated by bridgeFallGuard before route projection.
 const nowInside=insideTrackLoop(c,points);
 // The toast bridge is the only approved shortcut and is explicitly exempt.
 // It must be approached through the ramp (c.onBridge), not by jumping the map.
 if(c.onBridge){c.auditBridge=true;}
 else if(c.auditBridge){c.auditBridge=false;c.auditP=near.p;c.auditTravel=0;c.auditCleanTime=0;c.auditOutsideTime=0;}
 else if(!c.bridgeMissActive && !c.bridgeLandingActive && !(c.respawnGrace>0) && !(c.impactGrace>0)){
   const deltaTravel=Math.hypot(c.x-oldX,c.y-oldY);
   c.auditTravel=(c.auditTravel||0)+Math.min(deltaTravel,40);
   // A large phase jump is NOT sufficient evidence of an illegal shortcut:
   // at adjacent hairpins, two legitimate road segments can project to widely
   // separated phases. Require verified time away from the drivable corridor.
   c.auditOutsideTime=near.distance>196&&!near.shortcut?(c.auditOutsideTime||0)+dt:Math.max(0,(c.auditOutsideTime||0)-dt*.6);
   const suspiciousAdvance=illegalRouteGain(c.auditP??c.lastP??near.p,near.p,c.auditTravel,TRACK_LENGTH);
   if(suspiciousAdvance&&c.auditOutsideTime>.47){
     recoverCar(c,'route-cut');continue;
   }
   if(near.distance<75&&!surface.outside&&c.speed>=0&&Math.cos(angleDiff(c.a,tangent(near.p)))>.38){
     c.auditCleanTime=(c.auditCleanTime||0)+dt;
     const gain=K.forwardProgress(c.auditP??near.p,near.p)*TRACK_LENGTH;
     if(c.auditCleanTime>.24&&gain>165&&gain<c.auditTravel*1.13+30){
       c.auditP=near.p;c.auditTravel=0;c.auditCleanTime=0;c.auditOutsideTime=0;
     }
   } else c.auditCleanTime=0;
 }
 // Only a return to the entrance side of the ordinary road clears a missed bridge.
 // This prevents crossing the cloth directly to the bridge exit as a free shortcut.
 if(c.bridgeMissActive){const m=nearestTrack(c,points);
   if(m.distance<85&&m.p>=shortcutFrom-.065&&m.p<=shortcutFrom+.045){
     c.bridgeMissActive=false;c.bridgeMissPenalty=0;c.bridgeMissGrace=0;c.offtrack=false;
     c.offtrackEntry=null;c.offtrackSeconds=0;
   }
 }
 // Early bend gate: a big cut across the table before the cup is not a valid route.
 // Do not interfere with the approved toast bridge, recovery grace or landing state.
 if(perfEnabled&&near.p>=.238&&near.p<=.306&&!near.shortcut&&!c.onBridge){
   if(mugBendGate(near,c,false).legalApex&&!c.perfCupApexSeen){c.perfCupApexSeen=true;c.cupApexVisits=(c.cupApexVisits||0)+1;}
   if(c.impactGrace>0||c.respawnGrace>0||c.bridgeMissGrace>0)c.cupGraceFrames=(c.cupGraceFrames||0)+1;
 }else c.perfCupApexSeen=false;
 if(!near.shortcut&&!c.onBridge&&!c.bridgeLandingActive&&!c.bridgeMissActive&&!(c.bridgeMissGrace>0)&&!(c.respawnGrace>0)&&!(c.impactGrace>0)&&!(c.tableFalling>0)){
   const gate=mugBendGate(near,c,c.mugApexPassed);
   c.mugApexPassed=gate.passed;
   if(gate.penalty){recoverCar(c,'cup-cut');continue;}
 }
 if(!c.routePinch&&!near.orangeLine&&near.distance<64&&!near.shortcut&&!c.offtrack&&!(c.respawnGrace>0)&&!c.stuckAnchor&&
    Math.cos(angleDiff(c.a,tangent(near.p)))>.23&&c.speed>=0&&!c.bridgeMissActive&&!c.bridgeLandingActive&&!c.onBridge){
   if(c.lastValidPosition&&(!c.previousValidPosition||K.phaseGap(c.previousValidPosition.p,c.lastValidPosition.p)>.025))c.previousValidPosition={...c.lastValidPosition,flags:c.lastValidPosition.flags.slice()};
   c.lastValidPosition={x:near.x,y:near.y,a:tangent(near.p),p:near.p,speed:Math.abs(c.speed),laps:c.lapsCompleted,flags:c.flags.slice(),mugApexPassed:!!c.mugApexPassed,elimDistance:c.elimDistance};
   c.lastCheckpoint=near.p;
 }
 if(surface.outside&&!c.offtrack){
   if(!finishEdgeTolerance(c,near))c.lapGateBlocked=true; // short legal finish excursion does not disarm a previously earned gate
   c.offtrackEntry=c.lastValidPosition||{x:near.x,y:near.y,a:tangent(near.p),p:near.p,speed:50,laps:c.lapsCompleted,flags:c.flags.slice(),mugApexPassed:!!c.mugApexPassed};
    c.maxInteriorCut=0;c.offtrackSeconds=0;c.offtrackReturnGrace=0;c.offtrackLastDistance=near.distance;
    if(c===race.player)SND.sfx('offtrack');
 }
 if(surface.outside||c.offtrack){
   c.offtrackSeconds=(c.offtrackSeconds||0)+dt;
   if(nowInside)c.maxInteriorCut=Math.max(c.maxInteriorCut||0,near.distance);
   const penalty=!near.shortcut&&c.offtrackEntry&&shortcutViolation(c.offtrackEntry.p,near.p,nowInside,
      c.offtrackSeconds,c.maxInteriorCut||0);
   const lenientJamCurve=near.p>.77&&near.p<.84&&near.distance<164&&c.offtrackSeconds<.70;
   const lenientFinish=(!near.shortcut)&&(near.p>.965||near.p<.03)&&near.distance<166&&c.offtrackSeconds<.62;
   // A driver visibly returning to the course gets a short continuous correction window.
    const retreat=(c.offtrackLastDistance??near.distance)-near.distance;
    c.offtrackReturnGrace=Math.max(0,(c.offtrackReturnGrace||0)-dt);
    if(retreat>Math.max(1.0,dt*20))c.offtrackReturnGrace=1.0;
    c.offtrackLastDistance=near.distance;
    const recoverWide=!(c.offtrackReturnGrace>0)&&wideCornerRecovery(near.distance,c.offtrackSeconds,near.shortcut);
   // Early breakfast bend: keep legal tight lines safe, but do NOT allow a cloth-cut before the mug.
   const earlyBendAdvance=!near.shortcut&&c.offtrackEntry?K.forwardProgress(c.offtrackEntry.p,near.p):0;
   const lenientEarlyBend=!near.shortcut&&near.p>.095&&near.p<.335&&near.distance<166&&c.offtrackSeconds<.90&&earlyBendAdvance<.065&&(c.maxInteriorCut||0)<155;
   if(!c.onBridge&&!c.bridgeLandingActive&&!c.bridgeMissActive&&!(c.bridgeMissGrace>0)&&!(c.respawnGrace>0)&&!(c.impactGrace>0)&&!(lenientEarlyBend||lenientJamCurve||lenientFinish)&&(penalty||recoverWide)){
     recoverCar(c,penalty?'shortcut':'wide-corner');continue;
   }else if(!surface.outside){
     // A legal return resumes progress; the finish uses its own bounded tolerance.
     c.offtrack=false;c.offtrackEntry=null;c.offtrackSeconds=0;c.maxInteriorCut=0;c.offtrackReturnGrace=0;c.offtrackLastDistance=0;
   }else c.offtrack=true;
 }
 // Mid-bridge crossing is never a legal shortcut. A misstep drops onto the cloth;
 // it does NOT teleport the car to a checkpoint. The lost momentum is the penalty.
 if(!c.onBridge && !(c.respawnGrace>0) && !c.bridgeMissActive && !(c.bridgeMissGrace>0)){
   const b=shortcutNearest(c),main=nearestTrack(c,points);
   if(b.t>.22&&b.t<.90&&b.distance<26&&main.distance>138){
     bridgeFall(c);near=nearestCourse(c,points);
   }
 }
 // On the narrow toast, the edge is a real fall rather than an instant respawn.
 if(c.onBridge){
   const branch=shortcutNearest(c);
   if(!c.bridgeTakeoff&&c.jump<=0&&branch.t>.96 && branch.distance<65&&nearestTrack(c,points).distance<138){ttrRaceSafety.bridgeLog(c,'exit');c.bridgeEntrySafe=null;c.onBridge=false;c.bridgeOffSeconds=0;c.bridgeExitVisual=.80;c.bridgeTakeoff=false;c.offtrack=false;c.offtrackEntry=null;c.offtrackSeconds=0;c.routePinch=null;c.routeStableP=shortcutTo;c.auditP=shortcutTo;c.auditTravel=0;c.auditOutsideTime=0;c.bridgeMissGrace=Math.max(c.bridgeMissGrace||0,.55);}
   else if(c.jump>0){
     // Do not judge airborne steering as a failed landing: measure contact only
     // after the wheels touch the lower tablecloth / toast bridge.
     c.bridgeOffSeconds=0;
   }else if(!c.bridgeTakeoff&&bridgeLaneViolation(c,47)&&!(c.bridgeContactGrace>0)){
     c.bridgeOffSeconds=(c.bridgeOffSeconds||0)+dt;
     if(c.bridgeOffSeconds>.22){bridgeFall(c);near=nearestCourse(c,points);}
   }else c.bridgeOffSeconds=0;
 }
 // The actual boundary of the tabletop, not the crumb border, is a rescue zone.
 if(edgeOfTable(c)&&!(c.tableFalling>0)){startTableFall(c);continue;}

  // v80: the actual landing determines whether the driver stays on toast.
  // During flight the vehicle is above the deck; a wide landing fails with
  // lost momentum and a real drop to the cloth, never a free teleport.
  if(c.bridgeTakeoff && c.jump<=0){
    c.bridgeTakeoff=false;
    const landing=shortcutNearest(c);
    if(landing.t>.94&&landing.distance<=65&&nearestTrack(c,points).distance<138){ttrRaceSafety.bridgeLog(c,'exit');c.bridgeEntrySafe=null;c.onBridge=false;c.bridgeExitVisual=.80;c.offtrack=false;c.offtrackEntry=null;c.offtrackSeconds=0;c.routePinch=null;c.routeStableP=shortcutTo;c.auditP=shortcutTo;c.auditTravel=0;c.auditOutsideTime=0;c.bridgeMissGrace=Math.max(c.bridgeMissGrace||0,.55);}else if(!(landing.t>=.012&&landing.t<=.94&&landing.distance<=45)){
      bridgeFall(c);near=nearestCourse(c,points);
    }else{
      c.onBridge=true;c.bridgeOffSeconds=0;
    }
  }
 }
 if(c.bridgeFallAudit)continue;
 const recoveryBefore=c.shortcutRespawns||0;
 ttrRaceCollisions.handleObstacles(c,oldX,oldY,dt);
 if((c.shortcutRespawns||0)!==recoveryBefore)continue;
 const priorOilSpin=c.oilSpin||0;ttrRaceOil.handleOilContact(c,oldX,oldY);if(isBath()&&priorOilSpin<=0&&c.oilSpin>0)DR.beginBrushSpin(c);
 ttrRacePickups.collect(c);
 const lapBefore=c.lapsCompleted;
 updateCommittedProgress(c,dt,oldX,oldY);
 if(perfEnabled&&perfCars[c.id]&&c.lapsCompleted===lapBefore+1){const m=perfCars[c.id];perfSyncCounters(c,m);perfRecordLap(m);}
 if(race.mode==='elimination'&&c.lastValidPosition&&K.phaseGap(c.lastValidPosition.p,c.elimPrevP)<.008){const d=((K.forwardProgress(c.elimPrevP,c.lastValidPosition.p)+.5)%1-.5)*TRACK_LENGTH;c.lastValidPosition.elimDistance=c.elimDistance+d;}
 ttrRaceCPU.useTacticalPowerup(c);
 }
 ttrRaceCollisions.handleCars();
 if(perfEnabled)for(const c of race.cars){const m=perfCars[c.id];if(m)perfSyncCounters(c,m);}
 if(race.trialSession)race.trialSession.sample(race.time,isDesk()&&!isBath()&&race.player.deskExitRamp?{...race.player,bridgeExitVisual:.1}:race.player,{discontinuity:race.trialRecovery!==(race.player.shortcutRespawns||0)});race.trialRecovery=race.player.shortcutRespawns||0;
 if(race.mode==='elimination'){eliminationEvaluate(dt);syncAudio();}
 else if(race.mode==='online'&&onlineSession?.host){
  const members=onlineSession.members.filter(Boolean);const humans=members.map(m=>race.cars[m.slot]).filter(Boolean);
  if(humans.some(c=>c.done)&&!onlineFinishDeadline)onlineFinishDeadline=race.time+26;
  if(humans.length&&((humans.every(c=>c.done))||(onlineFinishDeadline&&race.time>=onlineFinishDeadline))){
   race.finished=true;syncAudio();onlineFinish();SND.stopMusic();SND.sfx('finish');const completedRace=race;setTimeout(()=>{if(race===completedRace&&race.finished)showResults();},850);
  }else syncAudio();
 }else if(race.player.done){race.finished=true;syncAudio();SND.stopMusic();SND.sfx('finish');const completedRace=race;setTimeout(()=>{if(race===completedRace&&race.finished)showResults();},850);}else syncAudio();
 if(refreshHud)hud();
}
function showResults(){return ttrRaceResults.showResults();}
const I18N=window.TTRI18N;
const t=I18N.t;
const ttrRaceResults=window.TTRRaceResults.create({
 getRace:()=>race,$,SND,t,fmtTime,hideEliminationUI,profiles,
 getShowroomStarts:()=>TTRShowroomStarts,flow:window.TTRRaceFlow,
 navigation:{mainMenu,openCircuitLoading,onlineQuit,onlineOpenPanel,openCareer:()=>window.TTRCareer?.open()}
});
let selectedCar=0,garagePreview=0,menuTimer=null,menuStep=0,lastShowroomDraw=0,garageRotationOrigin=0;

// v0.13.6.68 — Canonical first-season circuit catalog. Locked tracks have no driving geometry,
// so they may be previewed in text but are NEVER passed into initRace or misrepresented as playable.
const TTRCircuitCatalog=Object.freeze([
 {id:'colazione-turbo',name:'Colazione Turbo',scene:'colazione',ready:true},
 {id:'box-di-biliardo',name:'Box di Biliardo',scene:'box',ready:true},
 {id:'desk-drift',name:'Desk Drift',scene:'desk',ready:false,prototype:true},
 {id:'bagno-sprint',name:'Bagno Sprint',scene:'bath',ready:false,prototype:true},
 {id:'garage-grid',name:'Garage Grid',scene:'garage',ready:false,prototype:true},
 {id:'giardino-mini-gp',name:'Giardino Mini GP',scene:null,ready:false},
 {id:'market-rush',name:'Market Rush',scene:null,ready:false},
 {id:'sofa-loop',name:'Sofa Loop',scene:null,ready:false},
 {id:'playroom-panic',name:'Playroom Panic',scene:null,ready:false},
 {id:'laundry-slide',name:'Laundry Slide',scene:null,ready:false},
 {id:'terrazza-veloce',name:'Terrazza Veloce',scene:null,ready:false},
 {id:'lab-finale',name:'Lab Finale',scene:null,ready:false}
].map((v,i)=>Object.freeze({...v,index:i+1})));
window.TTRTrackCatalog=TTRCircuitCatalog;
let activeTrackMode=null, selectedTrackId='colazione-turbo';
const TTRTrackCopy=Object.freeze({
 it:{title:'SCEGLI IL CIRCUITO',ready:'GIOCABILE',locked:'IN SVILUPPO',info:'Minimappa reale · Power-up su tutto il tracciato',back:'← INDIETRO',continue:'CONTINUA',launch:'AVVIA GARA',lockedInfo:'Tracciato in sviluppo · minimappa non ancora disponibile'},
 en:{title:'CHOOSE A TRACK',ready:'PLAYABLE',locked:'IN DEVELOPMENT',info:'Actual course map · Power-ups throughout',back:'← BACK',continue:'CONTINUE',launch:'START RACE',lockedInfo:'Track in development · no course map yet'},
 es:{title:'ELIGE EL CIRCUITO',ready:'JUGABLE',locked:'EN DESARROLLO',info:'Minimapa real · Potenciadores en todo el circuito',back:'← VOLVER',continue:'CONTINUAR',launch:'INICIAR CARRERA',lockedInfo:'Circuito en desarrollo · minimapa pendiente'},
 de:{title:'STRECKE WÄHLEN',ready:'SPIELBAR',locked:'IN ENTWICKLUNG',info:'Echte Streckenkarte · Power-ups auf der Strecke',back:'← ZURÜCK',continue:'WEITER',launch:'RENNEN STARTEN',lockedInfo:'Strecke in Entwicklung · noch keine Streckenkarte'},
 fr:{title:'CHOISIR UN CIRCUIT',ready:'JOUABLE',locked:'EN DÉVELOPPEMENT',info:'Vraie carte · Bonus sur tout le parcours',back:'← RETOUR',continue:'CONTINUER',launch:'LANCER LA COURSE',lockedInfo:'Circuit en développement · carte non disponible'},
 pt:{title:'ESCOLHER PISTA',ready:'JOGÁVEL',locked:'EM DESENVOLVIMENTO',info:'Minimapa real · Itens em toda a pista',back:'← VOLTAR',continue:'CONTINUAR',launch:'INICIAR CORRIDA',lockedInfo:'Pista em desenvolvimento · minimapa indisponível'}
});
function TTRTrackAvailable(c,mode){return !!(c?.ready||(c?.prototype&&(c.id==='bagno-sprint'?Bath:c.id==='garage-grid'?Garage:Desk)&&['race','trial','career','elimination','online'].includes(mode)));}
function TTRDrawSelectedTrack(canvas,c,loading=false){
 const box=c?.id==='box-di-biliardo';
 const bath=c?.id==='bagno-sprint',desk=c?.id==='desk-drift'||c?.id==='garage-grid';
 const T=bath?Bath:c?.id==='garage-grid'?Garage:Desk;
 const opts=(desk||bath)?{points:T.points,point:T.point,tangent:T.tangent,theme:loading||bath||c?.id==='garage-grid'?'plain':'desk',shortcuts:[T.shortcutSamples],pickups:loading||bath?T.pickupPhases.slice(0,bath?Math.min(T.pickupPhases.length,Math.max(3,pickupCount(T.length/155))):3).map(T.point):[]}:box?{points:B.points,point:B.point,tangent:B.tangent,theme:loading?'plain':'billiard',pickups:loading?B.pickupPhases.map(B.point):[],pockets:loading?[B.entryPocket,B.exitPocket]:B.pockets}:{points:breakfastPoints,point:Base.trackPoint,tangent:Base.tangent,theme:loading?'plain':'breakfast',pickups:loading?Base.pickupSegments.slice(0,2).map(Base.trackPoint):[],shortcuts:loading?[Base.shortcutSamples]:[]};
 window.TTRMinimapVisuals.drawTrackPreview(canvas,opts);
}
const TTRPrototypeCopy={it:['PROTOTIPO 0.2','Tracciato preliminare · Tutte le modalità','PROVA CIRCUITO'],en:['PROTOTYPE 0.2','Early track · All modes','TEST TRACK'],es:['PROTOTIPO 0.2','Circuito preliminar · Todos los modos','PROBAR CIRCUITO'],de:['PROTOTYP 0.1','Frühe Strecke · Alle Modi','STRECKE TESTEN'],fr:['PROTOTYPE 0.2','Circuit préliminaire · Tous les modes','TESTER LE CIRCUIT'],pt:['PROTÓTIPO 0.1','Pista preliminar · Todos os modos','TESTAR PISTA']};
const TTRProtoCopy=()=>TTRPrototypeCopy[I18N.getLang()]||TTRPrototypeCopy.it;
function TTRPaintCareerTracks(){const root=$('careerCircuitCatalog');if(!root)return;root.replaceChildren();TTRCircuitCatalog.forEach(c=>{const label=document.createElement('span');label.className='ttr-career-circuit'+(TTRTrackAvailable(c,'career')?' ready':'');label.textContent=String(c.index).padStart(2,'0')+' · '+c.name+(c.prototype?' · 0.2':c.ready?' ✓':'');root.append(label);});}
TTRPaintCareerTracks();
function TTROpenTrackSelect(mode){
 if(mode!=='trial'&&mode!=='career'&&!TTRModeConfigs[mode])return;TTRCloseRaceConfig(false);activeTrackMode=mode;
 selectedTrackId='colazione-turbo';const copy=TTRTrackCopy[I18N.getLang()]||TTRTrackCopy.it;
 const panel=$('trackSelect'),grid=$('trackSelectGrid');if(!panel||!grid)return;
 $('trackSelectTitle').textContent=copy.title;
 $('trackSelectSubtitle').textContent=(mode==='trial'?($('trialBtn')?.textContent?.trim()||'TIME TRIAL'):t(mode==='career'?'career':mode==='race'?'quickRace':'elimination'))+' · '+TTRCircuitCatalog.filter(c=>TTRTrackAvailable(c,mode)).length+' / '+TTRCircuitCatalog.length+' '+copy.ready;
 $('trackSelectBack').textContent=copy.back;$('trackSelectNext').textContent=copy.continue;
 grid.replaceChildren();
 TTRCircuitCatalog.forEach((c)=>{
  const btn=document.createElement('button');btn.type='button';btn.className='ttr-track-card'+(c.id===selectedTrackId?' is-selected':'');btn.dataset.track=c.id;
  const available=TTRTrackAvailable(c,mode),statusText=c.ready?copy.ready:(available&&c.prototype?TTRProtoCopy()[0]:copy.locked);
  btn.disabled=!available;btn.setAttribute('aria-label',String(c.index).padStart(2,'0')+' · '+c.name+' · '+statusText);
  if(available){const map=document.createElement('canvas');map.width=180;map.height=94;map.setAttribute('aria-hidden','true');btn.append(map);TTRDrawSelectedTrack(map,c);}
  else{const blank=document.createElement('span');blank.className='ttr-track-empty';blank.classList.add('ttr-v69-upcoming');blank.setAttribute('aria-hidden','true');btn.append(blank);}
  const labels=document.createElement('span');labels.className='ttr-track-info';const title=document.createElement('b');title.textContent=String(c.index).padStart(2,'0')+' · '+c.name;
  const status=document.createElement('small');status.textContent=statusText;labels.append(title,status);btn.append(labels);
  if(available)btn.addEventListener('click',()=>{selectedTrackId=c.id;grid.querySelectorAll('button').forEach(e=>e.classList.toggle('is-selected',e.dataset.track===c.id));TTRUpdateTrackPreview();SND.sfx('select');});grid.append(btn);
 });
 TTRUpdateTrackPreview();panel.hidden=false;grid.querySelector('.is-selected')?.focus();SND.sfx('select');
}
function TTRUpdateTrackPreview(){const c=TTRCircuitCatalog.find(t=>t.id===selectedTrackId);const copy=TTRTrackCopy[I18N.getLang()]||TTRTrackCopy.it;if(!c)return;
 const available=TTRTrackAvailable(c,activeTrackMode);
 $('trackSelectSelected').textContent=String(c.index).padStart(2,'0')+' · '+c.name.toUpperCase();$('trackSelectInfo').textContent=c.prototype&&available?TTRProtoCopy()[1]:c.ready?copy.info:copy.lockedInfo;
 if(available){TTRDrawSelectedTrack($('trackSelectMap'),c);try{const id=profiles[selectedCar]?.id,db=JSON.parse(localStorage.getItem('ttr_trial_records_v1_'+c.id+'-events151')||'{}');const best=db[id]?.bestLap;$('trackSelectInfo').textContent+=' · '+TTRLoadText()[22]+': '+(typeof best==='number'&&Number.isFinite(best)&&best>0?window.TTRTrialSession.formatTime(best):'—');}catch(_){}}
 $('trackSelectNext').textContent=c.prototype&&available?TTRProtoCopy()[2]:copy.continue;
 $('trackSelectNext').disabled=!available;
}
function TTRCloseTrackSelect(){const panel=$('trackSelect');if(panel)panel.hidden=true;activeTrackMode=null;}
function TTRAdvanceTrackSelect(){const c=TTRCircuitCatalog.find(t=>t.id===selectedTrackId);if(!activeTrackMode||!TTRTrackAvailable(c,activeTrackMode))return;
 const mode=activeTrackMode;TTRCloseTrackSelect();
 if(!TTRTrackAvailable(c,mode)||!c.scene)return;
 if(mode==='career'){SND.unlock();stopMenuMusic();openCircuitLoading('career');return;}
 if(mode==='trial'){window.TTRModeTrial.setTrack(c.id);window.TTRModeTrial.menu(profiles,profiles[selectedCar],()=>{stopMenuMusic();openCircuitLoading('trial');});return;}
 TTROpenRaceConfig(mode);
}
// v67: separate persistent race configurations; never mix with global language/audio settings.
const TTRModeDefaults=Object.freeze({race:Object.freeze({racers:'4',difficulty:'1',elimGoal:'5'}),elimination:Object.freeze({racers:'4',difficulty:'1',elimGoal:'5'})});
let TTRModeConfigs={race:{...TTRModeDefaults.race},elimination:{...TTRModeDefaults.elimination}},activeConfigMode=null;
try{const saved=JSON.parse(localStorage.getItem('ttr_mode_config_v67')||'null');if(saved&&typeof saved==='object')for(const m of ['race','elimination'])if(saved[m])for(const k of Object.keys(TTRModeDefaults[m])){const val=String(saved[m][k]);if(({racers:['4','6','8'],difficulty:['0.8','1','1.13'],elimGoal:['3','5','7']})[k].includes(val))TTRModeConfigs[m][k]=val;}}catch(_){}
function TTRCareerDifficulty(){const state=window.TTRCareer?.getState?.()||{};return window.TTRRaceFlow.careerDifficulty(state,window.TTRCareerCore?.medalCount);}
function TTRCloseRaceConfig(returnToTracks=false){const mode=activeConfigMode;const panel=$('raceConfig');if(panel)panel.hidden=true;activeConfigMode=null;if(returnToTracks&&mode)TTROpenTrackSelect(mode);}
function TTROpenRaceConfig(mode){if(!TTRModeConfigs[mode])return;const chosen=TTRCircuitCatalog.find(c=>c.id===selectedTrackId);if(!TTRTrackAvailable(chosen,mode)||!chosen.scene)return;
 activeConfigMode=mode;const panel=$('raceConfig'),cfg=TTRModeConfigs[mode];if(!panel)return;
 for(const name of ['racers','difficulty','elimGoal'])$(name).value=cfg[name];$('eliminationGoalField').hidden=mode!=='elimination';
 const title=$('raceConfigTitle');title.dataset.i18n=mode==='race'?'quickRace':'elimination';I18N.apply();
 $('raceSelectedTrack').textContent=String(chosen.index).padStart(2,'0')+' · '+chosen.name.toUpperCase();
 const copy=TTRTrackCopy[I18N.getLang()]||TTRTrackCopy.it;const start=$('raceConfigStart');start.removeAttribute('data-i18n');start.textContent=copy.launch;
 panel.hidden=false;start.focus();SND.sfx('select');}
function TTRStartConfiguredRace(){const mode=activeConfigMode;const track=TTRCircuitCatalog.find(c=>c.id===selectedTrackId);if(!TTRModeConfigs[mode]||!TTRTrackAvailable(track,mode)||!track.scene)return;
 const cfg={};for(const name of ['racers','difficulty','elimGoal'])cfg[name]=$(name).value;TTRModeConfigs[mode]=cfg;
 try{localStorage.setItem('ttr_mode_config_v67',JSON.stringify(TTRModeConfigs));}catch(_){}
 TTRCloseRaceConfig(false);SND.unlock();stopMenuMusic();openCircuitLoading(mode);}

try{selectedCar=+localStorage.getItem('ttr_selected_car')||0;}catch(e){}selectedCar=clamp(selectedCar,0,profiles.length-1);
const initialMenu=$('screen').innerHTML;
function mainMenu(){
 selectedTrackId='colazione-turbo';selectCircuit(selectedTrackId);
 if(onlineSession)onlineQuit();
 ttrRaceResults.cancelMusicTimer();
 loadingToken++;$('loadingTrack').hidden=true;if(race){perfArchiveCompleted(race);perfContext.completed=!!race.finished;perfContext.serverAuthority=race.serverAuthority??null;perfContext.serverTick=race.serverTick??null;perfContext.bridgeEvents=race.bridgeEvents||[];perfContext.bridgeEventsDropped=race.bridgeEventsDropped||0;perfContext.runtimeFault=race.runtimeFault??null;perfContext.environmentEvents=window.TTREnvironmentEvents.snapshot(race.environmentEvents);perfRecoveries=race.recoveryHistory||[];perfRecoveryDropped=race.recoveryHistoryDropped||0;}race=null;releaseAllControls();hideEliminationUI();$('pauseOverlay').hidden=true;syncAudio();$('garageScreen').hidden=true;$('languageScreen').hidden=true;if($('careerScreen'))$('careerScreen').hidden=true;if($('careerMissionsScreen'))$('careerMissionsScreen').hidden=true;
 const oldSettings=$('retroSettings');if(oldSettings)oldSettings.remove();const oldRaceConfig=$('raceConfig');if(oldRaceConfig)oldRaceConfig.remove();const oldTrackSelect=$('trackSelect');if(oldTrackSelect)oldTrackSelect.remove();
 $('screen').innerHTML=initialMenu;$('screen').hidden=false;$('screen').style.display='flex';$('controls').style.display='none';$('hud').style.display='none';
 I18N.apply();wireMenu();startMenuMusic();refreshAudioUI();if($('menuCarName'))$('menuCarName').textContent=profiles[selectedCar].name.toUpperCase();drawShowroom($('menuCar'),selectedCar,'menu');
}
function showLanguage(){stopMenuMusic();$('screen').hidden=true;$('screen').style.display='none';$('garageScreen').hidden=true;$('languageScreen').hidden=false;}
// Fase 6f: wrapper di compatibilità; l'intera pittura delle vetture vive nel modulo 06f.
const {TTRShowroomStarts,TTRShowroom60}=window.TTRVehicleVisuals;
const TTRAssetCopy={it:['CARICAMENTO MODELLINO…','Asset vetture non disponibili. Riprova.','RIPROVA','INDIETRO'],en:['LOADING MODEL…','Vehicle assets unavailable. Retry.','RETRY','BACK'],es:['CARGANDO MODELO…','Recursos de vehículos no disponibles. Reintenta.','REINTENTAR','ATRÁS'],de:['MODELL WIRD GELADEN…','Fahrzeugdaten fehlen. Erneut versuchen.','ERNEUT','ZURÜCK'],fr:['CHARGEMENT DU MODÈLE…','Modèles indisponibles. Réessayer.','RÉESSAYER','RETOUR'],pt:['CARREGANDO MODELO…','Modelos indisponíveis. Tente novamente.','TENTAR','VOLTAR']};
const assetCopy=()=>TTRAssetCopy[I18N.getLang()]||TTRAssetCopy.it;
function drawShowroom(canvas,index,view='menu'){
 const id=profiles[index]?.id;if(!canvas||!id)return;const assets=window.TTRAssets;
 if(!assets?.ensureTurntable(id)){assets?.requestTurntable(id);const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#24265f';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff1aa';ctx.font='bold '+Math.max(12,Math.round(canvas.height*.055))+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(assetCopy()[assets?.status[id+'_turntable']==='failed'?1:0],canvas.width/2,canvas.height/2);return;}
 return window.TTRVehicleVisuals.drawShowroom(canvas,index,view,clock,garageRotationOrigin,profiles);
}
async function showGarage(){
 const button=$('garageBtn');
 if(button){button.disabled=true;button.textContent=assetCopy()[0];}
 const ok=await window.TTRAssets.ensureGarageReady(profiles[selectedCar].id);
 if(button){button.disabled=false;button.textContent=ok?t('garage'):t('garage')+' · '+assetCopy()[2];}
 if(!ok||$('screen').hidden||$('garageBtn')!==button)return;
 stopMenuMusic();SND.music('garage');$('screen').hidden=true;$('screen').style.display='none';$('garageScreen').hidden=false;
 garagePreview=selectedCar;garageRotationOrigin=clock;refreshGarage();ping(650,.10,.13);
}
window.TTRVehicleDesignStats=Object.freeze({"scatto":[6,7,7,7,5,7],"tuono":[7,8,5,6,8,6],"polvere":[6,7,8,8,6,7],"lampo":[8,7,8,7,4,5],"aero":[9,8,7,8,4,5],"enduro":[8,7,9,9,3,6],"brezza":[7,8,10,8,2,5],"volt":[9,10,6,7,4,5],"roccia":[6,6,5,7,9,9],"martello":[6,7,5,6,10,7],"turbovan":[6,7,6,7,8,7],"titan":[5,6,6,9,9,8],"hotflash":[8,10,5,5,7,5],"metrocab":[6,7,7,7,6,7],"interceptor":[7,8,7,7,8,6],"retrosprint":[7,6,8,8,5,6],"apex":[10,9,10,9,2,3],"tempesta":[8,9,9,7,5,5],"neon":[10,10,4,5,3,3],"behemoth":[5,6,3,5,10,10]});
function refreshGarage(){if(typeof window.TTRUpdateGarageCollectionCount==='function')window.TTRUpdateGarageCollectionCount();const p=profiles[garagePreview];$('garageName').textContent=p.name;
 $('garageDesc').textContent=t(p.id+'Desc');
 // Six historical design indicators recovered from original project conversations; no gameplay physics changed.
 const garageDesignStats=window.TTRVehicleDesignStats;
 const garageDesignSource='Scheda numerica storica recuperata · revisioni successive da verificare';
 const garageLabels=['Velocità','Accelerazione','Sterzo','Grip','Impatto','Stabilità'];
 const stats=garageLabels.map((label,i)=>[label,garageDesignStats[p.id]?.[i]??0]);
 $('garageBars').setAttribute('aria-label',garageDesignSource); $('garageBars').innerHTML=stats.map(([label,raw])=>{const value=Math.max(0,Math.min(10,Number(raw)||0));return `<div class="garage-stats"><span class="garage-stat-label">${label}</span><div class="rail" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${value}">${Array.from({length:10},(_,i)=>`<i class="${i<value?'filled':''}"></i>`).join('')}</div><b class="garage-stat-value">${value}/10</b></div>`}).join('');
 const list=$('garageChoices'),listKey=profiles.map(q=>q.id).join(',')+'|'+selectedCar;
 if(list.dataset.rosterKey!==listKey){list.dataset.rosterKey=listKey;
 $('garageChoices').innerHTML=profiles.map((q,i)=>`<button class="car-choice ${i===garagePreview?'active':''}" data-car="${i}"><img class="car-choice-preview" data-image="${q.id}" alt="" aria-hidden="true"><span class="car-choice-info"><b>${String((window.TTRVehicleRoster||[]).find(v=>v.id===q.id)?.index??(i+1)).padStart(2,'0')} · ${q.name}</b><small>${q.id===profiles[selectedCar].id?t('selected'):['HOT HATCH','V8','BUGGY','SPORT','SUPERCAR · TEST','ENDURANCE · TEST','ROADSTER · TEST','ELETTRICA · TEST','HYPER EV · TEST','SUV · TEST','PICKUP · TEST','VAN · TEST','4X4 · TEST','HOT ROD · TEST','TAXI · TEST','POLIZIA · TEST','CLASSICA · TEST','MONOPOSTO · TEST','RALLY · TEST','MONSTER · TEST'][i]}</small></span></button>`).join('');
 document.querySelectorAll('.car-choice-preview').forEach(el=>{const car=el.dataset.image.replace('_showroom','');const pic=window.TTRAssets?.images[car+'_showroom']||window.TTRAssets?.images[car];const thumb=window.TTRVehicleThumbnail?.(car);if(thumb)el.src=thumb;else if(pic?.src)el.src=pic.src;});
 list.querySelectorAll('[data-car]').forEach(el=>el.onclick=()=>{garagePreview=+el.dataset.car;garageRotationOrigin=clock;ping(640,.08,.07);refreshGarage();});
 }
 list.querySelectorAll('[data-car]').forEach(el=>el.classList.toggle('active',+el.dataset.car===garagePreview));
 const artCard=$('garageCanon');if(artCard){
   const pic=profiles[garagePreview].id+'_concept_views';
   const asset=window.TTRAssets?.images[pic];
   if(asset?.src)artCard.src=asset.src;
   artCard.alt='Viste ortogonali del concept ufficiale: '+profiles[garagePreview].name;
   artCard.title='Concept ufficiale: frontale, laterale, retro e dall’alto';
   artCard.hidden=true; // Reference sheet stays in the source archive only; showroom never shows cropped poster.
 }
 drawShowroom($('garageCanvas'),garagePreview,'garage');
}
function wireMenu(){
 // 14.15: tolerate a cached pre-14.14 HTML shell; manual acceleration is no longer supported.
 const obsoleteAuto=$('auto');if(obsoleteAuto){const label=obsoleteAuto.closest('label');if(label)label.remove();else obsoleteAuto.remove();}
 document.documentElement.dataset.ttrJsBuild='0.13.6.153';
 const buildLabel=$('ttrBuildLabel');if(buildLabel)buildLabel.textContent='BUILD v0.13.6.153 · 14.25d-android-ai';
 // A transformed menu creates a non-viewport containing block for fixed dialogs.
 // Move Options to document.body, so the overlay is genuinely viewport-sized on iPhone.
 const settingsDialog=$('retroSettings');if(settingsDialog&&settingsDialog.parentNode!==document.body)document.body.appendChild(settingsDialog);const configDialog=$('raceConfig');if(configDialog&&configDialog.parentNode!==document.body)document.body.appendChild(configDialog);const trackDialog=$('trackSelect');if(trackDialog&&trackDialog.parentNode!==document.body)document.body.appendChild(trackDialog);
 const r=$('raceBtn'),trial=$('trialBtn'),garage=$('garageBtn'),mute=$('menuMute');
 const careerBtn=$('careerBtn');if(careerBtn)careerBtn.onclick=()=>{SND.unlock();window.TTRCareer?.open();};
  if(r)r.onclick=()=>{SND.unlock();TTROpenTrackSelect('race')};if(trial)trial.onclick=()=>{SND.unlock();TTROpenTrackSelect('trial');};const onlineBtn=$('onlineBtn');if(onlineBtn)onlineBtn.onclick=()=>{SND.unlock();onlineOpenPanel();};const eliminationBtn=$('eliminationBtn');if(eliminationBtn)eliminationBtn.onclick=()=>{SND.unlock();TTROpenTrackSelect('elimination')};
 if(garage)garage.onclick=()=>{SND.unlock().then(ok=>{if(ok)SND.music('garage')});showGarage();};
 if($('raceConfigStart'))$('raceConfigStart').onclick=TTRStartConfiguredRace;for(const id of ['raceConfigCancel','raceConfigClose'])if($(id))$(id).onclick=()=>TTRCloseRaceConfig(true);if(configDialog){configDialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();TTRCloseRaceConfig(true);}});configDialog.addEventListener('click',e=>{if(e.target===configDialog)TTRCloseRaceConfig(true);});}
  if($('trackSelectNext'))$('trackSelectNext').onclick=TTRAdvanceTrackSelect;for(const id of ['trackSelectClose','trackSelectBack'])if($(id))$(id).onclick=()=>{const mode=activeTrackMode;TTRCloseTrackSelect();if(mode==='career')$('careerPlay')?.focus();else $('screen').querySelector(mode==='elimination'?'#eliminationBtn':mode==='trial'?'#trialBtn':'#raceBtn')?.focus();};if(trackDialog){trackDialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();TTRCloseTrackSelect();}});trackDialog.addEventListener('click',e=>{if(e.target===trackDialog)TTRCloseTrackSelect();});}
  const setting=$('settingsBtn');if(setting)setting.onclick=()=>{const panel=$('retroSettings');panel.open=true;const selector=$('settingsLanguage');if(selector)selector.value=I18N.getLang();SND.sfx('select');};
  const settingsLanguage=$('settingsLanguage');if(settingsLanguage){settingsLanguage.value=I18N.getLang();settingsLanguage.onchange=()=>{I18N.setLang(settingsLanguage.value);refreshAudioUI();};}
  if(settingsDialog){settingsDialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();settingsDialog.open=false;setting?.focus();}});settingsDialog.addEventListener('click',event=>{if(event.target===settingsDialog){settingsDialog.open=false;setting?.focus();}});}
 if(settingsDialog&&!$('ttrQuality')){const row=document.createElement('div');row.className='ttr-quality-row';row.innerHTML='<label>GRAFICA <select id="ttrQuality"><option value="auto">Automatica</option><option value="high">Elevata</option><option value="balanced">Bilanciata</option><option value="low">Risparmio energetico</option></select></label><label><input id="ttrPerfToggle" type="checkbox"> Diagnostica</label><button type="button" class="mini-btn" id="ttrPerfCopy">Copia report</button><button type="button" class="mini-btn" id="ttrPerfExport">Esporta JSON</button><button type="button" class="mini-btn" id="ttrPerfAnomalies">Copia solo anomalie</button><button type="button" class="mini-btn" id="ttrPerfHistoryExport">Esporta storico</button><button type="button" class="mini-btn" id="ttrPerfHistoryClear">Cancella storico</button><small id="ttrPerfHistoryStatus" aria-live="polite"></small>';row.style.flexWrap='wrap';settingsDialog.querySelector('.v11-settings-card').append(row);$('ttrQuality').value=qualityMode;$('ttrPerfToggle').checked=perfEnabled;$('ttrQuality').onchange=()=>{qualityMode=$('ttrQuality').value;try{localStorage.setItem('ttr_quality',qualityMode);}catch(_){}};$('ttrPerfToggle').onchange=()=>{perfEnabled=$('ttrPerfToggle').checked;try{localStorage.setItem('ttr_perf',perfEnabled?'1':'0');}catch(_){}};$('ttrPerfExport').onclick=perfExportJSON;$('ttrPerfHistoryExport').onclick=perfExportHistory;$('ttrPerfHistoryClear').onclick=()=>{if(window.confirm('Cancellare tutti i report salvati?')){perfHistory.clear();refreshPerfHistoryUI();}};refreshPerfHistoryUI();$('ttrPerfAnomalies').onclick=perfCopyAnomalies;$('ttrPerfCopy').onclick=async()=>{const report=JSON.stringify(perfSnapshot(),null,2);try{await navigator.clipboard.writeText(report);$('ttrPerfCopy').textContent='Copiato';}catch(_){window.prompt('Copia diagnostica',report);}};}
 if(settingsDialog&&matchMedia('(any-pointer:fine)').matches&&!$('ttrKeyboardSettings')){const row=document.createElement('div');row.className='ttr-keyboard-footer';const b=document.createElement('button');b.id='ttrKeyboardSettings';b.type='button';b.className='ttr-settings-text-action';b.textContent='COMANDI TASTIERA';b.setAttribute('aria-haspopup','dialog');b.onclick=openKeyboardPanel;row.append(b);settingsDialog.querySelector('.v11-settings-card').append(row);}
 if($('closeSettings'))$('closeSettings').onclick=()=>{$('retroSettings').open=false;setting?.focus();SND.sfx('select');};
 // Vehicle selection is exclusively handled by garageSelect (no global car selector).
 const nav=[...document.querySelectorAll('.retro-option')];nav.forEach((el,i)=>{
   const move=()=>{if(el.classList.contains('selected'))return;nav.forEach(b=>b.classList.remove('selected'));el.classList.add('selected');SND.sfx('select');};
   el.addEventListener('pointerenter',move);el.addEventListener('focus',move);
   el.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=(i+(e.key==='ArrowDown'?1:-1)+nav.length)%nav.length;nav[n].focus();}});
 });
 if(mute)mute.onclick=()=>{const off=SND.setMuted(!SND.status().muted);if(!off)enableSound().then(ok=>{if(ok)startMenuMusic();});else stopMenuMusic();refreshAudioUI();};
 const test=$('audioTest');if(test)test.onclick=()=>{SND.setMuted(false);enableSound().then(ok=>{if(ok){SND.sfx('pickup');startMenuMusic();}refreshAudioUI();});};
 for(const [id,key] of [['volMaster','master'],['volMusic','music'],['volEngine','engine'],['volEffects','effects']]){const el=$(id);if(!el)continue;el.value=Math.round(SND.getSettings()[key]*100);el.oninput=()=>SND.setVolume(key,+el.value/100);}
}

// v0.13.6.34 Safari-first engine start: HTMLMediaElement.play() invoked inside the actual user click.
// No autoplay, no dependency on a delayed WebAudio Promise, audio original and embedded for offline Pages.
const TTRStartupEngineSound = new Audio("data:audio/mpeg;base64,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");
TTRStartupEngineSound.preload='auto';TTRStartupEngineSound.playsInline=true;

function startMenuMusic(){SND.music('menu');}
function stopMenuMusic(){SND.stopMusic();}
function boot(){I18N.apply();$('loadbar').style.width='100%';$('enterGame').hidden=false;const copy=$('splashLoadingCopy');if(copy)copy.hidden=true;
 $('enterGame').addEventListener('click',()=>{
   // Safari/iOS only permits a new AudioContext to start after an actual user tap.
   // Keep the original splash visible while the ignition plays; do not overlap menu music.
   $('enterGame').hidden=true;
   let transitioned=false;
   const finishIntro=()=>{
     if(transitioned)return;transitioned=true;
     $('splash').hidden=true;
     if(I18N.hasSaved())mainMenu();else showLanguage();
   };
   // Call resume on the user's click AND start the embedded engine sample immediately.
   // Unlike the previous .then() chain, HTMLAudio.play() remains inside the trusted gesture.
   const soundSettings=SND.getSettings(),soundAllowed=!soundSettings.muted && soundSettings.master>.015 && (soundSettings.engine>.01||soundSettings.effects>.01);
   if(!soundAllowed){SND.unlock();finishIntro();return;}
   let pendingFallback=null;
   const media=TTRStartupEngineSound;
   const introTimeout=setTimeout(finishIntro,3200);
   const complete=()=>{clearTimeout(introTimeout);finishIntro();};
   try{
     media.pause();media.currentTime=0;
     // Preserve user's separate engine/effects level. iOS hardware volume remains device-controlled.
     media.volume=Math.max(.08,Math.min(1,soundSettings.master*(soundSettings.engine*.75+soundSettings.effects*.33)*1.55));
     const playback=media.play();
     // Resume WebAudio for the garage/menu after the media start, while still in the same gesture.
     const unlockPromise=SND.unlock();
     media.addEventListener('ended',complete,{once:true});
     if(playback&&typeof playback.catch==='function')playback.catch(()=>{
       // Audio file was denied or cannot decode: fall back to the original synth cue.
       clearTimeout(introTimeout);
       Promise.resolve(unlockPromise).then(ok=>{if(ok&&SND.introEngines())setTimeout(finishIntro,2050);else finishIntro();}).catch(finishIntro);
     });
   }catch(err){clearTimeout(introTimeout);SND.unlock().then(ok=>{if(ok&&SND.introEngines())setTimeout(finishIntro,2050);else finishIntro();}).catch(finishIntro);}

 },{once:true});
 document.querySelectorAll('.language-btn').forEach(b=>b.onclick=()=>{I18N.setLang(b.dataset.lang);$('languageScreen').hidden=true;mainMenu();SND.sfx('select');});
 $('garageClose').onclick=()=>mainMenu();$('garageSelect').onclick=()=>{selectedCar=garagePreview;try{localStorage.setItem('ttr_selected_car',selectedCar)}catch(e){}SND.sfx('select');mainMenu();};
}
// iOS/Safari multitouch controller: no pointer capture, no button focus, release outside the button.
const ttrTouchOwners=new Map(),ttrPointerOwners=new Map();
function refreshControls(trackInput=true){let changed=false;for(const k of Object.keys(controls)){
 const next=[...ttrTouchOwners.values(),...ttrPointerOwners.values()].includes(k);changed ||= controls[k]!==next;controls[k]=next;
 const el=$(k);if(el)el.classList.toggle('active',controls[k]);
 }if(trackInput&&changed)markPerfInput();onlineGuestSendInput(true);
}
function releaseAllControls(){ttrTouchOwners.clear();ttrPointerOwners.clear();refreshControls(false);perfTouchAt=0;}
function bindControl(id,key){const b=$(id);if(!b)return;
 b.setAttribute('draggable','false');b.setAttribute('tabindex','-1');
 b.addEventListener('touchstart',e=>{e.preventDefault();for(const t of e.changedTouches)ttrTouchOwners.set(t.identifier,key);b.blur();refreshControls();},{passive:false});
 b.addEventListener('touchmove',e=>{e.preventDefault();let changed=false;for(const touch of e.changedTouches){const old=ttrTouchOwners.get(touch.identifier);if(old!=='left'&&old!=='right')continue;const hit=document.elementFromPoint(touch.clientX,touch.clientY)?.closest('#left,#right');if(hit&&hit.id!==old){ttrTouchOwners.set(touch.identifier,hit.id);changed=true;}}if(changed)refreshControls();},{passive:false});
 b.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;e.preventDefault();ttrPointerOwners.set(e.pointerId,key);b.blur();refreshControls();});
 b.addEventListener('contextmenu',e=>e.preventDefault());
}
for(const [id,key] of [['left','left'],['right','right'],['brake','brake']])bindControl(id,key);
const onTouchRelease=e=>{for(const t of e.changedTouches)ttrTouchOwners.delete(t.identifier);refreshControls();};
window.addEventListener('touchend',onTouchRelease,{passive:true,capture:true});
window.addEventListener('touchcancel',onTouchRelease,{passive:true,capture:true});
window.addEventListener('pointerup',e=>{ttrPointerOwners.delete(e.pointerId);refreshControls();},true);
window.addEventListener('pointercancel',e=>{ttrPointerOwners.delete(e.pointerId);refreshControls();},true);
window.addEventListener('blur',releaseAllControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAllControls();});
// One-shot actions still allow a second finger to steer simultaneously.
function bindTap(id,func){const b=$(id);b.setAttribute('draggable','false');b.setAttribute('tabindex','-1');
 b.addEventListener('touchstart',e=>{e.preventDefault();func();b.blur();b.classList.add('active');},{passive:false});
 b.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;e.preventDefault();func();b.blur();b.classList.add('active');});
 const off=()=>b.classList.remove('active');b.addEventListener('touchend',off);b.addEventListener('touchcancel',off);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('contextmenu',e=>e.preventDefault());
}
bindTap('use',()=>race&&useItem(race.player));
addEventListener('keydown',e=>{if(!keys[e.code]&&['left','right','brake'].some(k=>keyMap[k].includes(e.code)))markPerfInput();keys[e.code]=true;onlineGuestSendInput(true);if(race&&Object.values(keyMap).some(a=>a.includes(e.code)))e.preventDefault();if(e.repeat)return;if(keyMap.power.includes(e.code)&&race&&!race.paused&&!race.finished)useItem(race.player);if(keyMap.pause.includes(e.code)&&race?.mode==='online'){onlineQuit();mainMenu();return;}if(keyMap.pause.includes(e.code)&&race)togglePause();});addEventListener('keyup',e=>{if(keys[e.code]&&['left','right','brake'].some(k=>keyMap[k].includes(e.code)))markPerfInput();keys[e.code]=false;onlineGuestSendInput(true)});addEventListener('blur',()=>{releaseAllControls();for(const k in keys)delete keys[k];});
$('pauseBtn').onclick=()=>{if(race?.mode==='online'){onlineQuit();mainMenu();}else togglePause();};
 const pauseAudio=$('pauseAudio');
 const pauseCard=pauseAudio.closest('.pause-card');
 pauseAudio.addEventListener('toggle',()=>pauseCard.classList.toggle('audio-open',pauseAudio.open));
 for(const [pid,key,mid] of [
   ['pauseVolMaster','master','volMaster'],['pauseVolMusic','music','volMusic'],
   ['pauseVolEngine','engine','volEngine'],['pauseVolEffects','effects','volEffects']
 ]){const input=$(pid);input.oninput=()=>{SND.setVolume(key,Number(input.value)/100);const other=$(mid);if(other)other.value=input.value;};}
 $('pauseMute').onclick=()=>{const muted=SND.setMuted(!SND.status().muted);
   if(!muted)enableSound();refreshAudioUI();};
 $('resumeRace').onclick=()=>{if(race&&race.paused)togglePause();};$('restartRace').onclick=()=>{if(!race)return;const mode=race.mode;$('pauseOverlay').hidden=true;releaseAllControls();openCircuitLoading(mode);};$('exitRace').onclick=()=>{SND.sfx('select');mainMenu();};
function syncPauseAudioControls(){const st=SND.getSettings();
 for(const [pid,key] of [['pauseVolMaster','master'],['pauseVolMusic','music'],['pauseVolEngine','engine'],['pauseVolEffects','effects']]){
  const input=$(pid);if(input)input.value=Math.round(st[key]*100);
 }refreshAudioUI();}
function togglePause(){if(!race||race.finished)return;if(race.runtimeFault){mainMenu();return;}race.paused=!race.paused;releaseAllControls();$('pauseOverlay').hidden=!race.paused;$('hint').classList.remove('show');lastHint=0;
 if(race.paused){$('pauseAudio').open=false;document.querySelector('.pause-card').classList.remove('audio-open');syncPauseAudioControls();SND.stopMusic();SND.sfx('select');}
 else SND.music('race');syncAudio();}
let miniBase=window.TTRMinimapVisuals.createRaceMiniBase(points,shortcutSamples,WORLD_W,WORLD_H);
function selectCircuit(id){
 const next=id==='garage-grid'&&Garage?'garage-grid':id==='bagno-sprint'&&Bath?'bagno-sprint':id==='desk-drift'&&Desk?'desk-drift':id==='box-di-biliardo'&&B?'box-di-biliardo':'colazione-turbo';window.TTRModeTrial.setTrack(next);if(next===circuitId)return;
 circuitId=next;D=isBath()?Bath:isGarage()?Garage:Desk;DR=isBath()?window.TTRBathRules:isGarage()?window.TTRGarageRules:window.TTRDeskRules;WORLD_W=isDesk()?D.world.w:isBox()?B.world.w:Base.WORLD_W;WORLD_H=isDesk()?D.world.h:isBox()?B.world.h:Base.WORLD_H;TRACK_LENGTH=isDesk()?D.length:isBox()?B.length:Base.TRACK_LENGTH;LANE_HALF=isDesk()?D.laneHalf:isBox()?B.laneHalf:Base.LANE_HALF;
 shortcutFrom=isDesk()?D.entry:isBox()?B.entry:Base.shortcutFrom;shortcutTo=isDesk()?D.exit:isBox()?B.exit:Base.shortcutTo;shortcutSamples=isDesk()?D.shortcutSamples:isBox()?[]:Base.shortcutSamples;pickupSegments=isDesk()?D.pickupPhases:isBox()?B.pickupPhases:Base.pickupSegments;
 points.splice(0,points.length,...(isDesk()?D.points:isBox()?B.points:breakfastPoints));
 track.width=bridgeLayer.width=WORLD_W;track.height=bridgeLayer.height=WORLD_H;worldInit();
 miniBase=window.TTRMinimapVisuals.createRaceMiniBase(points,shortcutSamples,WORLD_W,WORLD_H);
 ttrRaceDrivers=window.TTRRaceDrivers.create({getRace:()=>race,getOnlineSession:()=>onlineSession,onlineHostInput,controls,keys,trackPoint,mod,angleDiff,clamp,nearestTrack,points,K,props});ttrEliminationMode=makeEliminationMode();
 camX=WORLD_W/2;camY=WORLD_H/2;
}
let ttrFrameMean=1/60,ttrLowGraphics=false,ttrQualityTimer=0;let perfQuality=1.65;
 const SIM_STEP=1/60;let simDebt=0,simRace=null,simPrevious=new Map(),renderFraction=1,lastHudAt=-Infinity;
 function visualCar(c){if(race?.mode==='online')return c.netRender?{...c,...c.netRender}:c;const p=simPrevious.get(c.id);if(!p||p.round!==race.elim?.round||p.recovery!==(c.shortcutRespawns||0)||Math.hypot(c.x-p.x,c.y-p.y)>100)return c;const u=renderFraction;const pose={...c,x:p.x+(c.x-p.x)*u,y:p.y+(c.y-p.y)*u,a:p.a+angleDiff(c.a,p.a)*u};if(race.mode!=='elimination'&&p.onBridge===!!c.onBridge&&p.rampEntryVisual===!!c.rampEntryVisual&&p.elevated===!!(c.jump>0||c.bridgeExitVisual>0||c.onBridge||c.rampEntryVisual)&&p.falling===!!(c.tableFalling>0)){pose.jump=p.jump+(c.jump-p.jump)*u;pose.wheelPhase=p.wheelPhase+angleDiff(c.wheelPhase||0,p.wheelPhase)*u;}return pose;}
 function resetSim(){simDebt=0;simPrevious.clear();renderFraction=1;lastHudAt=-Infinity;perfTouchAt=0;}
 document.addEventListener('visibilitychange',()=>{resetSim();frameTime=performance.now();});
function render(){const qualityCap=qualityMode==='low'?1.25:qualityMode==='balanced'?1.45:qualityMode==='high'?1.65:perfQuality;const ratio=Math.min(qualityCap,race?.mode==='online'&&onlineSession&&!onlineSession.host?1.38:1.65,devicePixelRatio||1);if(sw!==innerWidth||sh!==innerHeight||dpr!==ratio){sw=innerWidth;sh=innerHeight;dpr=ratio;canvas.width=Math.ceil(sw*dpr);canvas.height=Math.ceil(sh*dpr);}g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#6e4a37';g.fillRect(0,0,sw,sh);
 // Real follow camera: the circuit extends beyond the mobile viewport.
 // Keep the player just behind centre, giving sight of the upcoming corner.
 const gridLocked=race?.mode==='elimination'&&race.elim.state==='race'&&race.countdown>0;
 const physicalPlayer=race?.mode==='elimination'?(gridLocked?race.player:race.elim.state==='celebration'?race.cars[race.elim.winner]:eliminationCameraLeader()):race?.player,player=physicalPlayer?visualCar(physicalPlayer):null,playerFalling=!!(player&&player.tableFalling>0);
 const look=player&&race.countdown<=0&&!playerFalling?(race?.mode==='elimination'?0:85):0;
 const groupTarget=race?.mode==='elimination'&&race.elim.state==='race'&&!gridLocked?{x:player.x,y:player.y}:null;
 const pocketCamera=isBox()&&player?.boxTransit>0?BR.cameraPose(player):null;
 const targetX=pocketCamera?pocketCamera.x:gridLocked?elimGridCamera.x:groupTarget?groupTarget.x:player?player.x+Math.cos(player.a)*look:WORLD_W/2;
 const targetY=pocketCamera?pocketCamera.y:gridLocked?elimGridCamera.y:groupTarget?groupTarget.y:player?player.y+Math.sin(player.a)*look:WORLD_H/2;
 scale=sw<sh?Math.min(.85,Math.max(.60,sh/620)):
   Math.min(.86,Math.max(.59,Math.min(sw/1140,sh/540)));
 const halfW=sw/(2*scale),halfH=sh/(2*scale);
  // Progressive catch-up replaces the old instantaneous follow=1 branch.
  const gapToTarget=Math.hypot(targetX-camX,targetY-camY);
  const response=race?.mode==='elimination'?Math.min(15,9+gapToTarget/110):6.4;
  const follow=gridLocked?1:playerFalling?(race?.mode==='elimination'?.23:1-Math.exp(-Math.min(.15,renderDelta)*15.68)):1-Math.exp(-Math.min(.15,renderDelta)*response);
 camX+=(targetX-camX)*follow;camY+=(targetY-camY)*follow;
 const outerView=playerFalling?105:0;
 camX=halfW>=WORLD_W/2?WORLD_W/2:clamp(camX,halfW-outerView,WORLD_W-halfW+outerView);
 camY=halfH>=WORLD_H/2?WORLD_H/2:clamp(camY,halfH-outerView,WORLD_H-halfH+outerView);
 g.setTransform(dpr*scale,0,0,dpr*scale,dpr*(sw/2-camX*scale),dpr*(sh/2-camY*scale));
 const viewLeft=Math.max(0,Math.floor(camX-halfW-60)),viewTop=Math.max(0,Math.floor(camY-halfH-60));
 const viewRight=Math.min(WORLD_W,Math.ceil(camX+halfW+60)),viewBottom=Math.min(WORLD_H,Math.ceil(camY+halfH+60));
 if(viewRight>viewLeft&&viewBottom>viewTop)g.drawImage(track,viewLeft,viewTop,viewRight-viewLeft,viewBottom-viewTop,viewLeft,viewTop,viewRight-viewLeft,viewBottom-viewTop);
 if(isBath()&&viewRight>Bath.pool.x-Bath.pool.rx&&viewLeft<Bath.pool.x+Bath.pool.rx&&viewBottom>Bath.pool.y-Bath.pool.ry&&viewTop<Bath.pool.y+Bath.pool.ry)window.TTRBathVisuals.waterMotion(g,clock);
 if(race){window.TTREnvironmentEvents.draw(g,race.environmentEvents);const oilVisible=o=>Math.abs(o.x-camX)<halfW+100&&Math.abs(o.y-camY)<halfH+100;race.oils.forEach(o=>{if((!isDesk()||isBath()||!o.deskDeck)&&oilVisible(o)){if(isBath()&&o.bathBrushOil)DR.drawBrushOil(g,o,clock,renderOil);else renderOil(g,o,clock);}});race.pickups.forEach(p=>{if(Math.abs(p.x-camX)<halfW+80&&Math.abs(p.y-camY)<halfH+80)drawBox(g,p);});
   // Genuine ramp-entry cars render ABOVE the ramp even before jump starts.
  const visibleProp=o=>Math.abs(o.x-camX)<halfW+145&&Math.abs(o.y-camY)<halfH+145;
  // Floor spills are decals below all four wheels, irrespective of their y-sort position.
   // Overflow goes UNDER the puddle shapes, preserving exposed cereal pieces.
   props.filter(o=>o.type==='milk_cereal_cup'&&visibleProp(o)).forEach(o=>drawMilkOverflow(g,o));
    props.filter(o=>o.type==='milk_cereal_spill'&&visibleProp(o)).forEach(o=>drawObstacle(g,o));
    // The spreading jam is a low ground decal, always BEHIND car wheels.
    if(isBreakfast()&&Math.abs(jamPatch.x-camX)<halfW+240&&Math.abs(jamPatch.y-camY)<halfH+280)drawJamPour(g);
 const ghostPose=race.trialGhost&&race.countdown<=0?race.trialGhost(race.time):null;
 const ghostCar=ghostPose&&!(ghostPose.boxTransit>=.8)?{profile:race.player.profile,id:-1,...ghostPose,jumpTotal:ghostPose.jumpTotal||.96,onBridge:!!ghostPose.onBridge,rampEntryVisual:!!ghostPose.rampEntryVisual,bridgeExitVisual:ghostPose.bridgeExitVisual||0,speed:0,slip:0,boost:0,claw:0,tableFalling:ghostPose.tableFalling||0}:null;
 const visualRaceCars=race.mode==='online'?race.cars.map(visualCar):race.cars;
 const elevated=c=>c.onBridge||c.jump>0||c.rampEntryVisual||c.bridgeExitVisual>0||(isDesk()&&!isBath()&&DR.rampPose(c).above);
 const drawGhost=()=>{if(!ghostCar||!visibleProp(ghostCar))return;g.save();g.globalAlpha=.35;carSprite(g,ghostCar);g.restore();};
 props.filter(o=>(o.type==='orange_bump'||o.type==='orange')&&visibleProp(o)).forEach(o=>drawRaceProp(g,o));
 if(ghostCar&&!elevated(ghostCar))drawGhost();
   // Road cars are drawn first. The opaque raised bread deck then occludes them
   // at crossings, while vehicles actually ON the bridge stay visible on top.
   [...props.filter(o=>o.type!=='ramp'&&o.type!=='milk_cereal_spill'&&o.type!=='orange_bump'&&o.type!=='orange'&&visibleProp(o)).map(o=>({y:o.y,prop:o})),
    ...visualRaceCars.filter(c=>!c.eliminated&&(!isBox()||BR.visualScale(c)>0)&&visibleProp(c)&&!elevated(c)).map(c=>({y:c.y,car:race.mode==='online'?c:visualCar(c)}))]
     .sort((a,b)=>a.y-b.y).forEach(e=>e.prop?drawRaceProp(g,e.prop):carSprite(g,e.car));
   if(viewRight>viewLeft&&viewBottom>viewTop)g.drawImage(bridgeLayer,viewLeft,viewTop,viewRight-viewLeft,viewBottom-viewTop,viewLeft,viewTop,viewRight-viewLeft,viewBottom-viewTop);
   props.filter(o=>o.type==='ramp'&&visibleProp(o)).forEach(o=>drawRaceProp(g,o));
   if(isDesk()&&!isBath())race.oils.forEach(o=>{if(o.deskDeck&&oilVisible(o))DR.drawDeckOil(g,o,clock,renderOil);});
   if(ghostCar&&elevated(ghostCar))drawGhost();
   visualRaceCars.filter(c=>!c.eliminated&&(!isBox()||BR.visualScale(c)>0)&&visibleProp(c)&&elevated(c)).map(c=>race.mode==='online'?c:visualCar(c)).sort((a,b)=>a.y-b.y).forEach(c=>carSprite(g,c));

 for(const c of race.cars){if(!c.eliminated&&!(c.boxTransit>0)&&c.claw>0&&c.clawTarget)drawClawCable(g,visualCar(c),visualCar(c.clawTarget),clock);}
 let impactBudget=(ttrLowGraphics||qualityMode==='low')?5:12;race.effects.forEach(e=>{if(e.kind==='impactBurst'&&impactBudget--<=0)return;if(Math.abs(e.x-camX)<halfW+160&&Math.abs(e.y-camY)<halfH+160)renderEffect(g,e,clamp);});if(race.countdown>0){g.save();g.setTransform(dpr,0,0,dpr,0,0);g.textAlign='center';g.textBaseline='middle';g.lineWidth=7;g.strokeStyle='#142438';g.font=`950 ${Math.min(90,sw/5)}px system-ui`;const waiting=race.mode==='online'&&!onlineSession?.allLoaded;const v=waiting?'ATTESA GIOCATORI':Math.min(3,Math.ceil(race.countdown));if(waiting)g.font=`900 ${Math.min(30,sw/18)}px system-ui`;g.strokeText(String(v),sw/2,sh/2);g.fillStyle='#ffe67f';g.fillText(String(v),sw/2,sh/2);g.restore();}}else gameObstacles(g);
 if(clock>lastHint&&lastHint!==0){$('hint').classList.remove('show');lastHint=0;}
}
function frame(t){
 try{
  if(race?.runtimeFault){frameTime=t;return;}
  const raw=Math.max(0,(t-frameTime)/1000);frameTime=t;
  const dt=document.hidden?0:Math.min(.5,raw);renderDelta=dt||1/60;
  if(simRace!==race){if(simRace){perfArchiveCompleted(simRace);perfContext.completed=!!simRace.finished;perfContext.serverAuthority=simRace.serverAuthority??null;perfContext.serverTick=simRace.serverTick??null;perfContext.bridgeEvents=simRace.bridgeEvents||[];perfContext.bridgeEventsDropped=simRace.bridgeEventsDropped||0;perfContext.runtimeFault=simRace.runtimeFault??null;perfContext.environmentEvents=window.TTREnvironmentEvents.snapshot(simRace.environmentEvents);perfRecoveries=simRace.recoveryHistory||[];perfRecoveryDropped=simRace.recoveryHistoryDropped||0;}simRace=race;resetSim();if(race){resetPerf();perfContext={trackId:race.trackId,mode:race.mode,difficulty:race.aiFactor,quality:qualityMode,playerId:race.player?.id??0,coverage:perfEnabled};perfLast=t;ttrFrameMean=1/60;ttrQualityTimer=0;ttrLowGraphics=false;perfQuality=1.65;}}
  if(race&&raw>0&&raw<.5){ttrFrameMean+=.10*(raw-ttrFrameMean);ttrQualityTimer+=raw;if(ttrQualityTimer>(ttrLowGraphics?2:.6)){if(ttrFrameMean>.026){ttrLowGraphics=true;perfQuality=ttrFrameMean>.041?1.25:1.45;}else if(ttrFrameMean<.019){ttrLowGraphics=false;perfQuality=1.65;}ttrQualityTimer=0;}}
  onlinePingTick(t);
  if(race){
   if(!perfEnabled&&!race.finished&&race.countdown<=0)perfContext.coverage=false;
   const perfStart=performance.now();let perfSteps=0;const activeFrame=perfEnabled&&!race.paused&&!race.finished&&race.countdown<=0&&!document.hidden&&innerHeight<=innerWidth&&raw>0;
   if(race.mode==='online'){const netDt=raw>.25?0:Math.min(.12,dt);clock+=netDt;onlineGuestStep(netDt);if(race.player?.netPrediction)measurePerfInput();else perfTouchAt=0;if(t-lastHudAt>=66||lastHudAt===-Infinity){hud();lastHudAt=t;}renderFraction=1;}
   else if(race.paused||race.finished||innerHeight>innerWidth||document.hidden){resetSim();syncAudio();}
   else {
    simDebt=Math.min(.75,simDebt+dt);let count=0;
    // Bounded catch-up preserves normal 30/60 Hz timing and avoids runaway CPU load.
    while(simDebt+1e-9>=SIM_STEP&&count<12){
      simPrevious=new Map(race.cars.map(c=>[c.id,{x:c.x,y:c.y,a:c.a,round:race.elim?.round,recovery:c.shortcutRespawns||0,jump:c.jump||0,wheelPhase:c.wheelPhase||0,onBridge:!!c.onBridge,rampEntryVisual:!!c.rampEntryVisual,elevated:!!(c.jump>0||c.bridgeExitVisual>0||c.onBridge||c.rampEntryVisual),falling:!!(c.tableFalling>0)}]));
      update(SIM_STEP,false);perfSteps++;measurePerfInput();simDebt=Math.max(0,simDebt-SIM_STEP);count++;
      if(race.finished){resetSim();break;}
    }
    renderFraction=Math.min(1,simDebt/SIM_STEP);
    // Online uses only the authoritative server; never sends a local snapshot.
    if(t-lastHudAt>=66||lastHudAt===-Infinity){hud();lastHudAt=t;}
   }
   const renderStart=performance.now();render();const renderEnd=performance.now();
   if(activeFrame){recordPerf(perfStats,raw,renderStart-perfStart,renderEnd-renderStart,perfSteps);recordPerf(perfTotal,raw,renderStart-perfStart,renderEnd-renderStart,perfSteps,raw>.035?{raceTime:+race.time.toFixed(3),phase:+(race.player?.p||0).toFixed(5),oilCount:race.oils.length,dpr,focused:document.hasFocus(),visibility:document.visibilityState,lowGraphics:ttrLowGraphics}:null);
    if(t-perfLast>=1000||race.finished){const n=perfStats.frames,latency=perfInputDelay==null?'—':perfInputDelay.toFixed(0)+' ms';perfReport=`${(n/Math.max(.001,perfStats.elapsed)).toFixed(0)} FPS | SIM ${(perfStats.physics/n).toFixed(1)} ms | GFX ${(perfStats.render/n).toFixed(1)} ms\nFrame >40ms: ${perfStats.slow}/${n} | input→sim ${latency} | debito ${Math.round(simDebt*1000)} ms | DPR ${dpr}`;perfPanel.textContent=perfReport;perfStats=emptyPerf();perfLast=t;}}
   else if(race.paused||document.hidden||innerHeight>innerWidth||race.countdown>0){perfStats=emptyPerf();perfLast=t;perfTouchAt=0;}
   if(race.finished)perfArchiveCompleted(race);
   perfPanel.hidden=!perfEnabled||race.paused||race.finished;
  }
 else {perfPanel.hidden=true;clock+=dt;
   // Lightweight canvas-only 60fps turntable: the rest of the game stays paused while in the garage.
   if(t-lastShowroomDraw>8){lastShowroomDraw=t;
     if(!$('screen').hidden && $('menuCar'))drawShowroom($('menuCar'),selectedCar,'menu');
     else if(!$('garageScreen').hidden)drawShowroom($('garageCanvas'),garagePreview,'garage');
   }
 }
 }catch(error){
  console.error("TTR frame failure",error);
  if(race){race.runtimeFault=String(error);race.paused=true;resetSim();releaseAllControls();SND.stopMusic();syncAudio();$("pauseOverlay").hidden=false;showHint("Errore di gara · Riavvia / Esci",999);}
 }finally{requestAnimationFrame(frame);}
}
window.addEventListener('ttr:career-start',e=>{const v=(window.TTRVehicleRoster||[]).find(x=>x.id===e.detail?.carId);const pi=profiles.findIndex(p=>p.id===v?.id);if(!v||v.status!=='playable'||pi<0||pi!==e.detail.vehicleIndex)return;if(v.availability!=='initial'&&!window.TTRCareer?.isUnlocked(v.id))return;selectedCar=pi;try{localStorage.setItem('ttr_selected_car',String(selectedCar))}catch(_){}SND.unlock();stopMenuMusic();TTROpenTrackSelect('career');});
window.addEventListener('ttr:career-close',()=>mainMenu());
onlineWire();worldInit();window.TTRAssets?.ready.then(()=>{if(!race)worldInit();if(!$('screen').hidden)drawShowroom($('menuCar'),selectedCar,'menu');if(!$('garageScreen').hidden)drawShowroom($('garageCanvas'),garagePreview,'garage');});wireMenu();boot();requestAnimationFrame(frame);
window.TTROnlineDebug={state:()=>onlineSession?{...onlineSession,resumeToken:undefined,connected:onlineSocket?.readyState===1,raceMode:race?.mode,rttMs:onlineRttMs,latencySupported:onlinePingSupported,net:{...onlineNetStats},prediction:!!race?.player?.netPrediction,local:race?.player?{x:race.player.x,y:race.player.y,a:race.player.a,netX:race.player.netX,netY:race.player.netY,netA:race.player.netA}:null,controls:race?.mode==='online'&&!onlineSession.host?onlineLocalInput():null,remoteSteer:onlineSession.host?onlineRemoteInputs[1]?.steer??null:null}:null};
window.TTRTrackDebug=Object.freeze({current:()=>circuitId,info:()=>({trackId:circuitId,length:TRACK_LENGTH,cars:race?.cars.length,mode:race?.mode}),
});
window.TTREliminationDebug={startTestRace:()=>initRace('elimination'),
 // Verify no front/rear starting slot lies near a jump takeoff or landing.
 testJumpRestartGrid:()=>[shortcutFrom-.006,shortcutFrom+.01,knifePhase-.008,knifePhase+.008].flatMap(p=>[4,8].map(count=>{
   const placement=eliminationChooseGrid(p,count),front=placement.grid[0];
   return {scorePhase:p,count,restartPhase:placement.phase,zone:placement.jumpAdjusted,
      safe:eliminationJumpSafeGrid(placement.grid)&&eliminationGridValid(placement.phase,count,placement.offset),
      toRamp:Math.round(eliminationSignedArc(front.p,shortcutFrom)),
      toKnife:Math.round(eliminationSignedArc(front.p,knifePhase))};
 })),

 // Regression tools intentionally mutate a running test race, never persistent progress.
 testMultipleOutside:()=>{
   if(race?.mode!=='elimination'||race.cars.length<4)return {pass:false,reason:'Start 4-player elimination'};
   race.countdown=0;race.time=Math.max(race.time,15);race.elim.roundTime=15;
   const c=race.cars;const center={x:WORLD_W/2,y:WORLD_H/2};
   camX=center.x;camY=center.y;elimCameraId=c[0].id;
   race.elim.lastLeaderSwitchTime=-999;
   const offset=Math.max((sw||innerWidth)/(2*(scale||.65)),(sh||innerHeight)/(2*(scale||.65)))+150;
   c.forEach((car,i)=>Object.assign(car,{x:center.x+(i?offset+i*55:0),y:center.y+(i?120:0),
     eliminated:false,done:false,respawnGrace:0,elimProtection:0,impactGrace:0,bridgeMissGrace:0,
     bridgeMissActive:false,tableFalling:0,routePinch:null,offtrack:false,offtrackSeconds:0,
     elimDistance:i?100:900,elimLag:.52,elimRecoveryCount:0,elimStallSeconds:0,elimLastMeaningfulProgress:i?100:900}));
   eliminationEvaluate(.06);
   return {pass:c.slice(1).every(car=>car.eliminated)&&race.elim.state==='celebration',
     eliminated:c.filter(car=>car.eliminated).map(car=>car.id),state:race.elim.state};
 },
 testRespawnLoop:()=>{
   if(race?.mode!=='elimination'||race.cars.length<2)return {pass:false,reason:'Start elimination'};
   race.countdown=0;race.time=Math.max(race.time,25);race.elim.roundTime=15;
   race.cars.forEach((c,i)=>Object.assign(c,{eliminated:false,done:false,elimDistance:i?300:800,
    elimLastMeaningfulProgress:i?300:800,elimStallSeconds:i?2:0,elimLag:0,
    elimRecoveryCount:i?3:0,elimRecoveryWindowStart:i?race.time-5:-999,
    elimRecoveryStartDistance:i?270:0}));
   elimCameraId=race.cars[0].id;race.elim.lastLeaderSwitchTime=-999;
   eliminationEvaluate(.05);
   return {pass:race.cars[1].eliminated,eliminated:race.cars.filter(c=>c.eliminated).map(c=>c.id)};
 },
 state:()=>race?.elim?{mode:race.mode,round:race.elim.round,state:race.elim.state,points:[...race.elim.points],goal:race.elim.goal,active:eliminationActive().map(c=>c.id),recoveries:race.cars.map(c=>c.elimRecoveryCount||0),stalls:race.cars.map(c=>Number((c.elimStallSeconds||0).toFixed(2))),progress:race.cars.map(c=>c.elimDistance||0),cameraLeader:elimCameraId,cameraTarget:eliminationCameraTarget()}:null,knockOut:(id)=>{if(race?.mode!=='elimination')return false;return knockOutElimination(race.cars[id]);},award:(id)=>{if(race?.mode!=='elimination')return false;return awardEliminationPoint(race.cars[id]);},
 // Visual lead must override a stalled nearest-track projection on a legal bend.
 testPhysicalCornerCamera:()=>{
   if(race?.mode!=='elimination'||eliminationActive().length<2)return {pass:false,reason:'Start Eliminazione first'};
   const active=eliminationActive(),[incumbent,challenger]=active;
   const fields=['x','y','a','speed','elimDistance','offtrack','offtrackSeconds','offtrackReturnGrace','routePinch','respawnGrace','impactGrace','onBridge','bridgeMissActive','bridgeLandingActive','tableFalling'];
   const snapshots=active.map(c=>Object.fromEntries(fields.map(k=>[k,c[k]])));
   const camera=[elimCameraId,elimCameraProgress,elimFocusWeight,elimCandidateId,elimCandidateSince];
   let result;
   try{
     active.forEach(c=>c.elimDistance=0);
     const p=.116,pt=trackPoint(p),a=tangent(p),fx=Math.cos(a),fy=Math.sin(a),nx=-fy,ny=fx;
     Object.assign(incumbent,{x:pt.x,y:pt.y,a,speed:170,elimDistance:100,
       offtrack:false,offtrackSeconds:0,offtrackReturnGrace:0,routePinch:null,
       respawnGrace:0,impactGrace:0,onBridge:false,bridgeMissActive:false,bridgeLandingActive:false,tableFalling:0});
     Object.assign(challenger,{x:pt.x+fx*43+nx*155,y:pt.y+fy*43+ny*155,a,speed:175,elimDistance:96,
       offtrack:true,offtrackSeconds:.28,offtrackReturnGrace:.8,routePinch:null,
       respawnGrace:0,impactGrace:0,onBridge:false,bridgeMissActive:false,bridgeLandingActive:false,tableFalling:0});
     elimCameraId=incumbent.id;elimCandidateId=null;
     const physical=eliminationPhysicalOvertake(challenger,incumbent);
     eliminationCameraLeader();const savedTime=race.time;race.time+=.2;
     const lead=eliminationCameraLeader();race.time=savedTime;
     result={pass:physical&&lead.id===challenger.id&&challenger.elimDistance>incumbent.elimDistance,
       physical,leaderId:lead.id,challengerId:challenger.id,projectedDeficit:incumbent.elimDistance-challenger.elimDistance};
   }finally{
     active.forEach((c,i)=>fields.forEach(k=>snapshots[i][k]===undefined?delete c[k]:c[k]=snapshots[i][k]));
     [elimCameraId,elimCameraProgress,elimFocusWeight,elimCandidateId,elimCandidateSince]=camera;
   }
   return result;
 },
 // A repeatable in-browser smoke test. It restores every changed car/camera field.
 testLegalCornerOvertake:()=>{
   if(race?.mode!=='elimination'||eliminationActive().length<2)return {pass:false,reason:'Start Eliminazione with two or more racers'};
   const [challenger,incumbent]=eliminationActive();
   const fields=['x','y','a','speed','elimDistance','elimPrevP','elimPrevX','elimPrevY','elimTravelSinceCredit','offtrack','offtrackSeconds','offtrackReturnGrace','routePinch','respawnGrace','bridgeMissActive','bridgeLandingActive','tableFalling'];
   const snaps=[challenger,incumbent].map(car=>Object.fromEntries(fields.map(k=>[k,car[k]])));
   const oldCamera=elimCameraId,oldProgress=elimCameraProgress,oldFocus=elimFocusWeight;
   let result;
   try{
     const p=.111,pt=trackPoint(p),a=tangent(p),nx=-Math.sin(a),ny=Math.cos(a);
     Object.assign(challenger,{x:pt.x+nx*175,y:pt.y+ny*175,a,speed:170,elimDistance:99,elimPrevP:p-.0015,
       elimPrevX:pt.x+nx*175-Math.cos(a)*9,elimPrevY:pt.y+ny*175-Math.sin(a)*9,
       elimTravelSinceCredit:14,offtrack:true,offtrackSeconds:.4,offtrackReturnGrace:.8,
       routePinch:null,respawnGrace:0,bridgeMissActive:false,bridgeLandingActive:false,tableFalling:0});
     incumbent.elimDistance=100;
     const dist=nearestCourse(challenger,points).distance;
     eliminationProgressUpdate(challenger,p,.04);
     const lead=eliminationCameraLeader();
     result={pass:lead.id===challenger.id&&challenger.elimDistance>100&&dist>151&&dist<=228,
       legalCutDistance:Math.round(dist),cameraLeader:lead.id,challenger:challenger.id,
       creditedProgress:Number(challenger.elimDistance.toFixed(2))};
   }finally{
     [challenger,incumbent].forEach((car,i)=>fields.forEach(k=>{
       if(snaps[i][k]===undefined)delete car[k];else car[k]=snaps[i][k];
     }));
     elimCameraId=oldCamera;elimCameraProgress=oldProgress;elimFocusWeight=oldFocus;
   }
   return result;
 }};
window.TTRDebug={
 getPickupRespawnSeconds:(n)=>K.pickupRespawnSeconds(n),
 getPickupCooldowns:()=>race?.pickups.map(p=>p.cool),
 getPhysicsProfiles:()=>profiles.map(pr=>({id:pr.id,...ttrCalibratedProfile(pr)})),
 getMenuClock:()=>({clock,phase:clock%TTRShowroom60.menuCycleSeconds,menuVisible:!$('screen').hidden,cycle:TTRShowroom60.menuCycleSeconds,hopPixels:TTRShowroom60.hopPixels}),
 testJamJarCollision:()=>{
   const jar=props.find(o=>o.type==='jam_spill_jar');if(!jar)return {pass:false,reason:'Jar not found'};
   const car={x:jar.x-55,y:jar.y,a:0,speed:100,width:36,length:62,jump:.45,jumpTotal:.45,jumpCd:0,hitVX:0,hitVY:0};
   const hit=contactWithProp(car,jar,{x:jar.x-110,y:jar.y});
   return {pass:jar.solid&&hit&&car.jump===0,solid:jar.solid,hit,airborneAfter:car.jump};
 },
 testMilkCupCollision:()=>{
    const bowl=props.find(o=>o.type==='milk_cereal_cup');if(!bowl)return {pass:false,reason:'cup not found'};
    const makeCar=(jump)=>({x:bowl.x-60,y:bowl.y,a:0,speed:105,width:36,length:62,
       jump,jumpTotal:jump,jumpCd:0,hitVX:0,hitVY:0});
    const grounded=makeCar(0),airborne=makeCar(.5);
    const old={x:bowl.x-105,y:bowl.y};
    const groundHit=contactWithProp(grounded,bowl,old);
    const airHit=contactWithProp(airborne,bowl,old);
    return {pass:!!(bowl.solid&&groundHit&&airHit&&airborne.jump===0),
      solid:bowl.solid,groundHit,airHit,airborneJumpAfter:airborne.jump,
      groundSeparation:Math.hypot(grounded.x-bowl.x,grounded.y-bowl.y)};
  },
 testOrangeCollision:()=>props.filter(o=>o.type==='orange'||o.type==='orange_bump').map(o=>{
   const c={x:o.x,y:o.y,a:0,speed:150,width:36,length:64,hitVX:0,hitVY:0,jump:.2,jumpTotal:.2,jumpCd:0};
   const hit=contactWithProp(c,o,{x:o.x-35,y:o.y});
   return {type:o.type,solid:o.solid,hit,jumpAfter:c.jump,displacement:Math.hypot(c.x-o.x,c.y-o.y)};
 }),
 getBreakfastPreview:()=>{
   const ox=155,oy=700,w=1000,h=600;const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');ctx.drawImage(track,ox,oy,w,h,0,0,w,h);
   ctx.drawImage(bridgeLayer,ox,oy,w,h,0,0,w,h);
   ctx.save();ctx.translate(-ox,-oy);
   props.filter(o=>o.type==='milk_cereal_cup').forEach(o=>drawMilkOverflow(ctx,o));
   props.filter(o=>o.x>ox-o.r&&o.x<ox+w+o.r&&o.y>oy-o.r&&o.y<oy+h+o.r).sort((a,b)=>a.y-b.y).forEach(o=>drawObstacle(ctx,o));
   ctx.restore();return canvas.toDataURL('image/png');
 },
 testMilkSlip:()=>{
   if(!race||milkCerealSpills.length<2)return false;
   const c=race.player,o=milkCerealSpills[1];c.x=o.x;c.y=o.y;c.speed=105;c.jump=0;c.slip=0;c.oilCooldown=0;c.oilSpin=0;
   c.respawnGrace=2;race.countdown=0;return true;
 },
 testImpactEjection:()=>{
   if(!race||race.cars.length<2)return false;
   race.countdown=0;
   const attacker=race.cars[0],victim=race.cars[1];
   attacker.x=WORLD_W-142;attacker.y=760;attacker.a=0;attacker.speed=270;
   victim.x=WORLD_W-82;victim.y=760;victim.a=0;victim.speed=0;
   for(const c of [attacker,victim]){
     c.hitVX=0;c.hitVY=0;c.hitYaw=0;c.impactGrace=0;
     c.offtrack=false;c.offtrackSeconds=0;c.offtrackEntry=null;
     c.auditP=.25;c.auditTravel=0;c.auditOutsideTime=0;c.respawnGrace=.4;
     c.tableFalling=0;c.tableFallImpact=false;c.jump=0;c.jumpCd=0;c.done=false;
   }
   return true;
 },
 getImpactEjection:()=>race?.cars.slice(0,2).map(c=>({id:c.id,x:c.x,y:c.y,falling:c.tableFalling||0,hitVX:c.hitVX||0,grace:c.impactGrace||0,respawns:c.shortcutRespawns||0})),
 testLegitimateInsideBend:(phase=.1,lateral=-112)=>{
  if(!race)return false;const c=race.player,q=trackPoint(phase),a=tangent(phase),nx=-Math.sin(a),ny=Math.cos(a);
  c.x=q.x+nx*lateral;c.y=q.y+ny*lateral;c.a=a;c.speed=91;c.p=phase;c.lastP=phase;c.jump=0;c.onBridge=false;c.rampEntryVisual=false;
  c.auditP=phase;c.auditTravel=0;c.auditCleanTime=0;c.auditOutsideTime=0;c.auditBridge=false;
  c.offtrack=false;c.offtrackEntry=null;c.offtrackSeconds=0;c.respawnGrace=0;c.bridgeMissActive=false;c.bridgeMissGrace=0;c.bridgeLandingActive=false;
  c.lastValidPosition={x:q.x,y:q.y,p:phase,a,speed:60,laps:c.lapsCompleted,flags:c.flags.slice()};race.countdown=0;return true;
 },
 testImpreciseBridgeLanding:(offset=64)=>{
  if(!race)return false;const c=race.player,q=shortcutPoint(.55),r=shortcutPoint(.57),a=Math.atan2(r.y-q.y,r.x-q.x);
  c.x=q.x-Math.sin(a)*offset;c.y=q.y+Math.cos(a)*offset;c.a=a;c.speed=88;c.jump=0;c.jumpCd=1.2;
  c.onBridge=true;c.bridgeOffSeconds=.19;c.bridgeMissActive=false;c.bridgeMissGrace=0;c.bridgeLandingActive=false;
  c.auditBridge=true;c.offtrack=false;c.offtrackEntry=null;c.respawnGrace=0;race.countdown=0;return true;
 },
 getVariantSprites:()=>race?.cars.map(c=>({id:c.id,model:c.profile.id,sprite:c.variantSprite||c.profile.id,color:c.variantAccent||c.profile.color})),testShowResults:()=>showResults(),testTableFall:()=>{if(!race)return false;race.countdown=0;const c=race.player;c.x=WORLD_W-18;c.y=Math.round(WORLD_H*.48);c.a=0;c.speed=60;return startTableFall(c);},getTableFall:()=>race?{left:race.player.tableFalling||0,impact:!!race.player.tableFallImpact,effects:race.effects.map(e=>e.kind)}:null,testRampContact:(offset=0,angleOffset=0,reverse=false)=>{const o=props.find(q=>q.type==='ramp');if(!o)return false;const ca=Math.cos(o.a),sa=Math.sin(o.a),al=-70;const c={x:o.x+ca*al-sa*offset,y:o.y+sa*al+ca*offset,a:o.a+angleOffset,speed:reverse?-150:150,jump:0,jumpCd:0,length:65};const next={...c,x:c.x+ca*65,y:c.y+sa*65};return K.rampLaunch(next,o,{x:c.x,y:c.y});},getBridgeState:()=>race?{onBridge:!!race.player.onBridge,takeoff:!!race.player.bridgeTakeoff,jump:race.player.jump||0,missGrace:race.player.bridgeMissGrace||0,missActive:!!race.player.bridgeMissActive,landingActive:!!race.player.bridgeLandingActive,falling:race.player.bridgeFalling||0,respawns:race.player.shortcutRespawns||0,speed:race.player.speed}:null,
 testKnifeJump:()=>{if(!race)return false;const c=race.player,o=props.find(q=>q.type==='knife'&&q.interactive);if(!o)return false;const ca=Math.cos(o.angle),sa=Math.sin(o.angle);const along=55,across=-50;c.x=o.x+ca*along-sa*across;c.y=o.y+sa*along+ca*across;c.a=tangent(o.segment);c.speed=132;c.jump=0;c.jumpCd=0;c.knifeCd=0;c.offtrack=false;c.bridgeMissActive=false;c.bridgeMissGrace=0;c.respawnGrace=0;race.countdown=0;return true;},
 testKnifeHandle:()=>{if(!race)return false;const c=race.player,o=props.find(q=>q.type==='knife'&&q.interactive);if(!o)return false;const ca=Math.cos(o.angle),sa=Math.sin(o.angle),along=-33,across=-51;c.x=o.x+ca*along-sa*across;c.y=o.y+sa*along+ca*across;c.a=tangent(o.segment);c.speed=125;c.jump=0;c.jumpCd=0;c.knifeCd=0;c.offtrack=false;c.bridgeMissActive=false;c.bridgeMissGrace=0;c.respawnGrace=0;race.countdown=0;return true;},
 testBridgeFall:()=>{if(!race)return false;const c=race.player,q=shortcutPoint(.55),r=shortcutPoint(.57),a=Math.atan2(r.y-q.y,r.x-q.x);c.x=q.x-Math.sin(a)*43;c.y=q.y+Math.cos(a)*43;c.a=a;c.speed=115;c.jump=0;c.jumpCd=.5;c.onBridge=true;c.bridgeOffSeconds=.16;c.offtrack=false;c.offtrackEntry=null;c.respawnGrace=0;c.bridgeMissGrace=0;race.countdown=0;return true;},
 getTraction:()=>race?{slip:race.player.slip,oilCooldown:race.player.oilCooldown||0,skidVX:race.player.skidVX||0,skidVY:race.player.skidVY||0}:null,
 testOilPlayer:()=>{if(!race||race.cars.length<2)return false;const c=race.player,q=trackPoint(.32);c.x=q.x;c.y=q.y;c.a=tangent(.32);c.speed=120;c.jump=0;c.slip=0;c.skidVX=0;c.skidVY=0;c.oilCooldown=0;c.bridgeMissActive=false;c.bridgeMissPenalty=0;c.bridgeMissGrace=0;c.offtrack=false;c.offtrackEntry=null;c.respawnGrace=0;c.auditP=.32;c.auditTravel=0;c.auditCleanTime=0;c.p=.32;c.lastP=.32;c.shortcutRespawns=0;c.oilSpin=0;
 c.lastValidPosition={x:c.x,y:c.y,p:.32,a:c.a,speed:60,laps:c.lapsCompleted,flags:c.flags.slice()};
 race.countdown=0;race.oils=[{x:c.x,y:c.y,r:34,t:9,owner:1,phase:0}];return true;},
 getCerealSpills:()=>milkCerealSpills.map(p=>({x:p.x,y:p.y,rx:p.rx,ry:p.ry,shape:p.spillShape,roadDistance:nearestCourse(p,points).distance})),
 getEliminationCamera:()=>({leaderId:elimCameraId,focusWeight:elimFocusWeight,camera:{x:camX,y:camY},gridLocked:race?.mode==='elimination'&&race.countdown>0}),
 testEliminationCameraSetup:(gap=55)=>{
  if(!race||race.mode!=='elimination')return false;
  // Deterministic frozen-grid camera diagnostic (available only via TTRDebug).
  const dist=Math.max(0,Number(gap)||0);race.countdown=999;race.elim.state='race';
  race.cars.forEach((c,i)=>{c.x=1080-i*dist;c.y=710+i*10;c.speed=0;c.elimDistance=1800-i*dist;
   c.eliminated=false;c.done=false;c.tableFalling=0;c.respawnGrace=0;});
  camX=950;camY=710;elimCameraId=null;elimFocusWeight=0;return true;
 },
 getOrangeRind:()=>props.filter(p=>p.type==='orange_bump').map(p=>({x:p.x,y:p.y,r:p.r,solid:p.solid,jump:p.jump})),
 getTrackMeta:()=>({jamPatch,courseYShift:K.COURSE_Y_SHIFT,crumbCount:K.crumbMarkers().length,worldW:WORLD_W,worldH:WORLD_H,length:TRACK_LENGTH,sections:sectionNames,sectionRanges,shortcutStart:shortcutFrom,shortcutEnd:shortcutTo,shortcut:shortcutSamples.map(q=>({x:q.x,y:q.y}))}),testEnterShortcut:()=>{if(!race)return false;const c=race.player,pt=shortcutPoint(.15),q=shortcutPoint(.19);c.x=pt.x;c.y=pt.y;c.a=Math.atan2(q.y-pt.y,q.x-pt.x);c.speed=160;c.respawnGrace=0;c.offtrack=false;c.offtrackEntry=null;race.countdown=0;return true;},teleportForCamera:(phase)=>{if(!race)return false;const c=race.player,p=trackPoint(phase);c.x=p.x;c.y=p.y;c.a=tangent(phase);c.speed=0;c.hitVX=c.hitVY=0;c.offtrack=false;return true;},getCamera:()=>({x:camX,y:camY,scale,viewportWidth:sw/scale,viewportHeight:sh/scale}),
 testFinishInnerLine:(offset=110)=>{if(!race)return false;const c=race.player,pt=trackPoint(0),a=tangent(0),nx=-Math.sin(a),ny=Math.cos(a),fx=Math.cos(a),fy=Math.sin(a);c.x=pt.x-fx*17+nx*offset;c.y=pt.y-fy*17+ny*offset;c.a=a;c.speed=160;c.flags=[true,true,true];c.lapGateBlocked=false;c.offtrack=false;c.respawnGrace=0;c.lastP=.966;c.p=.966;c.offtrackEntry=null;race.countdown=0;return true;},
 testCarAtEdge:()=>{if(!race)return false;const c=race.player;c.x=7;c.y=7;return true;},testCarStuck:()=>{if(!race)return false;const c=race.player;c.stuckAnchor={x:c.x,y:c.y};c.lastObstacleContact=race.time;c.obstacleStuckSeconds=2.56;return true;},getControls:()=>({...controls}),getSpoonStatus:()=>props.filter(o=>o.type==='spoon').map(o=>({x:o.x,y:o.y,interactive:!!o.interactive,solid:!!o.solid})),getCookieStyles:()=>props.filter(o=>o.type==='cookie').map(o=>o.cookieKind),getAssetStatus:()=>({...window.TTRAssets?.status}),
 testOilHit:()=>{if(!race||race.cars.length<2)return false;
   race.countdown=0;const oil={x:780,y:500,r:34,t:9,owner:0,phase:0};race.oils=[oil];
   const other=race.cars[1];other.x=oil.x;other.y=oil.y;other.speed=0;other.jump=0;other.slip=0;
   return true;},
 testUseItem:(kind='oil')=>{if(!race)return false;race.countdown=0;race.player.item=kind;useItem(race.player);return true;},
 getOilState:()=>race?{puddles:race.oils.map(o=>({x:o.x,y:o.y,r:o.r,t:o.t,deskDeck:!!o.deskDeck,bathBrushOil:!!o.bathBrushOil})),playerSlip:race.player.slip}:null,
 getPenaltyState:()=>race?{respawns:race.player.shortcutRespawns||0,offtrack:!!race.player.offtrack,lap:race.player.lapsCompleted,lapGateBlocked:!!race.player.lapGateBlocked,p:race.player.p,mugApexPassed:!!race.player.mugApexPassed}:null,
  testMugBendGate:(p,x,y,passed=false)=>{const at={x:x??trackPoint(p).x,y:y??trackPoint(p).y};return mugBendGate(nearestTrack(at,points),at,passed);},
 getTrackProps:()=>props.map(o=>({type:o.type,p:o.segment??null,x:o.x,y:o.y,a:o.a??o.angle,interactive:!!o.interactive,solid:!!o.solid,r:o.r,length:o.length||null,bladeInLane:o.bladeInLane||null})),
 testWideFinish:()=>{if(!race)return false;const c=race.player,p=.987,pt=trackPoint(p),a=tangent(p),nx=-Math.sin(a),ny=Math.cos(a);c.x=pt.x+nx*71;c.y=pt.y+ny*71;c.a=a;c.speed=225;c.lastP=p;c.p=p;c.flags=[true,true,true];c.lapGateBlocked=false;c.respawnGrace=0;c.offtrack=false;c.offtrackEntry=null;c.offtrackSeconds=0;c.stuckAnchor=null;race.countdown=0;return true;},
 testFinishSeam:()=>{if(!race)return false;const c=race.player,pos=trackPoint(.985),a=tangent(.985);c.x=pos.x;c.y=pos.y;c.a=a;c.speed=125;c.offtrack=false;c.offtrackEntry=null;c.offtrackSeconds=0;c.lastP=.985;c.p=.985;c.respawnGrace=0;return true;},
 testSeamOutside:(phase=.99)=>{if(!race)return false;const c=race.player,pt=trackPoint(phase),a=tangent(phase),nx=-Math.sin(a),ny=Math.cos(a);
  c.x=pt.x+nx*102;c.y=pt.y+ny*102;c.a=a;c.speed=0;c.offtrack=true;c.offtrackSeconds=.6;
  c.offtrackEntry={x:trackPoint(.975).x,y:trackPoint(.975).y,a:tangent(.975),p:.975,speed:50,laps:c.lapsCompleted,flags:c.flags.slice()};
  c.lastP=.975;c.p=.975;c.lapGateBlocked=true;c.maxInteriorCut=0;return true;},
 testReenterSeam:()=>{if(!race)return false;const c=race.player,pt=trackPoint(.02);c.x=pt.x;c.y=pt.y;c.a=tangent(.02);c.speed=0;return true;},

 testWideCorner:()=>{if(!race)return false;const c=race.player,pt=trackPoint(.07);
  c.lastValidPosition={x:pt.x,y:pt.y,a:tangent(.07),p:.07,speed:40,laps:c.lapsCompleted,flags:c.flags.slice()};
  c.x=86;c.y=1140;c.speed=0;c.offtrack=true;c.onBridge=false;c.bridgeOffSeconds=0;c.offtrackSeconds=1.01;
  c.offtrackEntry={...c.lastValidPosition};c.respawnGrace=0;c.maxInteriorCut=0;c.lapGateBlocked=true;race.countdown=0;return true;},
 testPickupApproach:()=>{if(!race)return false;const box=race.pickups[0],c=race.player;c.x=box.x;c.y=box.y;c.a=tangent(box.segment);c.speed=0;c.jump=0;c.jumpCd=0;c.item=null;box.cool=0;return true;},
 testRampApproach:()=>{if(!race)return false;const c=race.player,o=props.find(q=>q.type==='ramp');if(!o)return false;
   c.x=o.x-Math.cos(o.a)*70;c.y=o.y-Math.sin(o.a)*70;c.a=o.a;c.speed=148;c.jump=0;c.jumpCd=0;c.bridgeMissActive=false;c.bridgeMissGrace=0;c.offtrack=false;c.respawnGrace=0;race.countdown=0;return true;},
 testJamContact:()=>{if(!race)return false;const c=race.player;c.x=jamPatch.x;c.y=jamPatch.y;c.jump=0;c.jumpCd=0;c.speed=230;c.jamTimer=0;c.offtrack=false;c.respawnGrace=0;race.countdown=0;return true;},
 getJamState:()=>race?{jamTimer:race.player.jamTimer||0,speed:race.player.speed,inside:jamHit(race.player,jamPatch)}:null,
 getWorldData:()=>track.toDataURL('image/png'),forceFinish:(rank=1)=>{if(!race)return false;race.countdown=0;race.time=Math.max(race.time,35);race.cars.slice(1).forEach((v,i)=>{v.done=i<Math.max(0,rank-1);v.finishTime=v.done?race.time-4-i:null;});race.player.done=true;race.player.finishTime=race.time;return true;},teleportOfftrack:()=>{if(!race)return false;const c=race.player,pt=trackPoint(.22),a=tangent(.22);c.x=pt.x-Math.sin(a)*165;c.y=pt.y+Math.cos(a)*165;c.speed=85;return true;},testSpoonApproach:()=>{if(!race)return false;const o=props.find(o=>o.type==='spoon'&&o.solid),c=race.player;if(!o)return false;c.x=o.x-55*Math.cos(o.angle);c.y=o.y-55*Math.sin(o.angle);c.a=o.angle;c.speed=125;c.jump=0;c.jumpCd=0;c.spoonCd=0;return true;},simulate:(seconds=1)=>{for(let i=0;i<Math.round(seconds*60);i++)update(1/60);return race?.cars.map(c=>({id:c.id,progress:c.p,laps:c.lapsCompleted,speed:c.speed,done:c.done}));},testClaw:(withTarget=true)=>{if(!race||race.cars.length<2)return false;const c=race.player;
  const at=trackPoint(.74),aim=tangent(.74);c.x=at.x;c.y=at.y;c.a=aim;c.speed=75;c.jump=0;c.item='claw';c.claw=0;c.clawTarget=null;
  for(let i=1;i<race.cars.length;i++){const t=race.cars[i];const pt={x:c.x+Math.cos(aim)*97,y:c.y+Math.sin(aim)*97};t.x=i===1&&withTarget?pt.x:390+i*65;t.y=i===1&&withTarget?pt.y:245;t.a=i===1&&withTarget?tangent(.756):0;t.speed=i===1&&withTarget?50:0;t.done=false;}
  useItem(c);return {engaged:c.claw>0,remainingItem:c.item,target:c.clawTarget?.id??null,hint:$('hint').textContent};
 },
 testShortcut:(cut=true)=>{if(!race)return false;const c=race.player,pt=trackPoint(.15);
  c.lastValidPosition={x:pt.x,y:pt.y,a:tangent(.15),p:.15,speed:100,laps:c.lapsCompleted,flags:c.flags.slice()};
  c.x=cut?720:pt.x;c.y=cut?460:pt.y;c.a=0;c.speed=0;c.offtrack=false;c.offtrackSeconds=0;c.offtrackEntry=null;c.maxInteriorCut=0;
  return true;
 },
 testEarlyCornerCut:(from=.24,to=.36,travelled=380)=>K.illegalRouteGain(from,to,travelled,TRACK_LENGTH),testEarlyCutIntegration:()=>{if(!race)return null;const c=race.player,from=.24,to=.36;const pos=trackPoint(to),safe=trackPoint(from);
 c.lastValidPosition={x:safe.x,y:safe.y,a:tangent(from),p:from,laps:c.lapsCompleted,flags:c.flags.slice()};
 c.auditP=from;c.auditTravel=350;c.auditCleanTime=0;c.x=pos.x;c.y=pos.y;c.p=from;c.lastP=from;c.a=tangent(to);c.speed=0;c.offtrack=false;c.respawnGrace=0;race.countdown=0;
 const before=c.shortcutRespawns||0;update(1/60);return {before,after:c.shortcutRespawns||0,phase:c.p,expectedPhase:from};
},getRouteAudit:()=>race?{anchor:race.player.auditP,travel:race.player.auditTravel,p:race.player.p,penalties:race.player.shortcutRespawns||0,pinch:race.player.routePinch,stable:race.player.routeStableP}:null,getOilSpin:()=>race?{left:race.player.oilSpin||0,heading:race.player.a,slip:race.player.slip}:null,getGrid:()=>race?.cars.map(c=>({x:c.x,y:c.y,p:c.p,id:c.id})),version:'0.13.6.153',getAudioStatus:()=>SND.status(),getCars:()=>race?.cars.map(c=>({id:c.id,x:c.x,y:c.y,speed:c.speed,slip:c.slip,claw:c.claw,p:c.p,stuckTime:c.stuckTime,hitVX:c.hitVX,hitVY:c.hitVY})),getState:()=>race?{mode:race.mode,oilCount:race.oils.length,playerSlip:race.player.slip,lap:race.player.lapsCompleted,position:race.player.p,x:race.player.x,y:race.player.y,angle:race.player.a,speed:race.player.speed,camX,camY,scale,jump:race.player.jump,car:race.player.profile.id,checkpoint:race.player.flags.slice(),pickupCount:race.pickups.length,pickupSegments:race.pickups.map(p=>p.segment),pickupTypes:race.cars.map(c=>c.item),loading:!$('loadingTrack').hidden,carCount:race.cars.length,offtrack:race.player.offtrack,offtrackSeconds:race.player.offtrackSeconds,spoonCd:race.player.spoonCd,shortcutRespawns:race.player.shortcutRespawns||0,claw:race.player.claw,clawTargetId:race.player.clawTarget?.id??null}:null,start:mode=>initRace(mode||'race')};
})();


