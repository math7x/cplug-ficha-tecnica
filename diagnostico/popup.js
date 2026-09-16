async function refresh() {
  const {records = []} = await chrome.storage.local.get('records');
  document.getElementById('status').textContent = `${records.length} estruturas de operações registradas`;
  return records;
}
document.getElementById('export').onclick = async () => {
  const records = await refresh();
  const blob = new Blob([JSON.stringify({version: 1, records}, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'diagnostico-cplug-custos.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
document.getElementById('clear').onclick = async () => { await chrome.runtime.sendMessage({type:'clear'}); await refresh(); };
refresh();
