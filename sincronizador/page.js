(() => {
  'use strict';
  if(window.__CPLUG_COST_PAGE_VERSION==='0.6.18')return;
  window.__CPLUG_COST_PAGE_VERSION='0.6.18';
  const origin = location.origin, channel = 'CPLUG_COST_SYNC_03';
  const products = new Map();
  let listReads = 0;
  function notify(kind, data) { window.postMessage({channel,kind,data},origin); }
  function receive(url, method, status, request, response) {
    let parsed;
    try { parsed = new URL(url,origin); } catch { return; }
    if (parsed.origin !== 'https://api.connectplug.com.br') return;
    if (method === 'GET' && parsed.pathname === '/api/v3/products' && status === 200 && Array.isArray(response?.data?.products)) {
      for (const p of response.data.products) {
        products.set(String(p.id), {id:p.id,name:p.name,components:(p.components || []).map(c=>({product:{id:c.product?.id}}))});
      }
      listReads++;
    }
    const entry = CplugCostCore.completedEntry({url:parsed.href,method,status,request,response});
    if (entry) {
      const movementIds = response?.data?.movements?.map(m=>m.id).filter(Boolean) || [];
      const key = entry.kind === 'invoice' ? 'invoice:'+entry.invoiceId : movementIds.length ? 'movements:'+movementIds.join(',') : crypto.randomUUID();
      notify('entry',{...entry,key});
    }
    if (method === 'PUT' && /^\/api\/v3\/products\/[1-9]\d*$/.test(parsed.pathname)) notify('saved',{id:parsed.pathname.split('/').pop(),status});
  }
  function json(value) { try { return JSON.parse(value); } catch { return null; } }
  const fetchOriginal = window.fetch;
  window.fetch = function(input, init) {
    let copy;
    try { if (input instanceof Request && init?.body === undefined) copy = input.clone(); } catch {}
    const promise = fetchOriginal.apply(this,arguments);
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    if (url && /\/api\/v3\/(products|stocks|purchase-invoices)(\/|\?|$)/.test(url)) {
      promise.then(async r => {
        try {
          const req = copy ? json(await copy.text()) : json(init?.body);
          const response = r.status === 204 ? null : r.headers.get('content-type')?.includes('json') ? await r.clone().json() : null;
          receive(url,method,r.status,req,response);
        } catch {}
      }).catch(()=>{});
    }
    return promise;
  };
  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  const metadata = new WeakMap();
  XMLHttpRequest.prototype.open = function(method,url) { const result=open.apply(this,arguments); metadata.set(this,{method:String(method).toUpperCase(),url}); return result; };
  XMLHttpRequest.prototype.send = function(body) {
    const meta = metadata.get(this);
    if (meta) this.addEventListener('load',()=>{
      try { receive(meta.url,meta.method,this.status,json(body),this.responseType === 'json' ? this.response : json(this.responseText)); } catch {}
    },{once:true});
    return send.apply(this,arguments);
  };
  window.addEventListener('message',event=>{
    if (event.source!==window || event.origin!==origin || event.data?.channel!==channel) return;
    if(event.data.kind==='resetSnapshot') {
      products.clear();listReads=0;
      notify('snapshotReset',{id:event.data.id});
      return;
    }
    if(event.data.kind==='snapshot')notify('snapshotResult',{id:event.data.id,products:[...products.values()],listReads});
  });
})();
