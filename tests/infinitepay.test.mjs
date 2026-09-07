import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutUrl,verifiedPayment} from '../server/infinitepay.mjs';
import {harness} from './helpers.mjs';

const setup=()=>{
  const h=harness();
  Object.assign(h.env,{
    INFINITEPAY_HANDLE:'lucas-banza',INFINITEPAY_ENABLED:'true',INFINITEPAY_SERVICE_LABEL:'Serviços profissionais',
    INFINITEPAY_MIN_AMOUNT_CENTS:'2000',INFINITEPAY_MAX_AMOUNT_CENTS:'25000',INFINITEPAY_TEST_MODE:'false',
    PUBLIC_BASE_URL:'https://pixai.test',PII_ENCRYPTION_KEY:Buffer.alloc(32,8).toString('base64'),
  });
  return h;
};

test('valida URLs e confirma pagamentos Pix ou cartão retornados pela InfinitePay',()=>{
  assert.equal(checkoutUrl('https://checkout.infinitepay.com.br/lucas-banza?lenc=x'),'https://checkout.infinitepay.com.br/lucas-banza?lenc=x');
  assert.throws(()=>checkoutUrl('https://example.com/falso'));
  assert.equal(verifiedPayment({success:true,paid:true,amount:1500,paid_amount:1510,installments:2,capture_method:'credit_card'},1500),true);
  assert.equal(verifiedPayment({success:true,paid:true,amount:1500,paid_amount:1500,installments:1,capture_method:'pix'},1500),true);
  assert.equal(verifiedPayment({success:true,paid:true,amount:1499,paid_amount:1510,installments:2,capture_method:'credit_card'},1500),false);
});

test('fluxo de serviços limita valores e cria checkout pelo valor exato',async()=>{
  const h=setup(),c=h.client();
  assert.equal((await c('infinitepay/quote',{method:'POST',headers:{origin:'https://pixai.test'},body:{amount:1999,productId:'opcao-5'}})).status,400);
  const quoted=await c('infinitepay/quote',{method:'POST',headers:{origin:'https://pixai.test'},body:{amount:20000,productId:'opcao-5'}});
  assert.equal(quoted.status,200);
  assert.deepEqual(quoted.data.quote,{serviceAmount:20000,totalCharge:20000,productId:'opcao-5',productName:'Opção 5'});
  let payload;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    payload=JSON.parse(options.body);
    return new Response(JSON.stringify({url:'https://checkout.infinitepay.com.br/lucas-banza?lenc=teste'}),{status:200,headers:{'content-type':'application/json'}});
  };
  try {
    const created=await c('infinitepay/create',{method:'POST',key:crypto.randomUUID(),headers:{origin:'https://pixai.test'},body:{amount:20000,totalCharge:20000,productId:'opcao-5',name:'Pessoa de Teste',email:'pessoa@example.com',cpf:'529.982.247-25',confirmed:true}});
    assert.equal(created.status,201);
    assert.match(created.data.checkoutUrl,/^https:\/\/checkout\.infinitepay\.com\.br/);
    assert.ok(created.data.accessToken.length>=32);
    assert.equal(payload.handle,'lucas-banza');
    assert.equal(payload.items[0].price,20000);
    assert.match(payload.items[0].description,/Opção 5.*valor personalizado/);
    assert.deepEqual(payload.customer,{name:'Pessoa de Teste',email:'pessoa@example.com'});
    const stored=h.sqlite.prepare('SELECT recipient_encrypted FROM infinite_operations').get().recipient_encrypted;
    assert.doesNotMatch(stored,/pessoa@example\.com|Pessoa de Teste|52998224725/);
  } finally {globalThis.fetch=oldFetch;}
});

