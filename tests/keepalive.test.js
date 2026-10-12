import test from 'node:test';
import assert from 'node:assert/strict';
import {startKeepAlive} from '../keepalive.js';

const timers = {setInterval:()=>1,setTimeout:()=>2,clearInterval(){},clearTimeout(){}};
const options = {baseUrl:'https://example.onrender.com',timers,log:()=>{}};
test('Chama somente a rota publica de health sem senha',async()=>{
  let request;
  const ping = startKeepAlive({...options,fetchImpl:async(url,init)=>{
    request={url,init}; return {ok:true,json:async()=>({status:'ok'})};
  }});
  assert.equal(await ping.tick(),true);
  assert.equal(request.url,'https://example.onrender.com/health');
  assert.equal(request.init.method,'GET');
  assert.equal(request.init.headers.Authorization,undefined);
  ping.stop(); assert.equal(await ping.tick(),false);
});
test('Falha de rede nao impede a proxima tentativa',async()=>{
  let attempts=0;
  const ping = startKeepAlive({...options,fetchImpl:async()=>{
    if(++attempts===1) throw Error('rede');
    return {ok:true,json:async()=>({status:'ok'})};
  }});
  assert.equal(await ping.tick(),false);
  assert.equal(await ping.tick(),true);
});
test('Nao sobrepoe requisicoes lentas',async()=>{
  let finish,calls=0;
  const ping = startKeepAlive({...options,fetchImpl:()=>{
    calls++; return new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>({status:'ok'})}));
  }});
  const first = ping.tick();
  assert.equal(await ping.tick(),false);
  finish(); assert.equal(await first,true); assert.equal(calls,1);
});
test('Nao inicia fora do Render sem URL ou quando desativado',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;};
  assert.equal(await startKeepAlive({...options,baseUrl:'',fetchImpl}).tick(),false);
  assert.equal(await startKeepAlive({...options,enabled:false,fetchImpl}).tick(),false);
  assert.equal(calls,0);
});
