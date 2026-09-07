import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('interface pública apresenta somente o pagamento de serviços pela InfinitePay',()=>{
  const script=readFileSync('public/app.js','utf8');
  const html=readFileSync('public/index.html','utf8');
  assert.match(script,/Pague seu serviço com clareza e segurança/);
  assert.match(script,/Serviço contratado/);
  assert.match(script,/infinitepay\/create/);
  assert.match(script,/Produtos e serviços/);
  assert.match(script,/Textos e campos da página/);
  assert.match(script,/data-product-field/);
  assert.match(html,/Checkout InfinitePay/);
  assert.doesNotMatch(script+html,/Fazer um Pix|solicitação de Pix|checkout Asaas|capital próprio|margem de 30%/i);
});
