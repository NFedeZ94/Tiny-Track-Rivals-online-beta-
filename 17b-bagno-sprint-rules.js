/* Bagno Sprint R4. Mandatory brush, manual wet drain cut, bounded route tracking. */
(()=>{'use strict';const D=window.TTRBathTrack,K=window.TTRCore;
 const signed=(a,b)=>K.mod(b-a+.5,1)-.5,exitAssistDuration=.75;
 const gate=.10,gatePhase=D.entry+(D.exit-D.entry)*gate;
 const axis=D.shortcutTangent(gate),P=D.shortcutPoint(gate),Q=D.shortcutPoint(1),out=D.shortcutTangent(1);
 const plane=(q,o,a)=>(q.x-o.x)*Math.cos(a)+(q.y-o.y)*Math.sin(a);
 const brushAxis=Math.atan2(D.brush.Q.y-D.brush.P.y,D.brush.Q.x-D.brush.P.x);
 function brushFootprint(q){const z=D.brushContact(q);return z.u>.10&&z.u<.965&&Math.abs(z.side)<=D.brushLimit(q,z.u);}
 function markOil(c,o){o.bathBrushOil=brushFootprint(o);return o;}
 function drawBrushOil(g,o,clock,draw){g.save();g.translate(D.brush.P.x,D.brush.P.y);g.rotate(brushAxis);g.beginPath();for(let i=0;i<=100;i++){const u=.10+.865*i/100,x=u*D.brush.length,y=-D.brushDeckHalf(u);if(!i)g.moveTo(x,y);else g.lineTo(x,y);}for(let i=100;i>=0;i--){const u=.10+.865*i/100;g.lineTo(u*D.brush.length,D.brushDeckHalf(u));}g.closePath();g.clip();g.rotate(-brushAxis);g.translate(-D.brush.P.x,-D.brush.P.y);draw(g,o,clock);g.restore();}
 // A spinning car keeps its momentum direction on the narrow crossing; its
 // sprite still spins, acceleration/steering remain impaired, and real falls count.
 function beginBrushSpin(c){if(c.onBridge||!brushFootprint(c))return false;c.bathBrushSpinHeading=c.a;c.skidVX=(c.skidVX||0)*.20;c.skidVY=(c.skidVY||0)*.20;return true;}
 function spinTravelHeading(c){return Number.isFinite(c.bathBrushSpinHeading)&&c.oilSpin>0&&brushFootprint(c)?c.bathBrushSpinHeading:c.a;}
 function enter(){return false;}
 function transit(){return false;}
 function environment(c,old,dt,race,recover,SND){
  const p=K.mod(c.routeStableP??c.p,1),step=K.distance(c,old),physical=step<=40?step:0;
  const b=D.shortcutNearest(c),before=D.shortcutNearest(old),n=K.nearestTrackWindow(c,D.points,p,.032),advance=signed(p,n.p)*D.length;
  const trace=(decision,distance)=>{if(race.time-(c.routeTraceAt??-Infinity)<.099)return;const log=c.routeTrace??=[];log.push({t:+race.time.toFixed(3),x:+c.x.toFixed(2),y:+c.y.toFixed(2),p:c.p,stable:c.routeStableP??p,near:b.p,d:+distance.toFixed(1),branchT:b.t,decision});if(log.length>40)log.shift();c.routeTraceAt=race.time;};
  const fail=reason=>{if(c.onBridge)c.shortcutFailed=(c.shortcutFailed||0)+1;trace(reason,b.distance);c.routeDecision={kind:reason,branch:!!c.onBridge,phase:p,t:b.t,branchDistance:b.distance,normalDistance:n.distance,exitDistance:K.nearestTrackWindow(c,D.points,D.exit,.025).distance,brushU:D.brushContact(c).u,brushSide:D.brushContact(c).side,brushHalf:D.brushDeckHalf(D.brushContact(c).u),brushLimit:D.brushLimit(c,D.brushContact(c).u),brushOffSeconds:c.bathBrushOff||0,oilSpin:c.oilSpin||0,slip:c.slip||0,water:D.wet(c)};if(c===race.player&&reason==='bath-water')SND?.sfx('boxPocket');recover(c,reason);return false;};
  // The branch is acquired only at the real entrance plane, with forward movement.
  if(!c.onBridge&&!(c.respawnGrace>0)&&physical>.02&&plane(old,P,axis)<0&&plane(c,P,axis)>=0&&b.t<gate+.03&&b.distance<D.bridgeHalf-15&&Math.abs(signed(D.entry,p))<.043&&Math.cos(K.angleDiff(c.a,axis))>.58&&c.speed>0){c.onBridge=true;c.bridgeOffSeconds=0;c.routePinch=null;c.deskTry=false;c.shortcutEntered=(c.shortcutEntered||0)+1;if(c===race.player)SND?.sfx('oilSkid');}
  if(D.wet(c)&&!(c.jump>0))return fail('bath-water');
  if(c.onBridge){
   // The legal main lane and the shortcut form one continuous surface at the exit.
   // Rejoin only from the final branch section, after real movement and on the local exit arm.
   const rejoin=K.nearestTrackWindow(c,D.points,D.exit,.025),oldBranch=before.t;
   const exitGap=signed(D.exit,rejoin.p);
   const forward=physical>.02&&c.speed>0&&((c.x-old.x)*Math.cos(D.tangent(rejoin.p))+(c.y-old.y)*Math.sin(D.tangent(rejoin.p)))>=-physical*.2;
   const alongExit=physical>.02?((c.x-old.x)*Math.cos(D.tangent(rejoin.p))+(c.y-old.y)*Math.sin(D.tangent(rejoin.p)))/physical:0;
   // Both lanes overlap at the dry outlet; allow the final 12% only if
   // the previous sample was already there and the car actually heads into the outgoing lane.
   const dryEarly=p>=D.entry+(D.exit-D.entry)*.865&&oldBranch>=.87&&b.t>=.88&&b.distance>=D.bridgeHalf-8&&b.distance<=D.bridgeHalf+28&&rejoin.distance<=D.laneHalf-8&&exitGap>=-.004&&exitGap<=.022&&alongExit>.48;
   if((dryEarly||oldBranch>=.88&&b.t>=.90&&Math.abs(exitGap)<=.022&&rejoin.distance<=D.laneHalf-12&&forward&&(b.distance>D.bridgeHalf-8||b.t>=.97))&&physical>.02&&c.speed>0&&Math.abs(b.t-oldBranch)*D.shortcutLength<=physical*2.4+5){
    c.onBridge=false;c.bridgeOffSeconds=0;c.offtrack=false;c.offtrackSeconds=0;c.routePinch=null;c.routeStableP=rejoin.p;c.routeResolvedNear={...rejoin,shortcut:false};c.routeDecision=dryEarly?'bath-dry-exit-rejoin':'bath-legal-rejoin';c.deskTry=false;c.shortcutCompleted=(c.shortcutCompleted||0)+1;trace(c.routeDecision,rejoin.distance);if(c===race.player)SND?.sfx('landing');return true;
   }
   // A dry edge may be grazed briefly; no progress credit while outside.
   if(b.t<gate-.045)return fail('bath-shortcut-fall');
   if(b.distance>D.bridgeHalf){c.bridgeOffSeconds=(c.bridgeOffSeconds||0)+dt;if(b.distance>D.bridgeHalf+10||c.bridgeOffSeconds>.12)return fail('bath-shortcut-fall');c.routeResolvedNear={...b,p,shortcut:true};trace('bath-edge-grace',b.distance);return true;}c.bridgeOffSeconds=0;
   if(Math.abs(b.t-before.t)*D.shortcutLength>physical*2.4+5)return fail('bath-shortcut-cut');
   c.offtrack=false;c.offtrackSeconds=0;c.routePinch=null;
   const phase=D.entry+(D.exit-D.entry)*b.t;c.routeStableP=phase;c.routeResolvedNear={...b,p:phase};c.routeDecision='bath-manual-cut';trace(c.routeDecision,b.distance);
   // Wet ceramic: a modest speed-dependent drag, with no steering assistance.
   const cap=(c.profile?.max||250)*.97;if(c.speed>cap)c.speed=cap+(c.speed-cap)*Math.exp(-dt*4.5);
   if(plane(old,Q,out)<0&&plane(c,Q,out)>=0&&b.t>.97&&b.distance<D.bridgeHalf-10&&c.speed>0&&Math.cos(K.angleDiff(c.a,out))>.35){c.onBridge=false;c.routeStableP=D.exit;c.routeResolvedNear={...D.point(D.exit),distance:K.distance(c,D.point(D.exit)),p:D.exit,shortcut:false};c.deskTry=false;c.shortcutCompleted=(c.shortcutCompleted||0)+1;if(c===race.player)SND?.sfx('landing');}
   return true;
  }
  // Same bounded phase correction as the stability hotfix, but no global arm snap.
  let stable=p;const allowed=Math.min(24,physical*1.85+.12),from=K.nearestTrackWindow(old,D.points,p,.012);
  if(physical>.02&&n.distance<=D.laneHalf+24&&from.distance<=D.laneHalf+30){const a=D.tangent(n.p),align=((c.x-old.x)*Math.cos(a)+(c.y-old.y)*Math.sin(a))/physical;if(Math.abs(advance)<=allowed||align*Math.sign(advance)>.12)stable=K.mod(p+K.clamp(advance,-allowed,allowed)/D.length,1);}
  const near=K.nearestTrackWindow(c,D.points,stable,.009);c.routeStableP=stable;c.offtrack=near.distance>D.laneHalf+16;c.offtrackSeconds=c.offtrack?(c.offtrackSeconds||0)+dt:0;c.routeResolvedNear={...near,p:stable,shortcut:false};c.routeDecision=c.offtrack?'bath-outside':'bath-local';c.routePinch=c.offtrack?{phase:stable}:null;
  if(race.time-(c.routeTraceAt??-Infinity)>=.099){const log=c.routeTrace??=[];log.push({t:+race.time.toFixed(3),x:+c.x.toFixed(2),y:+c.y.toFixed(2),p:c.p,stable,near:n.p,d:+near.distance.toFixed(1),decision:c.routeDecision,oilSpin:+(c.oilSpin||0).toFixed(3),slip:+(c.slip||0).toFixed(3)});if(log.length>40)log.shift();c.routeTraceAt=race.time;}
  // The toothbrush is the normal route, not a shortcut. A narrow deck spans the gap.
  const deck=D.brushContact(c);
  const onBrush=D.onBrushPhase(stable)&&deck.u>.11&&deck.u<.965;if(onBrush&&!c.bathBrush&&c===race.player)SND?.sfx('spoon');c.bathBrush=onBrush;
  // Landing surfaces overlap the deck at both ends. Falling requires sustained
  // loss of central support, not an outer wheel or bumper crossing the contour.
  const unsupported=D.onBrushPhase(stable)&&deck.u>.10&&deck.u<.965&&!D.brushSupported(c);
  c.bathBrushOff=unsupported?(c.bathBrushOff||0)+dt:0;
  if(unsupported&&(Math.abs(deck.side)>D.brushLimit(c,deck.u)+20||c.bathBrushOff>=.14)){
   return fail('bath-toothbrush-fall');
  }
  if(c.offtrackSeconds>.8&&near.distance>D.laneHalf+38&&!(c.respawnGrace>0)){recover(c,'bath-route-cut');return false;}
  if(c.jump<=0&&D.damp(c)){c.speed*=Math.exp(-dt*.32);if(!c.bathDamp&&c===race.player)SND?.sfx('oilSkid');c.bathDamp=true;}else c.bathDamp=false;
  if(c.jump<=0&&(D.inSoft(c,D.sponge,31)||D.cotton.some(o=>D.inSoft(c,o,18)))){c.speed*=Math.exp(-dt*1.65);if(!c.bathSponge&&c===race.player)SND?.sfx('slowSurface');c.bathSponge=true;}else c.bathSponge=false;
  const ramp=D.towel,rx=Math.cos(ramp.a),ry=Math.sin(ramp.a),alongRamp=q=>(q.x-ramp.x)*rx+(q.y-ramp.y)*ry;
  if(c.jump<=0&&!(c.jumpCd>0)&&c.speed>95&&alongRamp(old)<ramp.rx*.56&&alongRamp(c)>=ramp.rx*.56&&Math.abs(-(c.x-ramp.x)*ry+(c.y-ramp.y)*rx)<=ramp.ry&&Math.cos(K.angleDiff(c.a,ramp.a))>.45){c.jump=.55;c.jumpTotal=.55;c.jumpCd=1.1;c.towelJumps=(c.towelJumps||0)+1;if(c===race.player)SND?.sfx('ramp');}
  if(!D.onBrushPhase(stable)&&!c.offtrack&&near.distance<80&&!D.wet(D.point(stable))&&!(c.respawnGrace>0)&&c.speed>=0&&Math.cos(K.angleDiff(c.a,D.tangent(stable)))>.2){c.lastCheckpoint=stable;c.lastValidPosition={...D.point(stable),p:stable,a:D.tangent(stable),laps:c.lapsCompleted,flags:c.flags.slice(),elimDistance:c.elimDistance};}
  return true;
 }
 function drive(c,race,s){const p=c.routeStableP??c.p,near=K.nearestTrackWindow(c,D.points,p,.028),hard=s.pace>=.999;
  if(hard&&!c.aiPersonality)c.aiPersonality=['aggressive','technical','strategic'][((c.id-1)%3+3)%3];
  const speed=Math.abs(c.speed),look=(hard?86:65)+Math.min(hard?72:58,speed*.20),phase=p+look/D.length,a=D.tangent(phase),normal=D.point(phase),nx=-Math.sin(a),ny=Math.cos(a);
  let target=normal,lead=null,gap=Infinity;
  for(const o of race.cars){if(o===c||o.done||o.eliminated||o.jump>0)continue;const dx=o.x-c.x,dy=o.y-c.y,f=dx*Math.cos(c.a)+dy*Math.sin(c.a),l=-dx*Math.sin(c.a)+dy*Math.cos(c.a);if(f>10&&f<135&&Math.abs(l)<45&&f<gap){lead=o;gap=f;}}
  const valid=q=>K.nearestTrackWindow(q,D.points,phase,.035).distance<D.laneHalf-(c.width||36)*.5-8;
  const safe=q=>valid(q)&&!D.wet(q)&&!D.props.some(o=>K.distance(q,o)<o.r+32)&&!race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&K.distance(q,o)<42);
  if(hard&&!c.onBridge&&!(p>D.brush.start-.045&&p<D.brush.end+.012)&&!(p>D.entry-.035&&p<D.entry+.043)&&near.distance<55){const delta=105/D.length,l=D.point(phase-delta),r=D.point(phase+delta),off=K.clamp(((l.x+r.x)/2-normal.x)*nx+((l.y+r.y)/2-normal.y)*ny,-28,28);const q={x:normal.x+nx*off,y:normal.y+ny*off};if(safe(q))target=q;}
  if(!(p>D.brush.start-.018&&p<D.brush.end+.008)&&lead&&s.pass>0&&near.distance<75&&lead.speed<c.speed+12&&!(c.aiPassCooldown>race.time)){const side=((lead.x-normal.x)*nx+(lead.y-normal.y)*ny)>0?-1:1;for(const dir of [side,-side]){const q={x:normal.x+nx*dir*s.pass,y:normal.y+ny*dir*s.pass};if(safe(q)){c.aiPassSide=dir;c.aiPassUntil=race.time+1;c.aiPassCooldown=race.time+2;c.aiPassAttempts=(c.aiPassAttempts||0)+1;break;}}}
  if(p>D.brush.start-.018&&p<D.brush.end+.008)c.aiPassUntil=0;
  if(c.aiPassUntil>race.time){const q={x:normal.x+nx*c.aiPassSide*s.pass,y:normal.y+ny*c.aiPassSide*s.pass};if(safe(q))target=q;else c.aiPassUntil=0;}
  for(const o of D.props){if(K.distance(c,o)>160||K.distance(target,o)>o.r+35)continue;const side=((o.x-normal.x)*nx+(o.y-normal.y)*ny)>0?-1:1;const q={x:normal.x+nx*side*46,y:normal.y+ny*side*46};if(safe(q))target=q;break;}
  if(!c.onBridge&&D.wet(target)){for(const side of [-1,1]){const q={x:normal.x+nx*side*65,y:normal.y+ny*side*65};if(safe(q)){target=q;break;}}}
  if(near.distance>100||c.aiRecoveryUntil>race.time)target=D.point(p+.008);
  const visit=(race.elim?.round||0)+':'+c.lapsCompleted;
  const decisionZone=p>D.entry-(hard?.045:.027)&&p<D.entry-.005;
  if(decisionZone&&c.deskChoiceVisit!==visit){c.deskChoiceVisit=visit;c.deskTry=false;c.bathChoicePending=Math.random()<(s.pace<.9?.12:s.pace<.99?.30:.88);c.shortcutDecisionCount=(c.shortcutDecisionCount||0)+1;}
  if(decisionZone&&c.bathChoicePending&&!c.deskTry){const waterRisk=window.TTREnvironmentEvents.branchHazard(race.environmentEvents,D,speed);const clear=!waterRisk&&!race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&K.distance(o,P)<(hard?100:125));if(clear&&near.distance<65&&Math.abs(K.angleDiff(c.a,D.tangent(p)))<.55&&speed>80&&(hard||speed<290)&&!(c.respawnGrace>0)&&!(c.aiRecoveryUntil>race.time)){c.deskTry=true;c.bathChoicePending=false;c.shortcutAttemptCount=(c.shortcutAttemptCount||0)+1;}}
  if(!decisionZone)c.bathChoicePending=false;
  if(!c.onBridge&&p<D.entry-.01&&c.deskTry&&window.TTREnvironmentEvents.branchHazard(race.environmentEvents,D,speed)){c.deskTry=false;c.environmentShortcutAvoids=(c.environmentShortcutAvoids||0)+1;}
  if(c.onBridge||c.deskTry&&p>D.entry-(hard?.045:.023)&&p<D.entry+.043){const b=D.shortcutNearest(c);target=D.shortcutPoint(Math.min(1,b.t+Math.min(.09,95/D.shortcutLength)));if(c.onBridge&&b.t>.91)target=D.point(D.exit+.006);}
  if(!c.onBridge&&(p>D.entry+.043||c.aiRecoveryUntil>race.time||c.respawnGrace>0))c.deskTry=false;
  // On the narrow mandatory toothbrush, aim at the actual support axis.
  // No overtaking or oil-avoidance detour may send CPU wheels over its edge.
  const brushApproach=!c.onBridge&&p>D.brush.start-.035&&p<D.brush.end+.004;
  if(brushApproach){const q=D.brushContact(c),u=q.u+Math.max(55,look-Math.abs(q.side)*.6)/D.brush.length;
   // Do not steer toward the far-side curve while the axle is on the narrow neck.
   if(q.u<.965){const t=K.clamp(u,.035,1.04);target={x:D.brush.P.x+(D.brush.Q.x-D.brush.P.x)*t,y:D.brush.P.y+(D.brush.Q.y-D.brush.P.y)*t};}else target=D.point(D.brush.end+Math.max(.005,(u-1)*D.brush.length/D.length));
   // Queue behind nearby cars on the narrow crossing. No side passing here.
   c.aiPassUntil=0;
   // Queue on the actual bridge axis, including cars returning to the centre.
   lead=null;gap=Infinity;for(const o of race.cars){if(o===c||o.done||o.eliminated||o.onBridge||o.jump>0)continue;const z=D.brushContact(o),f=(z.u-q.u)*D.brush.length;if(f>0&&f<155&&Math.abs(z.side)<D.brush.half+25&&f<gap){gap=f;lead=o;}}
  }
  const oil=c.onBridge?window.TTRRaceDrivers.avoidOil(c,race,s,target,D.shortcutTangent(D.shortcutNearest(c).t),q=>!D.wet(q)&&D.shortcutNearest(q).distance<=D.bridgeHalf-(c.width||36)*.5-7,[],{maxOffset:36}):brushApproach?window.TTRRaceDrivers.avoidOil(c,race,s,target,brushAxis,q=>{const z=D.brushContact(q);return z.u<0||z.u>1?valid(q):Math.abs(z.side)<=D.brushDeckHalf(z.u)-(c.width||36)*.5-5;},[],{maxOffset:24}):c.deskTry?{target,slow:false}:window.TTRRaceDrivers.avoidOil(c,race,s,target,a,q=>valid(q)&&!D.wet(q),D.props);target=oil.target;
  const d=K.angleDiff(Math.atan2(target.y-c.y,target.x-c.x),c.a),steer=K.clamp(d*(hard?3.7:3.3),-1,1);
  if(c.reverseRecovery>0)return {steer:-steer||1,gas:false,brake:true};
  const bend=Math.max(Math.abs(K.angleDiff(D.tangent(p+.017),D.tangent(p))),Math.abs(K.angleDiff(D.tangent(p+.029),D.tangent(p+.012))));
  const cap=c.profile.max*s.pace*(c.boost>0?1.42:1);let desired=cap*(1-K.clamp((bend-.20)*(hard?.34:.63),0,.6));
  if(Math.abs(d)>.30)desired=Math.min(desired,cap*(1-K.clamp((Math.abs(d)-.25)*(hard?.43:.68),0,.65)));
  if(lead&&gap<60&&!(c.aiPassUntil>race.time))desired=Math.min(desired,Math.max(70,lead.speed));if(c.onBridge||c.deskTry){const b=D.shortcutNearest(c);desired=Math.min(desired,cap*(hard?.98:.94),b.t>.74&&(b.distance>30||Math.abs(d)>.25)?205:hard?250:235);}else if(brushApproach){const q=D.brushContact(c),returning=Math.abs(q.side)>24||Math.abs(d)>.22;desired=Math.min(desired,returning?105:hard?245:195,c.bathRejoinUntil>race.time?125:Infinity);const followGap=hard?105:135;if(lead&&gap<followGap)desired=Math.min(desired,Math.max(0,lead.speed-(followGap-gap)*2.5));}else if(near.distance>95)desired=Math.min(desired,110);if(oil.slow)desired=Math.min(desired,cap*(brushApproach?.55:c.onBridge?.60:hard?.80:.65));
  const brake=c.speed>desired+(brushApproach?5:12)&&c.speed>(brushApproach?8:70);return {steer,gas:!brake&&(desired>=cap*(hard?.94:.96)||c.speed<desired+(hard&&!brushApproach?10:5)),brake};
 }
 // Preserve legitimate falls, but limit the lateral displacement and impulse
 // introduced by car-to-car contacts on the narrow mandatory bridge only.
 function contactSnapshot(c){const q=D.brushContact(c);return !c.onBridge&&!c.done&&!c.eliminated&&!(c.jump>0)&&D.onBrushPhase(c.routeStableP??c.p)&&q.u>.10&&q.u<.965&&D.brushSupported(c)?{x:c.x,y:c.y,vx:c.hitVX||0,vy:c.hitVY||0,yaw:c.hitYaw||0}:null;}
 function softenContact(c,old){if(!old)return;const dx=(D.brush.Q.x-D.brush.P.x)/D.brush.length,dy=(D.brush.Q.y-D.brush.P.y)/D.brush.length,nx=-dy,ny=dx;
  const side=(c.x-old.x)*nx+(c.y-old.y)*ny,v=((c.hitVX||0)-old.vx)*nx+((c.hitVY||0)-old.vy)*ny;
  if(Math.abs(side)<1e-6&&Math.abs(v)<1e-6)return;
  // Keep the normal positional separation, correcting only an unsupported overhang.
  c.hitVX=(c.hitVX||0)-nx*v*.78;c.hitVY=(c.hitVY||0)-ny*v*.78;c.hitYaw=old.yaw+((c.hitYaw||0)-old.yaw)*.35;
  const q=D.brushContact(c),limit=D.brushLimit(c,q.u),excess=Math.max(0,Math.abs(q.side)-limit);if(excess>0){c.x-=nx*Math.sign(q.side)*excess;c.y-=ny*Math.sign(q.side)*excess;}
 }
 window.TTRBathRules=Object.freeze({environment,drive,enter,transit,exitAssistDuration,contactSnapshot,softenContact,brushFootprint,markOil,drawBrushOil,beginBrushSpin,spinTravelHeading});})();
