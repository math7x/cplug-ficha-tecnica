(() => {
  'use strict';
  if (window.__cplugCostDiagnostic) return;
  window.__cplugCostDiagnostic = true;
  const channel = 'CPLUG_COST_SCHEMA_V1';
  const origin = location.origin;
  const sensitive = /token|password|senha|authorization|cookie|secret|email|cpf|cnpj|address|telefone|phone/i;
  function shape(value, depth = 0) {
    if (value === null) return null;
    if (depth > 7) return '[profundidade limitada]';
    if (Array.isArray(value)) return {type: 'array', sample: value.slice(0, 2).map(v => shape(v, depth + 1))};
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 100).map(([k, v]) => [k, sensitive.test(k) ? '[omitido]' : shape(v, depth + 1)]));
    // Nenhum valor de campo é exportado: apenas seu tipo.
    return typeof value;
  }
  function bodyShape(body) {
    if (body == null) return '[sem corpo]';
    if ((typeof FormData !== 'undefined' && body instanceof FormData) || (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)) {
      return Object.fromEntries([...body.entries()].slice(0, 100).map(([key, value]) => [key, sensitive.test(key) ? '[omitido]' : typeof value === 'string' ? 'string' : '[arquivo omitido]']));
    }
    if (typeof body !== 'string' || body.length > 1500000) return '[corpo não analisado]';
    try { return shape(JSON.parse(body)); } catch { return '[não JSON]'; }
  }
  function target(raw) {
    try {
      const u = new URL(raw, origin);
      if (u.origin !== 'https://api.connectplug.com.br' && u.origin !== origin) return null;
      if (!u.pathname.startsWith('/api/') || !/technical|recipe|composition|product|stock|purchase|invoice|movement|ingredient|item|production/i.test(u.pathname)) return null;
      return {path: u.pathname.replace(/\b\d+\b/g, ':id').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid'), queryKeys: [...new Set(u.searchParams.keys())].filter(k => !sensitive.test(k))};
    } catch { return null; }
  }
  function emit(meta, method, request, status, response) {
    try {
      const record = {at: new Date().toISOString(), page: location.pathname.replace(/\b\d+\b/g, ':id'), ...meta, method, status, request, response};
      if (JSON.stringify(record).length < 60000) window.postMessage({channel, record}, origin);
    } catch {}
  }
  const previousFetch = window.fetch;
  window.fetch = function(input, init) {
    let requestCopy;
    try { if (!init?.body && typeof Request !== 'undefined' && input instanceof Request) requestCopy = input.clone(); } catch {}
    const result = previousFetch.apply(this, arguments);
    try {
      const meta = target(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
      if (meta) {
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        let request = bodyShape(init?.body);
        result.then(async response => {
          try {
            if (requestCopy) {
              request = '[sem corpo]';
              if (requestCopy.body) {
                const rr = requestCopy.body.getReader(), decoder = new TextDecoder();
                let size = 0, text = '', limited = false;
                while (true) {
                  const part = await rr.read();
                  if (part.done) break;
                  size += part.value.byteLength;
                  if (size > 1500000) { rr.cancel().catch(() => {}); limited = true; break; }
                  text += decoder.decode(part.value, {stream:true});
                }
                request = limited ? '[corpo grande]' : bodyShape(text + decoder.decode());
              }
            }
            if (!response.body || response.status === 204) { emit(meta, method, request, response.status, '[resposta vazia]'); return; }
            if (!response.headers.get('content-type')?.includes('json')) { emit(meta, method, request, response.status, '[resposta não JSON]'); return; }
            const reader = response.clone().body.getReader();
            const decoder = new TextDecoder();
            let total = 0, contents = '';
            while (true) {
              const {done, value} = await reader.read();
              if (done) break;
              total += value.byteLength;
              if (total > 1500000) { reader.cancel().catch(() => {}); emit(meta, method, request, response.status, '[resposta grande]'); return; }
              contents += decoder.decode(value, {stream: true});
            }
            contents += decoder.decode();
            emit(meta, method, request, response.status, bodyShape(contents));
          } catch { emit(meta, method, request, response.status, '[resposta não analisada]'); }
        }).catch(() => {});
      }
    } catch {}
    return result;
  };
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  const metadata = new WeakMap();
  XMLHttpRequest.prototype.open = function(method, url) {
    const result = open.apply(this, arguments);
    metadata.set(this, {meta: target(url), method: String(method).toUpperCase()});
    return result;
  };
  XMLHttpRequest.prototype.send = function(body) {
    const entry = metadata.get(this);
    if (entry?.meta) this.addEventListener('load', () => {
      try {
        const response = this.status === 204 ? '[resposta vazia]' : !this.getResponseHeader('content-type')?.includes('json') ? '[resposta não JSON]' : this.responseType === 'json' ? shape(this.response) : bodyShape(this.responseText);
        emit(entry.meta, entry.method, bodyShape(body), this.status, response);
      } catch {}
    }, {once: true});
    return send.apply(this, arguments);
  };
})();
