/* TTR .152: tick-based playback and bounded client-side visual correction.
 * No authoritative game state is written here. All times are monotonic ms. */
(()=>{'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function timeline(){return {offset:null,jitter:0,delay:100,lastTick:null,lastAt:null,play:null,gaps:0,duplicates:0};}
function observe(t,tick,now){if(!Number.isSafeInteger(tick)||tick<0||!Number.isFinite(now))return false;if(t.lastTick!==null&&tick<=t.lastTick){t.duplicates++;return false;}
 const ms=tick*1000/60,offset=now-ms;
 if(t.lastTick!==null){const actual=now-t.lastAt,expected=(tick-t.lastTick)*1000/60;t.jitter=.85*t.jitter+.15*Math.abs(actual-expected);if(actual>150)t.gaps++;}
 t.offset=t.offset===null?offset:Math.min(offset,t.offset+(offset-t.offset>180?6:.25));t.delay=clamp(85+3*t.jitter,85,220);t.lastTick=tick;t.lastAt=now;return true;}
function playback(t,now,dt){if(t.offset===null)return null;const target=now-t.offset-t.delay,limit=t.lastTick*1000/60+75;
 if(t.play===null||Math.abs(target-t.play)>400)t.play=Math.max(t.play??-Infinity,Math.min(target,limit));else t.play=Math.min(limit,t.play+clamp(dt*1000+(target-t.play)*.08,0,dt*1000*1.25));return t.play;}
function pose(frames,target){if(!frames?.length||target===null)return null;while(frames.length>2&&frames[1].ms<=target)frames.shift();const a=frames[0],b=frames[1];if(!b||target<=a.ms){if(b||target<=a.ms)return a;}if(b&&target<=b.ms){const u=clamp((target-a.ms)/(b.ms-a.ms||1),0,1);return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,a:a.a+angle(b.a,a.a)*u,s:a.s+(b.s-a.s)*u,visual:blendVisual(a.visual,b.visual,u)};}
 const l=frames[frames.length-1],dt=clamp((target-l.ms)/1000,0,.075);return {x:l.x+(Math.cos(l.a)*l.s+(l.vx||0))*dt,y:l.y+(Math.sin(l.a)*l.s+(l.vy||0))*dt,a:l.a,s:l.s,visual:l.visual};}
function blendVisual(a,b,u){if(!a||!b)return a||b;const out={...(u<.5?a:b)};for(const k of ['jump','wheelPhase','bridgeExitVisual','tableFalling','boxTransit','oilSpin','boost'])if(Number.isFinite(a[k])&&Number.isFinite(b[k]))out[k]=a[k]+(b[k]-a[k])*u;return out;}
function correction(visual,base){return {x:visual.x-base.x,y:visual.y-base.y,a:angle(visual.a,base.a)};}
function decay(c,dt){const k=Math.exp(-Math.min(.12,Math.max(0,dt))*11);c.x*=k;c.y*=k;c.a*=k;return c;}
function quantile(a,p){if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return +b[Math.min(b.length-1,Math.max(0,Math.ceil(b.length*p)-1))].toFixed(2);}
function append(a,v,limit=512){if(!Number.isFinite(v))return;a.push(v);if(a.length>limit)a.shift();}
window.TTROnlineNet=Object.freeze({timeline,observe,playback,pose,correction,decay,quantile,append});
})();
