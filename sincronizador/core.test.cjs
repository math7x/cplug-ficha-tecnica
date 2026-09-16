const test = require('node:test');
const assert = require('node:assert/strict');
const {completedEntry, affectedProducts} = require('./core.js');
const invoice = {url:'https://api.connectplug.com.br/api/v3/purchase-invoices/42/import',method:'PUT',status:204};
test('somente conclusão bem-sucedida da nota inicia evento', () => {
  assert.deepEqual(completedEntry(invoice),{kind:'invoice',invoiceId:'42'});
  for (const status of [202,400,401,403,422,500]) assert.equal(completedEntry({...invoice,status}),null);
  for (const suffix of ['', '/items', '/prepare-items', '/info']) assert.equal(completedEntry({...invoice,url:'https://api.connectplug.com.br/api/v3/purchase-invoices/42'+suffix}),null);
  assert.equal(completedEntry({...invoice,method:'GET'}),null);
  assert.equal(completedEntry({...invoice,url:invoice.url.replace('api.connectplug.com.br','example.com')}),null);
});
test('movimentação reúne códigos válidos sem duplicar', () => {
  const event=completedEntry({url:'https://api.connectplug.com.br/api/v3/stocks/2/movements',method:'POST',status:201,request:{products:[{product_id:3},{product_id:3},{product_id:null},{product_id:'bad'}]},response:{data:{movements:[{product_id:4}]}}});
  assert.deepEqual(event.productIds,['3','4']);
  assert.equal(event.stockId,'2');
});
test('localiza múltiplos pais e fichas encadeadas sem entrar em ciclo', () => {
  const products=[{id:10,components:[{product:{id:1}}]},{id:11,components:[{product:{id:1}}]},{id:12,components:[{product:{id:10}}]},{id:20,components:[{product:{id:21}}]},{id:21,components:[{product:{id:20}}]}];
  assert.deepEqual(affectedProducts(products,[1]),['10','11','12']);
  assert.deepEqual(affectedProducts(products,[20]),['21','20']);
  assert.deepEqual(affectedProducts(products,[99]),[]);
});
