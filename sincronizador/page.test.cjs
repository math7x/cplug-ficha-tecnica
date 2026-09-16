const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const core=require('./core.js');
function setup(){
  const messages=[],listeners={};
  let calls=0,nextResponse=new Response(null,{status:204});
  class XHR {
    open(method,url){this.method=method;this.url=url;} addEventListener(event,listener){this.listener=listener;}
    send(){this.status=204;this.responseText='';this.listener();}
  }
  const window={fetch:()=>{calls++;return Promise.resolve(nextResponse)},postMessage:m=>messages.push(m),addEventListener:(name,fn)=>listeners[name]=fn};
  vm.runInNewContext(fs.readFileSync(__dirname+'/page.js','utf8'),{window,location:{origin:'https://app.connectplug.com.br'},document:{querySelector:()=>null},CplugCostCore:core,URL,Request,XMLHttpRequest:XHR,crypto:webcrypto});
  return {window,messages,XHR,listeners,response:r=>nextResponse=r,calls:()=>calls};
}
const tick=()=>new Promise(r=>setTimeout(r,30));
test('fetch preserva resposta e detecta conclusão sem depender de empresa',async()=>{
  const env=setup();const url='https://api.connectplug.com.br/api/v3/purchase-invoices/5/import';
  const response=await env.window.fetch(url,{method:'PUT'});await tick();
  assert.equal(response.status,204);assert.equal(env.calls(),1);assert.equal(env.messages.filter(m=>m.kind==='entry').length,1);
  assert.equal(env.messages.filter(m=>m.kind==='entry').at(-1).data.company,undefined);
  env.response(new Response(JSON.stringify({message:'erro'}),{status:422,headers:{'content-type':'application/json'}}));
  await env.window.fetch(url,{method:'PUT'});await tick();
  assert.equal(env.messages.filter(m=>m.kind==='entry').length,1);
});
test('XHR 204 detecta importação, salvamento de produto não cria entrada',()=>{
  const env=setup();
  const x=new env.XHR();x.open('PUT','https://api.connectplug.com.br/api/v3/purchase-invoices/5/import');x.send('{}');
  const y=new env.XHR();y.open('PUT','https://api.connectplug.com.br/api/v3/products/398');y.send('{}');
  assert.equal(env.messages.filter(m=>m.kind==='entry').length,1);
  assert.equal(env.messages.filter(m=>m.kind==='saved').length,1);
});
test('lista mantém apenas identificação e vínculo necessário',async()=>{
  const env=setup();
  env.response(new Response(JSON.stringify({data:{products:[{id:398,name:'Teste',companies:[{id:1,name:'Qualquer'}],components:[{product:{id:399}}],private_notes:'não repassar',stock_settings:{cost:{amount:590}}}]}}),{headers:{'content-type':'application/json'}}));
  await env.window.fetch('https://api.connectplug.com.br/api/v3/products?page=1');await tick();
  env.listeners.message({source:env.window,origin:'https://app.connectplug.com.br',data:{channel:'CPLUG_COST_SYNC_03',kind:'snapshot',id:'test'}});
  const snapshot=env.messages.find(m=>m.kind==='snapshotResult');
  assert.equal(snapshot.data.products[0].components[0].product.id,399);
  assert.equal(snapshot.data.products[0].private_notes,undefined);
  assert.equal(snapshot.data.products[0].stock_settings,undefined);
  assert.equal(snapshot.data.company,undefined);
});
test('resetSnapshot limpa produtos capturados antes de varrer a aba Produção',async()=>{
  const env=setup();
  env.response(new Response(JSON.stringify({data:{products:[{id:1,name:'Produto de Todos',companies:[],components:[]}]}}),{headers:{'content-type':'application/json'}}));
  await env.window.fetch('https://api.connectplug.com.br/api/v3/products?page=1');await tick();
  env.listeners.message({source:env.window,origin:'https://app.connectplug.com.br',data:{channel:'CPLUG_COST_SYNC_03',kind:'resetSnapshot',id:'reset-1'}});
  assert(env.messages.some(m=>m.kind==='snapshotReset'&&m.data.id==='reset-1'));
  env.response(new Response(JSON.stringify({data:{products:[{id:2,name:'Ficha Produção',companies:[],components:[{product:{id:3}}]}]}}),{headers:{'content-type':'application/json'}}));
  await env.window.fetch('https://api.connectplug.com.br/api/v3/products?page=1&production=true');await tick();
  env.listeners.message({source:env.window,origin:'https://app.connectplug.com.br',data:{channel:'CPLUG_COST_SYNC_03',kind:'snapshot',id:'after-reset'}});
  const snapshot=env.messages.find(m=>m.kind==='snapshotResult'&&m.data.id==='after-reset');
  assert.equal(Array.from(snapshot.data.products,p=>p.id).join(','),'2');
  assert.equal(snapshot.data.listReads,1);
});
