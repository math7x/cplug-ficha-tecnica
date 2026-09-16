importScripts('core.js');
const APP='https://app.connectplug.com.br';
const VERSION='0.6.18';
let running=false, pending=[], workerTabs=new Set();
let logQueue=Promise.resolve();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let taskProgressState={};
async function setTaskProgress(patch={}) {
  taskProgressState={...taskProgressState,...patch,updatedAt:new Date().toISOString()};
  await chrome.storage.local.set({taskProgress:taskProgressState});
}
function itemPercent(index,total,fraction=0) {
  if(!total)return 8;
  const value=8+((index+Math.max(0,Math.min(1,fraction)))/total)*88;
  return Math.max(0,Math.min(99,Math.round(value)));
}
async function log(entry) {
  logQueue=logQueue.catch(()=>{}).then(async()=>{
    const {history=[]}=await chrome.storage.local.get('history');
    history.push({at:new Date().toISOString(),...entry});
    await chrome.storage.local.set({history:history.slice(-500)});
  });
  return logQueue;
}
async function setPendingBadge(pending) {
  if(!chrome.action?.setBadgeText)return;
  const count=Array.isArray(pending?.items)?pending.items.length:pending?.count;
  const text=pending?'!':'';
  await chrome.action.setBadgeText({text}).catch(()=>{});
  if(pending)await chrome.action.setBadgeBackgroundColor({color:'#d97706'}).catch(()=>{});
  await chrome.action.setTitle({title:pending?`Custos das fichas técnicas • ${Number.isInteger(count)?count+' alteração(ões) ':''}pendente(s)`:'Custos das fichas técnicas'}).catch(()=>{});
}
async function refreshPendingBadge() {
  const {pendingApproval=null}=await chrome.storage.local.get('pendingApproval');
  await setPendingBadge(pendingApproval);
}

