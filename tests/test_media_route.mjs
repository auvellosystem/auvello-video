import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { timingSafeEqual } from 'node:crypto';
const source = fs.readFileSync('whatsapp-service/index.js', 'utf8');
const route = source.slice(source.indexOf('app.post("/send-video"'), source.indexOf('app.post("/send",'));
let handlers;
const sent = [];
const context = { Buffer, console, timingSafeEqual,
  process: {env:{WA_MEDIA_TOKEN:'secret',VIDEO_RECIPIENT:'5528999676818'}},
  app:{post:(_path,...args)=>{handlers=args;}}, express:{raw:()=>()=>{}},
  ready:true, sock:{onWhatsApp:async phone=>[{exists:true,jid:phone+'@s.whatsapp.net'}],sendMessage:async(...args)=>{sent.push(args);return {key:{id:'test'}};}}
};
vm.runInNewContext(route,context);
const res=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}});
let response=res(), passed=false;
handlers[0]({headers:{authorization:'Bearer wrong'}},response,()=>{passed=true;});
assert.equal(response.statusCode,401);assert.equal(passed,false);
handlers[0]({headers:{authorization:'Bearer secret'}},res(),()=>{passed=true;});assert.equal(passed,true);
const request={headers:{'x-video-caption':Buffer.from('Descricao com link').toString('base64')},body:Buffer.from('\x00\x00\x00\x18ftypisom')};
response=res();await handlers[2](request,response);
assert.equal(response.statusCode,200);assert.equal(sent[0][0],'5528999676818@s.whatsapp.net');assert.equal(sent[0][1].caption,'Descricao com link');
context.sock.onWhatsApp=async()=>[{exists:false}];response=res();await handlers[2](request,response);assert.equal(response.statusCode,404);assert.equal(sent.length,1);
console.log('Media route: authentication, recipient, caption and missing account OK');
