'use strict';
// Render build only: obtain immutable, trusted game source, not arbitrary URLs.
const fs=require('node:fs/promises'),path=require('node:path');
const {ROOT,REV,BUILD,MODULES,LEGACY_HASH,blobHash,loadScripts,makeFactory,verify}=require('./engine.cjs');
const base=`https://raw.githubusercontent.com/NFedeZ94/Tiny-Track-Rivals-ChatGPT/${REV}/`;
async function download(name){const res=await fetch(base+name,{signal:AbortSignal.timeout(25000),redirect:'error'});if(!res.ok)throw Error(`${name}: HTTP ${res.status}`);const b=Buffer.from(await res.arrayBuffer());if(b.length>2*1024*1024||!b.length)throw Error('Unexpected source size: '+name);return b;}
(async()=>{const temp=ROOT+'.tmp';await fs.rm(temp,{recursive:true,force:true});await fs.mkdir(path.join(temp,'js'),{recursive:true});const version=await download('version.txt');if(version.toString().trim()!==BUILD)throw Error('Incorrect game version');await fs.writeFile(path.join(temp,'version.txt'),version);
 for(let i=0;i<MODULES.length;i+=5)await Promise.all(MODULES.slice(i,i+5).map(async name=>{const b=await download('js/'+name);if(name==='06-game-legacy.js'&&blobHash(b)!==LEGACY_HASH)throw Error('Published game differs from supplied .148 ZIP');await fs.writeFile(path.join(temp,'js',name),b);}));
 const checked=verify(makeFactory(loadScripts(temp)));console.log('AUTHORITATIVE GAME SMOKE TESTS:',JSON.stringify(checked));await fs.rm(ROOT,{recursive:true,force:true});await fs.rename(temp,ROOT);console.log('Verified pinned engine '+REV);})().catch(e=>{console.error(e);process.exitCode=1;});