async function rememberCurrentLink(id,name,cost) {
  if(!Number.isSafeInteger(cost)||cost<0)return;
  const {currentValueLinks={}}=await chrome.storage.local.get('currentValueLinks');
  const next={...(currentValueLinks||{}),[String(id)]:{id:String(id),name,cost,confirmedAt:new Date().toISOString()}};
  await chrome.storage.local.set({currentValueLinks:next});
}
async function forgetCurrentLinks(ids) {
  const keys=[...new Set((ids||[]).map(String).filter(Boolean))];
  if(!keys.length)return;
  const {currentValueLinks={}}=await chrome.storage.local.get('currentValueLinks');
  const next={...(currentValueLinks||{})};
  let changed=false;
  for(const id of keys)if(Object.prototype.hasOwnProperty.call(next,id)){delete next[id];changed=true;}
  if(changed)await chrome.storage.local.set({currentValueLinks:next});
}
async function activateTabs() {
  const tabs=await chrome.tabs.query({url:APP+'/*'});
  for(const tab of tabs) {
    if(!tab.id)continue;
    try {
      await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['core.js','page.js']});
      await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',files:['ui.js','content.js']});
    } catch(error) {
      await log({kind:'monitor-error',message:'Não foi possível ativar o monitor em uma aba do CPlug: '+error.message});
    }
  }
  return tabs.length;
}
async function work(task) {
  const path=['scan','recipe'].includes(task.op)?'/dashboard/catalog/technical-sheets':'/dashboard/catalog/products';
  const previous=(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id;
  const tab=await chrome.tabs.create({url:APP+path,active:true});
  workerTabs.add(tab.id);
  try {
    let ready=false;
    for(let i=0;i<100;i++) {
      try {const r=await chrome.tabs.sendMessage(tab.id,{type:'ping'});if(r?.ok){ready=true;break;}}catch{}
      await pause(250);
    }
    if(!ready)throw new Error('Não foi possível abrir a aba de trabalho no CPlug');
    const result=await chrome.tabs.sendMessage(tab.id,{type:'work',task});
    if(!result?.ok)throw new Error(result?.error||'Aba de trabalho indisponível');
    return result.data;
  } finally {
    workerTabs.delete(tab.id);
    const wasActive=(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id===tab.id;
    await chrome.tabs.remove(tab.id).catch(()=>{});
    if(wasActive&&previous!==undefined)await chrome.tabs.update(previous,{active:true}).catch(()=>{});
  }
}
function ordered(products) {
  const map=new Map(products.map(p=>[String(p.id),p]));
  const visiting=new Set(),done=new Set(),out=[];
  function visit(id) {
    if(done.has(id))return;
    if(visiting.has(id))throw new Error('Há um ciclo entre fichas técnicas. Corrija a composição antes de sincronizar.');
    visiting.add(id);
    for(const c of map.get(id).components){const child=String(c.product?.id);if(map.has(child))visit(child);}
    visiting.delete(id);done.add(id);out.push(map.get(id));
  }
  for(const id of map.keys())visit(id);
  return out;
}

function pendingEvents(existing,event) {
  const out=[];
  for(const item of Array.isArray(existing?.events)?existing.events:(existing?.event?[existing.event]:[])){
    if(item&&['movement','invoice'].includes(item.kind))out.push(item);
  }
  if(event&&['movement','invoice'].includes(event.kind))out.push(event);
  const seen=new Set();
  return out.filter(item=>{
    const key=item.key||`${item.kind}:${item.invoiceId||item.stockId||''}:${(item.productIds||[]).join(',')}`;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}
function combinedPendingEvent(events) {
  if(!events.length)return null;
  if(events.some(e=>e.kind==='invoice'))return null;
  const productIds=[...new Set(events.flatMap(e=>Array.isArray(e.productIds)?e.productIds:[]).map(String))];
  return productIds.length?{kind:'movement',productIds}:null;
}
async function planEntry(event) {
  const startedAt=new Date().toISOString();
  await chrome.storage.local.set({running:true,lastError:null,lastRunMode:'plan',lastRunResult:null,progress:'Entrada detectada. Identificando fichas afetadas sem recalcular ou salvar…'});
  await setTaskProgress({active:true,status:'running',mode:'plan',title:'Entrada detectada',stage:'Identificando fichas afetadas',detail:'Nenhum custo será recalculado antes da aprovação',percent:8,current:0,total:0,itemName:''});
  await log({kind:'approval-plan-start',message:'Entrada detectada. Iniciando identificação segura das fichas afetadas; nenhum recálculo será executado.'});
  try {
    const {pendingApproval:existing=null}=await chrome.storage.local.get('pendingApproval');
    const events=pendingEvents(existing,event);
    const scopeEvent=combinedPendingEvent(events);
    const all=await work({op:'scan'});
    await setTaskProgress({stage:'Analisando vínculos das fichas',percent:55});
    const candidates=all.filter(p=>p.components?.length);
    if(!candidates.length)throw new Error('Nenhuma ficha de produção com componentes foi identificada');
    const affected=scopeEvent?.kind==='movement'&&scopeEvent.productIds?.length?new Set(CplugCostCore.affectedProducts(all,scopeEvent.productIds)):null;
    const selected=ordered(candidates.filter(p=>!affected||affected.has(String(p.id))));
    // Uma nova entrada invalida o vínculo confirmado dos produtos potencialmente afetados.
    // Assim, mesmo que os valores ainda estejam iguais visualmente, o usuário recebe nova aprovação.
    await forgetCurrentLinks(selected.map(p=>p.id));
    const items=selected.map(p=>({id:String(p.id),name:p.name,planned:true}));
    await setTaskProgress({total:items.length,current:items.length,percent:92,stage:items.length?'Preparando sua confirmação':'Nenhuma ficha afetada'});
    if(!items.length){
      const message='Entrada detectada, mas nenhuma ficha técnica foi identificada como afetada. Nenhuma alteração foi feita.';
      await chrome.storage.local.set({pendingApproval:existing||null,progress:message,lastRunResult:{ok:true,mode:'plan',count:0,message,at:new Date().toISOString()}});
      if(!existing)await setPendingBadge(null);
      await log({kind:'approval-plan-empty',message});
      await setTaskProgress({active:false,status:'done',percent:100,stage:'Concluído',detail:message});
      return;
    }
    const reviewedAt=new Date().toISOString();
    const pendingApproval={
      status:'waiting',
      event:scopeEvent,
      events,
      scope:scopeEvent?'affected':'all',
      items,
      count:items.length,
      detectedAt:existing?.detectedAt||startedAt,
      reviewedAt,
      lastError:null,
      safePlan:true
    };
    const message=`Entrada detectada: ${items.length} ficha(s) podem ser afetadas e aguardam sua aprovação. Nenhum recálculo ou custo foi gravado.`;
    await chrome.storage.local.set({pendingApproval,progress:message,lastRunResult:{ok:true,mode:'plan',count:items.length,message,at:reviewedAt}});
    await setPendingBadge(pendingApproval);
    await log({kind:'approval-pending',message,count:items.length});
    await setTaskProgress({active:false,status:'pending',percent:100,stage:'Aguardando sua aprovação',detail:message,current:items.length,total:items.length});
  } catch(error) {
    const failedAt=new Date().toISOString();
    const {pendingApproval:existing=null}=await chrome.storage.local.get('pendingApproval');
    const events=pendingEvents(existing,event);
    const pendingApproval={...(existing||{}),status:'review-error',event:combinedPendingEvent(events),events,items:Array.isArray(existing?.items)?existing.items:[],count:Array.isArray(existing?.items)?existing.items.length:0,detectedAt:existing?.detectedAt||failedAt,reviewedAt:failedAt,lastError:error.message,safePlan:true};
    const progress='Entrada detectada, mas não foi possível identificar com segurança as fichas afetadas. A pendência foi mantida e nada foi recalculado.';
    await chrome.storage.local.set({pendingApproval,lastError:error.message,progress,lastRunResult:{ok:false,mode:'plan',message:error.message,at:failedAt}});
    await setPendingBadge(pendingApproval);
    await log({kind:'approval-error',message:progress+' '+error.message});
    await setTaskProgress({active:false,status:'error',stage:'Falha na detecção',detail:error.message});
  } finally {
    await chrome.storage.local.set({running:false});
  }
}

async function execute({apply,event,autoReview=false,approval=false,strategy='recalculate',strategies=null}) {
  const runMode=apply?'sync':'preview';
  const syncStrategy=apply&&strategy==='current'?'current':'recalculate';
  const strategyMap=apply&&strategies&&typeof strategies==='object'?Object.fromEntries(Object.entries(strategies).filter(([,value])=>value==='current'||value==='recalculate').map(([id,value])=>[String(id),value])):{};
  const mixedMode=apply&&Object.keys(strategyMap).length>0;
  const runStrategy=mixedMode?'mixed':syncStrategy;
  let effectiveEvent=event||null;
  if(autoReview){
    const {pendingApproval=null}=await chrome.storage.local.get('pendingApproval');
    if(pendingApproval)effectiveEvent=null;
  }
  await chrome.storage.local.set({
    running:true,
    lastError:null,
    lastRunMode:runMode,
    lastRunResult:null,
    progress:apply?(mixedMode?'Sincronização por produto iniciada':syncStrategy==='current'?'Sincronização pela ficha atual iniciada':'Sincronização com recálculo iniciada'):'Conferência iniciada (não salva)',
    ...(apply?{}:{previewItems:[],previewAt:null})
  });
  await setTaskProgress({active:true,status:'running',mode:runMode,title:apply?'Sincronizando custos':'Conferindo custos',stage:'Lendo fichas técnicas',detail:apply?(mixedMode?'Aplicando a estratégia escolhida em cada produto':syncStrategy==='current'?'Usando o valor que a ficha mostra agora, sem recalcular componentes':'Atualizando a cadeia de produção e recalculando antes de copiar o custo'):'Nenhuma alteração será salva nesta conferência',percent:3,current:0,total:0,itemName:''});
  await log({kind:'start',message:apply?(mixedMode?'Sincronização iniciada com escolha individual por produto':syncStrategy==='current'?'Sincronização iniciada usando o valor atual das fichas':'Sincronização iniciada com atualização da cadeia e recálculo'):'Conferência iniciada'});
  const keepAlive=setInterval(()=>chrome.runtime.getPlatformInfo().catch(()=>{}),15000);
  try {
    const all=await work({op:'scan'});
    await setTaskProgress({stage:'Selecionando fichas de produção',percent:7});
    const candidates=all.filter(p=>p.components?.length);
    if(!candidates.length)throw new Error('Nenhuma ficha de produção com componentes foi identificada');
    const affected=effectiveEvent?.kind==='movement'&&effectiveEvent.productIds?.length?new Set(CplugCostCore.affectedProducts(all,effectiveEvent.productIds)):null;
    const orderedSelected=ordered(candidates.filter(p=>!affected||affected.has(String(p.id))));
    const selected=mixedMode?orderedSelected.filter(p=>strategyMap[String(p.id)]):orderedSelected;
    if(mixedMode&&!selected.length)throw new Error('Nenhum produto válido foi selecionado para sincronizar');
    const nameCounts=new Map();
    for(const product of all)nameCounts.set(product.name,(nameCounts.get(product.name)||0)+1);
    let changed=0,recipeSavedCount=0;
    const previewItems=[];
    const previewUnresolved=new Set();
    const productNames=new Map(all.map(product=>[String(product.id),product.name]));
    let {currentValueLinks={}}=await chrome.storage.local.get('currentValueLinks');
    currentValueLinks={...(currentValueLinks||{})};
    await setTaskProgress({total:selected.length,current:0,stage:selected.length?'Iniciando produtos':'Nenhuma ficha para processar',percent:selected.length?8:95});
    for(let index=0;index<selected.length;index++) {
      const p=selected[index];
      const {cancelRequested}=await chrome.storage.local.get('cancelRequested');
      if(cancelRequested)throw new Error('Interrompido pelo usuário');
      const id=String(p.id);
      if(nameCounts.get(p.name)!==1)throw new Error('Há produtos com o mesmo nome: '+p.name+'. A seleção automática foi interrompida.');
      const record={id,name:p.name};
      const itemStrategy=mixedMode?strategyMap[id]:syncStrategy;
      await chrome.storage.local.set({progress:(apply?'Sincronizando ':'Conferindo ')+p.name});
      await setTaskProgress({current:index+1,total:selected.length,itemName:p.name,stage:'Localizando produto pela busca rápida',detail:`${index+1} de ${selected.length}`,percent:itemPercent(index,selected.length,0.12)});
      let current;
      try {current=await work({op:'read',...record});}catch(error){throw new Error('Conferência incompleta — '+p.name+': '+error.message);}
      if(typeof current?.fixed!=='boolean'||(current.fixed&&(!Number.isSafeInteger(current.cost)||current.cost<0)))throw new Error('Conferência incompleta — estado do custo fixo não confirmado: '+p.name);
      const fixedEnabled=current.fixed===true;
      const fixedNeedsEnable=!fixedEnabled;

      // Se o usuário já escolheu "Usar valor atual da ficha" e o vínculo continua intacto,
      // não recalcula nem volta a listar o produto. O vínculo cai automaticamente se qualquer
      // um dos dois valores mudar. Entradas novas já o invalidam no planEntry.
      const linked=currentValueLinks[id];
      if(!apply&&linked){
        if(fixedEnabled&&Number.isSafeInteger(current.cost)&&current.cost===linked.cost){
          await setTaskProgress({stage:'Confirmando vínculo já aprovado',detail:'Ficha e custo fixo permanecem iguais',percent:itemPercent(index,selected.length,0.30)});
          const linkedRecipe=await work({op:'recipe',...record});
          if(linkedRecipe.cost===linked.cost){
            await log({kind:'linked-current',id,name:p.name,cost:linked.cost,message:`${p.name}: vínculo pelo valor atual da ficha continua válido em R$ ${(linked.cost/100).toFixed(2)}.`});
            continue;
          }
        }
        delete currentValueLinks[id];
        await chrome.storage.local.set({currentValueLinks:{...currentValueLinks}});
      }
      if(apply&&itemStrategy==='recalculate'&&currentValueLinks[id]){
        delete currentValueLinks[id];
        await chrome.storage.local.set({currentValueLinks:{...currentValueLinks}});
      }

      // Registra a obrigação antes do recálculo: falha posterior não pode ocultar o Não.
      if(!apply)await chrome.storage.local.set({previewItems:fixedNeedsEnable?[...previewItems,{id,name:p.name,fixedEnabled:false,fixedNeedsEnable:true,fixedBefore:null,recipeBefore:null}]:[...previewItems]});

      // Estratégia 1: usar exatamente o valor que a ficha técnica mostra agora.
      // Não abre "Recalcular custo", não altera componentes e não salva a ficha;
      // apenas garante Custo com valor fixo = Sim e copia o total atual da ficha.
      if(apply&&itemStrategy==='current') {
        await setTaskProgress({stage:'Lendo valor atual da ficha técnica',detail:'Sem recalcular componentes',percent:itemPercent(index,selected.length,0.38)});
        const recipeCurrent=await work({op:'recipe',...record});
        const target=recipeCurrent.cost;
        const fixedChanged=fixedNeedsEnable||current.cost!==target;
        const change={
          id,name:p.name,before:current.cost,after:target,
          fixedBefore:current.cost,fixedAfter:target,
          fixedEnabled,fixedNeedsEnable,
          recipeBefore:target,recipeAfter:target,
          existingMismatch:fixedNeedsEnable||(fixedEnabled&&target!==current.cost),
          recipeChanged:false,fixedChanged,
          syncStrategy:'current'
        };
        if(!fixedChanged){
          await rememberCurrentLink(id,p.name,target);
          currentValueLinks[id]={id,name:p.name,cost:target,confirmedAt:new Date().toISOString()};
          await log({kind:'equal',id,name:p.name,cost:current.cost,message:`${p.name}: ficha atual e custo fixo já conferem em R$ ${(target/100).toFixed(2)} e o vínculo foi confirmado.`});
          await setTaskProgress({stage:'Ficha atual já confere com o custo fixo',detail:`R$ ${(target/100).toFixed(2)}`,percent:itemPercent(index,selected.length,0.95)});
          continue;
        }
        const {cancelRequested:cancel}=await chrome.storage.local.get('cancelRequested');
        if(cancel)throw new Error('Interrompido pelo usuário');
        await log({kind:'saving',...change,message:`${p.name}: copiando o valor atual da ficha para o custo fixo.`});
        await chrome.storage.local.set({progress:'Atualizando cadastro de '+p.name+' pelo valor atual da ficha'});
        const fromText=fixedEnabled?`R$ ${(current.cost/100).toFixed(2)}`:'custo fixo DESATIVADO';
        await setTaskProgress({stage:fixedNeedsEnable?'Ativando custo fixo pela ficha atual':'Copiando ficha atual para o custo fixo',detail:`${fromText} → R$ ${(target/100).toFixed(2)}`,percent:itemPercent(index,selected.length,0.80)});
        const editResult=await work({op:'edit',...record,expected:current.cost,expectedFixed:fixedEnabled,cost:target});
        await setTaskProgress({stage:'Confirmando custo fixo e valor gravado',percent:itemPercent(index,selected.length,0.94)});
        const verified=await work({op:'read',...record});
        if(verified.fixed!==true||verified.cost!==target)throw new Error('A gravação não foi confirmada: '+p.name);
        const enabledNow=fixedNeedsEnable||editResult?.enabledFixed===true;
        await rememberCurrentLink(id,p.name,target);
        currentValueLinks[id]={id,name:p.name,cost:target,confirmedAt:new Date().toISOString()};
        await log({kind:enabledNow?'fixed-enabled':'updated',...change,message:enabledNow?`${p.name}: Custo com valor fixo garantido em Sim e definido em R$ ${(target/100).toFixed(2)} pelo valor atual da ficha.`:`${p.name}: custo fixo atualizado para R$ ${(target/100).toFixed(2)} pelo valor atual da ficha.`});
        changed++;
        continue;
      }

      const blockedIds=!apply?(p.components||[]).map(c=>String(c.product?.id||'')).filter(child=>previewUnresolved.has(child)):[];
      if(!apply&&blockedIds.length){
        await setTaskProgress({stage:'Dependência aguardando correção',detail:'Valor final será confirmado após corrigir o componente',percent:itemPercent(index,selected.length,0.82)});
        const recipeCurrent=await work({op:'recipe',...record});
        const blockedNames=blockedIds.map(child=>productNames.get(child)||('Produto '+child));
        const change={id,name:p.name,before:current.cost,after:null,fixedBefore:current.cost,fixedAfter:null,fixedEnabled,fixedNeedsEnable,recipeBefore:recipeCurrent.cost,recipeAfter:null,existingMismatch:fixedNeedsEnable||(fixedEnabled&&recipeCurrent.cost!==current.cost),recipeChanged:false,fixedChanged:fixedNeedsEnable,dependencyPending:true,blockedBy:blockedNames};
        previewItems.push(change);await chrome.storage.local.set({previewItems:[...previewItems]});previewUnresolved.add(id);changed++;
        await log({kind:'difference',...change,message:`SIMULAÇÃO: ${p.name} depende de ${blockedNames.join(', ')} que precisa ser corrigido antes. Nenhuma alteração foi salva.`});
        continue;
      }
      await setTaskProgress({stage:apply?'Recalculando ficha técnica':'Simulando recálculo da ficha técnica',detail:'A ficha técnica é a referência',percent:itemPercent(index,selected.length,0.38)});
      const recipe=await work({op:'recipe',...record,recalculate:true,persist:!!apply});
      const recipeBefore=Number.isSafeInteger(recipe.beforeCost)?recipe.beforeCost:recipe.cost;
      const existingMismatch=fixedNeedsEnable||(fixedEnabled&&recipeBefore!==current.cost);
      const recipeChanged=recipe.recipeChanged===true||recipeBefore!==recipe.cost;
      const fixedChanged=fixedNeedsEnable||!fixedEnabled||recipe.cost!==current.cost;
      const suspiciousZero=recipe.suspiciousZero===true||(recipeBefore>0&&recipe.cost===0);
      const change={
        id,name:p.name,before:current.cost,after:recipe.cost,
        fixedBefore:current.cost,fixedAfter:recipe.cost,
        fixedEnabled,fixedNeedsEnable,
        recipeBefore,recipeAfter:recipe.cost,
        existingMismatch,recipeChanged,fixedChanged,suspiciousZero,
        safetyBlocked:suspiciousZero
      };
      await log({kind:'recalculated',id,name:p.name,message:`${p.name}: ${recipe.recalculated||0} componente(s) recalculado(s)${recipe.recipeSaved?' e ficha salva':''}`});
      if(recipe.recipeSaved){
        recipeSavedCount++;
        await setTaskProgress({stage:'Confirmando ficha técnica salva',percent:itemPercent(index,selected.length,0.56)});
        const savedRecipe=await work({op:'recipe',...record});
        if(savedRecipe.cost!==recipe.cost)throw new Error('O custo recalculado não persistiu na ficha '+p.name);
      }
      if(!apply){
        await setTaskProgress({stage:'Comparando ficha e custo fixo',percent:itemPercent(index,selected.length,0.82)});
        if(!existingMismatch&&!recipeChanged&&!fixedChanged&&!suspiciousZero){await log({kind:'equal',id,name:p.name,cost:current.cost});continue;}
        previewItems.push(change);await chrome.storage.local.set({previewItems:[...previewItems]});
        if(fixedChanged||suspiciousZero)previewUnresolved.add(id);
        const fixedText=fixedEnabled?`R$ ${(current.cost/100).toFixed(2)}`:'DESATIVADO';
        const detail=`Ficha R$ ${(recipeBefore/100).toFixed(2)} | custo fixo ${fixedText} | após recálculo R$ ${(recipe.cost/100).toFixed(2)}`;
        await log({kind:suspiciousZero?'safety-block':'difference',...change,message:`SIMULAÇÃO: ${p.name} — ${detail}.${suspiciousZero?' Recálculo para zero bloqueado por segurança.':''} Nada foi salvo.`});
        changed++;
        continue;
      }
      if(!fixedChanged){
        await log({kind:recipe.recipeSaved?'recipe-updated':'equal',...change,cost:current.cost,message:recipe.recipeSaved?`${p.name}: ficha recalculada/salva; o custo fixo já estava em ${(current.cost/100).toFixed(2)}.`:undefined});
        continue;
      }
      await setTaskProgress({stage:'Conferindo valor final da ficha',percent:itemPercent(index,selected.length,0.68)});
      const fresh=await work({op:'recipe',...record});
      if(fresh.cost!==recipe.cost)throw new Error('O custo da ficha mudou durante a conferência: '+p.name);
      const {cancelRequested:cancel}=await chrome.storage.local.get('cancelRequested');
      if(cancel)throw new Error('Interrompido pelo usuário');
      await log({kind:'saving',...change});
      await chrome.storage.local.set({progress:'Atualizando cadastro de '+p.name});
      const fromText=fixedEnabled?`R$ ${(current.cost/100).toFixed(2)}`:'custo fixo DESATIVADO';
      await setTaskProgress({stage:fixedNeedsEnable?'Ativando custo fixo e copiando a ficha':'Atualizando custo fixo pelo valor da ficha',detail:`${fromText} → R$ ${(recipe.cost/100).toFixed(2)}`,percent:itemPercent(index,selected.length,0.80)});
      const editResult=await work({op:'edit',...record,expected:current.cost,expectedFixed:fixedEnabled,cost:recipe.cost});
      await setTaskProgress({stage:'Confirmando custo fixo ativo e valor gravado',percent:itemPercent(index,selected.length,0.94)});
      const verified=await work({op:'read',...record});
      if(verified.fixed!==true||verified.cost!==recipe.cost)throw new Error('A gravação não foi confirmada: '+p.name);
      const enabledNow=fixedNeedsEnable||editResult?.enabledFixed===true;
      await log({kind:enabledNow?'fixed-enabled':'updated',...change,message:enabledNow?`${p.name}: Custo com valor fixo garantido em Sim e definido em R$ ${(recipe.cost/100).toFixed(2)} pela ficha técnica.`:undefined});changed++;
    }
    const finishedAt=new Date().toISOString();
    let message=apply?(mixedMode?`${changed} custo(s) processado(s) conforme as escolhas por produto e conferido(s)`:syncStrategy==='current'?`${changed} custo(s) atualizado(s) pelo valor atual das fichas e conferido(s)`:`${changed} custo(s) atualizado(s)${recipeSavedCount?` e ${recipeSavedCount} ficha(s) recalculada(s)/salva(s)`:''} e conferido(s)`):`Conferência concluída: ${changed} diferença(s). Nenhuma alteração foi salva.`;
    const storage={
      ...(apply?{previewItems:[],previewAt:null}:{previewItems,previewAt:finishedAt}),
      lastRunResult:{ok:true,mode:runMode,strategy:apply?runStrategy:null,count:changed,message,at:finishedAt}
    };
    if(autoReview){
      if(changed>0){
        const pendingApproval={
          status:'waiting',
              event:effectiveEvent,
          items:previewItems,
          count:changed,
          detectedAt:new Date().toISOString(),
          reviewedAt:finishedAt,
          lastError:null
        };
        message=`Entrada detectada: ${changed} alteração(ões) aguardam sua confirmação.`;
        storage.pendingApproval=pendingApproval;
        storage.lastRunResult.message=message;
        await log({kind:'approval-pending',message,count:changed});
        await setPendingBadge(pendingApproval);
      }else{
        message='Entrada detectada e conferida: nenhum custo precisa ser alterado.';
        storage.pendingApproval=null;
        storage.lastRunResult.message=message;
        await setPendingBadge(null);
      }
    }else if(apply){
      storage.pendingApproval=null;
      await setPendingBadge(null);
    }
    storage.progress=message;
    await log({kind:'finished',message,count:changed,mode:runMode});
    await chrome.storage.local.set(storage);
    await setTaskProgress({active:false,status:'done',percent:100,current:selected.length,total:selected.length,itemName:'',stage:apply?'Sincronização concluída':'Conferência concluída',detail:message});
  } catch(error) {
    const failedAt=new Date().toISOString();
    const storage={lastError:error.message,progress:'Precisa de atenção',lastRunResult:{ok:false,mode:runMode,message:error.message,at:failedAt}};
    if(autoReview){
      const {pendingApproval:existing=null}=await chrome.storage.local.get('pendingApproval');
      const pendingApproval={
        ...(existing||{}),
        status:'review-error',
        event:effectiveEvent,
        items:Array.isArray(existing?.items)?existing.items:[],
        count:Array.isArray(existing?.items)?existing.items.length:null,
        detectedAt:existing?.detectedAt||failedAt,
        reviewedAt:failedAt,
        lastError:error.message
      };
      storage.pendingApproval=pendingApproval;
      storage.progress='Entrada detectada, mas a conferência falhou. A pendência foi mantida.';
      await setPendingBadge(pendingApproval);
      await log({kind:'approval-error',message:storage.progress+' '+error.message});
    }else if(approval){
      const {pendingApproval:existing=null}=await chrome.storage.local.get('pendingApproval');
      if(existing){
        const pendingApproval={...existing,status:'sync-error',lastError:error.message,reviewedAt:failedAt};
        storage.pendingApproval=pendingApproval;
        storage.progress='A sincronização da pendência falhou. Ela continua pendente.';
        await setPendingBadge(pendingApproval);
      }
    }
    await chrome.storage.local.set(storage);
    await log({kind:'error',message:error.message});
    await setTaskProgress({active:false,status:'error',stage:'Operação interrompida',detail:error.message});
  } finally {clearInterval(keepAlive);await chrome.storage.local.set({running:false});}
}
async function start(job) {
  if(running){pending.push(job);return;}
  running=true;
  try {
    await chrome.storage.local.set({cancelRequested:false});
    let next=job;
    while(next){if(next.planOnly)await planEntry(next.event||null);else await execute(next);const s=await chrome.storage.local.get(['cancelRequested','lastError']);if(s.cancelRequested||s.lastError){pending=[];break;}next=pending.shift();}
  } finally {running=false;}
}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  const fromPage=sender.tab&&sender.url?.startsWith(APP+'/');
  const fromPopup=!sender.tab&&sender.url===chrome.runtime.getURL('popup.html');
  if(msg?.type==='entry'&&fromPage&&!workerTabs.has(sender.tab.id)) {
    (async()=>{
      const {automatic=false,seen=[]}=await chrome.storage.local.get(['automatic','seen']);
      const seenKey=msg.event?.key||`${msg.event?.kind||'event'}:${msg.event?.invoiceId||msg.event?.stockId||''}:${(msg.event?.productIds||[]).join(',')}`;
      if(!automatic||!seenKey||seen.includes(seenKey))return;
      if(!['movement','invoice'].includes(msg.event.kind))return;
      await chrome.storage.local.set({seen:[...seen,seenKey].slice(-500)});
      await log({kind:'entry',message:msg.event.kind==='invoice'?'Importação de nota concluída':'Movimentação de estoque concluída'});
      await chrome.storage.local.set({lastDetectedEntry:{kind:msg.event.kind,at:new Date().toISOString()},progress:'Entrada detectada. Identificando fichas afetadas sem recalcular ou salvar…'});
      await pause(2000);
      await start({planOnly:true,event:msg.event});
    })().catch(error=>log({kind:'error',message:error.message}));
    respond({ok:true});return;
  }
  if(!fromPopup)return;
  if(msg.type==='run') {
    (async()=>{
      if(running){respond({ok:false,error:'Já existe uma operação em andamento'});return;}
      const strategies=msg.strategies&&typeof msg.strategies==='object'?Object.fromEntries(Object.entries(msg.strategies).filter(([,value])=>value==='current'||value==='recalculate')):null;
      if(msg.apply===true&&strategies&&Object.keys(strategies).length){
        const {previewItems=[]}=await chrome.storage.local.get('previewItems');
        const blocked=new Set((previewItems||[]).filter(item=>item?.safetyBlocked).map(item=>String(item.id)));
        const invalid=Object.entries(strategies).find(([id,value])=>value==='recalculate'&&blocked.has(String(id)));
        if(invalid){respond({ok:false,error:'O produto selecionado para recálculo está bloqueado por segurança. Use o valor atual da ficha nesse item ou confira novamente.'});return;}
      }
      void start({apply:msg.apply===true,strategy:msg.strategy==='current'?'current':'recalculate',strategies});respond({ok:true});
    })().catch(error=>respond({ok:false,error:error.message}));return true;
  } else if(msg.type==='approvePending') {
    (async()=>{
      if(running){respond({ok:false,error:'Já existe uma operação em andamento'});return;}
      const {pendingApproval=null}=await chrome.storage.local.get('pendingApproval');
      if(!pendingApproval){respond({ok:false,error:'Não há alteração pendente para aprovar'});return;}
      if(pendingApproval.status==='review-error'){respond({ok:false,error:'A conferência da entrada falhou. Tente conferir novamente antes de sincronizar.'});return;}
      const strategy=msg.strategy==='current'?'current':'recalculate';
      await log({kind:'approval-accepted',message:strategy==='current'?'Pendência aprovada: usar valor atual das fichas.':'Pendência aprovada: atualizar cadeia, recalcular e sincronizar.'});
      void start({apply:true,event:pendingApproval.event||null,approval:true,strategy});
      respond({ok:true});
    })().catch(error=>respond({ok:false,error:error.message}));return true;
  } else if(msg.type==='deferPending') {
    (async()=>{
      const {pendingApproval=null}=await chrome.storage.local.get('pendingApproval');
      if(!pendingApproval){respond({ok:false,error:'Não há alteração pendente'});return;}
      const deferred={...pendingApproval,status:'deferred',deferredAt:new Date().toISOString()};
      await chrome.storage.local.set({pendingApproval:deferred,progress:`${deferred.items?.length||deferred.count||0} alteração(ões) continuam pendentes de aprovação.`});
      await setPendingBadge(deferred);
      await log({kind:'approval-deferred',message:'Sincronização recusada por enquanto. A pendência foi mantida.'});
      respond({ok:true});
    })().catch(error=>respond({ok:false,error:error.message}));return true;
  } else if(msg.type==='retryPending') {
    (async()=>{
      if(running){respond({ok:false,error:'Já existe uma operação em andamento'});return;}
      const {pendingApproval=null}=await chrome.storage.local.get('pendingApproval');
      if(!pendingApproval){respond({ok:false,error:'Não há entrada pendente para conferir'});return;}
      await log({kind:'approval-retry',message:'Nova conferência da pendência iniciada.'});
      void start({planOnly:true,event:null});
      respond({ok:true});
    })().catch(error=>respond({ok:false,error:error.message}));return true;
  } else if(msg.type==='stop') {
    pending=[];chrome.storage.local.set({cancelRequested:true,automatic:false}).then(async()=>{await setTaskProgress({active:false,status:'error',stage:'Interrompendo',detail:'Interrupção solicitada pelo usuário'});respond({ok:true});});return true;
  } else if(msg.type==='automatic') {
    (async()=>{
      if(msg.enabled===true){
        await chrome.storage.local.set({automatic:true,seen:[]});
        const count=await activateTabs();
        await chrome.storage.local.set({monitorMessage:`Monitor automático ativado em ${count} aba(s) do CPlug`});
        respond({ok:true,count});
      }else{
        await chrome.storage.local.set({automatic:false,monitorMessage:'Monitor automático desativado'});
        respond({ok:true,count:0});
      }
    })().catch(error=>respond({ok:false,error:error.message}));return true;
  } else if(msg.type==='monitorStatus') {
    (async()=>{
      const tabs=await chrome.tabs.query({active:true,currentWindow:true});
      const tab=tabs[0];
      if(!tab?.id||!tab.url?.startsWith(APP+'/')){respond({ok:true,active:false,message:'Abra uma aba do CPlug para verificar o monitor'});return;}
      const {automatic=false}=await chrome.storage.local.get(['automatic']);
      let result;
      try {
        result=await chrome.tabs.sendMessage(tab.id,{type:'ping'});
      } catch {}
      if(automatic&&result?.version!==VERSION) {
        await activateTabs();
        try {result=await chrome.tabs.sendMessage(tab.id,{type:'ping'});} catch {}
      }
      const active=result?.version===VERSION;
      const message=!result?'Monitor ausente nesta aba; recarregue o CPlug':result.version!==VERSION?'Aba com versão antiga; recarregue o CPlug':automatic?'Monitor ativo nesta aba':'Monitor disponível nesta aba';
      respond({ok:true,active,version:result?.version,message});
    })();return true;
  }
});
chrome.runtime.onInstalled.addListener(details=>{
  (async()=>{
    if(details.reason==='install')await chrome.storage.local.set({automatic:false,running:false,cancelRequested:false,pendingApproval:null,seen:[],progress:'Pronto para conferir os custos desta base do CPlug.',taskProgress:{active:false,status:'idle',percent:0}});
    else await chrome.storage.local.set({automatic:false,running:false,cancelRequested:false,pendingApproval:null,seen:[],progress:'Extensão atualizada para modo base única. Ative o monitor novamente quando quiser.',taskProgress:{active:false,status:'idle',percent:0}});
    await activateTabs();
    await refreshPendingBadge();
  })().catch(error=>log({kind:'monitor-error',message:error.message}));
});
chrome.runtime.onStartup.addListener(()=>Promise.all([activateTabs(),refreshPendingBadge()]).catch(error=>log({kind:'monitor-error',message:error.message})));
