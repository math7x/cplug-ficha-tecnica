(function(root){
  'use strict';
  function dismissWelcome(doc) {
    const tooltip=doc.querySelector('.introjs-tooltip');
    if(!tooltip)return false;
    const title=tooltip.querySelector('.introjs-tooltip-title');
    const skip=tooltip.querySelector('.introjs-skipbutton[role="button"]')||tooltip.querySelector('.introjs-skipbutton');
    if(title?.textContent.trim()!=='Bem-vindo(a)!'||!skip||skip.disabled||skip.getAttribute('aria-disabled')==='true')return false;
    skip.click();return true;
  }
  function recordTargets(doc,name) {
    return [...doc.querySelectorAll('table td, table td *')].filter(e=>e.textContent.trim()===name&&![...e.children].some(child=>child.textContent.trim()===name));
  }
  function recalculateAction(doc) {
    const menus=[...doc.querySelectorAll('[role="menuitem"][aria-label="Recalcular custo"]')].filter(e=>e.getClientRects().length&&e.getAttribute('aria-disabled')!=='true');
    const matches=menus.flatMap(menu=>[...menu.querySelectorAll('span')].filter(e=>e.textContent.trim()==='Recalcular custo'&&e.getClientRects().length));
    return matches.length===1?matches[0]:null;
  }
  function listSearchInput(doc) {
    const inputs=[...doc.querySelectorAll('input')].filter(e=>e.getClientRects?.().length!==0&&!e.disabled);
    return inputs.find(input=>{
      const placeholder=(input.getAttribute('placeholder')||'').toLocaleLowerCase('pt-BR');
      return placeholder.includes('busque por nome')||placeholder.includes('buscar por nome')||placeholder.includes('nome, código')||placeholder.includes('nome, codigo');
    })||null;
  }
  function productionTab(doc) {
    const candidates=[...doc.querySelectorAll('[role="tab"],button,a')].filter(e=>e.getClientRects?.().length!==0&&e.textContent.trim()==='Produção');
    return candidates.length===1?candidates[0]:null;
  }
  function tabIsActive(tab) {
    if(!tab)return false;
    if(tab.getAttribute?.('aria-selected')==='true'||tab.getAttribute?.('data-p-active')==='true'||tab.getAttribute?.('data-state')==='active')return true;
    const classes=String(tab.className||'')+' '+String(tab.parentElement?.className||'');
    return /(?:^|\s)(?:active|p-highlight|p-tab-active)(?:\s|$)/i.test(classes);
  }
  function optionClickTarget(option,desired) {
    // O CPlug usa conteúdo customizado dentro do li do PrimeVue.
    // O clique deve atravessar esse conteúdo, não começar no li externo.
    const labels=[...option.querySelectorAll('span')].filter(e=>
      e.textContent.trim()===desired&&e.getClientRects?.().length!==0&&
      ![...e.children].some(child=>child.textContent.trim()===desired));
    if(labels.length===1)return labels[0];
    if(labels.length>1)throw new Error('Opção ambígua: '+desired);
    return option;
  }
  const api={dismissWelcome,recordTargets,recalculateAction,listSearchInput,productionTab,tabIsActive,optionClickTarget};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.CplugCostUI=api;
})(globalThis);
