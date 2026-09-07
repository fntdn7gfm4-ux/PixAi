import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutUrl,verifiedPayment} from '../server/infinitepay.mjs';
import {harness} from './helpers.mjs';

test('valida URLs e confirmação retornadas pelo Checkout InfinitePay',()=>{
  assert.equal(checkoutUrl('https://checkout.infinitepay.com.br/lucas-banza?lenc=x'),'https://checkout.infinitepay.com.br/lucas-banza?lenc=x');
  assert.throws(()=>checkoutUrl('https://example.com/falso'));
  assert.equal(verifiedPayment({success:true,paid:true,amount:1500,paid_amount:1510,installments:2,capture_method:'credit_card'},1500),true);
  assert.equal(verifiedPayment({success:true,paid:true,amount:1499,paid_amount:1510,installments:2,capture_method:'credit_card'},1500),false);
  assert.equal(verifiedPayment({success:true,paid:true,amount:1500,paid_amount:1500,installments:1,capture_method:'pix'},1500),false);
});

test('fluxo público InfinitePay limita valores, preserva margem e cria checkout hospedado',async()=>{
  const h=harness(),c=h.client();
  Object.assign(h.env,{INFINITEPAY_HANDLE:'lucas-banza',INFINITEPAY_ENABLED:'true',INFINITEPAY_APPROVAL_REF:'IP-2314a3254x83',INFINITEPAY_MIN_AMOUNT_CENTS:'2000',INFINITEPAY_MAX_AMOUNT_CENTS:'25000',INFINITEPAY_GATEWAY_RATE_PPM:'155000',INFINITEPAY_MIN_MARGIN_PPM:'300000',INFINITEPAY_PRICING_REFERENCE:'amostra 200/240/169',INFINITEPAY_RECEIVING_PLAN:'na hora',INFINITEPAY_SERVICE_DEADLINE:'teste controlado',INFINITEPAY_TEST_MODE:'true',INFINITEPAY_TEST_ACCESS_CODE:'codigo-de-teste-com-pelo-menos-32-caracteres',PUBLIC_BASE_URL:'https://pixai.test',PII_ENCRYPTION_KEY:Buffer.alloc(32,8).toString('base64')});
  assert.equal((await c('infinitepay/quote',{method:'POST',headers:{origin:'https://pixai.test'},body:{pixAmount:20000}})).status,401);
  const accessHeaders={origin:'https://pixai.test','x-test-access-code':h.env.INFINITEPAY_TEST_ACCESS_CODE};
  assert.equal((await c('infinitepay/quote',{method:'POST',headers:accessHeaders,body:{pixAmount:1999}})).status,400);
  const quoted=await c('infinitepay/quote',{method:'POST',headers:accessHeaders,body:{pixAmount:20000}});
  assert.equal(quoted.status,200);assert.equal(quoted.data.quote.totalCharge,36790);assert.ok(quoted.data.quote.margin>=0.3);
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>new Response(JSON.stringify({url:'https://checkout.infinitepay.com.br/lucas-banza?lenc=teste'}),{status:200,headers:{'content-type':'application/json'}});
  try {
    const created=await c('infinitepay/create',{method:'POST',key:crypto.randomUUID(),headers:accessHeaders,body:{pixAmount:20000,totalCharge:quoted.data.quote.totalCharge,pricingRevision:quoted.data.pricingRevision,name:'Pessoa de Teste',cpf:'52998224725',confirmed:true}});
    assert.equal(created.status,201);assert.match(created.data.checkoutUrl,/^https:\/\/checkout\.infinitepay\.com\.br/);assert.ok(created.data.accessToken.length>=32);
  } finally { globalThis.fetch=oldFetch; }
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
