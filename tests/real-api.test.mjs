import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./helpers.mjs";

const REAL_ENV = {
  APP_ENV: "sandbox",
  PAYMENTS_ENABLED: "true",
  FUNDING_MODE: "settled",
  ASAAS_API_KEY: "test-asaas-key",
  ASAAS_ENV: "sandbox",
  ASAAS_WEBHOOK_TOKEN: "webhook-token-configured-123456789012",
  ASAAS_WITHDRAWAL_TOKEN: "withdrawal-token-configured-123456789012",
  PII_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  PUBLIC_BASE_URL: "https://pixai.test",
};
const CPF = "52998224725";
const MASKED_OK = "***.982.247-**";

function withRealEnv(h) {
  Object.assign(h.env, REAL_ENV);
  return h;
}

function mockAsaas(routes) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if(u.endsWith("/myAccount/fees/")) return {ok:true,status:200,json:async()=>({payment:{creditCard:{operationValue:0.49,oneInstallmentPercentage:2.99,upToSixInstallmentsPercentage:3.49,upToTwelveInstallmentsPercentage:3.99}},transfer:{pix:{feeValue:2}}})};
    for (const [pattern, handler] of routes) {
      if (pattern.test(u)) {
        const body = init?.body ? JSON.parse(init.body) : null;
        const res = handler(u, body, init);
        return { ok: res.status < 400, status: res.status, json: async () => res.body };
      }
    }
    throw Error(`Rota do Asaas não mockada: ${init?.method || "GET"} ${u}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

async function getQuote(c, amount = 10000, installments = 6) {
  const q = await c("real/quotes", { method: "POST", body: { pixAmount: amount } });
  return { quoteId: q.data.id, installments };
}

function confirmBody({ quoteId, installments }, overrides = {}) {
  return {
    quoteId,
    installments,
    cpf: CPF,
    name: "Pessoa Teste",
    email: "teste@example.com",
    pixKey: CPF,
    pixKeyType: "CPF",
    confirmed: true,
    termsVersion: "real-v1",
    ...overrides,
  };
}

test("rotas /api/real ficam fechadas sem configuração completa do Asaas", async () => {
  const h = harness(),
    c = h.client();
  assert.equal(
    (await c("real/quotes", { method: "POST", body: { pixAmount: 10000 } })).status,
    503,
  );
  h.env.APP_ENV = "production";
  assert.equal(
    (await c("real/quotes", { method: "POST", body: { pixAmount: 10000 } })).status,
    503,
  );
});

test("confirmar cobrança real cria checkout hospedado quando a chave Pix pertence ao CPF", async () => {
  const h = withRealEnv(harness()),
    c = h.client();
  const restore = mockAsaas([
    [/\/pix\/addressKeys\/external/, () => ({ status: 200, body: { cpfCnpj: MASKED_OK } })],
    [/\/customers\?/, () => ({ status: 200, body: { data: [] } })],
    [/\/customers$/, () => ({ status: 200, body: { id: "cus_1" } })],
    [/\/checkouts$/, (_u, body) => {
      assert.equal(body.billingTypes[0], "CREDIT_CARD");
      assert.ok(!("creditCard" in body));
      return { status: 200, body: { id: "chk_1", link: "https://asaas.com/checkoutSession/show?id=chk_1" } };
    }],
  ]);
  try {
    const quote = await getQuote(c);
    const r = await c("real/confirm", {
      method: "POST",
      key: crypto.randomUUID(),
      body: confirmBody(quote),
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.checkoutUrl, "https://asaas.com/checkoutSession/show?id=chk_1");
    const row = h.sqlite.prepare("SELECT * FROM real_operations WHERE id=?").get(r.data.id);
    assert.equal(row.status, "AWAITING_PAYMENT");
    assert.notEqual(row.cpf_encrypted, CPF);
    assert.notEqual(row.pix_key_encrypted, CPF);
    assert.ok(row.cpf_encrypted.includes(":"));
  } finally {
    restore();
  }
});

test("chave Pix de terceiro (CPF diferente) é recusada antes de qualquer cobrança", async () => {
  const h = withRealEnv(harness()),
    c = h.client();
  const restore = mockAsaas([
    [/\/pix\/addressKeys\/external/, () => ({ status: 200, body: { cpfCnpj: "***.000.000-**" } })],
    [/\/customers$/, () => ({ status: 200, body: { id: "cus_1" } })],
    [/\/checkouts$/, () => ({ status: 200, body: { id: "chk_1", link: "https://sandbox.asaas.com/checkoutSession/show/chk_1" } })],
  ]);
  try {
    const quote = await getQuote(c);
    const r = await c("real/confirm", {
      method: "POST",
      key: crypto.randomUUID(),
      body: confirmBody(quote),
    });
    assert.equal(r.status, 403);
    assert.equal(
      h.sqlite.prepare("SELECT count(*) AS n FROM real_operations").get().n,
      0,
    );
  } finally {
    restore();
  }
});

test("CPF inválido e confirmação implícita são rejeitados sem consultar o Asaas", async () => {
  const h = withRealEnv(harness()),
    c = h.client();
  const restore = mockAsaas([]);
  try {
    const quote = await getQuote(c);
    assert.equal(
      (
        await c("real/confirm", {
          method: "POST",
          key: crypto.randomUUID(),
          body: confirmBody(quote, { cpf: "111.111.111-11" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await c("real/confirm", {
          method: "POST",
          key: crypto.randomUUID(),
          body: confirmBody(quote, { confirmed: false }),
        })
      ).status,
      400,
    );
  } finally {
    restore();
  }
});

async function createAwaitingOperation(h, c) {
  const restore = mockAsaas([
    [/\/pix\/addressKeys\/external/, () => ({ status: 200, body: { cpfCnpj: MASKED_OK } })],
    [/\/customers\?/, () => ({ status: 200, body: { data: [{ id: "cus_1" }] } })],
    [/\/checkouts$/, () => ({ status: 200, body: { id: "chk_1", link: "https://sandbox.asaas.com/checkoutSession/show/chk_1" } })],
  ]);
  const quote = await getQuote(c);
  const r = await c("real/confirm", {
    method: "POST",
    key: crypto.randomUUID(),
    body: confirmBody(quote),
  });
  restore();
  return r.data.id;
}

function operation(h,id) { return h.sqlite.prepare('SELECT * FROM real_operations WHERE id=?').get(id); }
async function fixture() {
  const h=withRealEnv(harness()), c=h.client();
  const id=await createAwaitingOperation(h,c);
  assert.ok(id);
  return {h,c,id,q:JSON.parse(operation(h,id).value)};
}
function payment(q,overrides={}) { return {id:'pay_1',customer:'cus_1',checkoutSession:'chk_1',billingType:'CREDIT_CARD',value:q.totalCharge/100,netValue:(q.totalCharge-500)/100,status:'RECEIVED',...overrides}; }
const webhook=(c,id,event='PAYMENT_RECEIVED',extra={})=>c('real/webhooks/payment',{method:'POST',headers:{'asaas-access-token':REAL_ENV.ASAAS_WEBHOOK_TOKEN},body:{id,event,payment:{id:'pay_1',checkoutSession:'chk_1'},...extra}});

test('webhook confirma apenas por consulta oficial; cartão confirmado não dispara Pix',async()=>{
  const {h,c,id,q}=await fixture();
  const restore=mockAsaas([[/\/payments\?/,()=>({status:200,body:{data:[payment(q,{status:'CONFIRMED'})],hasMore:false}})]]);
  try {
    assert.equal((await webhook(c,'evt_1','PAYMENT_CONFIRMED')).status,200);
    assert.equal(operation(h,id).status,'AWAITING_FUNDS');
    assert.equal((await webhook(c,'evt_1','PAYMENT_CONFIRMED')).data.duplicate,true);
  } finally {restore();}
});
test('R$ 0,01, cliente errado e boleto não liberam operação; evento permanece pendente',async()=>{
  for(const bad of [{value:0.01},{customer:'other'},{billingType:'BOLETO'}]) {
    const {h,c,id,q}=await fixture();
    const restore=mockAsaas([[/\/payments\?/,()=>({status:200,body:{data:[payment(q,bad)]}})]]);
    try {
      assert.equal((await webhook(c,'evt_bad')).status,409);
      assert.equal(operation(h,id).status,'AWAITING_PAYMENT');
      assert.equal(h.sqlite.prepare('SELECT status FROM asaas_inbox').get().status,'PENDING');
    } finally {restore();}
  }
});
test('webhook com falha temporária pode ser reprocessado e não armazena CPF em texto',async()=>{
  const {h,c,id,q}=await fixture(); let failed=true;
  const restore=mockAsaas([[/\/payments\?/,()=>({status:failed?503:200,body:failed?{}:{data:[payment(q)]}})]]);
  try {
    assert.equal((await webhook(c,'evt_retry')).status,503); failed=false;
    assert.equal((await webhook(c,'evt_retry')).status,200);
    assert.equal(operation(h,id).status,'FUNDS_AVAILABLE');
    const inbox=h.sqlite.prepare('SELECT * FROM asaas_inbox').get();
    assert.equal(inbox.status,'DONE'); assert.ok(!inbox.payload_encrypted.includes('pay_1'));
    assert.equal((await webhook(c,'evt_retry','PAYMENT_CONFIRMED')).status,409);
  } finally {restore();}
});
test('parcelas são somadas e todas devem estar liquidadas',async()=>{
  const {h,c,id,q}=await fixture(); let received=false;
  const restore=mockAsaas([[/\/payments\?/,()=>({status:200,body:{data:[payment(q,{value:q.totalCharge/200,netValue:q.totalCharge/200-2}),payment(q,{id:'pay_2',value:q.totalCharge/200,netValue:q.totalCharge/200-2,status:received?'RECEIVED':'CONFIRMED'})]}})]]);
  try {
    assert.equal((await webhook(c,'evt_partial')).status,200); assert.equal(operation(h,id).status,'AWAITING_FUNDS');
    received=true; assert.equal((await webhook(c,'evt_all')).status,200); assert.equal(operation(h,id).status,'FUNDS_AVAILABLE');
  } finally {restore();}
});
test('chargeback posterior ao Pix concluído mantém contestação visível',async()=>{
  const {h,c,id,q}=await fixture();
  h.sqlite.prepare("UPDATE real_operations SET status='COMPLETED' WHERE id=?").run(id);
  const restore=mockAsaas([[/\/payments\?/,()=>({status:200,body:{data:[payment(q,{status:'CHARGEBACK_REQUESTED'})]}})]]);
  try {assert.equal((await webhook(c,'evt_dispute','PAYMENT_CHARGEBACK_REQUESTED')).status,200);assert.equal(operation(h,id).status,'PAYMENT_DISPUTED');} finally {restore();}
});
test('autorização exige ID, Pix, valor exato e chave no bankAccount; logs sem dados pessoais',async()=>{
  const {h,c,id}=await fixture();
  h.sqlite.prepare("UPDATE real_operations SET status='PIX_PROCESSING',asaas_transfer_id='tr_1' WHERE id=?").run(id);
  const base={id:'tr_1',externalReference:id,operationType:'PIX',value:100,bankAccount:{pixAddressKey:CPF}};
  const send=t=>c('real/webhooks/authorize',{method:'POST',headers:{'asaas-access-token':REAL_ENV.ASAAS_WITHDRAWAL_TOKEN},body:{type:'TRANSFER',transfer:t}});
  for(const wrong of [{id:'other'},{operationType:'TED'},{value:100.01},{value:'100'},{bankAccount:null},{bankAccount:{pixAddressKey:'another'}},{bankAccount:{},pixAddressKey:CPF}]) assert.equal((await send({...base,...wrong})).data.status,'REFUSED');
  assert.equal((await send(base)).data.status,'APPROVED');
  assert.equal((await send(base)).data.status,'APPROVED');
  assert.equal(operation(h,id).authorized_transfer_id,'tr_1');
  assert.ok(h.sqlite.prepare('SELECT payload FROM withdrawal_authorizations').all().every(r=>!r.payload.includes(CPF)));
});
test('somente transferência confirmada pela API pode concluir operação',async()=>{
  const {h,c,id}=await fixture();
  h.sqlite.prepare("UPDATE real_operations SET status='PIX_PROCESSING',asaas_transfer_id='tr_1' WHERE id=?").run(id);
  const restore=mockAsaas([[/\/transfers\/tr_1$/,()=>({status:200,body:{id:'tr_1',externalReference:id,operationType:'PIX',value:100,bankAccount:{pixAddressKey:CPF},status:'DONE'}})]]);
  try {assert.equal((await webhook(c,'evt_done','TRANSFER_DONE',{payment:undefined,transfer:{id:'tr_1'}})).status,200);assert.equal(operation(h,id).status,'COMPLETED');} finally {restore();}
});
test('saque requer revisão e clique administrativo, com envio único mesmo em concorrência',async()=>{
  const {h,c,id,q}=await fixture(); let calls=0;
  h.sqlite.prepare("UPDATE real_operations SET status='FUNDS_AVAILABLE' WHERE id=?").run(id);
  const restore=mockAsaas([
    [/\/payments\?/,()=>({status:200,body:{data:[payment(q)]}})],
    [/\/finance\/balance$/,()=>({status:200,body:{balance:1000}})],
    [/\/transfers$/,()=>{calls++;return {status:200,body:{id:'tr_unique'}};}],
  ]);
  const release=()=>c('real/admin/release',{method:'POST',admin:true,headers:{origin:'https://pixai.test'},body:{id,reviewReference:'fixture-identity-review',confirmed:true,pixAmount:10000}});
  try {const res=await Promise.all([release(),release()]);assert.ok(res.some(r=>r.status===200));assert.equal(calls,1);assert.equal(operation(h,id).status,'PIX_PROCESSING');} finally {restore();}
});
test('timeout de transferência fica incerto e uma repetição nunca reenvia',async()=>{
  const {h,c,id,q}=await fixture(); let calls=0;
  h.sqlite.prepare("UPDATE real_operations SET status='FUNDS_AVAILABLE' WHERE id=?").run(id);
  const restore=mockAsaas([
    [/\/payments\?/,()=>({status:200,body:{data:[payment(q)]}})],
    [/\/finance\/balance$/,()=>({status:200,body:{balance:1000}})],
    [/\/transfers$/,()=>{calls++;throw Error('timeout');}],
  ]);
  const release=()=>c('real/admin/release',{method:'POST',admin:true,headers:{origin:'https://pixai.test'},body:{id,reviewReference:'fixture-identity-review',confirmed:true,pixAmount:10000}});
  try {assert.equal((await release()).status,502);assert.equal(operation(h,id).status,'PIX_UNCERTAIN');assert.equal((await release()).status,409);assert.equal(calls,1);} finally {restore();}
});
test('checkout concorrente reserva cotação antes do POST e repete link já salvo',async()=>{
  const h=withRealEnv(harness()), c=h.client(); let calls=0;
  const restore=mockAsaas([
    [/\/pix\/addressKeys\/external/,()=>({status:200,body:{cpfCnpj:MASKED_OK}})],
    [/\/customers\?/,()=>({status:200,body:{data:[{id:'cus_1'}]}})],
    [/\/checkouts$/,(_u,body)=>{calls++; assert.deepEqual(body.chargeTypes,['INSTALLMENT']);assert.equal(body.installment.maxInstallmentCount,6);return {status:200,body:{id:'chk_1',link:'https://sandbox.asaas.com/checkoutSession/show/chk_1'}};}],
  ]);
  try {
    const q=await getQuote(c); const key=crypto.randomUUID();
    const send=()=>c('real/confirm',{method:'POST',key,body:confirmBody(q)});
    const res=await Promise.all([send(),send()]);assert.ok(res.some(r=>r.status===201));assert.equal(calls,1);
    assert.equal((await send()).data.checkoutUrl,'https://sandbox.asaas.com/checkoutSession/show/chk_1');
  } finally {restore();}
});
test('webhooks exigem token, limitam tamanho e permanecem ativos durante pausa',async()=>{
  const {h,c,q}=await fixture(); h.env.PAYMENTS_ENABLED='false';
  assert.equal((await c('real/webhooks/payment',{method:'POST',body:{id:'x',event:'PAYMENT_RECEIVED'}})).status,401);
  assert.equal((await webhook(c,'too_big','PAYMENT_RECEIVED',{extra:'x'.repeat(17000)})).status,413);
  const restore=mockAsaas([[/\/payments\?/,()=>({status:200,body:{data:[payment(q)]}})]]);
  try {assert.equal((await webhook(c,'paused')).status,200);assert.equal((await c('real/quotes',{method:'POST',body:{pixAmount:10000}})).status,503);} finally {restore();}
});
test('chave de produção sozinha não habilita pagamentos e recibo não expõe margem',async()=>{
  const {h,c,id}=await fixture(); h.env.APP_ENV='production'; h.env.ASAAS_ENV='production';
  assert.equal((await c('health')).data.paymentsEnabled,false);
  assert.equal((await c('real/admin/readiness',{admin:true})).data.ready,false);
  const receipt=(await c('real/status/'+id)).data;assert.equal(receipt.quote.profit,undefined);assert.equal(receipt.quote.gatewayRate,undefined);
});
test('capital próprio permite cartão confirmado, mas respeita limite e saldo com tarifa',async()=>{
  for(const [cap,balance,expected] of [[9999,1000,409],[100000,100,409],[100000,1000,200]]) {
    const {h,c,id,q}=await fixture();let sent=0;
    Object.assign(h.env,{FUNDING_MODE:'prefunded',PREFUND_MAX_OUTSTANDING_CENTS:String(cap),PREFUND_RESERVE_CENTS:'0'});
    const restore=mockAsaas([
      [/\/payments\?/,()=>({status:200,body:{data:[payment(q,{status:'CONFIRMED'})]}})],
      [/\/finance\/balance$/,()=>({status:200,body:{balance}})],
      [/\/transfers$/,()=>{sent++;return {status:200,body:{id:'tr_capital'}};}],
    ]);
    try {
      await webhook(c,'evt_capital');assert.equal(operation(h,id).status,'PAYMENT_APPROVED');
      const r=await c('real/admin/release',{method:'POST',admin:true,headers:{origin:'https://pixai.test'},body:{id,reviewReference:'fixture-identity-reviewed',pixAmount:10000,confirmed:true}});
      assert.equal(r.status,expected);assert.equal(sent,expected===200?1:0);
      assert.equal(operation(h,id).funding_exposure,expected===200?10000:0);
    } finally {restore();}
  }
});
