import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOffer,imageOffer} from '../offers.js';
import {deliver} from '../delivery.js';

const text = `🔥 ACHADO AUVELLO

Controle Sem Fio Joystick REDFIN
Bluetooth Compatível Para Ps4

De: R$ 114,90
Por: R$ 51,32
💥 55% OFF

🛒 Link:
https://meli.la/1MdxGac`;
test('Extrai os dados do exemplo e preserva o link de afiliado',()=>{
  assert.deepEqual(parseOffer(text),{name:'Controle Sem Fio Joystick REDFIN Bluetooth Compatível Para Ps4',price:51.32,originalPrice:114.9,link:'https://meli.la/1MdxGac'});
});
test('Aceita moeda brasileira com milhares e formatacao WhatsApp',()=>{
  const offer = parseOffer(text.replace('De: R$ 114,90','~De: R$ 3.499,90~').replace('Por: R$ 51,32','*Por: R$ 2.199,99*'));
  assert.equal(offer.price,2199.99);
  assert.equal(offer.originalPrice,3499.90);
});
test('Rejeita preco ausente, preco zero e dominio parecido',()=>{
  assert.equal(parseOffer(text.replace('Por: R$ 51,32','Por: grátis')),null);
  assert.equal(parseOffer(text.replace('51,32','0,00')),null);
  assert.equal(parseOffer(text.replace('meli.la/','meli.la.evil.example/')),null);
});
const source = {group:'123@g.us',since:1000000};
const message = {key:{remoteJid:'123@g.us',id:'one',fromMe:false},messageTimestamp:1001,message:{imageMessage:{caption:text,fileLength:100}}};
test('Recebe apenas fotos novas do grupo selecionado',()=>{
  assert.ok(imageOffer(message,source));
  assert.equal(imageOffer(message,source,'append'),null);
  assert.equal(imageOffer(message,{group:'outro@g.us',since:0}),null);
  assert.equal(imageOffer(message,{...source,since:2000000}),null);
  assert.equal(imageOffer({...message,message:{conversation:text}},source),null);
  assert.equal(imageOffer({...message,message:{viewOnceMessage:{message:message.message}}},source),null);
  assert.ok(imageOffer({...message,key:{...message.key,fromMe:true}},source));
});
test('Envia video primeiro e descricao com link depois',async()=>{
  const states=[],messages=[];
  await deliver({video:Buffer.from('mp4'),caption:'https://meli.la/1MdxGac',jid:'5528999676818@s.whatsapp.net',socket:{sendMessage:async(jid,body)=>messages.push({jid,body})},mark:async state=>states.push(state)});
  assert.deepEqual(states,['sending','description','sent']);
  assert.ok(messages[0].body.video);
  assert.equal(messages[1].body.text,'https://meli.la/1MdxGac');
  assert.equal(messages[0].jid,'5528999676818@s.whatsapp.net');
});
test('Falha na descricao nao repete automaticamente o video enviado',async()=>{
  let calls=0; const states=[];
  const ok=await deliver({video:Buffer.from('mp4'),caption:'legenda',jid:'destino',socket:{sendMessage:async()=>{if(++calls===2)throw Error('timeout');}},mark:async state=>states.push(state)});
  assert.equal(ok,false); assert.equal(calls,2);
  assert.deepEqual(states,['sending','description','review']);
});
test('Falha ao registrar o inicio impede o envio',async()=>{
  let calls=0;
  await assert.rejects(deliver({video:Buffer.from('mp4'),caption:'legenda',jid:'destino',socket:{sendMessage:async()=>calls++},mark:async()=>{throw Error('Neon indisponivel');}}));
  assert.equal(calls,0);
});
