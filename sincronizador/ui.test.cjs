const test=require('node:test'),assert=require('node:assert/strict');
const {dismissWelcome,recordTargets,recalculateAction,listSearchInput,productionTab,tabIsActive}=require('./ui.js');
function page(){
  let tooltip=null,clicks=0;
  const doc={querySelector:selector=>selector==='.introjs-tooltip'?tooltip:null};
  return {doc,clicks:()=>clicks,show:(title='Bem-vindo(a)!',disabled=false)=>{tooltip={querySelector:selector=>selector==='.introjs-tooltip-title'?{textContent:title}:selector==='.introjs-skipbutton[role="button"]'?{tagName:'A',textContent:'Pular',getAttribute:()=>disabled?'true':'false',click:()=>{clicks++;tooltip=null;}}:null};}};
}
test('fecha o link Pular do tour de boas-vindas',()=>{const p=page();p.show();assert.equal(dismissWelcome(p.doc),true);assert.equal(p.clicks(),1);assert.equal(dismissWelcome(p.doc),false);});
test('trata tour que aparece depois da primeira tentativa',()=>{const p=page();assert.equal(dismissWelcome(p.doc),false);p.show();assert.equal(dismissWelcome(p.doc),true);});
test('não fecha outros diálogos ou controle desabilitado',()=>{const p=page();p.show('Confirmar exclusão');assert.equal(dismissWelcome(p.doc),false);p.show('Bem-vindo(a)!',true);assert.equal(dismissWelcome(p.doc),false);assert.equal(p.clicks(),0);});
test('seleção distingue nome exato e evita clicar em ancestrais duplicados',()=>{
  const leaf={textContent:'PÃO TESTE',children:[]};
  const parent={textContent:'PÃO TESTE',children:[leaf]};
  const similar={textContent:'PÃO TESTE INTEGRAL',children:[]};
  const doc={querySelectorAll:()=>[parent,leaf,similar]};
  assert.deepEqual(recordTargets(doc,'PÃO TESTE'),[leaf]);
  assert.deepEqual(recordTargets(doc,'AUSENTE'),[]);
});
test('recálculo usa menu visível e não o primeiro menu oculto',()=>{
  const target={textContent:'Recalcular custo',getClientRects:()=>[{}]};
  const hidden={getClientRects:()=>[],getAttribute:()=>null};
  const visible={getClientRects:()=>[{}],getAttribute:()=>null,querySelectorAll:()=>[target]};
  assert.equal(recalculateAction({querySelectorAll:()=>[hidden,visible]}),target);
  assert.equal(recalculateAction({querySelectorAll:()=>[hidden]}),null);
  assert.equal(recalculateAction({querySelectorAll:()=>[visible,visible]}),null);
});

test('localiza a caixa de busca rápida da lista de produtos',()=>{
  const hidden={disabled:false,getClientRects:()=>[],getAttribute:()=> 'Busque por nome, código, SKU...'};
  const other={disabled:false,getClientRects:()=>[{}],getAttribute:()=> 'Quantidade'};
  const search={disabled:false,getClientRects:()=>[{}],getAttribute:name=>name==='placeholder'?'Busque por nome, código, SKU...':null};
  const doc={querySelectorAll:selector=>selector==='input'?[hidden,other,search]:[]};
  assert.equal(listSearchInput(doc),search);
  assert.equal(listSearchInput({querySelectorAll:()=>[other]}),null);
});


test('localiza a aba Produção e reconhece quando está ativa',()=>{
  const todos={textContent:'Todos',className:'',parentElement:null,getClientRects:()=>[{}],getAttribute:()=>null};
  const producao={textContent:'Produção',className:'',parentElement:null,getClientRects:()=>[{}],getAttribute:name=>name==='aria-selected'?'false':null};
  const doc={querySelectorAll:selector=>selector==='[role="tab"],button,a'?[todos,producao]:[]};
  assert.equal(productionTab(doc),producao);
  assert.equal(tabIsActive(producao),false);
  const active={...producao,getAttribute:name=>name==='aria-selected'?'true':null};
  assert.equal(tabIsActive(active),true);
});

test('não inventa aba Produção quando ela não existe',()=>{
  const todos={textContent:'Todos',className:'',parentElement:null,getClientRects:()=>[{}],getAttribute:()=>null};
  assert.equal(productionTab({querySelectorAll:()=>[todos]}),null);
});
test('fecha tour pelo X sem role button e sem texto Pular',()=>{
  let clicks=0;
  const skip={textContent:'×',getAttribute:()=>null,click:()=>clicks++};
  const tooltip={querySelector:s=>s==='.introjs-tooltip-title'?{textContent:'Bem-vindo(a)!'}:s==='.introjs-skipbutton'?skip:null};
  assert.equal(dismissWelcome({querySelector:()=>tooltip}),true);assert.equal(clicks,1);
});
test('alvo de opção rejeita textos internos duplicados',()=>{
  const {optionClickTarget}=require('./ui.js');
  const text=()=>({textContent:'Sim',children:[],getClientRects:()=>[{}]});
  assert.throws(()=>optionClickTarget({querySelectorAll:()=>[text(),text()]},'Sim'),/ambígua/);
});
