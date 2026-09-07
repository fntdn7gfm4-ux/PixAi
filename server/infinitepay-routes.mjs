import {infiniteRequest,checkoutUrl,verifiedPayment} from './infinitepay.mjs';
import {encryptPII,decryptPII} from './pii.mjs';
import {constantEqual,sha256} from './security.mjs';

export function infiniteRoutes({json,fail,run,first,readBody,only,auditRow,limited}) {
  const text=(value,min=1,max=200)=>typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max;
  const email=value=>text(value,3,200)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const integerEnv=(env,key,fallback)=>/^\d+$/.test(env[key]||'')?Number(env[key]):fallback;
  const limits=env=>({minAmount:integerEnv(env,'INFINITEPAY_MIN_AMOUNT_CENTS',2000),maxAmount:integerEnv(env,'INFINITEPAY_MAX_AMOUNT_CENTS',25000)});
  const config=async(db,env={})=>{
    const row=await first(db,"SELECT * FROM settings WHERE id='infinitepay'");
    const saved=row?JSON.parse(row.value):{};
    return {value:{
      handle:saved.handle||env.INFINITEPAY_HANDLE||'',
      serviceLabel:saved.serviceLabel||env.INFINITEPAY_SERVICE_LABEL||'Serviços profissionais',
      enabled:saved.enabled??(env.INFINITEPAY_ENABLED==='true'),
    },revision:row?.revision||0};
  };
  const view=row=>({id:row.id,status:row.status,quote:JSON.parse(row.quote),checkoutUrl:row.checkout_url,
    createdAt:row.created_at,payment:row.payment?JSON.parse(row.payment):null});

  async function check(db,row,body) {
    if(!text(body.transaction_nsu,1,100)||!text(body.invoice_slug,1,100)) fail(400,'Referências de pagamento inválidas.');
    if(row.transaction_nsu&&(row.transaction_nsu!==body.transaction_nsu||row.invoice_slug!==body.invoice_slug)) fail(409,'Pagamento já associado a outra referência.');
    let payment;
    try {
      payment=await infiniteRequest('/payment_check',{handle:row.handle,order_nsu:row.id,transaction_nsu:body.transaction_nsu,slug:body.invoice_slug});
    } catch {
      fail(400,'Não foi possível conferir o pagamento. Tente novamente em instantes.');
    }
    if(!verifiedPayment(payment,JSON.parse(row.quote).totalCharge)) fail(400,'Pagamento ou valor não confirmado pela InfinitePay.');
    const summary={amount:payment.amount,paidAmount:payment.paid_amount,installments:payment.installments,method:payment.capture_method};
    try {
      await db.batch([
        run(db,"UPDATE infinite_operations SET status='COMPLETED',transaction_nsu=?,invoice_slug=?,payment=?,received_at=? WHERE id=? AND status IN ('AWAITING_PAYMENT','CHECKOUT_UNCERTAIN','CHECKOUT_CREATING') AND transaction_nsu IS NULL",body.transaction_nsu,body.invoice_slug,JSON.stringify(summary),Date.now(),row.id),
        auditRow(db,'INFINITEPAY_PAYMENT_CONFIRMED',row.id,{transaction:body.transaction_nsu}),
      ]);
    } catch {
      fail(409,'Referência de pagamento já utilizada.');
    }
    return view(await first(db,'SELECT * FROM infinite_operations WHERE id=?',row.id));
  }

  return async(request,env,path)=>{
    if(!env.DB) fail(503,'Armazenamento indisponível.');
    const db=env.DB;
    await limited(db,'infinite:'+await sha256(request.headers.get('CF-Connecting-IP')||'local'),120);
    const current=await config(db,env);
    const enabled=env.INFINITEPAY_ENABLED==='true'&&current.value.enabled;

    if(path==='/api/infinitepay/bootstrap'&&request.method==='GET') {
      return json({provider:'infinitepay',paymentsEnabled:enabled,...limits(env),serviceLabel:current.value.serviceLabel});
    }
    if(path==='/api/infinitepay/webhook'&&request.method==='POST') {
      const body=await readBody(request);
      if(!text(body.order_nsu,1,100)) fail(400,'Pedido inválido.');
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.order_nsu);
      if(!row) fail(400,'Pedido desconhecido.');
      // The webhook is only a trigger; the payment is verified directly with InfinitePay.
      await check(db,row,body);
      return json({success:true,message:null});
    }
    if(path==='/api/infinitepay/status'&&request.method==='GET') {
      const url=new URL(request.url),id=url.searchParams.get('id'),token=request.headers.get('x-operation-token')||'';
      if(!id||token.length<32) fail(404,'Pagamento não encontrado.');
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',id);
      if(!row||!await constantEqual(await sha256(token),row.access_digest)) fail(404,'Pagamento não encontrado.');
      return json(view(row));
    }
    if(path==='/api/infinitepay/confirm'&&request.method==='POST') {
      const body=await readBody(request);only(body,['id','transaction_nsu','invoice_slug']);
      const token=request.headers.get('x-operation-token')||'';
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.id);
      if(!row||token.length<32||!await constantEqual(await sha256(token),row.access_digest)) fail(404,'Pagamento não encontrado.');
      return json(await check(db,row,body));
    }

    const isAdmin=path.startsWith('/api/infinitepay/admin/');
    if(!isAdmin&&!['/api/infinitepay/quote','/api/infinitepay/create','/api/infinitepay/confirm'].includes(path)) fail(404,'Recurso não encontrado.');
    if(isAdmin) {
      const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
      if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<32||!await constantEqual(token,env.ADMIN_TOKEN)) fail(401,'Acesso administrativo obrigatório.');
    }
    if(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin) fail(403,'Origem obrigatória.');
    if(!isAdmin&&env.INFINITEPAY_TEST_MODE==='true'&&(!env.INFINITEPAY_TEST_ACCESS_CODE||!await constantEqual(request.headers.get('x-test-access-code')||'',env.INFINITEPAY_TEST_ACCESS_CODE))) fail(401,'Código de acesso ao teste inválido.');

    if(path==='/api/infinitepay/confirm'&&request.method==='POST') {
      const body=await readBody(request);only(body,['id','transaction_nsu','invoice_slug']);
      const token=request.headers.get('x-operation-token')||'';
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.id);
      if(!row||token.length<32||!await constantEqual(await sha256(token),row.access_digest)) fail(404,'Pagamento não encontrado.');
      return json(await check(db,row,body));
    }

    if(path.endsWith('/config')) {
      if(request.method==='GET') return json({...await config(db,env),serverEnabled:env.INFINITEPAY_ENABLED==='true'});
      if(request.method==='PUT') {
        const body=await readBody(request);only(body,['value','revision']);
        if(!body.value||typeof body.value!=='object') fail(400,'Configuração inválida.');
        only(body.value,['handle','serviceLabel','enabled']);
        const value=body.value;
        if(typeof value.handle!=='string'||(value.handle&&!/^[A-Za-z0-9_.-]{1,80}$/.test(value.handle))||typeof value.enabled!=='boolean') fail(400,'Informe uma InfiniteTag válida, sem $.');
        if(!text(value.serviceLabel,3,100)) fail(400,'Informe o nome dos serviços.');
        if(value.enabled&&!value.handle) fail(400,'Informe a InfiniteTag antes de ativar.');
        const saved=await config(db,env);
        if(body.revision!==saved.revision) fail(409,'Configuração alterada em outra sessão.');
        const statement=saved.revision
          ?run(db,"UPDATE settings SET value=?,revision=revision+1,updated_at=? WHERE id='infinitepay' AND revision=?",JSON.stringify(value),Date.now(),saved.revision)
          :run(db,"INSERT OR IGNORE INTO settings(id,value,revision,updated_at) VALUES ('infinitepay',?,1,?)",JSON.stringify(value),Date.now());
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
      if(!row) fail(404,'Pagamento não encontrado.');
      await auditRow(db,'INFINITEPAY_CUSTOMER_VIEWED',row.id).run();
      return json(JSON.parse(await decryptPII(env,row.recipient_encrypted)));
    }
    if(path.endsWith('/quote')&&request.method==='POST') {
      const body=await readBody(request);only(body,['amount']);
      if(!enabled&&!isAdmin) fail(503,'Cobranças InfinitePay ainda não ativadas.');
      const {minAmount,maxAmount}=limits(env);
      if(!Number.isSafeInteger(body.amount)||body.amount<minAmount||body.amount>maxAmount) fail(400,`Informe um valor entre R$ ${(minAmount/100).toFixed(2)} e R$ ${(maxAmount/100).toFixed(2)}.`);
      return json({quote:{serviceAmount:body.amount,totalCharge:body.amount},pricingRevision:0,note:'O cliente paga o valor informado; formas de pagamento e parcelamento aparecem no checkout InfinitePay.'});
    }
    if(path.endsWith('/create')&&request.method==='POST') {
      if(!enabled) fail(503,'Cobranças InfinitePay ainda não ativadas.');
      const body=await readBody(request);only(body,['amount','totalCharge','serviceReference','serviceDescription','name','email','confirmed']);
      const {minAmount,maxAmount}=limits(env);
      if(body.confirmed!==true||!Number.isSafeInteger(body.amount)||body.amount<minAmount||body.amount>maxAmount||body.totalCharge!==body.amount) fail(400,'Confira o valor e a confirmação.');
      if(!text(body.serviceReference,2,80)||!text(body.serviceDescription,3,160)||!text(body.name,3,140)||!email(body.email)) fail(400,'Preencha referência, serviço, nome e e-mail válidos.');
      if(!/^https:\/\/[^/]+$/.test(env.PUBLIC_BASE_URL||'')||!env.PII_ENCRYPTION_KEY) fail(503,'Endereço ou criptografia pendentes.');
      const key=request.headers.get('idempotency-key')||'';
      if(!/^[A-Za-z0-9-]{16,100}$/.test(key)) fail(400,'Identificador da tentativa obrigatório.');
      const hash=await sha256(JSON.stringify(body));
      let old=await first(db,'SELECT * FROM infinite_operations WHERE idempotency_key=?',key);
      if(old) {
        if(old.request_hash!==hash) fail(409,'Tentativa divergente.');
        return json(view(old));
      }
      const id='SV-'+crypto.randomUUID(),access=crypto.randomUUID()+crypto.randomUUID(),now=Date.now();
      const quote={serviceAmount:body.amount,totalCharge:body.amount,serviceReference:body.serviceReference.trim(),serviceDescription:body.serviceDescription.trim()};
      const detail=await encryptPII(env,JSON.stringify({name:body.name.trim(),email:body.email.trim().toLowerCase(),serviceReference:quote.serviceReference,serviceDescription:quote.serviceDescription}));
      const inserted=await run(db,"INSERT OR IGNORE INTO infinite_operations(id,idempotency_key,request_hash,handle,status,quote,recipient_encrypted,access_digest,created_at) VALUES (?,?,?,?,'CHECKOUT_CREATING',?,?,?,?)",id,key,hash,current.value.handle,JSON.stringify(quote),detail,await sha256(access),now).run();
      if(!inserted.meta.changes) {
        old=await first(db,'SELECT * FROM infinite_operations WHERE idempotency_key=?',key);
        if(!old||old.request_hash!==hash) fail(409,'Tentativa divergente.');
        return json(view(old));
      }
      try {
        const result=await infiniteRequest('/links',{
          handle:current.value.handle,
          order_nsu:id,
          redirect_url:env.PUBLIC_BASE_URL+'/infinitepay-return.html#'+encodeURIComponent(id)+'/'+access,
          webhook_url:env.PUBLIC_BASE_URL+'/api/infinitepay/webhook',
          customer:{name:body.name.trim(),email:body.email.trim().toLowerCase()},
          items:[{quantity:1,price:body.amount,description:`${quote.serviceDescription} — ${quote.serviceReference}`}],
        });
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
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.id);
      if(!row) fail(404,'Pagamento não encontrado.');
      return json(await check(db,row,body));
    }
    fail(404,'Recurso não encontrado.');
  };
}
