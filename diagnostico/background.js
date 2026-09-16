let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const internal = !sender.tab && sender.url?.startsWith(chrome.runtime.getURL(''));
  const fromCplug = sender.tab && sender.url?.startsWith('https://app.connectplug.com.br/');
  if (!(message.type === 'record' && fromCplug) && !(message.type === 'clear' && internal)) return;
  queue = queue.catch(() => {}).then(async () => {
    if (message.type === 'clear') { await chrome.storage.local.set({records: []}); return; }
    const record = message.record;
    if (!record || typeof record.path !== 'string' || JSON.stringify(record).length > 60000) return;
    const {records = []} = await chrome.storage.local.get('records');
    const signature = r => JSON.stringify([r.path, r.method, r.status, r.request, r.response]);
    const key = signature(record);
    const filtered = records.filter(r => signature(r) !== key);
    filtered.push(record);
    while (filtered.length > 100 || JSON.stringify(filtered).length > 2000000) filtered.shift();
    await chrome.storage.local.set({records: filtered});
  });
  queue.then(() => respond({ok: true}), () => respond({ok: false}));
  return true;
});
