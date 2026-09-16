const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ui=require('./ui.js');
function setup(value='Não',hasCost=false){
  let listener,storageListener,clock=0,searches=0;
  const location={origin:'https://app.connectplug.com.br',pathname:'/dashboard/catalog/products'};
  const element=(text='')=>({textContent:text,children:[],getClientRects:()=>[{}],getAttribute:()=>null,matches:()=>true,querySelector:()=>null,querySelectorAll:()=>[],click(){}});
  const control=element(value);control.value=value;
  const cost=element();cost.value='R$ 3,97';
  const fixedLabel=element('Custo com valor fixo');fixedLabel.getAttribute=n=>n==='for'?'fixed':null;
  const costLabel=element('Valor do custo');costLabel.getAttribute=n=>n==='for'?'cost':null;
  const labels=[fixedLabel,...(hasCost?[costLabel]:[])];
  const target=element('Teste');target.click=()=>location.pathname='/dashboard/catalog/products/edit/398';
  const doc={documentElement:null,addEventListener(){},getElementById:id=>id==='fixed'?control:id==='cost'&&hasCost?cost:null,
    querySelector:s=>s==='table'?element():s==='[data-testid="tab-item-Estoque"]'?element():null,
    querySelectorAll:s=>s==='label'?labels:s==='table td, table td *'?[target]:[]};
  const sandbox={document:doc,location,window:{addEventListener(){}},CplugCostUI:{...ui,listSearchInput(){searches++;return {}; }},
    chrome:{storage:{onChanged:{addListener:fn=>storageListener=fn},local:{get:async()=>({})}},runtime:{onMessage:{addListener:fn=>listener=fn}}},
    Date:{now:()=>clock},setTimeout(fn,ms){clock+=ms;queueMicrotask(fn);return 1;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
    MutationObserver:class{observe(){}disconnect(){}},Event:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}}};
  let source=fs.readFileSync(__dirname+'/content.js','utf8');
  source=source.replace('  // Barra global de progresso:', '  globalThis.testing={fixedValue,field,chooseValue,gestureClick,optionFor};\n  // Barra global de progresso:');
  vm.runInNewContext(source,sandbox);
  return {sandbox,doc,labels,control,cost,costLabel,element,elapsed:()=>clock,read:()=>new Promise(resolve=>listener({type:'work',task:{op:'read',id:'398',name:'Teste'}},{},resolve)),cancel:()=>storageListener({cancelRequested:{newValue:true}},'local')};
}
test('mensagem real de leitura preserva fixed:false sem campo Valor do custo e sem espera',async()=>{
  const env=setup();const result=await env.read();assert.equal(result.ok,true);assert.equal(result.data.fixed,false);assert.equal(result.data.cost,null);assert.equal(env.elapsed(),0);
});
test('mensagem real confirma Sim e valor em centavos',async()=>{
  const env=setup('Sim',true);const result=await env.read();assert.equal(result.data.fixed,true);assert.equal(result.data.cost,397);
});
test('Não explícito tem prioridade mesmo com campo de custo remanescente',async()=>{
  const env=setup('Não',true);const result=await env.read();assert.equal(result.data.fixed,false);assert.equal(result.data.cost,null);
});
test('campo sem input próprio não captura input de grupo vizinho',()=>{
  const env=setup();env.labels.push(env.costLabel);env.costLabel.getAttribute=()=>null;
  env.costLabel.parentElement={querySelectorAll:s=>s==='label'?[env.costLabel,env.labels[0]]:[env.cost]};
  assert.equal(env.sandbox.testing.field('Valor do custo'),null);
});
test('seletor desconhecido falha com prazo de 8 segundos em vez de afirmar Sim',async()=>{
  const env=setup('');const result=await env.read();assert.equal(result.ok,false);assert.match(result.error,/estado de Custo/);assert(env.elapsed()>=8000&&env.elapsed()<8300);
});
test('Parar interrompe esperas',async()=>{
  const env=setup('');env.cancel();const result=await env.read();assert.equal(result.ok,false);assert.match(result.error,/Interrompido/);assert.equal(env.elapsed(),0);
});
test('seletor nativo seleciona pelo texto mesmo com valor interno numérico',async()=>{
  const env=setup();env.control.tagName='SELECT';env.control.options=[{textContent:'Sim',value:'1'}];
  env.control.dispatchEvent=()=>{env.control.selectedOptions=[{textContent:'Sim'}];};
  await env.sandbox.testing.chooseValue('Custo com valor fixo','Sim');assert.equal(env.control.value,'1');assert.equal(env.sandbox.testing.fixedValue(),'Sim');
});
test('seleção reconsulta controle recriado e restringe opções ao popup associado',async()=>{
  const env=setup();const replacement=env.element('Sim');replacement.value='Sim';let clicked=false;
  const option=env.element('Sim');option.click=()=>{clicked=true;env.doc.getElementById=id=>id==='fixed'?replacement:null;};
  const original=env.doc.getElementById;env.control.getAttribute=n=>n==='aria-controls'?'choices':null;
  env.doc.getElementById=id=>id==='choices'?{querySelectorAll:()=>[option]}:original(id);
  await env.sandbox.testing.chooseValue('Custo com valor fixo','Sim');assert(clicked);assert.equal(env.sandbox.testing.fixedValue(),'Sim');
});
test('reabre Estoque se o carregamento descartar o primeiro clique',async()=>{
  const env=setup();let clicks=0,selected=false;
  const tab=env.element();tab.getAttribute=n=>n==='aria-selected'?String(selected):null;
  tab.click=()=>{clicks++;if(clicks===2)selected=true;};
  const original=env.doc.querySelector;env.doc.querySelector=s=>s==='[data-testid="tab-item-Estoque"]'?tab:original(s);
  const result=await env.read();assert.equal(result.ok,true);assert.equal(result.data.fixed,false);assert.equal(clicks,2);assert(env.elapsed()<1500);
});
test('não aceita seletor quando a aba Estoque nunca ativa',async()=>{
  const env=setup();let clicks=0;const tab=env.element();tab.getAttribute=n=>n==='aria-selected'?'false':null;tab.click=()=>clicks++;
  const original=env.doc.querySelector;env.doc.querySelector=s=>s==='[data-testid="tab-item-Estoque"]'?tab:original(s);
  const result=await env.read();assert.equal(result.ok,false);assert.equal(clicks,4);assert.match(result.error,/Estoque ativo: false/);
});
test('estrutura PrimeVue real sem for usa combobox interno e não o wrapper',()=>{
  const env=setup();const label=env.labels[0];label.getAttribute=()=>null;
  const wrapper=env.element('Não');wrapper.contains=e=>e===env.control;
  env.control.value=undefined;env.control.textContent='';env.control.getAttribute=n=>n==='aria-label'?'Não':null;
  const fieldGroup={querySelectorAll:s=>s==='label'?[label]:[wrapper,env.control]};
  label.parentElement={parentElement:fieldGroup,querySelectorAll:s=>s==='label'?[label]:[]};
  assert.equal(env.sandbox.testing.fixedValue(),'Não');
});
test('seleção clica no texto interno do item customizado do CPlug',async()=>{
  const env=setup();const option=env.element('Sim');const text=env.element('Sim');let innerClicks=0;
  option.querySelectorAll=()=>[text];
  option.click=()=>{throw new Error('Clique externo não atualiza o formulário customizado');};
  text.click=()=>{innerClicks++;env.control.value='Sim';env.control.textContent='Sim';};
  env.control.getAttribute=n=>n==='aria-controls'?'choices':null;
  const original=env.doc.getElementById;env.doc.getElementById=id=>id==='choices'?{querySelectorAll:()=>[option]}:original(id);
  await env.sandbox.testing.chooseValue('Custo com valor fixo','Sim');
  assert.equal(innerClicks,1);assert.equal(env.sandbox.testing.fixedValue(),'Sim');
});

