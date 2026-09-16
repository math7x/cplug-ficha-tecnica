const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const core=require('./core.js');
function setup(failSave=false,failRecipeVerify=false,options={}){
  const state={},tasks=[];let listener,tabId=1,cost=options.fixedCost??399,fixedEnabled=options.fixedEnabled??true;
  const recipeBefore=options.recipeBefore??590,recipeAfter=options.recipeAfter??590;
  let recipeCost=recipeBefore;
  const chrome={
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,state[k]])),set:async values=>Object.assign(state,values)}},
    scripting:{executeScript:async()=>{}},
    tabs:{query:async options=>options?.url?[{id:99,url:'https://app.connectplug.com.br/dashboard/'}]:[{id:tabId,url:'https://app.connectplug.com.br/dashboard/'}],update:async()=>{},create:async options=>{assert.equal(options.active,true);return {id:++tabId};},remove:async()=>{},sendMessage:async(id,message)=>{
      if(message.type==='ping')return {ok:true,version:'0.6.18'};
      const task=message.task;tasks.push(task);
      if(task.op==='scan')return {ok:true,data:[{id:398,name:'Teste',companies:[],components:[{product:{id:399}}]},{id:400,name:'Sem ficha',companies:[],components:[]}]};
      if(task.op==='recipe'){
        if(options.recipeError)return {ok:false,error:'Recálculo indisponível'};
        if(task.recalculate){
          const beforeCost=recipeCost;
          const recipeChanged=beforeCost!==recipeAfter;
          const data={cost:recipeAfter,beforeCost,recalculated:1,recipeChanged,recipeSaved:!!task.persist&&recipeChanged,suspiciousZero:beforeCost>0&&recipeAfter===0};
          if(task.persist&&recipeChanged)recipeCost=recipeAfter;
          return {ok:true,data};
        }
        return {ok:true,data:{cost:failRecipeVerify?580:recipeCost,beforeCost:recipeCost,recalculated:0,recipeChanged:false,recipeSaved:false}};
      }
      if(task.op==='read')return options.readError?{ok:false,error:'Campo indisponível'}:options.missingFixed?{ok:true,data:{cost:null}}:{ok:true,data:{fixed:fixedEnabled,cost:fixedEnabled?cost:null}};
      if(task.op==='edit'){if(failSave)return {ok:false,error:'Falha simulada'};assert.equal(task.expectedFixed,fixedEnabled);if(fixedEnabled)assert.equal(task.expected,cost);fixedEnabled=true;cost=task.cost;return {ok:true,data:{saved:true,fixed:true}};}
    }},
    action:{setBadgeText:async({text})=>{state.badge=text},setBadgeBackgroundColor:async()=>{},setTitle:async({title})=>{state.actionTitle=title}},
    runtime:{onMessage:{addListener:fn=>listener=fn},onInstalled:{addListener(){}},onStartup:{addListener(){}},getURL:path=>'chrome-extension://test/'+path,getPlatformInfo:async()=>({})}
  };
  const sandbox={chrome,importScripts(){},CplugCostCore:core,setTimeout,setInterval,clearInterval,console};
  vm.runInNewContext(fs.readFileSync(__dirname+'/background.js','utf8'),sandbox);
  return {state,tasks,start:(apply,strategy='recalculate')=>listener({type:'run',apply,strategy},{url:'chrome-extension://test/popup.html'},()=>{}),message:(msg,sender={url:'chrome-extension://test/popup.html'})=>new Promise(resolve=>listener(msg,sender,resolve)),cost:()=>cost};
}
async function finished(env){for(let i=0;i<100;i++){if(env.state.running===false)return;await new Promise(r=>setTimeout(r,5));}throw new Error('Não finalizou');}
test('conferência não grava e ignora cadastro sem ficha',async()=>{
  const env=setup();env.start(false);await finished(env);
  assert(!env.tasks.some(t=>t.op==='edit'));assert.equal(env.cost(),399);
  assert(env.tasks.some(t=>t.op==='recipe'&&t.recalculate===true&&t.persist===false));
  assert(env.state.history.some(h=>h.kind==='difference'));
  assert(!env.tasks.some(t=>t.id==='400'));
  assert.equal(env.state.lastRunMode,'preview');assert(env.state.progress.includes('Nenhuma alteração foi salva'));
  assert(env.tasks.every(t=>!('company' in t)));
});
test('sincronização lê total, grava e verifica persistência',async()=>{
  const env=setup();env.start(true);await finished(env);
  assert.equal(env.cost(),590);assert.equal(env.tasks.filter(t=>t.op==='edit').length,1);
  assert(env.tasks.some(t=>t.op==='recipe'&&t.recalculate===true&&t.persist===true));
  assert.equal(env.tasks.at(-1).op,'read');assert(env.state.history.some(h=>h.kind==='updated'&&h.before===399&&h.after===590));
  assert.equal(env.state.lastRunMode,'sync');assert.equal(env.state.lastRunResult.ok,true);
  assert.equal(env.state.taskProgress.status,'done');assert.equal(env.state.taskProgress.percent,100);assert.equal(env.state.taskProgress.active,false);
});
test('não depende de nome de empresa para iniciar',async()=>{
  const env=setup();const result=await env.message({type:'run',apply:false});assert.equal(result.ok,true);await finished(env);
  assert(env.tasks.length>0);assert.equal(env.state.lastError,null);
});
test('falha na gravação não é registrada como atualização confirmada',async()=>{
  const env=setup(true);env.start(true);await finished(env);
  assert.equal(env.cost(),399);assert(!env.state.history.some(h=>h.kind==='updated'));
  assert.equal(env.state.lastError,'Falha simulada');
});
test('não altera cadastro se a ficha recalculada não persistir',async()=>{
  const env=setup(false,true,{recipeBefore:590,recipeAfter:600});env.start(true);await finished(env);
  assert(!env.tasks.some(t=>t.op==='edit'));assert.equal(env.cost(),399);
  assert(env.state.lastError.includes('não persistiu na ficha'));
});
test('ativar automático injeta monitor sem exigir empresa',async()=>{
  const env=setup();
  const result=await env.message({type:'automatic',enabled:true});
  assert.equal(result.ok,true);assert.equal(result.count,1);assert.equal(env.state.automatic,true);
  const status=await env.message({type:'monitorStatus'});
  assert.equal(status.active,true);assert.equal(status.version,'0.6.18');assert.equal(status.message,'Monitor ativo nesta aba');
  assert.equal(env.state.automaticCompany,undefined);
});
test('entrada detectada cria pendência e não grava antes da aprovação',async()=>{
  const env=setup();env.state.automatic=true;
  const sender={tab:{id:77},url:'https://app.connectplug.com.br/dashboard/stock/movements'};
  const event={kind:'movement',key:'movements:123',productIds:[399]};
  const first=await env.message({type:'entry',event},sender);assert.equal(first.ok,true);
  for(let i=0;i<700&&!env.state.pendingApproval;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(env.state.pendingApproval?.status,'waiting');
  assert.equal(env.state.pendingApproval?.items?.length,1);
  assert.equal(env.state.lastDetectedEntry.kind,'movement');
  assert.equal(env.tasks.filter(t=>t.op==='edit').length,0);
  assert.equal(env.tasks.filter(t=>t.op==='recipe').length,0);
  assert.equal(env.tasks.filter(t=>t.op==='read').length,0);
  assert.equal(env.state.lastRunMode,'plan');
  assert.equal(env.state.pendingApproval.items[0].planned,true);
  assert.equal(env.state.badge,'!');
  const approve=await env.message({type:'approvePending'});assert.equal(approve.ok,true);
  for(let i=0;i<300&&env.cost()!==590;i++)await new Promise(r=>setTimeout(r,5));
  await finished(env);
  assert.equal(env.cost(),590);
  assert.equal(env.tasks.filter(t=>t.op==='edit').length,1);
  assert.equal(env.state.pendingApproval,null);
  assert.equal(env.state.badge,'');
  const edits=env.tasks.filter(t=>t.op==='edit').length;
  await env.message({type:'entry',event},sender);await new Promise(r=>setTimeout(r,30));
  assert.equal(env.tasks.filter(t=>t.op==='edit').length,edits);
});
test('evento automático não precisa conter empresa',async()=>{
  const env=setup();env.state.automatic=true;
  const sender={tab:{id:77},url:'https://app.connectplug.com.br/dashboard/stock/movements'};
  const result=await env.message({type:'entry',event:{kind:'movement',key:'movements:999',productIds:[399]}},sender);
  assert.equal(result.ok,true);
  for(let i=0;i<700&&!env.state.pendingApproval;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(env.state.pendingApproval?.status,'waiting');
});
test('recusar por enquanto mantém a pendência e o aviso',async()=>{
  const env=setup();
  env.state.pendingApproval={status:'waiting',event:{kind:'movement',productIds:[399]},items:[{id:'398',name:'Teste',before:399,after:590}],count:1};
  const result=await env.message({type:'deferPending'});
  assert.equal(result.ok,true);
  assert.equal(env.state.pendingApproval.status,'deferred');
  assert.equal(env.state.pendingApproval.items.length,1);
  assert.equal(env.state.badge,'!');
  assert(env.state.progress.includes('continuam pendentes'));
});
test('conferência lista divergência mesmo quando ficha está abaixo do custo fixo e o recálculo os iguala',async()=>{
  const env=setup(false,false,{fixedCost:590,recipeBefore:458,recipeAfter:590});
  env.start(false);await finished(env);
  assert.equal(env.state.previewItems.length,1);
  const item=env.state.previewItems[0];
  assert.equal(item.recipeBefore,458);
  assert.equal(item.fixedBefore,590);
  assert.equal(item.recipeAfter,590);
  assert.equal(item.existingMismatch,true);
  assert.equal(item.fixedChanged,false);
  assert(env.state.history.some(h=>h.kind==='difference'&&h.recipeBefore===458&&h.fixedBefore===590));
});


test('custo fixo desativado é listado na conferência e ativado na sincronização',async()=>{
  const env=setup(false,false,{fixedEnabled:false,recipeBefore:397,recipeAfter:397});
  env.start(false);await finished(env);
  assert.equal(env.state.previewItems.length,1);
  const item=env.state.previewItems[0];
  assert.equal(item.fixedNeedsEnable,true);
  assert.equal(item.fixedEnabled,false);
  assert.equal(item.recipeBefore,397);
  assert.equal(item.fixedBefore,null);
  const env2=setup(false,false,{fixedEnabled:false,recipeBefore:397,recipeAfter:397});
  env2.start(true);await finished(env2);
  const edit=env2.tasks.filter(t=>t.op==='edit').at(-1);
  assert.equal(edit.expectedFixed,false);
  assert.equal(edit.cost,397);
  assert.equal(env2.cost(),397);
  assert(env2.state.history.some(h=>h.kind==='fixed-enabled'));
});

test('queda de ficha positiva para zero é marcada como bloqueio de segurança na conferência',async()=>{
  const env=setup(false,false,{fixedEnabled:true,fixedCost:397,recipeBefore:397,recipeAfter:0});
  env.start(false);await finished(env);
  assert.equal(env.state.previewItems.length,1);
  assert.equal(env.state.previewItems[0].suspiciousZero,true);
  assert.equal(env.state.previewItems[0].safetyBlocked,true);
  assert(!env.tasks.some(t=>t.op==='edit'));
  assert(env.state.history.some(h=>h.kind==='safety-block'));
});


test('estratégia ficha atual copia o total já exibido sem recalcular componentes',async()=>{
  const env=setup(false,false,{fixedEnabled:true,fixedCost:399,recipeBefore:590,recipeAfter:0});
  env.start(true,'current');await finished(env);
  assert.equal(env.cost(),590);
  assert.equal(env.tasks.filter(t=>t.op==='recipe'&&t.recalculate===true).length,0);
  assert(env.tasks.some(t=>t.op==='recipe'&&!t.recalculate));
  const edit=env.tasks.find(t=>t.op==='edit');
  assert.equal(edit.cost,590);
  assert.equal(env.state.lastRunResult.strategy,'current');
  assert(env.state.history.some(h=>h.kind==='updated'&&h.syncStrategy==='current'));
});

test('aprovação pendente oferece estratégia de usar ficha atual',async()=>{
  const env=setup(false,false,{fixedEnabled:false,recipeBefore:397,recipeAfter:0});
  env.state.pendingApproval={status:'waiting',event:{kind:'movement',productIds:[399]},items:[{id:'398',name:'Teste',planned:true}],count:1};
  const result=await env.message({type:'approvePending',strategy:'current'});
  assert.equal(result.ok,true);
  await finished(env);
  assert.equal(env.cost(),397);
  assert.equal(env.tasks.filter(t=>t.op==='recipe'&&t.recalculate===true).length,0);
  assert.equal(env.state.pendingApproval,null);
});

test('falha de leitura torna conferência incompleta em vez de sucesso sem diferenças',async()=>{
  const env=setup(false,false,{readError:true});env.start(false);await finished(env);
  assert.equal(env.state.lastRunResult.ok,false);assert.match(env.state.lastError,/Conferência incompleta/);
  assert(!env.state.history.some(h=>h.kind==='equal'||h.kind==='finished'));
});
test('resposta sem fixed explícito não é aceita como custo ativo',async()=>{
  const env=setup(false,false,{missingFixed:true});env.start(false);await finished(env);
  assert.equal(env.state.lastRunResult.ok,false);assert.match(env.state.lastError,/estado do custo fixo/);
});
test('Não continua listado como obrigatório mesmo se recálculo falhar',async()=>{
  const env=setup(false,false,{fixedEnabled:false,recipeError:true});env.start(false);await finished(env);
  assert.equal(env.state.lastRunResult.ok,false);assert.equal(env.state.previewItems.length,1);
  assert.equal(env.state.previewItems[0].fixedNeedsEnable,true);
});
test('ficha zero com custo fixo Não também exige ativação',async()=>{
  const env=setup(false,false,{fixedEnabled:false,recipeBefore:0,recipeAfter:0});env.start(false);await finished(env);
  assert.equal(env.state.previewItems.length,1);assert.equal(env.state.previewItems[0].fixedNeedsEnable,true);
});


test('usar valor atual cria vínculo e conferência seguinte não relista enquanto valores permanecerem iguais',async()=>{
  const env=setup(false,false,{fixedEnabled:true,fixedCost:399,recipeBefore:590,recipeAfter:453});
  env.start(true,'current');await finished(env);
  assert.equal(env.cost(),590);
  assert.equal(env.state.currentValueLinks?.['398']?.cost,590);
  const before=env.tasks.length;
  env.start(false);await new Promise(r=>setTimeout(r,10));await finished(env);
  const later=env.tasks.slice(before);
  assert.equal(env.state.previewItems.length,0);
  assert.equal(later.filter(t=>t.op==='recipe'&&t.recalculate===true).length,0);
  assert(later.some(t=>t.op==='recipe'&&!t.recalculate));
  assert(env.state.history.some(h=>h.kind==='linked-current'));
});

test('mudança de valor invalida vínculo e produto volta para a conferência',async()=>{
  const env=setup(false,false,{fixedEnabled:true,fixedCost:600,recipeBefore:590,recipeAfter:590});
  env.state.currentValueLinks={'398':{id:'398',name:'Teste',cost:590}};
  env.start(false);await finished(env);
  assert.equal(env.state.currentValueLinks?.['398'],undefined);
  assert.equal(env.state.previewItems.length,1);
  assert.equal(env.state.previewItems[0].fixedBefore,600);
});

test('nova entrada invalida vínculo confirmado dos produtos afetados',async()=>{
  const env=setup();env.state.automatic=true;
  env.state.currentValueLinks={'398':{id:'398',name:'Teste',cost:590}};
  const sender={tab:{id:77},url:'https://app.connectplug.com.br/dashboard/stock/movements'};
  const result=await env.message({type:'entry',event:{kind:'movement',key:'movements:link',productIds:[399]}},sender);
  assert.equal(result.ok,true);
  for(let i=0;i<700&&!env.state.pendingApproval;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(env.state.currentValueLinks?.['398'],undefined);
  assert.equal(env.state.pendingApproval?.status,'waiting');
});

test('estratégia por produto executa ficha atual sem recalcular o item',async()=>{
  const env=setup(false,false,{fixedEnabled:true,fixedCost:399,recipeBefore:590,recipeAfter:0});
  const result=await env.message({type:'run',apply:true,strategies:{'398':'current'}});
  assert.equal(result.ok,true);await finished(env);
  assert.equal(env.cost(),590);
  assert.equal(env.tasks.filter(t=>t.op==='recipe'&&t.recalculate===true).length,0);
  assert.equal(env.state.lastRunResult.strategy,'mixed');
});

test('estratégia por produto permite recalcular item não bloqueado',async()=>{
  const env=setup(false,false,{fixedEnabled:true,fixedCost:399,recipeBefore:590,recipeAfter:600});
  const result=await env.message({type:'run',apply:true,strategies:{'398':'recalculate'}});
  assert.equal(result.ok,true);await finished(env);
  assert.equal(env.cost(),600);
  assert(env.tasks.some(t=>t.op==='recipe'&&t.recalculate===true&&t.persist===true));
  assert.equal(env.state.lastRunResult.strategy,'mixed');
});

test('recálculo bloqueado impede apenas a escolha inválida daquele produto',async()=>{
  const env=setup();
  env.state.previewItems=[{id:'398',name:'Teste',safetyBlocked:true}];
  const blocked=await env.message({type:'run',apply:true,strategies:{'398':'recalculate'}});
  assert.equal(blocked.ok,false);assert.match(blocked.error,/bloqueado por segurança/);
  const allowed=await env.message({type:'run',apply:true,strategies:{'398':'current'}});
  assert.equal(allowed.ok,true);await finished(env);
});
