import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers.mjs';
test('cadastro privado aceita dados de serviços, preserva versão e não ativa pagamentos legados',async()=>{
  const h=harness(),c=h.client();h.env.APP_ENV='production';
  assert.equal((await c('real/admin/launch-draft')).status,401);
  const initial=await c('real/admin/launch-draft',{admin:true});assert.equal(initial.data.revision,0);
  assert.match(initial.data.value.termsText,/minuta/);
  const body={value:{tradeName:'PixAI',supportEmail:'contato@example.com',infiniteTag:'lucas-banza',serviceCatalog:'Consultoria e serviços digitais'},revision:0};
  const opt={method:'PUT',admin:true,headers:{origin:'https://pixai.test'},body};
  assert.equal((await c('real/admin/launch-draft',opt)).status,200);
  assert.equal((await c('real/admin/launch-draft',opt)).status,409);
  const other=h.client();assert.equal((await other('real/admin/launch-draft',{admin:true})).data.value.supportEmail,'contato@example.com');
  assert.equal((await c('health')).data.paymentsEnabled,false);
  assert.equal((await c('real/admin/launch-draft',{...opt,body:{revision:1,value:{ASAAS_API_KEY:'forbidden'}}})).status,400);
  assert.equal((await c('real/admin/launch-draft',{...opt,body:{revision:1,value:{minimumMargin:20}}})).status,400);
});
test('teste administrativo executa cenários com saldo zero sem chamar o parceiro ou criar operação real',async()=>{
  const h=harness(),c=h.client();h.env.APP_ENV='production';const old=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('Não pode acessar o parceiro');};
  try {
    for(const scenario of ['approved','zero_balance','declined','review','pix_failed']) {
      const opt={method:'POST',admin:true,headers:{origin:'https://pixai.test'},body:{pixAmount:10000,installments:6,scenario,confirmed:true}};
      const r=await c('real/admin/test-flow',opt);assert.equal(r.status,201);assert.equal(r.data.moneyMoved,false);assert.equal(r.data.environment,'simulation');assert.ok(r.data.quote.margin>=0.3);
      assert.equal((await c('real/admin/test-flow',{...opt,admin:false})).status,401);
    }
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM real_operations').get().n,0);
  }finally{globalThis.fetch=old;}
});
