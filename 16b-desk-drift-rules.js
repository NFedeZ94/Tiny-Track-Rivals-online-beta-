/* Desk Drift R3. Manual ruler bridge, independent of Bagno Sprint transit. */
(()=>{'use strict';const K=window.TTRCore;function create(D){
 const signed=(a,b)=>K.mod(b-a+.5,1)-.5,exitAssistDuration=.75;
 const axis=D.shortcutTangent(),fx=Math.cos(axis),fy=Math.sin(axis),P=D.shortcutPoint(0);
 const gate=D.gate,merge=D.merge,gatePhase=K.nearestTrackWindow(D.shortcutPoint(gate),D.points,D.entry,.025).p;
 const along=c=>((c.x-P.x)*fx+(c.y-P.y)*fy)/D.shortcutLength;
 // Render-only pose: the nose reaches the slope before the centre crosses its gate.
 // An incorrect lateral approach stays on the lower layer. Never change speed/jump/collisions.
 function rampPose(c){
  const u=along(c),b=D.shortcutNearest(c),over=(c.length||65)*.5/D.shortcutLength;
  const aligned=b.distance<D.bridgeHalf-12&&Math.cos(K.angleDiff(c.a,axis))>.80&&c.speed>=0;
  const approach=!c.onBridge&&!(c.respawnGrace>0)&&u>=gate-over&&u<gate&&aligned&&Math.abs(signed(D.entry,c.routeStableP??c.p??D.entry))<.055;
  const leaving=!c.onBridge&&c.deskExitRamp===true&&u>=merge-over&&u<=1+over&&b.distance<D.bridgeHalf+35&&!(c.respawnGrace>0);
  const above=!!c.onBridge||approach||leaving;
  const ascent=c.onBridge&&u>.10&&u<.29?Math.sin(Math.PI*((u-.10)/.19))*8:0;
  const down=K.clamp((u-.83)/.17,0,1),descent=(c.onBridge||leaving||c.bridgeExitVisual>0)&&u>.83&&u<1?10*Math.sin(Math.PI*down):0;
  const hop=Math.max(ascent,descent);
  return {above,hop,stage:approach?'approach':leaving?'exit':!c.onBridge?'ground':u<.17?'ascent':u>.82?'descent':'deck'};
 }
 // Oil belongs to the surface where it was deposited, not merely to its XY.
 function rulerFootprint(q){const u=along(q);return u>=0&&u<=1&&Math.abs((q.x-P.x)*(-fy)+(q.y-P.y)*fx)<=D.bridgeHalf;}
 function oilOnDeck(c,o=c){return (c.onBridge||rampPose(c).above)&&rulerFootprint(o);}
 function markOil(c,o){o.deskDeck=!!oilOnDeck(c,o);return o;}
 function sameOilSurface(c,o){return !!o.deskDeck===!!(c.onBridge||oilOnDeck(c));}
 function drawDeckOil(g,o,clock,draw){g.save();g.translate(P.x,P.y);g.rotate(axis);g.beginPath();g.rect(0,-D.bridgeHalf,D.shortcutLength,D.bridgeHalf*2);g.clip();g.rotate(-axis);g.translate(-P.x,-P.y);draw(g,o,clock);g.restore();}
 function resetObjects(props){for(const o of props)if(o.movable){Object.assign(o,{x:o.homeX,y:o.homeY,a:o.homeA,vx:0,vy:0,spin:0});}}
 function hitObject(c,o,resolve){const before=c.speed,dx=o.x-c.x,dy=o.y-c.y;if(!resolve(c,o))return false;const d=Math.hypot(dx,dy)||1,force=Math.min(125,Math.abs(before)*.44);o.vx=(o.vx||0)+dx/d*force;o.vy=(o.vy||0)+dy/d*force;o.spin=K.clamp((o.spin||0)+((dx*Math.sin(c.a)-dy*Math.cos(c.a))/d)*2.1,-3,3);return true;}
 function stepObjects(props,dt){const mobiles=props.filter(o=>o.movable);for(const o of mobiles){const old={x:o.x,y:o.y};o.x+=o.vx*dt;o.y+=o.vy*dt;o.a+=o.spin*dt;const drag=Math.exp(-dt*3.8);o.vx*=drag;o.vy*=drag;o.spin*=drag;
  // Keep objects within the tabletop, away from the bridge and out of other props.
  if(Math.hypot(o.x-o.homeX,o.y-o.homeY)>100||D.shortcutNearest(o).distance<D.bridgeHalf+o.r+35||props.some(v=>v!==o&&K.distance(o,v)<o.r+v.r-2)){o.x=old.x;o.y=old.y;o.vx*=-.25;o.vy*=-.25;}
  if(Math.hypot(o.vx,o.vy)<.3){o.vx=0;o.vy=0;}if(Math.abs(o.spin)<.03)o.spin=0;
 }}
 function enter(){return false;} // no assisted travel or input interception
 function transit(){return false;}
 function environment(c,old,dt,race,recover,SND){
  const p=K.mod(c.routeStableP??c.p,1),step=K.distance(c,old),physical=step<=40?step:0;
  const b=D.shortcutNearest(c),u=along(c),prevU=along(old),n=K.nearestTrackWindow(c,D.points,p,.032),advance=signed(p,n.p)*D.length;
  if(c.deskExitRamp&&(u>1+(c.length||65)/D.shortcutLength||u<merge-.06||b.distance>D.bridgeHalf+40||c.respawnGrace>0))c.deskExitRamp=false;
  // Enter via the actual ramp gate, not by proximity to the deck.
  if(!c.onBridge&&!(c.respawnGrace>0)&&physical>.02&&prevU<gate&&u>=gate&&b.distance<D.bridgeHalf-12&&Math.abs(signed(D.entry,p))<.055&&Math.cos(K.angleDiff(c.a,axis))>.80&&c.speed>0){c.onBridge=true;c.deskExitRamp=false;c.bridgeOffSeconds=0;c.routePinch=null;c.deskTry=false;c.shortcutEntered=(c.shortcutEntered||0)+1;if(c===race.player)SND?.sfx('ramp');}
  if(c.onBridge){
   if(c===race.player&&prevU<.83&&u>=.83)SND?.sfx('rampDown');
   if(race.time-(c.routeTraceAt??-Infinity)>=.099){const log=c.routeTrace??=[];log.push({t:+race.time.toFixed(3),x:+c.x.toFixed(2),y:+c.y.toFixed(2),p:c.p,stable:p,near:b.p,d:+b.distance.toFixed(1),branchT:b.t,decision:'desk-bridge'});if(log.length>40)log.shift();c.routeTraceAt=race.time;}
   if(u<gate-.03||b.distance>D.bridgeHalf+5||u>1.04){c.bridgeOffSeconds=(c.bridgeOffSeconds||0)+dt;c.offtrack=true;c.routePinch={phase:p};if(c.bridgeOffSeconds>.18){c.shortcutFailed=(c.shortcutFailed||0)+1;recover(c,'desk-bridge-fall');return false;}return true;}
   c.bridgeOffSeconds=0;c.offtrack=false;c.offtrackSeconds=0;c.routePinch=null;
   const phase=gatePhase+(D.exit-gatePhase)*K.clamp((b.t-gate)/(merge-gate),0,1);c.routeStableP=phase;c.routeResolvedNear={...b,p:phase};c.routeDecision='desk-manual-bridge';
   if(prevU<merge&&u>=merge&&b.distance<D.bridgeHalf-8&&c.speed>0&&Math.cos(K.angleDiff(c.a,axis))>.35){c.onBridge=false;c.deskExitRamp=true;c.routeStableP=D.exit;c.routeResolvedNear={...D.point(D.exit),distance:K.distance(c,D.point(D.exit)),p:D.exit,shortcut:false};c.deskTry=false;c.shortcutCompleted=(c.shortcutCompleted||0)+1;if(c===race.player)SND?.sfx('landing');}
   return true;
  }
  if(c.jump<=0&&D.paperContact(c)){c.speed*=Math.exp(-dt*.58);if(!c.deskPaper&&c===race.player)SND?.sfx('rindSurface');c.deskPaper=true;}else c.deskPaper=false;
  // Same bounded phase correction as the stability hotfix, but no global arm snap.
  let stable=p;const allowed=Math.min(24,physical*1.85+.12),from=K.nearestTrackWindow(old,D.points,p,.012);
  if(physical>.02&&n.distance<=D.laneHalf+24&&from.distance<=D.laneHalf+30){const a=D.tangent(n.p),align=((c.x-old.x)*Math.cos(a)+(c.y-old.y)*Math.sin(a))/physical;if(Math.abs(advance)<=allowed||align*Math.sign(advance)>.12)stable=K.mod(p+K.clamp(advance,-allowed,allowed)/D.length,1);}
  const near=K.nearestTrackWindow(c,D.points,stable,.009);c.routeStableP=stable;c.offtrack=near.distance>D.laneHalf+16;c.offtrackSeconds=c.offtrack?(c.offtrackSeconds||0)+dt:0;c.routeResolvedNear={...near,p:stable,shortcut:false};c.routeDecision=c.offtrack?'desk-outside':'desk-local';c.routePinch=c.offtrack?{phase:stable}:null;
  if(race.time-(c.routeTraceAt??-Infinity)>=.099){const log=c.routeTrace??=[];log.push({t:+race.time.toFixed(3),x:+c.x.toFixed(2),y:+c.y.toFixed(2),p:c.p,stable,near:n.p,d:+near.distance.toFixed(1),decision:c.routeDecision});if(log.length>40)log.shift();c.routeTraceAt=race.time;}
  // An outward excursion can be returning on the same local arm. Give it a short
  // bounded opportunity to rejoin; do not snap progress to a distant arm.
  const priorLocal=K.nearestTrackWindow(old,D.points,p,.032),returning=physical>.02&&n.distance+0.08<priorLocal.distance&&n.distance<=D.laneHalf+82&&Math.abs(signed(p,n.p))<=.022;
  const returnGrace=returning&&c.offtrackSeconds<1.40;
  if(c.offtrackSeconds>.8&&near.distance>D.laneHalf+38&&!returnGrace&&!(c.respawnGrace>0)){recover(c,'desk-route-cut');return false;}
  if(!c.offtrack&&near.distance<80&&!(c.respawnGrace>0)&&c.speed>=0&&Math.cos(K.angleDiff(c.a,D.tangent(stable)))>.2){c.lastCheckpoint=stable;c.lastValidPosition={...D.point(stable),p:stable,a:D.tangent(stable),laps:c.lapsCompleted,flags:c.flags.slice(),elimDistance:c.elimDistance};}
  return true;
 }
 function drive(c,race,s){const p=c.routeStableP??c.p,near=K.nearestTrackWindow(c,D.points,p,.028),hard=s.pace>=.999;
  if(hard&&!c.aiPersonality)c.aiPersonality=['aggressive','technical','strategic'][((c.id-1)%3+3)%3];
  const speed=Math.abs(c.speed),look=(hard?92:65)+Math.min(hard?82:58,speed*.24),phase=p+look/D.length,a=D.tangent(phase),normal=D.point(phase),nx=-Math.sin(a),ny=Math.cos(a);
  let target=normal,lead=null,gap=Infinity;
  for(const o of race.cars){if(o===c||o.done||o.eliminated||o.jump>0||!!o.onBridge!==!!c.onBridge)continue;const dx=o.x-c.x,dy=o.y-c.y,f=dx*Math.cos(c.a)+dy*Math.sin(c.a),l=-dx*Math.sin(c.a)+dy*Math.cos(c.a);if(f>10&&f<135&&Math.abs(l)<45&&f<gap){lead=o;gap=f;}}
  const valid=q=>K.nearestTrackWindow(q,D.points,phase,.035).distance<D.laneHalf-(c.width||36)*.5-8;
  const obstacles=race.deskProps||D.props;
  const approach=!c.onBridge&&p>D.entry-.04&&p<D.entry+.009;
  if(approach||c.onBridge)c.aiPassUntil=0;
  const safe=q=>valid(q)&&!obstacles.some(o=>K.distance(q,o)<o.r+32)&&!race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&K.distance(q,o)<42);
  if(hard&&!approach&&!c.onBridge&&near.distance<55&&!(c.aiRecoveryUntil>race.time)){const delta=145/D.length,l=D.point(phase-delta),r=D.point(phase+delta),off=K.clamp(((l.x+r.x)/2-normal.x)*nx+((l.y+r.y)/2-normal.y)*ny,-42,42);const q={x:normal.x+nx*off,y:normal.y+ny*off};if(safe(q))target=q;}
  if(!approach&&!c.onBridge&&lead&&s.pass>0&&near.distance<75&&lead.speed<c.speed+(hard?3:12)&&!(c.aiPassCooldown>race.time)){const side=((lead.x-normal.x)*nx+(lead.y-normal.y)*ny)>0?-1:1;for(const dir of [side,-side]){const q={x:normal.x+nx*dir*s.pass,y:normal.y+ny*dir*s.pass};if(safe(q)){c.aiPassSide=dir;c.aiPassUntil=race.time+1;c.aiPassCooldown=race.time+(hard?2.8:2);c.aiPassAttempts=(c.aiPassAttempts||0)+1;break;}}}
  if(c.aiPassUntil>race.time){const q={x:normal.x+nx*c.aiPassSide*s.pass,y:normal.y+ny*c.aiPassSide*s.pass};if(safe(q))target=q;else c.aiPassUntil=0;}
  for(const o of obstacles){if(o.type==='desk-clip'||K.distance(c,o)>160||K.distance(target,o)>o.r+35)continue;const side=((o.x-normal.x)*nx+(o.y-normal.y)*ny)>0?-1:1;const q={x:normal.x+nx*side*46,y:normal.y+ny*side*46};if(safe(q))target=q;break;}
  if(near.distance>100||c.aiRecoveryUntil>race.time)target=D.point(p+.008);
  const visit=(race.elim?.round||0)+':'+c.lapsCompleted;
  if(p>D.entry-.045&&p<D.entry+.008&&c.deskChoiceVisit!==visit){c.deskChoiceVisit=visit;c.deskTry=Math.random()<(s.pace<.9?.12:s.pace<.99?.40:.88)&&!(c.respawnGrace>0)&&!(c.deskRetryUntil>race.time);c.shortcutDecisionCount=(c.shortcutDecisionCount||0)+1;if(c.deskTry)c.shortcutAttemptCount=(c.shortcutAttemptCount||0)+1;}
  if(!c.onBridge&&c.deskTry&&approach){const b=D.shortcutNearest(c),u=along(c),side=(c.x-P.x)*(-fy)+(c.y-P.y)*fx;
   // Enter the ruler with aligned heading, not a late diagonal lunge.
   const occupied=race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&o.onBridge&&along(o)<.16&&((along(o)-u)*D.shortcutLength<Math.max(95,speed*.42)));
   const entranceOil=(race.oils||[]).some(o=>o.owner!==c.id&&o.deskDeck&&(o.t??1)>0&&along(o)<.19&&along(o)>=0);
   if(u<gate&&((occupied&&u>-.13)||entranceOil)){c.deskTry=false;c.aiPassUntil=0;}
   else {const t=K.clamp(u+.12,gate+.04,.35);target=D.shortcutPoint(t);}
  }
  if(c.onBridge){const b=D.shortcutNearest(c);target=D.shortcutPoint(Math.min(1,b.t+.12));if(b.t>.92)target=D.point(D.exit+.006);
   lead=null;gap=Infinity;for(const o of race.cars){if(o===c||o.done||o.eliminated||!o.onBridge)continue;const f=(along(o)-along(c))*D.shortcutLength;if(f>0&&f<165&&f<gap){lead=o;gap=f;}}
  }
  if(!c.onBridge&&(p>D.entry+.035||c.aiRecoveryUntil>race.time||c.respawnGrace>0||c.deskRetryUntil>race.time))c.deskTry=false;
  const oil=c.onBridge?window.TTRRaceDrivers.avoidOil(c,race,s,target,axis,q=>along(q)>=gate-.02&&along(q)<=1.04&&D.shortcutNearest(q).distance<=D.bridgeHalf-(c.width||36)*.5-5,[],{maxOffset:52,filter:o=>!!o.deskDeck}):c.deskTry?{target,slow:false}:window.TTRRaceDrivers.avoidOil(c,race,s,target,a,valid,obstacles,{filter:o=>sameOilSurface(c,o)});target=oil.target;
  const d=K.angleDiff(Math.atan2(target.y-c.y,target.x-c.x),c.a),steer=K.clamp(d*(hard?3.7:3.3),-1,1);
  if(c.reverseRecovery>0)return {steer:-steer||1,gas:false,brake:true};
  const bend=c.onBridge?0:Math.max(Math.abs(K.angleDiff(D.tangent(p+.017),D.tangent(p))),Math.abs(K.angleDiff(D.tangent(p+.029),D.tangent(p+.012))));
  const cap=c.profile.max*(c.boost>0?1.42:1);let desired=cap*(1-K.clamp((bend-(hard?.30:.20))*(hard?.19:.63),0,hard?.45:.6));
  if(Math.abs(d)>.30)desired=Math.min(desired,cap*(1-K.clamp((Math.abs(d)-.25)*(hard?.30:.68),0,hard?.48:.65)));
  if(!c.onBridge&&Math.abs(d)>.90)desired=Math.min(desired,Math.abs(d)>1.55?78:118);
  if(!c.onBridge&&near.distance>65&&Math.abs(d)>.60)desired=Math.min(desired,125);
  if(lead&&gap<60&&!(c.aiPassUntil>race.time))desired=Math.min(desired,Math.max(70,lead.speed));if(c.onBridge){const side=Math.abs((c.x-P.x)*(-fy)+(c.y-P.y)*fx);desired=Math.min(desired,cap,side>42||Math.abs(d)>.30?145:hard?c.profile.max:225);const followGap=hard?108:135;if(lead&&gap<followGap)desired=Math.min(desired,Math.max(0,lead.speed-(followGap-gap)*2.2));}else if(c.deskTry&&p>D.entry-.025){const alignment=Math.abs(K.angleDiff(c.a,axis));desired=Math.min(desired,cap,alignment>.27||D.shortcutNearest(c).distance>40?145:hard?Math.min(245,c.profile.max):190);}else if(near.distance>95)desired=Math.min(desired,110);if(oil.slow)desired=Math.min(desired,cap*(c.onBridge?.58:hard?.85:.65));
  const narrow=c.onBridge||c.deskTry;const brake=c.speed>desired+(narrow?7:hard?17:12)&&c.speed>(narrow?9:70);return {steer,gas:!brake&&(desired>=cap*(hard?.92:.96)||c.speed<desired+(hard?14:5)),brake};
 }
 function contactSnapshot(c){return c.onBridge&&!c.done&&!c.eliminated&&rulerFootprint(c)?{x:c.x,y:c.y,vx:c.hitVX||0,vy:c.hitVY||0,yaw:c.hitYaw||0}:null;}
 function softenContact(c,old){if(!old)return;const nx=-fy,ny=fx,v=((c.hitVX||0)-old.vx)*nx+((c.hitVY||0)-old.vy)*ny,side=(c.x-old.x)*nx+(c.y-old.y)*ny;if(Math.abs(v)<1e-6&&Math.abs(side)<1e-6)return;
  c.hitVX=(c.hitVX||0)-nx*v*.72;c.hitVY=(c.hitVY||0)-ny*v*.72;c.hitYaw=old.yaw+((c.hitYaw||0)-old.yaw)*.4;
  const u=along(c),z=(c.x-P.x)*nx+(c.y-P.y)*ny,excess=Math.max(0,Math.abs(z)-D.bridgeHalf);if(u>=gate&&u<=merge&&excess>0){c.x-=nx*Math.sign(z)*excess;c.y-=ny*Math.sign(z)*excess;}}
 return Object.freeze({contactSnapshot,softenContact,environment,drive,enter,transit,exitAssistDuration,rampPose,markOil,sameOilSurface,drawDeckOil,resetObjects,hitObject,stepObjects});}window.TTRDeskRules=create(window.TTRDeskTrack);if(window.TTRGarageTrack)window.TTRGarageRules=create(window.TTRGarageTrack);})();