test('se clique interno não altera, tenta o item externo com sequência completa',async()=>{
  const env=setup();const option=env.element('Sim');const text=env.element('Sim');let inner=0,outer=0;
  option.querySelectorAll=()=>[text];
  text.click=()=>{inner++;};
  option.click=()=>{outer++;env.control.value='Sim';env.control.textContent='Sim';};
  env.control.getAttribute=n=>n==='aria-controls'?'choices':null;
  const original=env.doc.getElementById;env.doc.getElementById=id=>id==='choices'?{querySelectorAll:()=>[option]}:original(id);
  await env.sandbox.testing.chooseValue('Custo com valor fixo','Sim');
  assert.equal(inner,1);assert.equal(outer,1);assert.equal(env.sandbox.testing.fixedValue(),'Sim');
});
test('aparecimento de Valor do custo confirma ativação mesmo com texto do seletor atrasado',async()=>{
  const env=setup();const option=env.element('Sim');const text=env.element('Sim');option.querySelectorAll=()=>[text];
  const originalGet=env.doc.getElementById;let activated=false;
  text.click=()=>{activated=true;};
  env.control.getAttribute=n=>n==='aria-controls'?'choices':null;
  env.doc.getElementById=id=>id==='choices'?{querySelectorAll:()=>[option]}:id==='cost'&&activated?env.cost:originalGet(id);
  env.doc.querySelectorAll=s=>s==='label'?(activated?[env.labels[0],env.costLabel]:[env.labels[0]]):s==='table td, table td *'?[]:[];
  await env.sandbox.testing.chooseValue('Custo com valor fixo','Sim');
  assert.equal(activated,true);
});
