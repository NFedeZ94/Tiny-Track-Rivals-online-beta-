/* Box 02: environment-specific rules, invoked by the common fixed-step race loop. */
(()=>{'use strict';const B=window.TTRBoxTrack,K=window.TTRCore;
 const signed=(a,b)=>K.mod(b-a+.5,1)-.5;
 const movableBall=o=>[9,10,11].includes(o.n);
 function obstacles(){const out=B.balls.map(o=>({...o,type:'box-ball',solid:true,movable:movableBall(o),homeX:o.x,homeY:o.y,vx:0,vy:0}));
  for(const o of B.chalks)out.push({...o,r:Math.hypot(o.w,o.h)/2,type:'box-proxy',solid:true});
  for(const o of B.cues){const end=o.len/2-(o.jump?175:0);for(let x=-o.len/2;x<=end;x+=32)out.push({...B.propWorld(o,x,0),r:o.w/2,type:'box-proxy',solid:true});}
  for(let i=0;i<3;i++){const a=B.rack.vertices[i],b=B.rack.vertices[(i+1)%3],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/24);for(let j=0;j<=n;j++){const t=j/n;out.push({...B.propWorld(B.rack,a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t),r:B.rack.w/2,type:'box-proxy',solid:true});}}return out;
 }
 function resetBalls(props){for(const o of props)if(o.movable){o.x=o.homeX;o.y=o.homeY;o.vx=o.vy=0;o.pocketed=false;o.solid=true;}}
 function hitBall(c,o,previous){if(c.jump>0||o.pocketed)return false;const dx=o.x-c.x,dy=o.y-c.y,d=Math.hypot(dx,dy),r=o.r+Math.min(24,(c.width||36)*.5);if(d>=r)return false;const nx=d>.001?dx/d:Math.cos(c.a),ny=d>.001?dy/d:Math.sin(c.a);const approach=Math.max(0,(Math.cos(c.a)*c.speed+(c.hitVX||0)-o.vx)*nx+(Math.sin(c.a)*c.speed+(c.hitVY||0)-o.vy)*ny);const overlap=r-d+.4;c.x-=nx*overlap*.75;c.y-=ny*overlap*.75;o.x+=nx*overlap*.25;o.y+=ny*overlap*.25;const push=Math.min(170,approach*.62);o.vx+=nx*push;o.vy+=ny*push;const speed=Math.hypot(o.vx,o.vy);if(speed>190){o.vx*=190/speed;o.vy*=190/speed;}c.speed*=1-Math.min(.36,approach/500);return true;}
 function stepBalls(props,dt,onImpact=null,onPocket=null){const moving=props.filter(o=>o.movable&&!o.pocketed);for(const o of moving){o.x+=o.vx*dt;o.y+=o.vy*dt;if(B.pockets.some(p=>onPocket?.(o,p)))continue;const drag=Math.exp(-dt*(o.eventBall?window.TTREnvironmentEvents.DRAG:2.45));o.vx*=drag;o.vy*=drag;if(Math.hypot(o.vx,o.vy)<1)o.vx=o.vy=0;const l=196+o.r,r=2404-o.r,t=161+o.r,b=1439-o.r;if(o.x<l||o.x>r){o.x=K.clamp(o.x,l,r);if(o.eventBall&&Math.abs(o.vx)>25)onImpact?.(o);o.vx*=-.62;}if(o.y<t||o.y>b){o.y=K.clamp(o.y,t,b);if(o.eventBall&&Math.abs(o.vy)>25)onImpact?.(o);o.vy*=-.62;}}
  // Reflect against static props and pocket rims instead of permitting a ball to block a hole.
  for(const o of moving){if(o.pocketed)continue;for(const q of [...props.filter(q=>q!==o&&!q.movable&&!q.pocketed),...B.pockets]){const dx=o.x-q.x,dy=o.y-q.y,d=Math.hypot(dx,dy),lim=o.r+(q.rimR||q.r||0);if(d>=lim||d<.001)continue;const nx=dx/d,ny=dy/d;o.x=q.x+nx*(lim+.3);o.y=q.y+ny*(lim+.3);const v=o.vx*nx+o.vy*ny;if(v<0){if(o.eventBall&&v< -25)onImpact?.(o);o.vx-=1.55*v*nx;o.vy-=1.55*v*ny;}}}
  for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){const a=moving[i],b=moving[j];if(a.pocketed||b.pocketed)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),lim=a.r+b.r;if(d>=lim||d<.001)continue;const nx=dx/d,ny=dy/d,over=(lim-d+.4)*.5;a.x-=nx*over;a.y-=ny*over;b.x+=nx*over;b.y+=ny*over;const v=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(v>0){if(v>25&&(a.eventBall||b.eventBall))onImpact?.(a.eventBall?a:b);const imp=v*.8;a.vx-=imp*nx;a.vy-=imp*ny;b.vx+=imp*nx;b.vy+=imp*ny;}}}
 function drawBall(c,o){if(o.pocketed)return;c.save();c.shadowColor='#07180d99';c.shadowBlur=9;c.shadowOffsetY=6;const g=c.createRadialGradient(o.x-o.r*.35,o.y-o.r*.4,2,o.x,o.y,o.r);g.addColorStop(0,'#fff');g.addColorStop(.25,o.color);g.addColorStop(1,'#10191d');c.fillStyle=g;c.beginPath();c.arc(o.x,o.y,o.r,0,Math.PI*2);c.fill();c.shadowBlur=0;c.shadowOffsetY=0;c.fillStyle='#f3eee1';c.beginPath();c.arc(o.x,o.y,o.r*.42,0,Math.PI*2);c.fill();c.font=`900 ${Math.round(o.r*.5)}px system-ui`;c.fillStyle='#171c24';c.textAlign='center';c.textBaseline='middle';c.fillText(o.n,o.x,o.y);c.restore();}
 // Sequence the visible exit animation and outlet in entry order. Waiting cars
 // remain hidden in the tunnel; no collision immunity is added on release.
 const exitDuration=.8,entryDuration=.38,exitAssistDuration=1.05;
 function visualScale(c){if(!(c.boxTransit>0))return 1;if(c.boxEntryPose&&c.boxTransit>B.transit-entryDuration){const u=K.clamp((B.transit-c.boxTransit)/entryDuration,0,1);return Math.max(0,1-u*u);}if(c.boxTransit>=exitDuration)return 0;const u=K.clamp(1-c.boxTransit/exitDuration,0,1);return .28+.72*u;}
 function exitPose(u){const v=1-u,a=B.tangent(B.exit+.009),handle=70;
   const q={x:B.outlet.x-Math.cos(a)*handle,y:B.outlet.y-Math.sin(a)*handle},p=B.exitPocket,r=B.outlet;
   return {x:v*v*p.x+2*v*u*q.x+u*u*r.x,y:v*v*p.y+2*v*u*q.y+u*u*r.y,
     a:Math.atan2(v*(q.y-p.y)+u*(r.y-q.y),v*(q.x-p.x)+u*(r.x-q.x))};}
 const active=(o,c)=>o!==c&&!o.done&&!o.eliminated;
 // Use conservative bounding circles (including a small visual clearance).
 const radius=c=>Math.hypot(c.length||69,c.width||41)*.5;
 function clearOf(c,pose,race){return !race.cars.some(o=>active(o,c)&&!(o.boxTransit>=exitDuration)&&
    Math.hypot(pose.x-o.x,pose.y-o.y)<radius(c)+radius(o)+12);}
 function priorWaiting(c,next,race){return race.cars.some(o=>active(o,c)&&o.boxTransit>0&&
   (o.boxEntryOrder??Infinity)<(c.boxEntryOrder??Infinity)&&o.boxTransit>=next);}
 function transit(c,dt,race,SND){if(!(c.boxTransit>0))return false;c.speed=0;
  const next=Math.max(0,c.boxTransit-dt);
  if(c.boxEntryPose){const u=K.clamp((B.transit-next)/entryDuration,0,1),v=u*u*(3-2*u),q=c.boxEntryPose;
    c.x=q.x+(B.entryPocket.x-q.x)*v;c.y=q.y+(B.entryPocket.y-q.y)*v;c.a=q.a;c.boxTransit=next;
    if(u>=1)c.boxEntryPose=null;return true;
  }
  if(next<exitDuration){const pose=exitPose(1-next/exitDuration);
    // FIFO progress and physical clearance permit multiple visible cars, but
    // a follower can never overtake or overlap its predecessor in the tunnel.
    if(priorWaiting(c,next,race)||!clearOf(c,pose,race)){
      if(c.boxTransit>=exitDuration)c.boxTransit=exitDuration;
      return true;
    }
    Object.assign(c,pose);
  }
  c.boxTransit=next;if(next>0)return true;
  const p=B.exit+.009,advance=K.forwardProgress(c.p,p);Object.assign(c,{x:B.outlet.x,y:B.outlet.y,p,lastP:p,a:B.tangent(p),routeStableP:p,auditP:p,auditTravel:0,auditCleanTime:0,auditOutsideTime:0,offtrack:false,offtrackSeconds:0,offtrackEntry:null,routePinch:null,routeResolvedNear:null,speed:Math.min(112,(c.profile?.max||250)*.40),boxExitAssist:exitAssistDuration,respawnGrace:1.05,claw:0,clawTarget:null,hitVX:0,hitVY:0,hitYaw:0,skidVX:0,skidVY:0,slip:0,oilSpin:0,steer:0,boxOutside:0,boxRouteCredit:0,routeTrace:[],routeTraceAt:null,routeDecision:null,boxTryPocket:false,boxPasses:(c.boxPasses||0)+1});
  if(race.mode==='elimination'){c.elimDistance=(c.elimDistance||0)+advance*B.length;c.elimPrevP=p;c.elimPrevX=c.x;c.elimPrevY=c.y;c.elimTravelSinceCredit=0;c.elimProtection=1.2;}
  c.lastCheckpoint=p;c.previousValidPosition=null;c.lastValidPosition={x:c.x,y:c.y,p,a:c.a,laps:c.lapsCompleted,flags:c.flags.slice(),elimDistance:c.elimDistance};if(c===race.player)SND?.sfx('boxPocket');return true;
 }
 // Reflect the actual velocity on the cushion, not blindly the heading. A car
 // pushed against a rail while already moving inward must not be flipped back.
 function railContact(c){
  const sx=c.x<196?1:c.x>2404?-1:0,sy=c.y<161?1:c.y>1439?-1:0;
  if(!sx&&!sy)return false;
  c.x=K.clamp(c.x,196,2404);c.y=K.clamp(c.y,161,1439);
  const forward=c.speed>=0?1:-1;
  let vx=Math.cos(c.a)*c.speed,vy=Math.sin(c.a)*c.speed;
  // Resolve the propulsion and transient impulses independently so a residual
  // collision impulse cannot repeatedly push the car through the same cushion.
  if(sx&&vx*sx<0){vx*=-.38;vy*=.87;}
  if(sy&&vy*sy<0){vy*=-.38;vx*=.87;}
  const magnitude=Math.hypot(vx,vy);if(magnitude>.001)c.a=Math.atan2(vy*forward,vx*forward);
  c.speed=magnitude*forward;
  for(const [axis,side] of [['X',sx],['Y',sy]])if(side){for(const key of ['hitV','skidV']){const k=key+axis;if((c[k]||0)*side<0)c[k]*=-.20;}}
  return true;
 }
 function environment(c,old,dt,race,recover,SND){
  for(const pocket of B.pockets){if(c.respawnGrace>0||c.jump>0||Math.hypot(c.x-pocket.x,c.y-pocket.y)>pocket.triggerR)continue;
   if(B.pocketEntry(c,pocket,old)){c.boxRailRejoin=null;c.boxTransit=B.transit;c.boxEntryTime=race.time;c.boxEntryPose={x:c.x,y:c.y,a:c.a};c.boxEntryOrder=race.boxEntrySerial=(race.boxEntrySerial||0)+1;c.claw=0;c.clawTarget=null;c.speed=0;c.boost=0;c.hitVX=c.hitVY=c.skidVX=c.skidVY=0;if(c===race.player)SND.sfx('boxPocket');}else recover(c,'box-pocket');return false;}
  const hit=railContact(c);
  const railPhase=c.routeStableP??c.lastP??c.p;
  // Remember only a genuine contact near the top-right apex, reached from
  // its legal incoming arm. No tunnel credit and no checkpoint is granted.
  if(hit&&!c.boxRailRejoin&&!(c.respawnGrace>0)&&railPhase>=.420&&railPhase<=.435&&c.x>=2310&&c.y<=240&&Math.hypot(c.x-old.x,c.y-old.y)<=40){
   const apex=K.nearestTrack(c,B.points);
   if(apex.distance<=B.laneHalf&&apex.p>=.420&&apex.p<=.44)c.boxRailRejoin={p:railPhase,at:race.time,lap:c.lapsCompleted,round:race.elim?.round,travel:0};
  }
  const prop=B.propContact(c,old);c.boxPropContact=!!(prop&&prop!=='jump'||hit);if(prop==='jump'){c.jumpTotal=.42;if(c===race.player)SND.sfx('ramp');}else if(prop||hit){if(c===race.player&&race.time-(c.lastPropHit??-10)>.35){c.lastPropHit=race.time;SND.sfx(({cue:'boxWood',rack:'boxRack',chalk:'boxChalk'})[prop]||'impact');}}
  // Track the local arm even on wide bends. When it is lost, reacquire only
  // a physically reachable phase, never the globally closest arm for free.
  const prev=c.routeStableP??c.lastP??c.p,step=Math.hypot(c.x-old.x,c.y-old.y);
  const near=K.nearestTrackWindow(c,B.points,prev,.012),delta=signed(prev,near.p);
  // Credit is measured in world units, not elapsed time. Stationary cars and
  // teleports cannot buy progress. A small reserve absorbs tight-corner geometry.
  const physical=step<=40?step:0,localLimit=physical*2.3+.15;
  let credit=Math.min(B.length*.14,(c.boxRouteCredit||0)+physical*1.35);
  let advance=0,decision='box-local',global=null;
  // At the top-right hairpin the visible lane overlaps its outgoing arm.
  // A local handoff is allowed only within that junction, with both projections
  // on the lane and real forward motion along the outgoing arm. Never grant
  // credit for crossing unrelated parts of the table.
  let seam=false;
  const rail=c.boxRailRejoin;
  if(rail){
   if(race.time-rail.at>2.5||rail.lap!==c.lapsCompleted||rail.round!==race.elim?.round||c.respawnGrace>0||step>40||c.x<1940||c.y>365){c.boxRailRejoin=null;}
   else if(physical>.02){
    rail.travel+=physical;
    const out=K.nearestTrack(c,B.points),before=K.nearestTrack(old,B.points),gain=signed(prev,out.p),fromApex=signed(rail.p,out.p),a=B.tangent(out.p);
    const aligned=((c.x-old.x)*Math.cos(a)+(c.y-old.y)*Math.sin(a))/physical;
    if(out.p>=.435&&out.p<=.478&&fromApex>=0&&fromApex<=.048&&gain>0&&gain<=.080&&out.distance<=B.laneHalf&&before.distance<=B.laneHalf&&aligned>.55&&fromApex*B.length<=rail.travel*1.35+12&&near.distance>out.distance+6){
     global=out;advance=gain*B.length;credit=24;decision='box-rail-rejoin';seam=true;c.boxRailRejoin=null;
    }
   }
  }
  if(!seam&&physical>.02&&prev>=.39&&prev<=.43&&near.distance<=B.laneHalf+3){
    global=K.nearestTrack(c,B.points);const gain=signed(prev,global.p);
    const a=B.tangent(global.p),alignment=((c.x-old.x)*Math.cos(a)+(c.y-old.y)*Math.sin(a))/physical;
    if(global.p>=.435&&global.p<=.47&&gain>=.018&&gain<=.045&&global.distance<=B.laneHalf-10&&near.distance>global.distance+18&&alignment>.5){
      const before=K.nearestTrack(old,B.points);
      if(before.distance<=B.laneHalf){advance=gain*B.length;credit=24;decision='box-junction-handoff';seam=true;}
    }
  }
  // Bottom-left hairpin: the inner racing line joins the outgoing arm before
  // the centreline apex. Only permit a local, forward handoff inside this
  // specific junction, never a free phase jump from the rest of the table.
  if(!seam&&physical>.02&&prev>=.825&&prev<=.865&&c.x>=490&&c.x<=755&&c.y>=885&&c.y<=1085&&near.distance<=190){
    global=K.nearestTrack(c,B.points);const gain=signed(prev,global.p);
    const a=B.tangent(global.p),alignment=((c.x-old.x)*Math.cos(a)+(c.y-old.y)*Math.sin(a))/physical;
    if(global.p>=.875&&global.p<=.915&&gain>=.018&&gain<=.075&&global.distance<=132&&near.distance>global.distance+18&&alignment>.45){
      const before=K.nearestTrack(old,B.points);
      if(before.distance<=142&&c.boxOutside<.15){advance=gain*B.length;credit=24;decision='box-final-junction-handoff';seam=true;}
    }
  }
  if(!seam&&physical>.02&&near.distance<=142){
    advance=K.clamp(delta*B.length,-Math.max(localLimit,credit),Math.max(localLimit,credit));
    credit=Math.max(0,credit-Math.abs(advance));
    if(Math.abs(delta*B.length-advance)<1)credit=Math.min(credit,24);
  }else if(!seam&&physical>.02){
    global=K.nearestTrack(c,B.points);
    const gain=signed(prev,global.p)*B.length;
    if(global.distance<=142&&Math.abs(gain)<=credit+12&&Math.abs(gain)<=B.length*.14&&Math.abs(gain)>0.01){
      advance=gain;credit=Math.min(24,Math.max(0,credit-Math.abs(gain)));decision='box-rejoin';
    }else if(near.distance<=205){
      // Maintain phase through a wide but continuous bend; no checkpoint is
      // granted until the car actually returns to the usable lane.
      advance=K.clamp(delta*B.length,-Math.min(localLimit,credit),Math.min(localLimit,credit));
      credit=Math.max(0,credit-Math.abs(advance));decision='box-wide-continuous';
    }else decision='box-rejoin-pending';
  }
  c.boxRouteCredit=credit;c.routeStableP=K.mod(prev+advance/B.length,1);
  const accepted=K.nearestTrackWindow(c,B.points,c.routeStableP,.004),d=accepted.distance;
  c.offtrack=d>142;c.boxOutside=c.offtrack?(c.boxOutside||0)+dt:Math.max(0,(c.boxOutside||0)-dt*2);
  // Trace both projections so a later report can distinguish a real cut from
  // a stale phase. A bounded ring covers the preceding four seconds.
  const log=c.routeTrace??=[];
  if(c.routeTraceAt==null||race.time-c.routeTraceAt>=.099){
    log.push({t:+race.time.toFixed(3),x:+c.x.toFixed(2),y:+c.y.toFixed(2),p:c.p,stable:c.routeStableP,near:near.p,d:+d.toFixed(1),globalPhase:global?.p??null,globalDistance:global?+global.distance.toFixed(1):null,credit:+credit.toFixed(1),decision});
    if(log.length>40)log.shift();c.routeTraceAt=race.time;
  }
  c.routeDecision={kind:decision,localDistance:+near.distance.toFixed(2),acceptedDistance:+d.toFixed(2),globalPhase:global?.p??null,globalDistance:global?.distance??null,credit,elapsed:c.boxOutside};
  // At the upper-right hairpin, a clearly unreachable remote arm is not a legal rejoin.
  // Penalize before several more seconds of driving on that arm; ordinary wide bends keep their grace.
  const remoteTop=decision==='box-rejoin-pending'&&global&&c.routeStableP>=.38&&c.routeStableP<=.435&&global.p>=.46&&global.p<=.55&&global.distance<=B.laneHalf&&d>205&&signed(c.routeStableP,global.p)*B.length>credit+12;
  if((c.boxOutside>1.65&&d>205||remoteTop&&c.boxOutside>.65)&&!(c.respawnGrace>0)){c.routeDecision.kind=remoteTop?'box-remote-arm-penalty':'box-route-penalty';recover(c,'box-route-cut');return false;}
  c.routeResolvedNear={...accepted,p:c.routeStableP,shortcut:false};
  if(!c.offtrack&&d<88&&!(c.respawnGrace>0)&&c.speed>=0&&Math.cos(K.angleDiff(c.a,B.tangent(c.routeStableP)))>.15){const p=c.routeStableP,q=B.point(p);c.lastCheckpoint=p;c.lastValidPosition={...q,p,a:B.tangent(p),laps:c.lapsCompleted,flags:c.flags.slice(),elimDistance:c.elimDistance};}
  return true;
 }
 function cpuTarget(c,race,s,normal){const p=c.routeStableP??c.p,visit=(race.elim?.round||0)+':'+c.lapsCompleted;
  if(p>B.entry-.065&&p<B.entry-.012&&c.boxDecision!==visit){c.boxDecision=visit;const hard=s.pace>=.999,chance=hard?({aggressive:.94,technical:.86,strategic:.92}[c.aiPersonality]??.90):s.shortcut;const queued=race.cars.filter(o=>o!==c&&!o.done&&!o.eliminated&&o.boxTransit>0).length;const clear=hard?queued<3:!race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&o.boxTryPocket&&Math.hypot(o.x-c.x,o.y-c.y)<100);c.boxTryPocket=Math.random()<chance&&clear&&(hard||(c.boxStreak||0)<2);c.boxStreak=c.boxTryPocket?(c.boxStreak||0)+1:0;c.shortcutDecisionCount=(c.shortcutDecisionCount||0)+1;if(c.boxTryPocket)c.shortcutAttemptCount=(c.shortcutAttemptCount||0)+1;}
  if(p<B.entry-.07||p>B.entry+.025||c.respawnGrace>0)c.boxTryPocket=false;
  return c.boxTryPocket&&p>B.entry-.045&&p<B.entry+.018?B.entryPocket:normal;
 }
 // A separate path planner, not a second physics engine. Shorter look-ahead
 // and curvature-aware speed are needed on the much tighter billiard bends.
 const guides=obstacles().filter(o=>!o.movable),N=640,offsets=[-64,-48,-32,-16,0,16,32,48,64];
 const guide=Array.from({length:N},(_,i)=>{const p=i/N,q=B.point(p),a=B.tangent(p),nx=-Math.sin(a),ny=Math.cos(a);let best=0,cost=Infinity;
   for(const off of offsets){const x=q.x+nx*off,y=q.y+ny*off;let score=Math.abs(off)*.34;
    if(x<218||x>2382||y<183||y>1417)score+=1000;
    for(const o of guides){const d=Math.hypot(x-o.x,y-o.y),gap=d-o.r-30;if(gap<22)score+=(22-gap)**2*.5;}
    for(const o of B.pockets){const d=Math.hypot(x-o.x,y-o.y);const margin=o.role==='hazard'?o.triggerR+42:o.r+28;if(d<margin)score+=(margin-d)**2;}
    if(score<cost){cost=score;best=off;}}
   return best;});
 function guidance(p){const q=B.point(p),a=B.tangent(p),i=Math.round(K.mod(p,1)*N)%N;let off=0,w=0;for(let j=-5;j<=5;j++){const v=6-Math.abs(j);off+=guide[K.mod(i+j,N)]*v;w+=v;}off/=w;return{x:q.x-Math.sin(a)*off,y:q.y+Math.cos(a)*off};}
 function drive(c,race,s){const p=c.routeStableP??c.p,near=K.nearestTrackWindow(c,B.points,p,.022),hard=s.pace>=.999;
   if(hard&&!c.aiPersonality)c.aiPersonality=['aggressive','technical','strategic'][((c.id-1)%3+3)%3];
   const speed=Math.abs(c.speed),look=(hard?76:52)+Math.min(hard?52:40,speed*(hard?.17:.14)),lookP=look/B.length;
   const aim=p+lookP,normal=guidance(aim),railZone=hard&&p>.425&&p<.49;
   if(hard){
     const a=B.tangent(aim),n={x:-Math.sin(a),y:Math.cos(a)},q=B.point(aim),l=B.point(aim-.012),r=B.point(aim+.012);
     const off=K.clamp(((l.x+r.x)*.5-q.x)*n.x+((l.y+r.y)*.5-q.y)*n.y,-24,24);
     const candidate={x:normal.x+n.x*off,y:normal.y+n.y*off};
     if(candidate.x>224&&candidate.x<2376&&candidate.y>190&&candidate.y<1410&&K.nearestTrackWindow(candidate,B.points,aim,.020).distance<65&&!guides.some(o=>K.distance(candidate,o)<o.r+36)&&!B.pockets.some(o=>K.distance(candidate,o)<o.r+36))Object.assign(normal,candidate);
   }
   if(hard&&aim>.435&&aim<.495){const w=K.clamp((aim-.435)/.012,0,1)*K.clamp((.495-aim)/.013,0,1);normal.y+=Math.max(0,270-normal.y)*w;}
   const live=[...guides,...(race.boxBalls||[]).filter(o=>o.movable&&!o.pocketed)];
   let target=cpuTarget(c,race,s,normal),branch=target!==normal;
   if(!branch){const a=B.tangent(p+lookP),nx=-Math.sin(a),ny=Math.cos(a);for(const o of race.boxBalls||[]){if(o.pocketed||K.distance(c,o)>150||K.distance(target,o)>o.r+30)continue;const side=(o.x-target.x)*nx+(o.y-target.y)*ny>0?-1:1;const q={x:target.x+nx*side*46,y:target.y+ny*side*46};if(K.nearestTrackWindow(q,B.points,p+lookP,.02).distance<B.laneHalf-28&&!B.pockets.some(v=>K.distance(q,v)<(v.triggerR||v.r)+35))target=q;break;}}
   let leader=null,gap=Infinity;
   if(!branch&&!railZone&&s.pass>0&&near.distance<85&&!(c.aiRecoveryUntil>race.time)){
     const a=B.tangent(p),nx=-Math.sin(a),ny=Math.cos(a),fx=Math.cos(a),fy=Math.sin(a);
     for(const o of race.cars){if(o===c||o.done||o.eliminated||o.boxTransit>0||o.jump>0)continue;const dx=o.x-c.x,dy=o.y-c.y,f=dx*fx+dy*fy,l=dx*nx+dy*ny;if(f>12&&f<135&&Math.abs(l)<49&&f<gap){leader=o;gap=f;}}
     const laneSafe=side=>{const q={x:normal.x+nx*side*s.pass*.75,y:normal.y+ny*side*s.pass*.75};const n=K.nearestTrackWindow(q,B.points,p+lookP,.018);return n.distance<75&&q.x>220&&q.x<2380&&q.y>185&&q.y<1415&&!live.some(o=>Math.hypot(q.x-o.x,q.y-o.y)<o.r+32)&&!B.pockets.some(o=>Math.hypot(q.x-o.x,q.y-o.y)<o.r+35);};
     if(leader&&leader.speed<c.speed+12&&!(c.aiPassUntil>race.time)&&!(c.aiPassCooldown>race.time)){
       const pref=((leader.x-normal.x)*nx+(leader.y-normal.y)*ny)>0?-1:1;
       const side=laneSafe(pref)?pref:laneSafe(-pref)?-pref:0;
       if(side){c.aiPassSide=side;c.aiPassUntil=race.time+1.0;c.aiPassCooldown=race.time+2.0;c.aiPassAttempts=(c.aiPassAttempts||0)+1;}
     }
     if(c.aiPassUntil>race.time&&laneSafe(c.aiPassSide)){target={x:normal.x+nx*c.aiPassSide*s.pass*.75,y:normal.y+ny*c.aiPassSide*s.pass*.75};}else if(c.aiPassUntil>race.time)c.aiPassUntil=0;
   }else c.aiPassUntil=0;
   if(branch){const bearing=K.angleDiff(Math.atan2(target.y-c.y,target.x-c.x),c.a);if(Math.abs(bearing)>(hard?1.20:1.12)||p>B.entry+(hard?.015:.006)||c.aiRecoveryUntil>race.time){c.boxTryPocket=false;target=normal;branch=false;}}
   if(c.aiRecoveryUntil>race.time||near.distance>120){target=guidance(p+.007);if(railZone)target.y=Math.max(target.y,270);branch=false;c.boxTryPocket=false;}
   const oil=(!branch&&near.distance<85&&!(c.aiRecoveryUntil>race.time))?window.TTRRaceDrivers.avoidOil(c,race,s,target,B.tangent(p+lookP),q=>q.x>220&&q.x<2380&&q.y>(railZone?230:185)&&q.y<1415&&K.nearestTrackWindow(q,B.points,p+lookP,.033).distance<B.laneHalf-(c.width||36)*.5-5&&!B.pockets.some(o=>Math.hypot(q.x-o.x,q.y-o.y)<o.r+35),live):{target,slow:false};
   target=oil.target;
   const movingEvent=!branch&&!(c.aiRecoveryUntil>race.time)?window.TTREnvironmentEvents.plan(c,race,s,target,B.tangent(aim),q=>!oil.slow&&!c.aiOilSeen?.side&&q.x>220&&q.x<2380&&q.y>185&&q.y<1415&&K.nearestTrackWindow(q,B.points,aim,.033).distance<B.laneHalf-(c.width||36)*.5-8&&!live.some(o=>!o.eventBall&&K.distance(q,o)<o.r+32)&&!B.pockets.some(o=>K.distance(q,o)<o.r+35)&&!race.cars.some(o=>o!==c&&!o.done&&!o.eliminated&&!o.boxTransit&&K.distance(q,o)<(c.width||36)*.5+(o.width||36)*.5+10)&&!race.oils?.some(o=>o.owner!==c.id&&o.t>0&&K.distance(q,o)<(o.r||34)+30)):{target,slow:false};
   target=movingEvent.target;
   let d=K.angleDiff(Math.atan2(target.y-c.y,target.x-c.x),c.a);const steer=K.clamp(d*(hard?3.7:3.4),-1,1);
   if(c.reverseRecovery>0)return {steer:-steer||1,gas:false,brake:true};
   const bend=Math.max(Math.abs(K.angleDiff(B.tangent(p+.012),B.tangent(p))),Math.abs(K.angleDiff(B.tangent(p+.023),B.tangent(p+.008))));
   const cap=c.profile.max*s.pace*(c.boost>0?1.42:1);let desired=cap*(1-K.clamp((bend-(hard?.36:.16))*(hard?.21:.65),0,hard?.32:.60));
   if(Math.abs(d)>(hard?.52:.34))desired=Math.min(desired,cap*(1-K.clamp((Math.abs(d)-(hard?.44:.28))*(hard?.48:.68),0,.66)));
   if(branch)desired=Math.min(desired,Math.max(105,cap*(hard?(K.distance(c,B.entryPocket)<100?.88:.95):.74)));
   if(leader&&gap<60&&!(c.aiPassUntil>race.time))desired=Math.min(desired,Math.max(80,leader.speed));
   if(near.distance>95)desired=Math.min(desired,110);
   if(movingEvent.slow)desired=Math.min(desired,cap*.72);
   if(oil.slow)desired=Math.min(desired,cap*(hard?.84:.68));
   else if(c.aiOilSeen?.side)desired=Math.min(desired,cap*(hard?.94:.86));
   const brake=c.speed>desired+(hard?16:12)&&c.speed>75;return {steer,gas:!brake&&(desired>=cap*(hard?.91:.96)||c.speed<desired+(hard?9:3)),brake};
 }
 function cameraPose(c){
   if(!(c?.boxTransit>0))return null;
   if(c.boxEntryPose||c.boxTransit<exitDuration)return {x:c.x,y:c.y};
   const t=K.clamp((B.transit-entryDuration-c.boxTransit)/(B.transit-entryDuration-exitDuration),0,1),u=t*t*(3-2*t);
   return {x:B.entryPocket.x+(B.exitPocket.x-B.entryPocket.x)*u,y:B.entryPocket.y+(B.exitPocket.y-B.entryPocket.y)*u};
 }
 window.TTRBoxRules=Object.freeze({obstacles,transit,environment,railContact,cpuTarget,drive,cameraPose,visualScale,exitAssistDuration,movableBall,resetBalls,hitBall,stepBalls,drawBall});})();
