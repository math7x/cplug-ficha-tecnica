window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'CPLUG_COST_SCHEMA_V1') return;
  const record = event.data.record;
  if (!record || typeof record.path !== 'string' || !record.path.startsWith('/api/') || JSON.stringify(record).length > 60000) return;
  chrome.runtime.sendMessage({type: 'record', record}).catch(() => {});
});
