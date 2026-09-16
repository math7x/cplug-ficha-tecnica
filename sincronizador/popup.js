const $=id=>document.getElementById(id);
const currency=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let strategyChoices={};
let lastPreviewAt=null;

function defaultStrategy(item){return item?.safetyBlocked?'current':'recalculate';}
function ensureChoices(items,previewAt){
  if(previewAt!==lastPreviewAt){strategyChoices={};lastPreviewAt=previewAt||null;}
  const valid=new Set(items.map(item=>String(item.id)));
  for(const id of Object.keys(strategyChoices))if(!valid.has(id))delete strategyChoices[id];
  for(const item of items){const id=String(item.id);if(!strategyChoices[id])strategyChoices[id]=defaultStrategy(item);if(item.safetyBlocked)strategyChoices[id]='current';}
}
function choiceButton(text,selected,disabled,onClick){
  const b=document.createElement('button');b.type='button';b.className='choice-btn'+(selected?' selected':'');b.textContent=text;b.disabled=!!disabled;b.setAttribute('aria-pressed',selected?'true':'false');b.onclick=onClick;return b;
}
function fillItems(container,items,{interactive=false}={}){
  container.replaceChildren();
  for(const item of items){
    const row=document.createElement('div');row.className='item';
    const name=document.createElement('strong');name.textContent=item.name||('Produto '+item.id);
    const values=document.createElement('div');values.className='values';
    if(Number.isFinite(item.recipeBefore)){
      const lineMoney=(label,value,emphasis=false)=>{const div=document.createElement('div');const l=document.createElement('span');l.textContent=label+': ';const v=document.createElement(emphasis?'strong':'span');v.textContent=currency(value);div.append(l,v);values.append(div);};
      const lineText=(label,text,emphasis=false)=>{const div=document.createElement('div');const l=document.createElement('span');l.textContent=label+': ';const v=document.createElement(emphasis?'strong':'span');v.textContent=text;div.append(l,v);values.append(div);};
      lineMoney('Ficha técnica',item.recipeBefore,true);
      if(item.fixedNeedsEnable||item.fixedEnabled===false)lineText('Custo com valor fixo','NÃO — precisa ser ativado',true);
      else if(Number.isFinite(item.fixedBefore))lineMoney('Custo fixo do produto',item.fixedBefore,item.recipeBefore!==item.fixedBefore);
      lineMoney('Opção 1 — usar ficha atual',item.recipeBefore,true);
      if(Number.isFinite(item.recipeAfter)){
        if(item.suspiciousZero)lineText('Opção 2 — recalcular',`BLOQUEADA (${currency(item.recipeAfter)})`,true);
        else lineMoney('Opção 2 — após recálculo',item.recipeAfter,true);
      }
      if(item.suspiciousZero){const note=document.createElement('div');note.className='item-note';note.textContent='⚠ O recálculo deste produto está bloqueado porque a ficha cairia para R$ 0,00. Você pode usar a ficha atual só neste item e recalcular os demais.';values.append(note);}
      else if(item.dependencyPending){const note=document.createElement('div');note.className='item-note';note.textContent='Este produto depende de '+((item.blockedBy||[]).join(', ')||'outro componente')+'. Se o componente anterior for corrigido primeiro, você pode recalcular este produto na mesma sincronização.';values.append(note);}
      else if(item.recipeAfter===item.fixedBefore&&item.recipeBefore!==item.fixedBefore){const note=document.createElement('div');note.className='item-note';note.textContent='O recálculo tende a alinhar a ficha ao custo fixo atual; a divergência existente ainda é mostrada para sua conferência.';values.append(note);}
    }else{
      values.textContent=item.fixedNeedsEnable?'Custo com valor fixo: NÃO — ativação obrigatória. Valor da ficha ainda não confirmado.':Number.isFinite(item.before)&&Number.isFinite(item.after)?`${currency(item.before)} → ${currency(item.after)}`:item.planned?'Novo custo será calculado somente após sua aprovação':'Valor ainda não conferido';
    }
    row.append(name,values);
    if(interactive&&Number.isFinite(item.recipeBefore)){
      const id=String(item.id),controls=document.createElement('div');controls.className='strategy-choice';
      const current=()=>strategyChoices[id]==='current',recalc=()=>strategyChoices[id]==='recalculate';
      const render=()=>{
        controls.replaceChildren(
          choiceButton('Usar ficha atual',current(),false,()=>{strategyChoices[id]='current';render();}),
          choiceButton(item.safetyBlocked?'Recalcular — bloqueado':'Recalcular',recalc(),!!item.safetyBlocked,()=>{strategyChoices[id]='recalculate';render();})
        );
      };
      render();row.append(controls);
    }
    container.append(row);
  }
}
function choicesFor(items){
  const out={};
  for(const item of items){const id=String(item.id);out[id]=item.safetyBlocked?'current':(strategyChoices[id]||defaultStrategy(item));}
  return out;
}
async function refresh(){
  const s=await chrome.storage.local.get(['automatic','running','progress','lastError','lastRunMode','lastRunResult','previewItems','previewAt','pendingApproval']);
  $('automatic').checked=!!s.automatic;
  let monitor=null;
  try{monitor=await chrome.runtime.sendMessage({type:'monitorStatus'});$('monitor').textContent=(monitor?.active?'✓ ':'⚠ ')+(monitor?.message||'Estado do monitor indisponível');}catch{$('monitor').textContent='⚠ Estado do monitor indisponível';}
  $('mode').textContent=s.lastRunMode==='plan'?'Última execução: DETECÇÃO SEGURA — nenhum recálculo':s.lastRunMode==='preview'?'Última execução: CONFERÊNCIA MANUAL':s.lastRunMode==='sync'?(s.lastRunResult?.strategy==='mixed'?'Última execução: SINCRONIZAÇÃO — escolhas por produto':s.lastRunResult?.strategy==='current'?'Última execução: SINCRONIZAÇÃO — valor atual da ficha':'Última execução: SINCRONIZAÇÃO — cadeia + recálculo'):'Nenhuma execução nesta versão';
  $('status').textContent=s.progress||'Pronto';$('error').textContent=s.lastError||'';$('preview').disabled=!!s.running;

  const pending=s.pendingApproval,pendingBox=$('pendingBox');
  if(pending){
    const items=Array.isArray(pending.items)?pending.items:[];pendingBox.style.display='block';fillItems($('pendingItems'),items);const count=items.length||pending.count||0;
    $('approveCurrent').disabled=!!s.running;$('approvePending').disabled=!!s.running;$('retryPending').disabled=!!s.running;$('deferPending').disabled=!!s.running;
    $('approveCurrent').style.display=pending.status==='review-error'?'none':'block';$('approvePending').style.display=pending.status==='review-error'?'none':'block';$('retryPending').style.display=pending.status==='review-error'||pending.status==='sync-error'?'block':'none';$('deferPending').style.display=pending.status==='deferred'?'none':'block';
    if(pending.status==='review-error'){$('pendingMessage').textContent='Uma entrada foi detectada, mas não foi possível concluir a conferência.';$('pendingWarning').textContent='Nada foi gravado. A pendência continua ativa; clique em Conferir novamente.';}
    else if(pending.status==='sync-error'){$('pendingMessage').textContent=`A sincronização falhou e ${count||'as'} ficha(s) continuam pendentes.`;$('pendingWarning').textContent='A pendência será mantida. A nova identificação não recalcula custos; a gravação só ocorre após uma nova aprovação.';}
    else if(pending.status==='deferred'){$('pendingMessage').textContent=count===1?'1 ficha continua pendente.':`${count} fichas continuam pendentes.`;$('pendingWarning').textContent='Você recusou por enquanto. Nenhum recálculo ou custo foi gravado e este aviso continuará aparecendo até a pendência ser resolvida.';$('approveCurrent').textContent=count?`Usar valor atual das fichas (${count})`:'Usar valor atual das fichas';$('approvePending').textContent=count?`Atualizar cadeia, recalcular e sincronizar (${count})`:'Atualizar cadeia, recalcular e sincronizar';}
    else{$('pendingMessage').textContent=count===1?'1 ficha pode ser afetada pela entrada:':`${count} fichas podem ser afetadas pela entrada:`;$('pendingWarning').textContent='Nada foi alterado ainda. Escolha abaixo entre usar o valor que a ficha mostra agora ou atualizar a cadeia de produção e recalcular antes de sincronizar.';$('approveCurrent').textContent=count?`Usar valor atual das fichas (${count})`:'Usar valor atual das fichas';$('approvePending').textContent=count?`Atualizar cadeia, recalcular e sincronizar (${count})`:'Atualizar cadeia, recalcular e sincronizar';}
  }else pendingBox.style.display='none';

  const previewItems=Array.isArray(s.previewItems)?s.previewItems:[],previewBox=$('previewBox');
  ensureChoices(previewItems,s.previewAt);
  if(s.lastRunMode==='preview'&&!pending){
    previewBox.style.display='block';
    if(s.running){$('previewCount').textContent='Conferência em andamento…';$('previewItems').replaceChildren();}
    else if(previewItems.length){$('previewCount').textContent=previewItems.length===1?'1 produto precisa ser atualizado:':`${previewItems.length} produtos precisam ser atualizados:`;fillItems($('previewItems'),previewItems,{interactive:true});}
    else{$('previewCount').textContent=s.lastRunResult?.ok?'Nenhuma diferença encontrada.':'Conferência incompleta — não foi possível confirmar as diferenças.';$('previewItems').replaceChildren();}
  }else previewBox.style.display='none';

  const canChoose=!s.running&&!pending&&s.lastRunMode==='preview'&&previewItems.length>0;
  $('allCurrent').disabled=!canChoose;$('allRecalculate').disabled=!canChoose;$('syncSelected').disabled=!canChoose;
  $('syncSelected').textContent=canChoose?`Sincronizar escolhas (${previewItems.length})`:'Sincronizar escolhas';
}
async function send(data){try{const r=await chrome.runtime.sendMessage(data);if(!r?.ok)throw new Error(r?.error||'Não foi possível iniciar');await refresh();}catch(e){$('error').textContent=e.message;}}
$('preview').onclick=()=>send({type:'run',apply:false});
$('allCurrent').onclick=async()=>{const {previewItems=[]}=await chrome.storage.local.get('previewItems');for(const item of previewItems)strategyChoices[String(item.id)]='current';await refresh();};
$('allRecalculate').onclick=async()=>{const {previewItems=[]}=await chrome.storage.local.get('previewItems');for(const item of previewItems)strategyChoices[String(item.id)]=item.safetyBlocked?'current':'recalculate';await refresh();};
$('syncSelected').onclick=async()=>{const {previewItems=[]}=await chrome.storage.local.get('previewItems');if(!previewItems.length)return;await send({type:'run',apply:true,strategies:choicesFor(previewItems)});};
$('approveCurrent').onclick=()=>send({type:'approvePending',strategy:'current'});
$('approvePending').onclick=()=>send({type:'approvePending',strategy:'recalculate'});
$('deferPending').onclick=()=>send({type:'deferPending'});
$('retryPending').onclick=()=>send({type:'retryPending'});
$('automatic').onchange=()=>send({type:'automatic',enabled:$('automatic').checked});
$('stop').onclick=()=>send({type:'stop'});
refresh();setInterval(refresh,2000);
