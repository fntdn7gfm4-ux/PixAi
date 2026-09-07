import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutUrl,verifiedPayment} from '../server/infinitepay.mjs';
import {harness} from './helpers.mjs';

test('valida URLs e confirmação retornadas pelo Checkout InfinitePay',()=>{
  assert.equal(checkoutUrl('https://checkout.infinitepay.com.br/lucas-banza?lenc=x'),'https://checkout.infinitepay.com.br/lucas-banza?lenc=x');
  assert.throws(()=>checkoutUrl('https://example.com/falso'));
  assert.equal(verifiedPayment({success:true,paid:true,amount:1500,paid_amount:1510,installments:2,capture_method:'credit_card'},1500),true);
  assert.equal(verifiedPayment({success:true,paid:true,amount:1499,paid_amount:1510,installments:2,capture_method:'credit_card'},1500),false);
});

test('configuração InfinitePay usa a InfiniteTag do ambiente e exige autorização administrativa',async()=>{
  const h=harness();h.env.INFINITEPAY_HANDLE='lucas-banza';h.env.INFINITEPAY_ENABLED='false';
  const c=h.client();
  assert.equal((await c('infinitepay/admin/config')).status,401);
  const initial=await c('infinitepay/admin/config',{admin:true});
  assert.equal(initial.data.value.handle,'lucas-banza');
  assert.equal(initial.data.serverEnabled,false);
  const saved=await c('infinitepay/admin/config',{method:'PUT',admin:true,headers:{origin:'https://pixai.test'},body:{revision:0,value:{handle:'lucas-banza',pricingReference:'tarifas conferidas em 07/09/2026',receivingPlan:'recebimento em 1 dia útil',serviceDeadline:'Pix manual após confirmação do saldo',enabled:false}}});
  assert.equal(saved.status,200);
  assert.equal(saved.data.value.handle,'lucas-banza');
  assert.equal(saved.data.revision,1);
  assert.equal((await c('infinitepay/admin/operations',{admin:true})).data.operations.length,0);
});