test('retorno autenticado consulta a InfinitePay e conclui o pagamento',async()=>{
  const h=setup(),c=h.client();
  const oldFetch=globalThis.fetch;
  let accessToken,id;
  globalThis.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);
    if(String(url).endsWith('/links')) return new Response(JSON.stringify({url:'https://checkout.infinitepay.com.br/lucas-banza?lenc=teste'}),{status:200});
    assert.equal(body.order_nsu,id);
    return new Response(JSON.stringify({success:true,paid:true,amount:8500,paid_amount:8500,installments:1,capture_method:'pix'}),{status:200});
  };
  try {
    const created=await c('infinitepay/create',{method:'POST',key:crypto.randomUUID(),headers:{origin:'https://pixai.test'},body:{amount:8500,totalCharge:8500,productId:'opcao-5',name:'Cliente Teste',email:'cliente@example.com',cpf:'52998224725',confirmed:true}});
    ({id,accessToken}=created.data);
    const confirmed=await c('infinitepay/confirm',{method:'POST',headers:{'x-operation-token':accessToken},body:{id,transaction_nsu:'tx-1',invoice_slug:'inv-1'}});
    assert.equal(confirmed.status,200);
    assert.equal(confirmed.data.status,'COMPLETED');
    assert.equal(confirmed.data.payment.method,'pix');
    const delivered=await c('infinitepay/admin/delivered',{method:'POST',admin:true,headers:{origin:'https://pixai.test'},body:{id,operator:'Lucas',reference:'Entregue por e-mail',confirmed:true}});
    assert.equal(delivered.status,200);
    assert.equal(delivered.data.status,'DELIVERED');
    assert.equal(delivered.data.deliveryReference,'Entregue por e-mail');
  } finally {globalThis.fetch=oldFetch;}
});

test('configuração InfinitePay exige administração e salva o nome dos serviços',async()=>{
  const h=setup(),c=h.client();
  assert.equal((await c('infinitepay/admin/config')).status,401);
  const initial=await c('infinitepay/admin/config',{admin:true});
  assert.equal(initial.data.value.handle,'lucas-banza');
  assert.deepEqual(initial.data.value.products.map(product=>product.price),[2000,5000,10000,25000,null]);
  const saved=await c('infinitepay/admin/config',{method:'PUT',admin:true,headers:{origin:'https://pixai.test'},body:{revision:0,value:{...initial.data.value,handle:'lucas-banza',serviceLabel:'Serviços digitais',enabled:true}}});
  assert.equal(saved.status,200);
  assert.equal(saved.data.value.serviceLabel,'Serviços digitais');
  assert.equal(saved.data.revision,1);
});

test('admin edita textos, limites e catálogo com preço fixo aplicado no servidor',async()=>{
  const h=setup(),c=h.client();
  const initial=await c('infinitepay/admin/config',{admin:true});
  const value={...initial.data.value,minAmount:3000,maxAmount:30000,content:{...initial.data.value.content,title:'Escolha e pague seu serviço'},products:[
    {id:'consultoria-express',name:'Consultoria express',description:'Sessão de consultoria',price:12500,active:true,customPrice:false},
    {id:'orcamento-livre',name:'Orçamento personalizado',description:'Serviço conforme proposta',price:null,active:false,customPrice:true},
  ]};
  const saved=await c('infinitepay/admin/config',{method:'PUT',admin:true,headers:{origin:'https://pixai.test'},body:{revision:initial.data.revision,value}});
  assert.equal(saved.status,200);
  const boot=await c('infinitepay/bootstrap');
  assert.equal(boot.data.content.title,'Escolha e pague seu serviço');
  assert.equal(boot.data.minAmount,3000);
  assert.deepEqual(boot.data.products.map(product=>product.id),['consultoria-express']);
  assert.equal((await c('infinitepay/quote',{method:'POST',headers:{origin:'https://pixai.test'},body:{amount:12000,productId:'consultoria-express'}})).status,409);
  assert.equal((await c('infinitepay/quote',{method:'POST',headers:{origin:'https://pixai.test'},body:{amount:12500,productId:'consultoria-express'}})).status,200);
});
