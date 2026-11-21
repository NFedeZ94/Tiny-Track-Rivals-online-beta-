'use strict';
// Strict dependency-free RFC6455 server transport for the beta prototype.
// Supports text messages, ping/pong, close, masking, fragmentation and frame-size limits.
// Replace with a maintained WS library after package registry access is available.
const crypto=require('node:crypto');
const MAGIC='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class WSConnection {
  constructor(socket,head,{maxMessageBytes=24000,onMessage,onClose}){
    this.socket=socket;this.maxMessageBytes=maxMessageBytes;this.onMessage=onMessage;this.onClose=onClose;
    this.buffer=Buffer.alloc(0);this.closed=false;this.closing=false;this.partType=0;this.parts=[];this.partSize=0;
    socket.on('data',b=>this.feed(b));socket.on('error',()=>this.terminate());socket.on('close',()=>this.terminate());
    if(head?.length)this.feed(head);
  }
  frame(op,payload=Buffer.alloc(0)){
    if(this.closed||this.socket.destroyed)return;
    const data=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload));let hdr;
    if(data.length<126){hdr=Buffer.from([0x80|op,data.length]);}
    else if(data.length<=65535){hdr=Buffer.alloc(4);hdr[0]=0x80|op;hdr[1]=126;hdr.writeUInt16BE(data.length,2);}
    else {hdr=Buffer.alloc(10);hdr[0]=0x80|op;hdr[1]=127;hdr.writeBigUInt64BE(BigInt(data.length),2);}
    // Slow clients can never accumulate unbounded queued snapshots in memory.
    if(this.socket.writableLength>180000){this.close(1013,'slow client');return;}
    this.socket.write(Buffer.concat([hdr,data]));
  }
  send(obj){if(!this.closed&&!this.closing)this.frame(1,JSON.stringify(obj));}
  ping(){if(!this.closed&&!this.closing)this.frame(9,'');}
  close(code=1000,reason=''){
    if(this.closed||this.closing)return;this.closing=true;
    const msg=Buffer.from(reason).subarray(0,100),data=Buffer.alloc(2+msg.length);
    data.writeUInt16BE(code,0);msg.copy(data,2);this.frame(8,data);
    this.socket.end();setTimeout(()=>{if(!this.socket.destroyed)this.socket.destroy();},1200).unref();
  }
  fail(code=1002,msg='protocol error'){this.close(code,msg);}
  feed(bytes){if(this.closed)return;
    if(this.buffer.length+bytes.length>this.maxMessageBytes+10000){this.fail(1009,'buffer too large');return;}
    this.buffer=Buffer.concat([this.buffer,bytes]);
    while(this.buffer.length>=2&&!this.closed){
      const b=this.buffer,fin=(b[0]&0x80)!==0,rsv=b[0]&0x70,op=b[0]&0x0f,masked=(b[1]&0x80)!==0;
      let n=b[1]&0x7f,pos=2;
      if(rsv||!masked){this.fail(1002,'bad frame');return;}
      if(n===126){if(b.length<4)return;n=b.readUInt16BE(2);pos=4;}
      else if(n===127){if(b.length<10)return;const big=b.readBigUInt64BE(2);if(big>BigInt(this.maxMessageBytes)){this.fail(1009,'too large');return;}n=Number(big);pos=10;}
      if(n>this.maxMessageBytes){this.fail(1009,'too large');return;}
      if((op&0x8)&&(!fin||n>125)){this.fail(1002,'bad control');return;}
      if(b.length<pos+4+n)return;
      const mask=b.subarray(pos,pos+4),data=Buffer.from(b.subarray(pos+4,pos+4+n));
      for(let i=0;i<data.length;i++)data[i]^=mask[i%4];this.buffer=b.subarray(pos+4+n);
      if(op===8){this.close(1000,'bye');return;}
      if(op===9){this.frame(10,data);continue;}
      if(op===10)continue;
      if(op!==0&&op!==1){this.fail(1003,'text only');return;}
      if(op===1){if(this.partType){this.fail(1002,'nested messages');return;}this.partType=1;this.parts=[];this.partSize=0;}
      else if(!this.partType){this.fail(1002,'unexpected continuation');return;}
      this.parts.push(data);this.partSize+=data.length;
      if(this.partSize>this.maxMessageBytes){this.fail(1009,'message too large');return;}
      if(fin){const full=Buffer.concat(this.parts);this.partType=0;this.parts=[];this.partSize=0;
        // Decode with fatal UTF-8; malformed text is a protocol error.
        let decoded;try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(full);}catch(_){this.fail(1007,'invalid utf8');return;}
        try{this.onMessage?.(decoded,this);}catch(err){console.error('[TTR beta] message handler:',err);this.fail(1011,'server error');return;}
      }
    }
  }
  terminate(){if(this.closed)return;this.closed=true;this.closing=true;try{this.onClose?.(this);}catch(e){console.error(e);}}
}
function acceptWebSocket(req,socket,head,options){
  const key=req.headers['sec-websocket-key'];
  if(req.method!=='GET'||req.headers.upgrade?.toLowerCase()!=='websocket'||typeof key!=='string'||
     !/^[A-Za-z0-9+/]{22}==$/.test(key)||req.headers['sec-websocket-version']!=='13'){
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return null;
  }
  const accept=crypto.createHash('sha1').update(key+MAGIC).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  socket.setNoDelay(true);return new WSConnection(socket,head,options);
}
module.exports={WSConnection,acceptWebSocket};
