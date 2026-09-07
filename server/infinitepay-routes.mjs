import {infiniteRequest, checkoutUrl, verifiedPayment} from './infinitepay.mjs';
import {launchPrice} from './launch-pricing.mjs';
import {encryptPII,decryptPII} from './pii.mjs';
import {isValidCPF,normalizeCPF} from './cpf.mjs';
import {constantEqual,sha256} from './security.mjs';

export function infiniteRoutes({json,fail,run,first,readBody,only,auditRow,limited,settings}) {
  const config = async(db,env={})=>{
    const row=await first(db,"SELECT * FROM settings WHERE id='infinitepay'");
    return row?{value:JSON.parse(row.value),revision:row.revision}:{value:{handle:env.INFINITEPAY_HANDLE||'',pricingReference:env.INFINITEPAY_PRICING_REFERENCE||'',receivingPlan:env.INFINITEPAY_RECEIVING_PLAN||'',serviceDeadline:env.INFINITEPAY_SERVICE_DEADLINE||'',enabled:env.INFINITEPAY_ENABLED==='true'&&!!env.INFINITEPAY_APPROVAL_REF},revision:0};
  };
  const integerEnv=(env,key,fallback)=>/^\d+$/.test(env[key]||'')?Number(env[key]):fallback;
  const providerSettings=async(db,env)=>{
    const base=await settings(db),rate=integerEnv(env,'INFINITEPAY_GATEWAY_RATE_PPM',155000);
    return {...base,value:{...base.value,minAmount:integerEnv(env,'INFINITEPAY_MIN_AMOUNT_CENTS',2000),maxAmount:integerEnv(env,'INFINITEPAY_MAX_AMOUNT_CENTS',25000),minimumProfitRate:integerEnv(env,'INFINITEPAY_MIN_MARGIN_PPM',300000),gatewayRates:Array(12).fill(rate),gatewayFixedFee:0,installments:Array.from({length:12},(_,i)=>i+1)}};
  };
  const view = r=>({id:r.id,status:r.status,quote:JSON.parse(r.quote),checkoutUrl:r.checkout_url,
    createdAt:r.created_at,payment:r.payment?JSON.parse(r.payment):null,
    receivedAt:r.received_at,sentAt:r.sent_at,operator:r.operator,settlementReference:r.settlement_reference,
    transferReference:r.transfer_reference});
  const textField=(value,min=1,max=200)=>typeof value==='string'&&value.trim().length>=min&&value.length<=max;
  async function check(db,row,body) {
    if(!textField(body.transaction_nsu,1,100)||!textField(body.invoice_slug,1,100)) fail(400,'Referências de pagamento inválidas.');
    if(row.transaction_nsu && (row.transaction_nsu!==body.transaction_nsu || row.invoice_slug!==body.invoice_slug)) fail(409,'Pagamento já associado a outra referência.');
    let payment;
    try {payment=await infiniteRequest('/payment_check',{handle:row.handle,order_nsu:row.id,transaction_nsu:body.transaction_nsu,slug:body.invoice_slug});}
    catch {fail(400,'Não foi possível conferir o pagamento. Tente conciliar novamente.');}
    if(!verifiedPayment(payment,JSON.parse(row.quote).totalCharge)) fail(400,'Pagamento ou valor não confirmado pela InfinitePay.');
    const summary={amount:payment.amount,paidAmount:payment.paid_amount,installments:payment.installments,method:payment.capture_method};
    try {
      await db.batch([run(db,"UPDATE infinite_operations SET status='PAYMENT_CONFIRMED',transaction_nsu=?,invoice_slug=?,payment=? WHERE id=? AND status IN ('AWAITING_PAYMENT','CHECKOUT_UNCERTAIN','CHECKOUT_CREATING') AND transaction_nsu IS NULL",body.transaction_nsu,body.invoice_slug,JSON.stringify(summary),row.id),auditRow(db,'INFINITEPAY_PAYMENT_CHECKED',row.id,{transaction:body.transaction_nsu})]);
    } catch {fail(409,'Referência de pagamento já utilizada.');}
    return view(await first(db,'SELECT * FROM infinite_operations WHERE id=?',row.id));
  }
  return async(request,env,path)=>{
    if(!env.DB) fail(503,'Armazenamento indisponível.');
    const db=env.DB;
    await limited(db,'infinite:'+await sha256(request.headers.get('CF-Connecting-IP')||'local'),120);
    const currentConfig=await config(db,env),enabled=env.INFINITEPAY_ENABLED==='true'&&currentConfig.value.enabled;
    if(path==='/api/infinitepay/bootstrap' && request.method==='GET') {
      const s=await providerSettings(db,env);
      return json({provider:'infinitepay',paymentsEnabled:enabled,minAmount:s.value.minAmount,maxAmount:s.value.maxAmount,handle:currentConfig.value.handle});
    }
    if(path==='/api/infinitepay/webhook' && request.method==='POST') {
      const body=await readBody(request);
      if(!textField(body.order_nsu,1,100)) fail(400,'Pedido inválido.');
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.order_nsu);
      if(!row) fail(400,'Pedido desconhecido.');
      // No documented signature: never trust an incoming paid flag or amount.
      await check(db,row,body);
      return json({success:true,message:null});
    }
    if(path==='/api/infinitepay/status' && request.method==='GET') {
      const url=new URL(request.url),id=url.searchParams.get('id'),token=request.headers.get('x-operation-token')||'';
      if(!id||token.length<32) fail(404,'Operação não encontrada.');
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',id);
      if(!row || !await constantEqual(await sha256(token),row.access_digest)) fail(404,'Operação não encontrada.');
      return json({id:row.id,status:row.status,quote:JSON.parse(row.quote),payment:row.payment?JSON.parse(row.payment):null,receivedAt:row.received_at,sentAt:row.sent_at});
    }
    const isAdmin=path.startsWith('/api/infinitepay/admin/');
    if(!isAdmin&&!['/api/infinitepay/quote','/api/infinitepay/create'].includes(path)) fail(404,'Recurso não encontrado.');
    if(isAdmin) {
      const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
      if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<32||!await constantEqual(token,env.ADMIN_TOKEN)) fail(401,'Acesso administrativo obrigatório.');
    }
    if(request.method!=='GET' && request.headers.get('origin')!==new URL(request.url).origin) fail(403,'Origem obrigatória.');
    if(!isAdmin&&env.INFINITEPAY_TEST_MODE==='true'&&(!env.INFINITEPAY_TEST_ACCESS_CODE||!await constantEqual(request.headers.get('x-test-access-code')||'',env.INFINITEPAY_TEST_ACCESS_CODE))) fail(401,'Código de acesso ao teste inválido.');
    if(path.endsWith('/config')) {
      if(request.method==='GET') return json({...await config(db,env),serverEnabled:env.INFINITEPAY_ENABLED==='true'});
      if(request.method==='PUT') {
        const body=await readBody(request);only(body,['value','revision']);
        if(!body.value||typeof body.value!=='object') fail(400,'Configuração inválida.');
        only(body.value,['handle','pricingReference','receivingPlan','serviceDeadline','enabled']);
        const v=body.value;
        if(typeof v.handle!=='string'||(v.handle&&!/^[A-Za-z0-9_.-]{1,80}$/.test(v.handle))||typeof v.enabled!=='boolean') fail(400,'Informe uma InfiniteTag válida, sem $.');
        for(const key of ['pricingReference','receivingPlan','serviceDeadline']) if(typeof v[key]!=='string'||v[key].length>200) fail(400,'Campo inválido: '+key);
        if(v.enabled&&(!v.handle||!v.pricingReference.trim()||!v.receivingPlan.trim()||!v.serviceDeadline.trim())) fail(400,'Informe a conta, a conferência de tarifas, o plano e o prazo de atendimento.');
        const c=await config(db,env);if(body.revision!==c.revision) fail(409,'Configuração alterada em outra sessão.');
        const statement=c.revision?run(db,"UPDATE settings SET value=?,revision=revision+1,updated_at=? WHERE id='infinitepay' AND revision=?",JSON.stringify(v),Date.now(),c.revision):run(db,"INSERT OR IGNORE INTO settings(id,value,revision,updated_at) VALUES ('infinitepay',?,1,?)",JSON.stringify(v),Date.now());
        const results=await db.batch([statement,auditRow(db,'INFINITEPAY_CONFIG_SAVED','infinitepay')]);
        if(!results[0].meta.changes) fail(409,'Conflito de edição.');
        return json({...await config(db,env),serverEnabled:env.INFINITEPAY_ENABLED==='true'});
      }
    }
    if(path.endsWith('/operations')&&request.method==='GET') {
      const rows=await run(db,'SELECT * FROM infinite_operations ORDER BY created_at DESC LIMIT 200').all();
      return json({operations:rows.results.map(view)});
    }
    if(path.endsWith('/recipient')&&request.method==='POST') {
      const body=await readBody(request);only(body,['id']);
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.id);
      if(!row) fail(404,'Operação não encontrada.');
      await auditRow(db,'INFINITEPAY_RECIPIENT_VIEWED',row.id).run();
      return json(JSON.parse(await decryptPII(env,row.recipient_encrypted)));
    }
    if(path.endsWith('/quote')&&request.method==='POST') {
      const body=await readBody(request);only(body,['pixAmount']);
      if(!enabled&&!isAdmin) fail(503,'Cobranças InfinitePay ainda não ativadas.');
      const s=await providerSettings(db,env);
      // Checkout chooses installments; charge a base covering the highest configured card cost.
      const maxRate=Math.max(...s.value.gatewayRates);
      let quote;try {quote=launchPrice(body.pixAmount,1,{...s.value,gatewayRates:s.value.gatewayRates.map(()=>maxRate)});} catch(e){fail(400,e.message);}
      return json({quote:{...quote,installments:1,installmentAmount:quote.totalCharge},pricingRevision:s.revision,note:'Valor base. Parcelas e eventuais acréscimos são definidos no checkout InfinitePay.'});
    }
    if(path.endsWith('/create')&&request.method==='POST') {
      const c=await config(db,env);
      if(env.INFINITEPAY_ENABLED!=='true'||!c.value.enabled) fail(503,'Cobranças InfinitePay ainda não ativadas. Salve a configuração e conclua a preparação.');
      const body=await readBody(request);only(body,['pixAmount','totalCharge','pricingRevision','name','cpf','confirmed']);
      if(body.confirmed!==true||!textField(body.name,3,140)||!isValidCPF(body.cpf)) fail(400,'Confira nome, CPF e consentimento.');
      if(!/^https:\/\/[^/]+$/.test(env.PUBLIC_BASE_URL||'')||!env.PII_ENCRYPTION_KEY) fail(503,'Endereço ou criptografia pendentes.');
      const key=request.headers.get('idempotency-key')||'';if(!/^[A-Za-z0-9-]{16,100}$/.test(key)) fail(400,'Identificador da tentativa obrigatório.');
      const hash=await sha256(JSON.stringify(body));
      let old=await first(db,'SELECT * FROM infinite_operations WHERE idempotency_key=?',key);
      if(old) {if(old.request_hash!==hash) fail(409,'Tentativa divergente.');return json(view(old));}
      const s=await providerSettings(db,env),maxRate=Math.max(...s.value.gatewayRates);
      let q;try {q=launchPrice(body.pixAmount,1,{...s.value,gatewayRates:s.value.gatewayRates.map(()=>maxRate)});}catch(e){fail(400,e.message);}
      if(s.revision!==body.pricingRevision||q.totalCharge!==body.totalCharge) fail(409,'Preço alterado. Calcule novamente.');
      const id='IP-'+crypto.randomUUID(),access=crypto.randomUUID()+crypto.randomUUID(),now=Date.now();
      const redirect=env.PUBLIC_BASE_URL+'/infinitepay-return.html#'+encodeURIComponent(id)+'/'+access;
      const recipient=await encryptPII(env,JSON.stringify({name:body.name.trim(),cpf:normalizeCPF(body.cpf),pixKey:normalizeCPF(body.cpf),pixKeyType:'CPF'}));
      const inserted=await run(db,"INSERT OR IGNORE INTO infinite_operations(id,idempotency_key,request_hash,handle,status,quote,recipient_encrypted,access_digest,created_at) VALUES (?,?,?,?,'CHECKOUT_CREATING',?,?,?,?)",id,key,hash,c.value.handle,JSON.stringify(q),recipient,await sha256(access),now).run();
      if(!inserted.meta.changes) {old=await first(db,'SELECT * FROM infinite_operations WHERE idempotency_key=?',key);if(!old||old.request_hash!==hash) fail(409,'Tentativa divergente.');return json(view(old));}
      try {
        const result=await infiniteRequest('/links',{handle:c.value.handle,order_nsu:id,redirect_url:redirect,webhook_url:env.PUBLIC_BASE_URL+'/api/infinitepay/webhook',items:[{quantity:1,price:q.totalCharge,description:'PixAI — solicitação de Pix com envio manual após recebimento: '+id}]});
        const url=checkoutUrl(result.url);
        await run(db,"UPDATE infinite_operations SET checkout_url=?,status=CASE WHEN status='CHECKOUT_CREATING' THEN 'AWAITING_PAYMENT' ELSE status END WHERE id=?",url,id).run();
      } catch {
        await run(db,"UPDATE infinite_operations SET status='CHECKOUT_UNCERTAIN' WHERE id=? AND status='CHECKOUT_CREATING'",id).run();
      }
      await auditRow(db,'INFINITEPAY_CHECKOUT_REQUESTED',id).run();
      return json({...view(await first(db,'SELECT * FROM infinite_operations WHERE id=?',id)),accessToken:access},201);
    }
    if(path.endsWith('/check')&&request.method==='POST') {
      const body=await readBody(request);only(body,['id','transaction_nsu','invoice_slug']);
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.id);if(!row) fail(404,'Operação não encontrada.');
      return json(await check(db,row,body));
    }
    if((path.endsWith('/received')||path.endsWith('/sent'))&&request.method==='POST') {
      const body=await readBody(request);only(body,['id','operator','reference','confirmed','pixAmount','netAmount']);
      if(body.confirmed!==true||!textField(body.operator,3,100)||!textField(body.reference,6,200)) fail(400,'Identifique o responsável, a referência e confirme a conferência.');
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.id);if(!row) fail(404,'Operação não encontrada.');
      const q=JSON.parse(row.quote);if(body.pixAmount!==q.pixAmount) fail(409,'Valor do Pix divergente.');
      const receiving=path.endsWith('/received'),expected=receiving?'PAYMENT_CONFIRMED':'READY_FOR_MANUAL_PIX',next=receiving?'READY_FOR_MANUAL_PIX':'COMPLETED';
      if(row.status!==expected) fail(409,'A operação não está nesta etapa. Atualize a lista.');
      if(receiving&&(!Number.isSafeInteger(body.netAmount)||body.netAmount<q.pixAmount+q.taxCost+q.fraudCost+q.operationalCost+q.profit)) fail(400,'Valor líquido insuficiente para o Pix, custos e lucro projetado. Confira as tarifas.');
      const stmt=receiving?run(db,"UPDATE infinite_operations SET status=?,operator=?,settlement_reference=?,received_at=? WHERE id=? AND status=?",next,body.operator.trim(),body.reference.trim(),Date.now(),row.id,expected):run(db,"UPDATE infinite_operations SET status=?,operator=?,transfer_reference=?,sent_at=? WHERE id=? AND status=?",next,body.operator.trim(),body.reference.trim(),Date.now(),row.id,expected);
      const result=await db.batch([stmt,auditRow(db,receiving?'INFINITEPAY_FUNDS_CONFIRMED_MANUALLY':'INFINITEPAY_PIX_RECORDED_MANUALLY',row.id,{operator:body.operator,reference:body.reference,netAmount:body.netAmount??null})]);
      if(!result[0].meta.changes) fail(409,'Etapa já registrada por outra sessão.');
      return json(view(await first(db,'SELECT * FROM infinite_operations WHERE id=?',row.id)));
    }
    fail(404,'Recurso não encontrado.');
  };
}
