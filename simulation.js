'use strict';
// Authoritative physics experiment, using the *identical* unchanged TTRCore from v0.13.6.37.
// Deliberately limited track mechanics: no bridge jump / spoon / knife scene collision yet.
const K = require('./ttr-core');
const {profiles, trackPoint, tangent, nearestTrack, nearestTrackWindow, junctionPhaseHop,
  phaseGap, mod, clamp, angleDiff, distance, forwardProgress, TRACK_LENGTH, WORLD_W,
  WORLD_H, resolveCarContacts, stepDriveSpeed, offTrackDynamics, edgeOfTable,
  circleRotatedRect, oilHit, clawTarget, clawPullStep, mugBendGate, finishLinePlane} = K;
const TRACK_POINTS = Array.from({length:520}, (_, i) => trackPoint(i/520));
const DT = 1/30, LAPS = 3;
function finite(v, fallback=0) { return typeof v==='number' && Number.isFinite(v)?v:fallback; }
function inputSafe(v) { return {steer:clamp(finite(v?.steer),-1,1),gas:v?.gas!==false,brake:v?.brake===true}; }
function makeCar(slot, carIndex=0) {
  const profile=profiles[clamp(Math.floor(finite(carIndex)),0,profiles.length-1)];
  const p=mod(.005-Math.floor(slot/2)*.019,1), pos=trackPoint(p), a=tangent(p);
  const lane=slot%2===0?-29:29, x=pos.x-Math.sin(a)*lane,y=pos.y+Math.cos(a)*lane;
  return {id:slot,carIndex:profiles.indexOf(profile),profile,x,y,a,speed:0,steer:0,
    width:profile.shape==='muscle'?39:profile.shape==='buggy'?41:profile.shape==='sport'?37:36,
    length:profile.shape==='muscle'?69:profile.shape==='buggy'?63:profile.shape==='sport'?67:61,
    p,lastP:p,routeStableP:p,routePinch:null,lapsCompleted:0,flags:[false,false,false],
    lapGateBlocked:true,done:false,finishTime:null,boost:0,slip:0,jump:0,claw:0,clawTarget:null,
    item:null,hitVX:0,hitVY:0,hitYaw:0,impactGrace:0,oilSpin:0,oilSpinDir:1,
    oilCooldown:0,skidVX:0,skidVY:0,respawnGrace:1.0,mugApexPassed:false,
    lastValid:{x,y,a,p,flags:[false,false,false],laps:0,mugApexPassed:false},
    lastPenaltyReason:'',penalties:0,offroadSeconds:0,progressTravel:0,
    cpu:false,stuckTime:0,stuckX:x,stuckY:y,lastInputSeq:0,input:{steer:0,gas:true,brake:false},
    stats:{items:0,impacts:0}};
}
function recover(c,reason) {
  const safe=c.lastValid || {p:0,flags:[false,false,false],laps:0},p=safe.p||0,pt=trackPoint(p);
  c.x=pt.x;c.y=pt.y;c.a=tangent(p);c.p=p;c.lastP=p;c.routeStableP=p;c.routePinch=null;
  c.lapsCompleted=safe.laps||0;c.flags=safe.flags.slice();c.mugApexPassed=!!safe.mugApexPassed;
  c.speed=44;c.steer=0;c.hitVX=0;c.hitVY=0;c.hitYaw=0;c.slip=0;c.oilSpin=0;
  c.skidVX=0;c.skidVY=0;c.boost=0;c.claw=0;c.clawTarget=null;c.impactGrace=0;
  c.respawnGrace=.8;c.lapGateBlocked=true;c.offroadSeconds=0;c.progressTravel=0;
  c.penalties++;c.lastPenaltyReason=reason;c.stuckTime=0;c.stuckX=c.x;c.stuckY=c.y;
}
function junctionCheck(c,near,old,dt){
  const delta=Math.hypot(c.x-old.x,c.y-old.y);
  if(c.respawnGrace>0){c.routePinch=null;c.routeStableP=near.p;return {near,penalty:false};}
  const anchor=c.routeStableP??c.lastP??near.p;
  if(!c.routePinch&&junctionPhaseHop(anchor,near.p,delta))c.routePinch={phase:anchor,elapsed:0,travel:0};
  if(c.routePinch){
    const pending=c.routePinch,legal=nearestTrackWindow(c,TRACK_POINTS,pending.phase,.07);
    pending.elapsed+=dt;pending.travel+=Math.min(delta,40);
    if(phaseGap(near.p,pending.phase)<.066&&near.distance<118){c.routePinch=null;c.routeStableP=near.p;return {near,penalty:false};}
    if((pending.travel>30&&legal.distance>158&&near.distance<108) ||
       (pending.travel>52&&pending.elapsed>.4&&legal.distance>132&&near.distance<44))return {near:legal,penalty:true};
    c.routeStableP=legal.p;return {near:legal,penalty:false};
  }
  c.routeStableP=near.p;return {near,penalty:false};
}
function cpuControl(c) {
  const future=trackPoint(mod(c.p+.025,1)),goal=Math.atan2(future.y-c.y,future.x-c.x);
  const err=angleDiff(goal,c.a),near=nearestTrack(c,TRACK_POINTS);
  let steer=clamp(err*2.85,-1,1);
  if(near.distance>60)steer=clamp(angleDiff(Math.atan2(near.y-c.y,near.x-c.x),c.a)*2.5,-1,1);
  return {steer,gas:Math.abs(err)<.65||Math.abs(c.speed)<90,brake:Math.abs(err)>.82&&c.speed>120};
}
class Simulation {
  constructor(members,capacity,seed=20261121) {
    this.cars=Array.from({length:capacity},(_,slot)=>makeCar(slot,members.find(m=>m.slot===slot)?.car??slot%5));
    for(const c of this.cars)c.cpu=!members.some(m=>m.slot===c.id);
    this.capacity=capacity;this.time=0;this.tick=0;this.countdown=3;this.running=true;
    this.finished=false;this.finishDeadline=null;this.results=null;
    this.oils=[];this.pickups=[.22,.825,.48].map((p,i)=>({...trackPoint(p),p,cool:0,r:16.5,id:i}));
    this.nextInput=new Map();this.rngState=seed>>>0;
  }
  random(){let n=this.rngState; n^=n<<13;n^=n>>>17;n^=n<<5;this.rngState=n>>>0;return (this.rngState>>>0)/4294967296;}
  setInput(slot,input,seq){const c=this.cars[slot];if(!c||c.cpu||c.done)return false;
    if(!Number.isSafeInteger(seq)||seq<=c.lastInputSeq||seq>1e12)return false;
    c.input=inputSafe(input);c.lastInputSeq=seq;return true;
  }
  replaceWithCpu(slot){const c=this.cars[slot];if(c){c.cpu=true;c.input={steer:0,gas:true,brake:false};}}
  setHuman(slot){const c=this.cars[slot];if(c){c.cpu=false;c.input={steer:0,gas:true,brake:false};}}
  useItem(slot){const c=this.cars[slot];if(!c||!c.item||c.done||this.countdown>0)return false;
    const item=c.item;c.item=null;
    if(item==='turbo')c.boost=1.05;
    if(item==='oil'){this.oils.push({x:c.x-Math.cos(c.a)*56,y:c.y-Math.sin(c.a)*56,t:9,r:34,owner:slot});}
    if(item==='claw'){
      const target=clawTarget(c,this.cars,[],162,.30);
      if(target){c.claw=1.28;c.clawTarget=target;}
    }
    return true;
  }
  step(dt=DT){if(!this.running||this.finished)return;
    dt=DT;this.tick++;
    if(this.countdown>0){this.countdown=Math.max(0,this.countdown-dt);return;}
    this.time+=dt;
    for(const p of this.pickups)p.cool=Math.max(0,p.cool-dt);
    this.oils=this.oils.filter(o=>(o.t-=dt)>0);
    for(const c of this.cars){if(c.done)continue;
      const old={x:c.x,y:c.y},control=c.cpu?cpuControl(c):c.input;
      const boost=c.boost>0;c.boost=Math.max(0,c.boost-dt);c.slip=Math.max(0,c.slip-dt);
      c.respawnGrace=Math.max(0,c.respawnGrace-dt);c.impactGrace=Math.max(0,c.impactGrace-dt);
      c.oilCooldown=Math.max(0,c.oilCooldown-dt);
      const terrain=offTrackDynamics(nearestTrack(c,TRACK_POINTS).distance);
      c.speed=stepDriveSpeed(c.speed,control,dt,c.profile,boost);
      c.speed*=Math.max(.92,1-(1-terrain.speedFactor)*dt*1.9);
      c.steer=control.steer;
      let turn=c.profile.turn*(.24+clamp(Math.abs(c.speed)/160,0,1)*.76)*(c.slip>0?.38:1)*terrain.grip;
      if(c.oilSpin>0){const n=Math.min(dt,c.oilSpin);c.a+=c.oilSpinDir*Math.PI*2*(n/1.16);c.oilSpin-=n;c.speed=Math.min(145,c.speed);}
      else c.a+=c.steer*turn*(c.speed>=0?1:-.7)*dt;
      c.a+=c.hitYaw*dt;c.hitYaw*=Math.exp(-4*dt);
      if(c.claw>0){const t=c.clawTarget;
        if(!t||t.done||distance(c,t)>164||Math.abs(angleDiff(Math.atan2(t.y-c.y,t.x-c.x),c.a))>.65){c.claw=0;c.clawTarget=null;}
        else {c.claw=Math.max(0,c.claw-dt);clawPullStep(c,t,dt);}
      }
      c.x+=(Math.cos(c.a)*c.speed+c.hitVX+c.skidVX)*dt;
      c.y+=(Math.sin(c.a)*c.speed+c.hitVY+c.skidVY)*dt;
      c.hitVX*=Math.exp(-5.2*dt);c.hitVY*=Math.exp(-5.2*dt);
      c.skidVX*=Math.exp(-3*dt);c.skidVY*=Math.exp(-3*dt);
      if(edgeOfTable(c,WORLD_W,WORLD_H,44)){recover(c,'table-edge');continue;}
      let near=nearestTrack(c,TRACK_POINTS);
      const route=junctionCheck(c,near,old,dt);if(route.penalty){recover(c,'junction-cut');continue;}
      near=route.near;
      c.offroadSeconds=near.distance>158?c.offroadSeconds+dt:Math.max(0,c.offroadSeconds-dt*.5);
      // Prototype race surface is the original full-width cloth corridor; detailed props still to port.
      if((near.distance>250&&c.offroadSeconds>.3)||(near.distance>158&&c.offroadSeconds>1.1)){
        recover(c,'offtrack');continue;
      }
      const mug=mugBendGate(near,c,c.mugApexPassed);c.mugApexPassed=mug.passed;
      if(c.respawnGrace===0&&mug.penalty){recover(c,'cup-cut');continue;}
      // Enforce *continuous measured movement* near overlapping road sections.
      const moved=Math.hypot(c.x-old.x,c.y-old.y);
      const progress=forwardProgress(c.lastP,near.p)*TRACK_LENGTH;
      if(c.respawnGrace===0&&progress>Math.max(145,moved*2.2+40)&&progress<TRACK_LENGTH*.8){
        recover(c,'phase-leap');continue;
      }
      const lane=near.distance<150&&c.offroadSeconds<.05&&c.respawnGrace===0;
      if(lane&&progress<110&&c.speed>=0){
        if(near.p>.17&&near.p<.36)c.flags[0]=true;
        if(near.p>.43&&near.p<.62)c.flags[1]=true;
        if(near.p>.68&&near.p<.86)c.flags[2]=true;
        if(near.p>.81)c.lapGateBlocked=false;
        if(near.distance<65){c.lastValid={p:near.p,flags:c.flags.slice(),laps:c.lapsCompleted,mugApexPassed:c.mugApexPassed};}
      }
      const crossed=finishLinePlane(old,c,trackPoint(0),tangent(0),148,c.lapGateBlocked||!lane,c.flags.every(Boolean),c.speed);
      if(crossed){c.lapsCompleted++;c.flags=[false,false,false];c.lapGateBlocked=true;c.mugApexPassed=false;
        if(c.lapsCompleted>=LAPS){c.done=true;c.finishTime=this.time;}
      }
      c.p=near.p;c.lastP=near.p;
      if(c.cpu){
        const displacement=Math.hypot(c.x-c.stuckX,c.y-c.stuckY);
        if(displacement<1.0&&Math.abs(c.speed)<20)c.stuckTime+=dt;else c.stuckTime=Math.max(0,c.stuckTime-dt*.4);
        if(c.stuckTime>5)recover(c,'cpu-stuck');
        c.stuckX=c.x;c.stuckY=c.y;
        if(c.item==='turbo'&&c.speed>90&&this.random()<.007)this.useItem(c.id);
        if(c.item==='claw'&&this.random()<.005)this.useItem(c.id);
      }
      if(c.respawnGrace===0){
        for(const oil of this.oils)if(c.oilCooldown<=0&&oilHit(c,old.x,old.y,oil)){
          c.slip=1.22;c.oilCooldown=1.55;c.oilSpin=1.16;c.oilSpinDir=c.id%2?1:-1;
          c.skidVX-=Math.sin(c.a)*c.oilSpinDir*65;c.skidVY+=Math.cos(c.a)*c.oilSpinDir*65;c.speed*=.8;
        }
        for(const p of this.pickups)if(p.cool===0&&!c.item&&circleRotatedRect(p,c,p.r)){
          c.item=['turbo','oil','claw'][Math.floor(this.random()*3)];p.cool=10;c.stats.items++;break;
        }
      }
    }
    const res=resolveCarContacts(this.cars);
    if(res.impacts>0){for(const c of this.cars)c.stats.impacts+=res.impacts;}
    for(const c of this.cars)if(!c.done&&edgeOfTable(c,WORLD_W,WORLD_H,44))recover(c,'collision-edge');
    if(this.cars.some(c=>c.done)&&!this.finishDeadline)this.finishDeadline=this.time+26;
    if(this.cars.every(c=>c.done) || (this.finishDeadline&&this.time>=this.finishDeadline) || this.time>=360){
      this.finished=true;this.results=this.cars.slice().sort((a,b)=>{
        if(a.done!==b.done)return a.done?-1:1;
        return a.done?a.finishTime-b.finishTime:K.racePosition(b)-K.racePosition(a);
      }).map((c,index)=>({rank:index+1,slot:c.id,car:c.carIndex,done:c.done,finishTime:c.finishTime,laps:c.lapsCompleted,penalties:c.penalties}));
    }
  }
  publicState(){return {tick:this.tick,serverTime:Number(this.time.toFixed(3)),countdown:Number(this.countdown.toFixed(2)),
    finished:this.finished,capacity:this.capacity,track:'colazione-turbo',laps:LAPS,
    cars:this.cars.map(c=>({id:c.id,car:c.carIndex,cpu:c.cpu,x:Math.round(c.x*10)/10,y:Math.round(c.y*10)/10,
      a:Math.round(c.a*10000)/10000,s:Math.round(c.speed*10)/10,p:Math.round(c.p*100000)/100000,
      lap:c.lapsCompleted,flags:c.flags,item:c.item,boost:Number(c.boost.toFixed(2)),done:c.done,
      penalty:c.penalties,penaltyReason:c.lastPenaltyReason,ack:c.lastInputSeq})),
    pickups:this.pickups.map(p=>({id:p.id,cool:Number(p.cool.toFixed(2))})),
    oils:this.oils.map(o=>({x:Math.round(o.x),y:Math.round(o.y),r:o.r,t:Number(o.t.toFixed(2))})),
    results:this.results};}
}
module.exports={Simulation,makeCar,recover,junctionCheck,cpuControl,DT,K,TRACK_POINTS,inputSafe};
