/* Tiny Track Rivals — Fase 7: logica di gara estratta senza alterare gli algoritmi.
 * Script classico: dipendenze iniettate dalla closure del legacy, nessuno stato globale di gara duplicato. */
(()=>{'use strict';
// Predictive avoidance, shared across the four offline circuits. No immunity.
function avoidOil(c,race,s,target,tangent,valid,obstacles=[],options={}){
 const normal={target,slow:false};
 if(!race.oils?.length||c.jump>0||c.slip>.2||c.reverseRecovery>0||c.boxExitAssist>0){c.aiOilSeen=null;return normal;}
 const skill=Math.max(0,Math.min(1,(s.pace-.80)/.20)),speed=Math.max(0,c.speed||0);
 const horizon=105+skill*105+speed*(.21+skill*.25),radius=o=>(o.r||31)+(c.width||36)*.24+5+skill*3;
 const fx=Math.cos(c.a),fy=Math.sin(c.a),nx=-Math.sin(tangent),ny=Math.cos(tangent);
 const hazards=race.oils.filter(o=>o.owner!==c.id&&(o.t??1)>0&&Math.hypot(o.x-c.x,o.y-c.y)<horizon+radius(o)&&((o.x-c.x)*fx+(o.y-c.y)*fy)>-radius(o)&&(!options.filter||options.filter(o)));
 if(!hazards.length){c.aiOilSeen=null;return normal;}
 const seg=(a,b,o)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(a.x+dx*t-o.x,a.y+dy*t-o.y);};
 const extension=Math.max(0,Math.min(190,horizon-Math.hypot(target.x-c.x,target.y-c.y)));
 const endpoints=new Map();const end=q=>{if(endpoints.has(q))return endpoints.get(q);let last=q;for(let k=1;k<=4;k++){const z={x:q.x+Math.cos(tangent)*extension*k/4,y:q.y+Math.sin(tangent)*extension*k/4};if(!valid(z))break;last=z;}endpoints.set(q,last);return last;};
 const clearance=(q,o,e)=>Math.min(seg(c,q,o),seg(q,e,o))-radius(o);
 const straightEnd=end(target),ahead=o=>(o.x-c.x)*fx+(o.y-c.y)*fy,threat=hazards.filter(o=>clearance(target,o,straightEnd)<0).sort((a,b)=>ahead(a)-ahead(b))[0];
 const previous=c.aiOilSeen;
 if(!threat&&(!previous||!hazards.includes(previous.oil))){c.aiOilSeen=null;return normal;}
 // Hold one side for the same obstacle rather than weaving back and forth.
 const oil=threat&&previous?.oil&&previous.oil!==threat&&ahead(threat)<ahead(previous.oil)-25?threat:previous&&hazards.includes(previous.oil)?previous.oil:threat;
 if(!previous||previous.oil!==oil){c.aiOilSeen={oil,time:race.time,side:0,offset:0};c.aiOilEncounters=(c.aiOilEncounters||0)+1;}
 const state=c.aiOilSeen,delay=.28-.27*skill;
 if(race.time-state.time<delay)return normal;
 const others=race.cars||[],max=options.maxOffset??(52+skill*28);
 const feasible=(q)=>{
   const e=end(q);
   if(!valid(q)||((straightEnd.x-e.x)*Math.cos(tangent)+(straightEnd.y-e.y)*Math.sin(tangent))>8)return false;
   for(const f of [.35,.65,.9])if(!valid({x:c.x+(q.x-c.x)*f,y:c.y+(q.y-c.y)*f}))return false;
   if(obstacles.some(o=>o.solid&&Math.min(seg(c,q,o),seg(q,e,o))<(o.r||20)+(c.width||36)*.5+5))return false;
   if(others.some(o=>o!==c&&!o.done&&!o.eliminated&&!o.boxTransit&&!(o.jump>0)&&!!o.onBridge===!!c.onBridge&&Math.min(seg(c,q,o),Math.hypot(o.x-q.x,o.y-q.y))<(c.width||36)*.5+(o.width||36)*.5+7))return false;
   return true;
 };
 const clear=q=>feasible(q)&&hazards.every(o=>clearance(q,o,end(q))>=0);
 const away=((oil.x-target.x)*nx+(oil.y-target.y)*ny)>0?-1:1;
 const preferred=state.side||away;
 const offsets=[state.offset,24,36,48,60,72,80,max].filter((v,i,a)=>v>0&&v<=max&&a.indexOf(v)===i);
 for(const side of [preferred,-preferred])for(const offset of offsets){
   const q={x:target.x+nx*offset*side,y:target.y+ny*offset*side};
   if(clear(q)){if(!state.detour){state.detour=true;c.aiOilDetours=(c.aiOilDetours||0)+1;}state.side=side;state.offset=offset;return {target:q,slow:false};}
 }
 if(!state.slow){state.slow=true;c.aiOilCautions=(c.aiOilCautions||0)+1;}
 // When all safe paths are blocked, reduce speed, never drive off the bridge.
 // Oil still applies its normal skid if contact is unavoidable.
 if(skill>=.999&&max>=40){
  const base=Math.min(...hazards.map(o=>clearance(target,o,straightEnd)));let best=target,bestClear=base;
  for(const side of [preferred,-preferred])for(const offset of [24,36,48,60,72,max]){if(offset>max)continue;const q={x:target.x+nx*side*offset,y:target.y+ny*side*offset};if(!feasible(q))continue;const margin=Math.min(...hazards.map(o=>clearance(q,o,end(q))));if(margin>bestClear+4){best=q;bestClear=margin;}}
  if(best!==target)return {target:best,slow:true};
 }
 return {target,slow:true};
}
window.TTRRaceDrivers=Object.freeze({avoidOil,create(deps){
  const {getRace,getOnlineSession,onlineHostInput,controls,keys,trackPoint,mod,angleDiff,clamp,nearestTrack,points,K,props}=deps;

function legacyInputFor(c){
 const race=getRace(),onlineSession=getOnlineSession();
if(race?.mode==='online'&&onlineSession?.host&&c.id!==0){const net=onlineHostInput(c);if(net)return net;}if(c===race.player){const steer=(controls.right||window.TTRKeyboard.down('right')?1:0)-(controls.left||window.TTRKeyboard.down('left')?1:0);return {steer,gas:true,brake:controls.brake||window.TTRKeyboard.down('brake')};}
 const difficulty=race.aiFactor||1,level=difficulty<.95?0:difficulty<1.1?1:2;
 const ramp=props.find(o=>o.type==='ramp');const inZone=c.p>.515&&c.p<.63;
 const visit=(race.elim?.round||0)+':'+c.lapsCompleted;
 if(ramp&&race.mode!=='online'&&inZone&&c.shortcutDecisionLap!==visit&&!c.bridgeMissActive){
  c.shortcutDecisionLap=visit;c.tryShortcut=Math.random()<[.10,.40,.80][level];c.shortcutDecisionCount=(c.shortcutDecisionCount||0)+1;if(c.tryShortcut)c.shortcutAttemptCount=(c.shortcutAttemptCount||0)+1;
  // A less accurate approach, rather than a forced failure, creates skill-dependent results.
  c.rampAimOffset=(Math.random()*2-1)*[49,30,9][level];
 }
 if(c.bridgeMissActive||c.respawnGrace>0||c.p>.82||c.p<.50)c.tryShortcut=false;
 let target=trackPoint(mod(c.p+[.021,.025,.027][level],1));
 if(c.onBridge){const b=K.shortcutNearest(c);target=K.shortcutPoint(Math.min(1,b.t+.075));if(b.t>.96)target=trackPoint(mod(K.shortcutTo+.025,1));}
 else if(c.tryShortcut&&ramp&&inZone){const along=(c.x-ramp.x)*Math.cos(ramp.a)+(c.y-ramp.y)*Math.sin(ramp.a);const lead=along< -105?-90:38,offset=c.rampAimOffset||0;target={x:ramp.x+Math.cos(ramp.a)*lead-Math.sin(ramp.a)*offset,y:ramp.y+Math.sin(ramp.a)*lead+Math.cos(ramp.a)*offset};}
 else if(ramp&&c.p>.54&&c.p<.67){const phase=mod(c.p+.027,1),a=K.tangent(phase),nx=-Math.sin(a),ny=Math.cos(a);const ref=trackPoint(K.shortcutFrom),ra=K.tangent(K.shortcutFrom);const side=(ref.x-ramp.x)*-Math.sin(ra)+(ref.y-ramp.y)*Math.cos(ra)>=0?1:-1;const weight=clamp((phase-.55)/.03,0,1)*clamp((.675-phase)/.035,0,1);target={x:target.x+nx*side*82*weight,y:target.y+ny*side*82*weight};}
 // Avoid tall objects ahead without routing through the grass.
 if(!c.onBridge&&!c.tryShortcut){for(const o of props){if(!o.solid||o.type==='knife')continue;const dx=o.x-c.x,dy=o.y-c.y,dist=Math.hypot(dx,dy);if(dist>o.r+105||dx*Math.cos(c.a)+dy*Math.sin(c.a)<0)continue;const a=K.tangent(c.p),nx=-Math.sin(a),ny=Math.cos(a),side=dx*nx+dy*ny>0?-1:1;target={x:target.x+nx*side*38,y:target.y+ny*side*38};break;}}
 const desired=Math.atan2(target.y-c.y,target.x-c.x),d=angleDiff(desired,c.a);let steer=clamp(d*[2.1,2.5,2.8][level],-1,1);const near=nearestTrack(c,points),tooFar=near.distance>55;
 if(tooFar&&!c.onBridge&&!c.tryShortcut&&!(ramp&&c.p>.54&&c.p<.67&&near.distance<105)){const go=Math.atan2(near.y-c.y,near.x-c.x),turn=angleDiff(go,c.a);steer=clamp(turn*2.8,-1,1);}
 const v=Math.abs(d);
 if(c.reverseRecovery>0)return {steer:-steer||1,gas:false,brake:true};
 const brake=v>[.53,.65,.75][level]&&c.speed>[93,108,120][level];
 return {steer,gas:!brake&&(v<[.46,.53,.58][level]||c.speed<92),brake};
}
 // Offline skill is shared by race, elimination and progressive career.
 // Physics remains identical; no speed or acceleration beyond vehicle limits.
 const skillProfiles=Object.freeze([
   Object.freeze({pace:.80,look:105,line:0,steer:2.1,curveSpeed:.77,pass:0,shortcut:.10,aim:49}),
   Object.freeze({pace:.95,look:125,line:.45,steer:2.55,curveSpeed:.89,pass:34,shortcut:.45,aim:27}),
   Object.freeze({pace:1,look:170,line:1,steer:3.45,curveSpeed:1,pass:52,shortcut:.60,aim:8})
 ]);
 function skillFor(race){
   const f=race.aiFactor||1;
   if(race.mode!=='career')return skillProfiles[f<.95?0:f<1.1?1:2];
   if(race.aiSkillProfile?.factor===f)return race.aiSkillProfile.profile;
   const t=clamp((f-.8)/.33,0,1)*2,i=Math.min(1,Math.floor(t)),u=t-i;
   const a=skillProfiles[i],b=skillProfiles[i+1],profile=Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*u]));race.aiSkillProfile={factor:f,profile};return profile;
 }
 const length=K.TRACK_LENGTH;
 const ramp=()=>props.find(o=>o.type==='ramp');
 function linePoint(p,strength){
   const chord=strength>=.999?.021:.014;const q=trackPoint(p),a=trackPoint(p-chord),b=trackPoint(p+chord),heading=K.tangent(p);
   // A bounded chord through the bend, still well inside the drivable lane.
   const n={x:-Math.sin(heading),y:Math.cos(heading)};
   const off=clamp(((a.x+b.x)/2-q.x)*n.x+((a.y+b.y)/2-q.y)*n.y,-(strength>=.999?48:42),strength>=.999?48:42)*strength;
   return {x:q.x+n.x*off,y:q.y+n.y*off};
 }
 function inputFor(c){
   const race=getRace();if(c===race.player||race.mode==='online'&&getOnlineSession()?.members[c.id])return legacyInputFor(c);
   const s=skillFor(race),hardLevel=s.curveSpeed>=.999;
   if(race.trackId==='box-di-biliardo')return window.TTRBoxRules.drive(c,race,s);
   if(race.trackId==='bagno-sprint')return window.TTRBathRules.drive(c,race,s);
   if(race.trackId==='desk-drift')return window.TTRDeskRules.drive(c,race,s);
   if(race.trackId==='garage-grid')return window.TTRGarageRules.drive(c,race,s);
   if(hardLevel&&!c.aiPersonality)c.aiPersonality=['aggressive','technical','strategic'][((c.id-1)%3+3)%3];
   const r=ramp(),inZone=c.p>.515&&c.p<.63,visit=(race.elim?.round||0)+':'+c.lapsCompleted;
   if(r&&inZone&&c.shortcutDecisionLap!==visit&&!c.bridgeMissActive){
     c.shortcutDecisionLap=visit;
     const chance=hardLevel?({aggressive:.90,technical:.83,strategic:.87}[c.aiPersonality]??.85):s.shortcut;
     const clear=!hardLevel||!race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&o.tryShortcut&&Math.hypot(o.x-c.x,o.y-c.y)<95);
     c.tryShortcut=Math.random()<chance&&clear;
     c.shortcutDecisionCount=(c.shortcutDecisionCount||0)+1;
     if(c.tryShortcut)c.shortcutAttemptCount=(c.shortcutAttemptCount||0)+1;
     c.rampAimOffset=(Math.random()*2-1)*s.aim;
   }
   if(c.bridgeMissActive||c.respawnGrace>0||c.p>.82||c.p<.50||c.aiRecoveryUntil>race.time)c.tryShortcut=false;
   // Protect the mandatory coffee-cup apex; no shortcut or gate bypass.
   const cupZone=c.p>=.205&&c.p<=.345&&!c.onBridge;
   const phase=mod(c.p+((cupZone?Math.min(s.look,112):s.look)+Math.max(0,c.speed)*.12)/length,1);
   let target=linePoint(phase,cupZone?Math.min(.15,s.line):s.line),plannedBranch=false;
   if(cupZone){c.aiPassUntil=0;c.aiPassCooldown=Math.max(c.aiPassCooldown||0,race.time+.5);}
   const a=K.tangent(phase),nx=-Math.sin(a),ny=Math.cos(a);
   if(c.onBridge){const b=K.shortcutNearest(c);target=K.shortcutPoint(Math.min(1,b.t+.075));if(b.t>.96)target=trackPoint(mod(K.shortcutTo+.025,1));plannedBranch=true;}
   else if(c.tryShortcut&&r&&inZone){const along=(c.x-r.x)*Math.cos(r.a)+(c.y-r.y)*Math.sin(r.a),lead=along< -105?-90:38,off=c.rampAimOffset||0;target={x:r.x+Math.cos(r.a)*lead-Math.sin(r.a)*off,y:r.y+Math.sin(r.a)*lead+Math.cos(r.a)*off};plannedBranch=true;}
   else if(r&&c.p>.54&&c.p<.67){const ref=trackPoint(K.shortcutFrom),ra=K.tangent(K.shortcutFrom),side=(ref.x-r.x)*-Math.sin(ra)+(ref.y-r.y)*Math.cos(ra)>=0?1:-1;const weight=clamp((phase-.55)/.03,0,1)*clamp((.675-phase)/.035,0,1);target={x:target.x+nx*side*82*weight,y:target.y+ny*side*82*weight};plannedBranch=true;}
   let obstacle=null,offset=0,blocked=false;
   if(!plannedBranch){
     for(const o of props){if(!o.solid||o.type==='knife')continue;const dx=o.x-c.x,dy=o.y-c.y,dist=Math.hypot(dx,dy);if(dist>o.r+110||dx*Math.cos(c.a)+dy*Math.sin(c.a)<0)continue;
       const ahead=Math.hypot(target.x-o.x,target.y-o.y);if(ahead>o.r+65)continue;
       const side=(o.x-target.x)*nx+(o.y-target.y)*ny>0?-1:1;offset=side*45;obstacle=o;break;
     }
     // Choose one passing side and hold it; do not weave every simulation step.
     let front=null,frontGap=Infinity;
     for(const other of race.cars){if(other===c||other.eliminated||other.done||other.onBridge||other.jump>0)continue;const dx=other.x-c.x,dy=other.y-c.y,f=dx*Math.cos(c.a)+dy*Math.sin(c.a),side=-dx*Math.sin(c.a)+dy*Math.cos(c.a);if(f>12&&f<140&&Math.abs(side)<46&&f<frontGap){front=other;frontGap=f;}}
     const passSafe=side=>{
       const q={x:target.x+nx*side*s.pass,y:target.y+ny*side*s.pass};
       const n=K.nearestTrackWindow(q,points,phase,.035);
       return n.distance<K.LANE_HALF-(c.width||36)*.5-12&&!props.some(o=>o.solid&&K.distance(q,o)<(o.r||25)+30)&&!race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&!o.onBridge&&!(o.jump>0)&&K.distance(q,o)<(c.width||36)*.5+(o.width||36)*.5+10);
     };
     if(!cupZone&&front&&front.speed<c.speed-(hardLevel?5:10)&&s.pass>0&&!obstacle&&!(c.aiPassUntil>race.time)&&!(c.aiPassCooldown>race.time)){
       const side=(front.x-target.x)*nx+(front.y-target.y)*ny>0?-1:1,chosen=passSafe(side)?side:passSafe(-side)?-side:0;
       if(chosen){c.aiPassSide=chosen;c.aiPassUntil=race.time+1.35;c.aiPassCooldown=race.time+3;c.aiPassAttempts=(c.aiPassAttempts||0)+1;}else c.aiPassCooldown=race.time+.7;
     }
     if(c.aiPassUntil>race.time&&!obstacle&&!cupZone&&passSafe(c.aiPassSide))offset=c.aiPassSide*s.pass;
     else {if(c.aiPassUntil>race.time)c.aiPassUntil=0;if(front&&frontGap<58)blocked=true;}
     target={x:target.x+nx*(cupZone?clamp(offset,-20,20):offset),y:target.y+ny*(cupZone?clamp(offset,-20,20):offset)};
   }
   const near=nearestTrack(c,points);
   if(c.aiRecoveryUntil>race.time&&!c.onBridge){const q=trackPoint(near.p+.012);target={x:q.x,y:q.y};plannedBranch=false;}
   if(near.distance>(cupZone?58:s.curveSpeed>=.999?92:83)&&!plannedBranch&&!(c.aiRecoveryUntil>race.time)){target=cupZone?trackPoint(mod(c.p+.013,1)):{x:near.x,y:near.y};}
   const edgeRisk=!c.onBridge&&(c.x<120||c.x>K.WORLD_W-120||c.y<120||c.y>K.WORLD_H-120)&&near.distance>75;
   if(edgeRisk){target=trackPoint(near.p+.006);plannedBranch=false;c.tryShortcut=false;}
   const oil=c.onBridge?avoidOil(c,race,s,target,Math.atan2(target.y-c.y,target.x-c.x),q=>K.shortcutNearest(q).distance<=Math.max(12,44-(c.width||36)*.5),[],{maxOffset:24}):(!plannedBranch&&!edgeRisk&&!(c.aiRecoveryUntil>race.time)&&near.distance<75)?avoidOil(c,race,s,target,a,q=>q.x>80&&q.x<K.WORLD_W-80&&q.y>80&&q.y<K.WORLD_H-80&&K.nearestTrackWindow(q,points,phase,.045).distance<K.LANE_HALF-(c.width||36)*.5-5,props,cupZone?{maxOffset:24}:{}):{target,slow:false};
   target=oil.target;
   const d=angleDiff(Math.atan2(target.y-c.y,target.x-c.x),c.a),v=Math.abs(d);
   const steer=clamp(d*s.steer,-1,1);
   if(c.reverseRecovery>0)return {steer:-steer||1,gas:false,brake:true};
   // Predict turn severity ahead, not merely current heading error. Preserve
   // full throttle on straights and a useful speed on the approved ramp.
   const bend=Math.abs(angleDiff(K.tangent(c.p+.033),K.tangent(c.p+.008)));
   const cap=c.profile.max*(c.boost>0?1.42:1);
   let desired=cap*(1-clamp((bend-.30)*.34,0,.38)*(.10+(1-s.curveSpeed)*3.3));
   const turnThreshold=.65+(s.curveSpeed-.77)*.9+(s.curveSpeed>=.999?.12:0);
   if(v>turnThreshold)desired=Math.min(desired,cap*(1-clamp((v-turnThreshold+.10)*.46,0,.55)));
   if(obstacle)desired=Math.min(desired,cap*(.78+(s.curveSpeed-.77)*.5));
   if(edgeRisk)desired=Math.min(desired,105);
   if(cupZone&&near.distance>58)desired=Math.min(desired,cap*.86);
   if(oil.slow)desired=Math.min(desired,cap*(hardLevel&&!cupZone&&!c.onBridge?.82:.68));
   else if(c.aiOilSeen?.side)desired=Math.min(desired,cap*(hardLevel?.94:.86));
   if(blocked)desired=Math.min(desired,Math.max(75,frontSpeedFallback(c,race)));
   if(plannedBranch&&c.tryShortcut&&v<.45&&!oil.slow)desired=cap;
   const hard=s.curveSpeed>=.999;
   // Avoid needless throttle/coast oscillation at the vehicle speed limiter.
   // Only hard AI gets the tighter racing-line and throttle calibration.
   const brake=c.speed>desired+(hard?16:12)&&c.speed>85;
   return {steer,gas:!brake&&(desired>=cap*.96||c.speed<desired+(hard?8:3)),brake};
 }
 function frontSpeedFallback(c,race){let speed=c.speed;for(const other of race.cars){if(other!==c&&!other.done&&!other.eliminated&&Math.hypot(other.x-c.x,other.y-c.y)<90)speed=Math.min(speed,other.speed);}return speed;}
 return Object.freeze({inputFor,skillFor});

}});
})();
