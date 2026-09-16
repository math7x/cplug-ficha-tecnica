/* Regras independentes do navegador. Integração automática em desenvolvimento. */
(function (root) {
  'use strict';
  const validId = value => /^(?:[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value));
  function ids(items, field) {
    if (!Array.isArray(items)) return [];
    return [...new Set(items.map(item => item?.[field]).filter(validId).map(String))];
  }
  function completedEntry({url, method, status, request, response}) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.origin !== 'https://api.connectplug.com.br') return null;
    method = String(method).toUpperCase();
    // Os códigos abaixo foram observados ou representam conclusão síncrona.
    // 202 não comprova conclusão; falhas nunca iniciam a sincronização.
    if (![200, 201, 204].includes(status)) return null;
    let match = /^\/api\/v3\/stocks\/([1-9]\d*)\/movements$/.exec(parsed.pathname);
    if (method === 'POST' && match && validId(match[1])) {
      const products = [...new Set([...ids(request?.products, 'product_id'), ...ids(response?.data?.movements, 'product_id')])];
      // O valor do tipo entrada/saída ainda precisa ser validado na base de testes.
      return {kind: 'movement', stockId: match[1], productIds: products, movementType: request?.type ?? null};
    }
    match = /^\/api\/v3\/purchase-invoices\/([1-9]\d*)\/import$/.exec(parsed.pathname);
    if (method === 'PUT' && match && validId(match[1])) return {kind: 'invoice', invoiceId: match[1]};
    return null;
  }
  function affectedProducts(products, componentIds) {
    if (!Array.isArray(products)) throw new Error('Lista de produtos inválida');
    const affected = new Set(componentIds.filter(validId).map(String));
    const parents = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const product of products) {
        if (!validId(product?.id) || !Array.isArray(product.components)) continue;
        const id = String(product.id);
        if (parents.has(id)) continue;
        if (product.components.some(component => validId(component?.product?.id) && affected.has(String(component.product.id)))) {
          parents.add(id); affected.add(id); changed = true;
        }
      }
    }
    return [...parents];
  }
  const api = Object.freeze({completedEntry, affectedProducts});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CplugCostCore = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
