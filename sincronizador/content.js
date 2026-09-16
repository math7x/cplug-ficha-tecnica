(() => {
  'use strict';
  if(window.__CPLUG_COST_CONTENT_VERSION==='0.6.18')return;
  window.__CPLUG_COST_CONTENT_VERSION='0.6.18';
  const channel='CPLUG_COST_SYNC_03', origin=location.origin;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const snapshots=new Map();
  let lastSave=null, busy=false, lastTourClick=0;
  function dismissTour() {
    if(!busy||Date.now()-lastTourClick<700)return;
    if(CplugCostUI.dismissWelcome(document))lastTourClick=Date.now();
  }
  const money=value=>{
    if (!/^R\$\s*[\d.]+,\d{2}$/.test(value?.trim())) throw new Error('Valor monetário não reconhecido');
    const n=Number(value.replace(/[^\d,]/g,'').replace(',','.'));
    if (!Number.isFinite(n) || n<0) throw new Error('Custo inválido');
    return Math.round(n*100);
  };
  let cancelled=false;
  function guard() {if(cancelled)throw new Error('Interrompido pelo usuário');}
  async function wait(fn, timeout=45000, stage='carregamento da tela') { const until=Date.now()+timeout; while(Date.now()<until) { guard(); dismissTour(); const value=fn(); if(value) return value; await sleep(150); } throw new Error('Tempo esgotado: '+stage+' ('+location.pathname+')'); }
  const exact=(selector,text)=>[...document.querySelectorAll(selector)].filter(e=>e.textContent.trim()===text);
  const visible=e=>!!e&&e.getClientRects?.().length!==0&&e.getAttribute?.('aria-hidden')!=='true';
  function labelledControl(text,selector) {
    const labels=exact('label',text).filter(visible);
    if(labels.length!==1)return null;
    const label=labels[0];
    const linkedId=label.getAttribute('for');
    if(linkedId){
      const linked=document.getElementById(linkedId);
      if(linked){
        if(linked.matches?.(selector)&&visible(linked))return linked;
        const inside=[...linked.querySelectorAll?.(selector)||[]].find(visible);
        if(inside)return inside;
      }
    }
    const lr=label.getBoundingClientRect?.();
    for(let node=label.parentElement,depth=0;node&&depth<5;node=node.parentElement,depth++){
      // Não atravessar grupos de campos: um input vizinho não pertence a este rótulo.
      if([...node.querySelectorAll('label')].some(e=>e!==label&&visible(e)))return null;
      const matches=[...node.querySelectorAll(selector)].filter(e=>visible(e)&&e.getAttribute?.('type')!=='hidden');
      // PrimeVue expõe wrapper e span combobox para o mesmo campo.
      // Usa o controle interno, que contém aria-controls e o valor selecionado.
      const candidates=matches.filter(e=>!matches.some(other=>other!==e&&e.contains?.(other)));
      if(!candidates.length)continue;
      if(candidates.length===1)return candidates[0];
      if(lr){
        const ranked=candidates.map(e=>{
          const r=e.getBoundingClientRect();
          const above=r.bottom<lr.top;
          const vertical=above?10000+(lr.top-r.bottom):Math.max(0,r.top-lr.bottom);
          const horizontal=Math.abs(r.left-lr.left);
          return {e,score:vertical*20+horizontal};
        }).sort((a,b)=>a.score-b.score);
        if(ranked[0])return ranked[0].e;
      }
      return candidates[0];
    }
    return null;
  }
  function field(text) { return labelledControl(text,'input'); }
  function controlOf(text) { return labelledControl(text,'select,[role="combobox"],.p-dropdown,.p-select'); }
  function valueOf(text) {
    const control=controlOf(text);
    if(!control)return null;
    const values=[
      control.selectedOptions?.[0]?.textContent,
      control.value,
      control.getAttribute?.('data-value'),
      control.getAttribute?.('aria-valuetext'),
      control.getAttribute?.('aria-label'),
      control.querySelector?.('[data-pc-section="label"],.p-dropdown-label,.p-select-label')?.textContent,
      control.textContent
    ];
    for(const value of values){
      const clean=String(value??'').trim();
      if(clean==='Sim'||clean==='Não')return clean;
    }
    return String(control.textContent||'').trim()||null;
  }
  function fixedValue() {
    const value=valueOf('Custo com valor fixo');
    // No CPlug, o campo Valor do custo só existe quando o custo fixo está ativo.
    // Isso também serve como confirmação quando o componente visual do seletor demora a atualizar o texto.
    const costField=field('Valor do custo');
    if(value==='Sim'||value==='Não')return value;
    if(costField)return 'Sim';
    return value;
  }
  function interactionEvent(type,extra={}) {
    const init={bubbles:true,cancelable:true,composed:true,...extra};
    try {
      if(type.startsWith('pointer')&&typeof PointerEvent==='function')return new PointerEvent(type,{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerdown'?1:0,...init});
      if(['mousedown','mouseup','mousemove','mouseover'].includes(type)&&typeof MouseEvent==='function')return new MouseEvent(type,{button:0,buttons:type==='mousedown'?1:0,...init});
      if(type.startsWith('key')&&typeof KeyboardEvent==='function')return new KeyboardEvent(type,init);
    } catch {}
    return new Event(type,init);
  }
  function gestureClick(target) {
    if(!target)return false;
    try{target.scrollIntoView?.({block:'center',inline:'nearest'});}catch{}
    try{target.focus?.({preventScroll:true});}catch{try{target.focus?.();}catch{}}
    const fire=(type,extra)=>{try{return target.dispatchEvent?.(interactionEvent(type,extra));}catch{return false;}};
    // PrimeVue/CPlug pode depender do ciclo de ponteiro/mouse antes do click.
    fire('pointermove',{buttons:0});fire('mousemove',{buttons:0});fire('mouseover',{buttons:0});
    fire('pointerdown',{buttons:1});fire('mousedown',{buttons:1});
    fire('pointerup',{buttons:0});fire('mouseup',{buttons:0});
    try{target.click();return true;}catch{}
    fire('click',{button:0,buttons:0});return true;
  }
  function pressEnter(target) {
    if(!target)return;
    try{target.focus?.({preventScroll:true});}catch{}
    try{target.dispatchEvent?.(interactionEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13}));}catch{}
    try{target.dispatchEvent?.(interactionEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13}));}catch{}
  }
  async function choiceConfirmed(read,desired,timeout=1400) {
    const until=Date.now()+timeout;
    while(Date.now()<until){
      dismissTour();guard();
      if(read()===desired)return true;
      await sleep(100);
    }
    return read()===desired;
  }
  function optionFor(control,desired) {
    const selectors='[role="option"],[role="menuitem"],.p-dropdown-item,.p-select-option';
    const current=controlOf('Custo com valor fixo')||control;
    const popupId=current?.getAttribute?.('aria-controls')||current?.getAttribute?.('aria-owns')||control?.getAttribute?.('aria-controls')||control?.getAttribute?.('aria-owns');
    let scope=popupId?document.getElementById(popupId):null;
    let options=[...scope?.querySelectorAll?.(selectors)||[]].filter(e=>visible(e)&&e.getAttribute?.('aria-disabled')!=='true'&&e.textContent.trim()===desired);
    // Alguns overlays são recriados fora do nó apontado por aria-controls. Só aceita fallback global se houver um único alvo visível exato.
    if(options.length!==1){
      options=[...document.querySelectorAll(selectors)].filter(e=>visible(e)&&e.getAttribute?.('aria-disabled')!=='true'&&e.textContent.trim()===desired);
    }
    return options.length===1?options[0]:null;
  }
  async function chooseValue(text,desired) {
    const read=()=>{
      if(text!=='Custo com valor fixo')return valueOf(text);
      // Durante a troca, o texto do seletor pode ficar momentaneamente em "Não" mesmo após o CPlug montar Valor do custo.
      if(desired==='Sim'&&field('Valor do custo'))return 'Sim';
      return fixedValue();
    };
    if(read()===desired)return;
    for(let attempt=0;attempt<3;attempt++){
      let control=await wait(()=>controlOf(text),4000,'campo '+text);
      if(control.tagName==='SELECT'){
        const option=[...control.options].find(e=>e.textContent.trim()===desired&&!e.disabled);
        if(!option)throw new Error('Opção indisponível: '+desired);
        guard();control.value=option.value;control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));
        if(await choiceConfirmed(read,desired,1800))return;
        continue;
      }

      // 1) Abre o seletor com uma interação mais parecida com a do usuário.
      guard();gestureClick(control);
      const option=await wait(()=>optionFor(control,desired),3500,'opção '+desired+' de '+text);
      const inner=CplugCostUI.optionClickTarget(option,desired);

      // 2) Primeiro tenta o conteúdo interno exato com sequência pointer/mouse.
      guard();gestureClick(inner);
      if(await choiceConfirmed(read,desired,1300))return;

      // 3) Se o componente escutar eventos no item externo, tenta o contêiner da opção.
      if(option!==inner){
        guard();gestureClick(option);
        if(await choiceConfirmed(read,desired,1300))return;
      }

      // 4) Último fallback seguro: Enter no item exato já localizado.
      guard();pressEnter(inner);
      if(await choiceConfirmed(read,desired,900))return;

      // Reconsulta o seletor porque PrimeVue pode ter recriado o nó após as tentativas.
      control=controlOf(text)||control;
      if(read()===desired)return;
    }
    const control=controlOf(text);
    const popupId=control?.getAttribute?.('aria-controls')||control?.getAttribute?.('aria-owns')||'ausente';
    throw new Error('Não foi possível confirmar '+text+' = '+desired+' após 3 tentativas [valor lido: '+(fixedValue()||'não identificado')+'; campo Valor do custo: '+(field('Valor do custo')?'visível':'ausente')+'; popup: '+popupId+']');
  }
  function bridge(kind) {return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID();
    const timeout=setTimeout(()=>{snapshots.delete(id);reject(new Error('Ponte de leitura indisponível'));},4000);
    snapshots.set(id,data=>{clearTimeout(timeout);resolve(data);});
    window.postMessage({channel,kind,id},origin);
  });}
  const snapshot=()=>bridge('snapshot');
  const resetSnapshot=()=>bridge('resetSnapshot');
  window.addEventListener('message',event=>{
    if(event.source!==window || event.origin!==origin || event.data?.channel!==channel) return;
    const {kind,data}=event.data;
    if(kind==='snapshotResult'||kind==='snapshotReset') {const resolve=snapshots.get(data?.id);if(resolve){snapshots.delete(data.id);resolve(data);}}
    if(kind==='saved') lastSave={...data,at:Date.now()};
    if(kind==='entry') chrome.runtime.sendMessage({type:'entry',event:data}).catch(()=>{});
  });
  async function prepare() {
    const state=await chrome.storage.local.get('cancelRequested');
    if(typeof state.cancelRequested==='boolean')cancelled=state.cancelRequested;
    guard();dismissTour();
  }
  async function scan() {
    if(location.pathname!=='/dashboard/catalog/technical-sheets') throw new Error('Página de fichas esperada');
    await wait(()=>document.querySelector('table'),45000,'lista de fichas técnicas');

    // Bases grandes podem ter milhares de produtos em "Todos". Para sincronização de custos,
    // a extensão precisa das fichas de produção. Se a aba Produção existir, troca para ela
    // antes de paginar e limpa o que foi capturado da aba Todos.
    const production=CplugCostUI.productionTab(document);
    if(production&&!CplugCostUI.tabIsActive(production)) {
      await resetSnapshot();
      guard();production.click();
      let productionLoaded=false;
      for(let i=0;i<80;i++) {
        await sleep(250);guard();dismissTour();
        const state=await snapshot();
        if(state.listReads>0){productionLoaded=true;break;}
      }
      if(!productionLoaded)throw new Error('A aba Produção foi encontrada, mas a lista não carregou. Recarregue o CPlug e tente novamente.');
    }

    let initial;
    for(let i=0;i<30;i++){initial=await snapshot();if(initial.listReads>0)break;await sleep(200);}
    if(!initial?.listReads)throw new Error('A lista de produtos não foi capturada. Recarregue a extensão e tente novamente.');
    for(let page=0;page<200;page++) {
      guard();dismissTour();
      await sleep(300);
      const next=document.querySelector('button[aria-label="Next Page"]');
      if(!next || next.disabled) {
        const result=await snapshot();
        if(!result.products.length) throw new Error('Nenhum produto capturado');
        return result.products;
      }
      const before=(await snapshot()).listReads;
      next.click();
      let advanced=false;
      for(let i=0;i<80;i++){await sleep(250);guard();dismissTour();if((await snapshot()).listReads>before){advanced=true;break;}}
      if(!advanced)throw new Error('Falha ao avançar a lista de fichas');
    }
    throw new Error('Limite de páginas atingido. Consulta incompleta.');
  }
  function setSearchValue(input,value) {
    input.focus();
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if(setter)setter.call(input,value);else input.value=value;
    input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  async function quickSearchTarget(task) {
    const input=CplugCostUI.listSearchInput(document);
    if(!input)return null;
    const existing=CplugCostUI.recordTargets(document,task.name);
    if(existing.length>1)throw new Error('Mais de um produto com o nome '+task.name);
    if(existing.length===1)return existing[0];
    const table=document.querySelector('table');
    const initial=table?.textContent||'';
    setSearchValue(input,task.name);
    let lastText='',stable=0;
    for(let i=0;i<24;i++) {
      await sleep(i<4?200:250);guard();dismissTour();
      const matches=CplugCostUI.recordTargets(document,task.name);
      if(matches.length>1)throw new Error('Mais de um produto com o nome '+task.name);
      if(matches.length===1)return matches[0];
      const text=document.querySelector('table')?.textContent||'';
      if(text===lastText&&text!==initial)stable++;else stable=0;
      lastText=text;
      if(stable>=5)break;
    }
    throw new Error('Busca rápida não localizou '+task.name+'. Confira o carregamento da lista e tente novamente.');
  }
  async function openRecord(task) {
    const list=task.op==='recipe'?'/dashboard/catalog/technical-sheets':'/dashboard/catalog/products';
    const target=task.op==='recipe'?list+'/'+task.id:list+'/edit/'+task.id;
    if(location.pathname!==list)throw new Error('Lista inicial diferente da esperada: '+location.pathname);
    if(typeof task.name!=='string'||!task.name.trim())throw new Error('Nome do produto não informado');
    await wait(()=>document.querySelector('table'),45000,'lista para localizar '+task.name);

    // Caminho rápido: usa a caixa de busca do próprio CPlug quando ela estiver disponível.
    // Isso evita percorrer dezenas/centenas de páginas em clientes com muitos cadastros.
    const quick=await quickSearchTarget(task);
    if(quick){
      guard();quick.click();
      await wait(()=>{
        guard();
        if(location.pathname===target)return true;
        if(location.pathname!==list)throw new Error('O produto aberto não corresponde ao código '+task.id);
        return false;
      },45000,'abertura rápida de '+task.name);
      return;
    }

    // Fallback conservador para telas/versões do CPlug sem a caixa de busca reconhecida.
    for(let page=0;page<200;page++) {
      guard();dismissTour();await sleep(page?350:150);
      const matches=CplugCostUI.recordTargets(document,task.name);
      if(matches.length>1)throw new Error('Mais de um produto com o nome '+task.name);
      if(matches.length===1) {
        guard();matches[0].click();
        await wait(()=>{
          guard();
          if(location.pathname===target)return true;
          if(location.pathname!==list)throw new Error('O produto aberto não corresponde ao código '+task.id);
          return false;
        },45000,'abertura de '+task.name+' pela lista');
        return;
      }
      const next=document.querySelector('button[aria-label="Next Page"]');
      if(!next||next.disabled)throw new Error('Produto não encontrado na lista: '+task.name);
      const before=document.querySelector('table').textContent;
      next.click();
      await wait(()=>document.querySelector('table')?.textContent!==before,45000,'próxima página de produtos');
    }
    throw new Error('Limite de páginas ao localizar '+task.name);
  }
  async function confirmedAction(action,message,stage) {
    const seen=new WeakSet([...document.querySelectorAll('.p-toast-message')]);
    let success=false,error=null;
    const check=()=>{
      for(const toast of document.querySelectorAll('.p-toast-message')) {
        if(seen.has(toast))continue;
        const text=toast.querySelector('.p-toast-summary')?.textContent.trim();
        if(!text)continue;
        seen.add(toast);
        if(toast.getAttribute('data-p')==='error')error=text;
        if(text===message&&toast.getAttribute('data-p')==='success')success=true;
      }
    };
    const observer=new MutationObserver(check);
    observer.observe(document,{childList:true,subtree:true,characterData:true});
    try {
      guard();action();
      await wait(()=>{guard();check();if(error)throw new Error(error);return success;},45000,stage);
    } finally {observer.disconnect();}
  }
  function components() {
    const tables=[...document.querySelectorAll('table')].filter(t=>[...t.querySelectorAll('th')].some(h=>h.textContent.trim()==='Nome do componente'));
    if(tables.length!==1)throw new Error('Tabela de componentes não identificada');
    const table=tables[0],head=[...table.querySelectorAll('th')].map(e=>e.textContent.trim());
    const nameIndex=head.indexOf('Nome do componente');
    const rows=[...table.querySelectorAll('tbody tr')].filter(r=>r.querySelector('input[placeholder="Custo"]'));
    if(!rows.length)throw new Error('Nenhum componente editável encontrado para recalcular');
    return rows.map(row=>({row,name:row.cells[nameIndex]?.textContent.trim(),quantity:row.querySelector('input[placeholder="Quantidade"]')?.value,cost:money(row.querySelector('input[placeholder="Custo"]').value)}));
  }
  async function recalculate(task) {
    const before=components();
    const signature=items=>JSON.stringify(items.map(i=>[i.name,i.quantity]));
    for(let i=0;i<before.length;i++) {
      guard();dismissTour();
      const current=components();
      if(signature(current)!==signature(before))throw new Error('A composição mudou durante o recálculo');
      const button=current[i].row.querySelector('button[data-testid="more-vertical"]');
      if(!button||button.disabled)throw new Error('Menu indisponível para '+current[i].name);
      let action=null;
      for(let attempt=0;attempt<3&&!action;attempt++) {
        guard();dismissTour();
        const latest=components();
        if(signature(latest)!==signature(before))throw new Error('A composição mudou durante a abertura do menu');
        const trigger=latest[i].row.querySelector('button[data-testid="more-vertical"]');
        if(!trigger||trigger.disabled)throw new Error('Menu indisponível para '+current[i].name);
        if(!CplugCostUI.recalculateAction(document))trigger.click();
        for(let n=0;n<12&&!action;n++){await sleep(250);guard();dismissTour();action=CplugCostUI.recalculateAction(document);}
      }
      if(!action)throw new Error('Não foi possível abrir Recalcular custo de '+current[i].name+' após 3 tentativas');
      await confirmedAction(()=>action.click(),'Custo atualizado com o custo médio do insumo','recálculo de '+current[i].name);
      await wait(()=>!CplugCostUI.recalculateAction(document),15000,'fechamento do menu do componente');
      await sleep(250);
    }
    const after=components();
    if(signature(before)!==signature(after))throw new Error('A composição mudou durante o recálculo');
    const changed=before.some((item,i)=>item.cost!==after[i].cost);
    return {recalculated:before.length,recipeChanged:changed,recipeSaved:false};
  }
  async function recipe(id,task={}) {
    if(location.pathname!=='/dashboard/catalog/technical-sheets/'+id)throw new Error('Ficha diferente da solicitada');
    await wait(()=>document.querySelector('[data-testid="dashboard-catalog-technical-sheet-calculator-input-total-cost"]'),45000,'custo total da ficha '+id);
    const total=()=>money(document.querySelector('[data-testid="dashboard-catalog-technical-sheet-calculator-input-total-cost"]')?.value);
    const beforeCost=total();
    const result=task.recalculate?await recalculate(task):{};
    if(task.recalculate)await sleep(250);guard();
    const cost=total();await sleep(150);guard();
    if(total()!==cost)throw new Error('Custo ainda está mudando; execute novamente');
    const suspiciousZero=beforeCost>0&&cost===0;
    let recipeSaved=false;
    if(task.persist&&result.recipeChanged) {
      if(suspiciousZero)throw new Error('O recálculo zeraria uma ficha que antes tinha custo. Gravação bloqueada para revisão dos componentes.');
      const save=await wait(()=>{const buttons=exact('button','Salvar');return buttons.length===1&&!buttons[0].disabled?buttons[0]:null;},15000,'Salvar ficha recalculada');
      await confirmedAction(()=>save.click(),'Ficha técnica atualizada com sucesso!','confirmação da ficha recalculada');
      await wait(()=>document.querySelector('input[placeholder="Custo"]'),45000,'componentes após salvar ficha');
      recipeSaved=true;
    }
    return {cost,beforeCost,name:document.querySelector('h1')?.textContent.trim(),...result,recipeSaved,suspiciousZero};
  }
  async function stock(id) {
    if(location.pathname!=='/dashboard/catalog/products/edit/'+id)throw new Error('Produto diferente do solicitado');
    await wait(()=>document.querySelector('[data-testid="tab-item-Estoque"]'),45000,'aba Estoque do produto '+id);
    let lastTabClick=-Infinity,clicks=0,fixed;
    try {
      fixed=await wait(()=>{
        const tab=document.querySelector('[data-testid="tab-item-Estoque"]');
        if(!tab||!visible(tab))return null;
        const selected=tab.getAttribute('aria-selected');
        if(selected==='false'||(selected===null&&clicks===0)){
          if(Date.now()-lastTabClick>=600&&clicks<4){
            dismissTour();guard();lastTabClick=Date.now();clicks++;tab.click();
          }
          // Não lê controles pertencentes ao painel anterior.
          if(selected==='false')return null;
        }
        const value=fixedValue();
        return value==='Sim'||value==='Não'?value:null;
      },8000,'estado de Custo com valor fixo do produto '+id);
    } catch(error) {
      if(cancelled)throw error;
      const tab=document.querySelector('[data-testid="tab-item-Estoque"]');
      const labels=exact('label','Custo com valor fixo').filter(visible).length;
      throw new Error(error.message+' [Estoque ativo: '+(tab?.getAttribute('aria-selected')||'indefinido')+'; rótulos visíveis: '+labels+'; seletor: '+(valueOf('Custo com valor fixo')||'não identificado')+']');
    }
    guard();
    if(fixed==='Não')return {fixed:false,cost:null};
    const el=await wait(()=>field('Valor do custo'),8000,'campo Valor do custo do produto '+id);
    return {fixed:true,el,cost:money(el.value)};
  }
  async function edit(task) {
    let state=await stock(task.id);
    const wasFixed=state.fixed===true;
    // Regra obrigatória: toda ficha tratada deve terminar com Custo com valor fixo = Sim.
    // Se o seletor mudou para Não desde a conferência, não cancela: reativa e corrige pelo valor da ficha.
    // A proteção contra alteração concorrente do VALOR continua somente quando ele estava e permanece fixo.
    if(task.expectedFixed===true&&state.fixed===true&&task.expected!==state.cost)throw new Error('O custo mudou desde a conferência; gravação cancelada para evitar sobrescrever uma alteração simultânea');
    if(state.fixed&&state.cost===task.cost)return {cost:state.cost,fixed:true,unchanged:true,enabledFixed:false};
    if(exact('button','Salvar').length)throw new Error('Cadastro já contém alterações pendentes');
    if(!Number.isSafeInteger(task.cost)||task.cost<0)throw new Error('Custo de destino inválido');
    guard();lastSave=null;
    if(!state.fixed){
      await chooseValue('Custo com valor fixo','Sim');
      const el=await wait(()=>field('Valor do custo'),15000,'campo Valor do custo após ativar custo fixo');
      state={fixed:true,el,cost:null};
    }
    const el=state.el||field('Valor do custo');
    if(!el)throw new Error('Campo Valor do custo não apareceu após ativar custo fixo');
    const desired=(task.cost/100).toFixed(2).replace('.',',');
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,desired);
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:desired}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.blur();
    await sleep(700);guard();
    if(money(el.value)!==task.cost)throw new Error('O campo não aceitou o custo esperado');
    const save=await wait(()=>{const b=exact('button','Salvar');return b.length===1&&!b[0].disabled?b[0]:null;},45000,'botão Salvar do produto '+task.id);
    guard();save.click();
    await wait(()=>lastSave&&String(lastSave.id)===String(task.id),45000,'resposta da gravação do produto '+task.id);
    if(lastSave.status<200||lastSave.status>=300)throw new Error('CPlug recusou a gravação (HTTP '+lastSave.status+')');
    await wait(()=>location.pathname==='/dashboard/catalog/products'||!exact('button','Salvar').length,45000,'finalização do cadastro '+task.id);
    return {cost:task.cost,fixed:true,saved:true,enabledFixed:!wasFixed};
  }
  // Barra global de progresso: aparece em qualquer aba do CPlug, inclusive nas abas temporárias abertas pela extensão.
  let progressHost=null, progressHideTimer=null;
  function progressUi(){
    if(progressHost?.isConnected)return progressHost.shadowRoot;
    if(!document.documentElement)return null;
    progressHost=document.createElement('div');
    progressHost.id='cplug-cost-progress-host';
    progressHost.style.cssText='all:initial;position:fixed;z-index:2147483647;top:14px;left:50%;transform:translateX(-50%);width:min(540px,calc(100vw - 28px));pointer-events:none;';
    const root=progressHost.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      *{box-sizing:border-box} .card{font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#17191e;color:#f5f7fa;border:1px solid #3b414c;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:11px 13px;opacity:0;transform:translateY(-8px);transition:opacity .16s ease,transform .16s ease}
      .card.show{opacity:1;transform:translateY(0)} .card.pending{border-color:#d97706}.card.error{border-color:#d05b5b}.card.done{border-color:#4b9b69}
      .top{display:flex;align-items:center;justify-content:space-between;gap:10px}.title{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.counter{font-size:12px;color:#c7ccd5;white-space:nowrap}.stage{margin-top:5px;color:#e9ecf1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.detail{margin-top:2px;color:#9fa7b4;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .track{height:7px;background:#2b3038;border-radius:99px;overflow:hidden;margin-top:9px}.fill{height:100%;width:0;background:#00a4dd;border-radius:99px;transition:width .22s ease}.pending .fill{background:#d97706}.error .fill{background:#d05b5b}.done .fill{background:#4b9b69}
    </style><div class="card"><div class="top"><div class="title"></div><div class="counter"></div></div><div class="stage"></div><div class="detail"></div><div class="track"><div class="fill"></div></div></div>`;
    document.documentElement.appendChild(progressHost);
    return root;
  }
  function recentProgress(progress){
    if(!progress?.updatedAt)return false;
    const age=Date.now()-Date.parse(progress.updatedAt);
    return Number.isFinite(age)&&age>=0&&age<4500;
  }
  function renderProgress(progress,pendingApproval){
    const root=progressUi();if(!root)return;
    const card=root.querySelector('.card'),title=root.querySelector('.title'),counter=root.querySelector('.counter'),stage=root.querySelector('.stage'),detail=root.querySelector('.detail'),fill=root.querySelector('.fill'),track=root.querySelector('.track');
    clearTimeout(progressHideTimer);
    const running=!!progress?.active;
    const transient=!running&&['done','error'].includes(progress?.status)&&recentProgress(progress);
    const pending=!!pendingApproval&&!running&&!transient;
    if(!running&&!transient&&!pending){card.className='card';return;}
    card.className='card show'+(pending?' pending':progress?.status==='error'?' error':progress?.status==='done'?' done':'');
    if(pending){
      const count=Array.isArray(pendingApproval.items)?pendingApproval.items.length:(pendingApproval.count||0);
      title.textContent='⚠ Entrada aguardando aprovação';
      counter.textContent=count?`${count} ficha${count===1?'':'s'}`:'';
      stage.textContent=pendingApproval.status==='deferred'?'Pendente — você recusou por enquanto':'Abra a extensão para revisar antes de sincronizar';
      detail.textContent='Nenhum custo será alterado sem sua aprovação.';
      fill.style.width='100%';track.style.display='block';
      return;
    }
    const pct=Math.max(0,Math.min(100,Number(progress?.percent)||0));
    title.textContent=progress?.title||'Custos das fichas técnicas';
    counter.textContent=progress?.total?`${Math.min(progress.current||0,progress.total)} de ${progress.total} • ${pct}%`:`${pct}%`;
    stage.textContent=progress?.itemName?`${progress.stage||'Processando'} — ${progress.itemName}`:(progress?.stage||'Processando…');
    detail.textContent=progress?.detail||'';
    fill.style.width=pct+'%';track.style.display='block';
    if(transient)progressHideTimer=setTimeout(()=>{card.className='card';},Math.max(250,4500-(Date.now()-Date.parse(progress.updatedAt))));
  }
  async function refreshProgress(){
    try{const state=await chrome.storage.local.get(['taskProgress','pendingApproval']);renderProgress(state.taskProgress,state.pendingApproval);}catch{}
  }
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.cancelRequested)cancelled=changes.cancelRequested.newValue===true;
    if(area==='local'&&(changes.taskProgress||changes.pendingApproval))refreshProgress();
  });
  if(document.documentElement)refreshProgress();else document.addEventListener('DOMContentLoaded',refreshProgress,{once:true});

  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.type==='ping'){respond({ok:true,version:'0.6.18'});return;}
    if(message?.type!=='work')return;
    if(busy){respond({ok:false,error:'Aba ocupada'});return;}
    busy=true;
    const task=message.task;
    const tourObserver=new MutationObserver(dismissTour);
    tourObserver.observe(document,{childList:true,subtree:true});
    const tourTimer=setInterval(dismissTour,750);
    (async()=>{
      await prepare();
      if(task.op==='scan')return await scan();
      if(!/^[1-9]\d*$/.test(String(task.id)))throw new Error('Código inválido');
      await openRecord(task);
      if(task.op==='recipe')return await recipe(task.id,task);
      if(task.op==='read'){const state=await stock(task.id);return {fixed:state.fixed,cost:state.cost};}
      if(task.op==='edit')return await edit(task);
      throw new Error('Operação desconhecida');
    })().then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message})).finally(()=>{clearInterval(tourTimer);tourObserver.disconnect();busy=false;});
    return true;
  });
})();
