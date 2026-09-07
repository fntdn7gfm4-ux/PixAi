import {infiniteRequest,checkoutUrl,verifiedPayment} from './infinitepay.mjs';
import {encryptPII,decryptPII} from './pii.mjs';
import {constantEqual,sha256} from './security.mjs';
import {isValidCPF,normalizeCPF} from './cpf.mjs';

export function infiniteRoutes({json,fail,run,first,readBody,only,auditRow,limited}) {
  const text=(value,min=1,max=200)=>typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max;
  const email=value=>text(value,3,200)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const integerEnv=(env,key,fallback)=>/^\d+$/.test(env[key]||'')?Number(env[key]):fallback;
  const defaultContent={
    eyebrow:'Checkout seguro pela InfinitePay',
    title:'Pague seu serviço com clareza e segurança.',
    subtitle:'Informe os dados do seu orçamento e siga para o ambiente de pagamento da InfinitePay.',
    formTitle:'Dados do pagamento',
    formHelp:'Selecione uma opção e informe os dados do titular que receberá o serviço.',
    amountLabel:'Valor personalizado',nameLabel:'Nome do cliente',emailLabel:'E-mail',cpfLabel:'CPF',
    cpfNotice:'O serviço contratado será enviado apenas para o CPF do titular informado neste campo.',buttonLabel:'Continuar para o pagamento',
  };
  const defaultProducts=[
    {id:'opcao-1',name:'Opção 1',description:'Serviço contratado — opção 1',price:2000,active:true,customPrice:false},
    {id:'opcao-2',name:'Opção 2',description:'Serviço contratado — opção 2',price:5000,active:true,customPrice:false},
    {id:'opcao-3',name:'Opção 3',description:'Serviço contratado — opção 3',price:10000,active:true,customPrice:false},
    {id:'opcao-4',name:'Opção 4',description:'Serviço contratado — opção 4',price:25000,active:true,customPrice:false},
    {id:'opcao-5',name:'Opção 5',description:'Serviço contratado — valor personalizado',price:null,active:true,customPrice:true},
  ];
  const config=async(db,env={})=>{
    const row=await first(db,"SELECT * FROM settings WHERE id='infinitepay'");
    const saved=row?JSON.parse(row.value):{};
    const content={...defaultContent,...(saved.content||{})};
    delete content.descriptionLabel;delete content.descriptionPlaceholder;delete content.referenceLabel;delete content.referencePlaceholder;
    if(/referência|descrição/i.test(content.formHelp)) content.formHelp=defaultContent.formHelp;
    return {value:{
      handle:saved.handle||env.INFINITEPAY_HANDLE||'',
      serviceLabel:!saved.serviceLabel||saved.serviceLabel==='Serviços profissionais'?'Opção selecionada':saved.serviceLabel,
      enabled:saved.enabled??(env.INFINITEPAY_ENABLED==='true'),
      minAmount:Number.isSafeInteger(saved.minAmount)?saved.minAmount:integerEnv(env,'INFINITEPAY_MIN_AMOUNT_CENTS',2000),
      maxAmount:Number.isSafeInteger(saved.maxAmount)?saved.maxAmount:integerEnv(env,'INFINITEPAY_MAX_AMOUNT_CENTS',25000),
      content,
      products:Array.isArray(saved.products)?saved.products:defaultProducts,
    },revision:row?.revision||0};
  };
  const view=row=>({id:row.id,status:row.status,quote:JSON.parse(row.quote),checkoutUrl:row.checkout_url,
    createdAt:row.created_at,payment:row.payment?JSON.parse(row.payment):null,deliveredAt:row.sent_at,
    operator:row.operator,deliveryReference:row.transfer_reference});

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
      return json({provider:'infinitepay',paymentsEnabled:enabled,minAmount:current.value.minAmount,maxAmount:current.value.maxAmount,serviceLabel:current.value.serviceLabel,content:current.value.content,products:current.value.products.filter(product=>product.active)});
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

    if(path.endsWith('/config')) {
      if(request.method==='GET') return json({...await config(db,env),serverEnabled:env.INFINITEPAY_ENABLED==='true'});
      if(request.method==='PUT') {
        const body=await readBody(request);only(body,['value','revision']);
        if(!body.value||typeof body.value!=='object') fail(400,'Configuração inválida.');
        only(body.value,['handle','serviceLabel','enabled','minAmount','maxAmount','content','products']);
        const value=body.value;
        if(typeof value.handle!=='string'||(value.handle&&!/^[A-Za-z0-9_.-]{1,80}$/.test(value.handle))||typeof value.enabled!=='boolean') fail(400,'Informe uma InfiniteTag válida, sem $.');
        if(!text(value.serviceLabel,3,100)) fail(400,'Informe o nome dos serviços.');
        if(value.enabled&&!value.handle) fail(400,'Informe a InfiniteTag antes de ativar.');
        if(!Number.isSafeInteger(value.minAmount)||!Number.isSafeInteger(value.maxAmount)||value.minAmount<100||value.maxAmount>100000000||value.minAmount>value.maxAmount) fail(400,'Informe limites de valor válidos.');
        if(!value.content||typeof value.content!=='object'||Array.isArray(value.content)) fail(400,'Conteúdo da página inválido.');
        only(value.content,Object.keys(defaultContent));
        for(const key of Object.keys(defaultContent)) if(typeof value.content[key]!=='string'||value.content[key].trim().length<1||value.content[key].length>300) fail(400,'Preencha todos os textos da página.');
        if(!Array.isArray(value.products)||value.products.length>50) fail(400,'Catálogo inválido.');
        const ids=new Set();
        for(const product of value.products) {
          if(!product||typeof product!=='object'||Array.isArray(product)) fail(400,'Produto inválido.');
          only(product,['id','name','description','price','active','customPrice']);
          if(!/^[a-z0-9-]{3,50}$/.test(product.id)||ids.has(product.id)||!text(product.name,2,100)||!text(product.description,3,160)||typeof product.active!=='boolean'||typeof product.customPrice!=='boolean') fail(400,'Revise os produtos e seus identificadores.');
          if(!product.customPrice&&(!Number.isSafeInteger(product.price)||product.price<value.minAmount||product.price>value.maxAmount)) fail(400,'O preço fixo deve respeitar os limites configurados.');
          if(product.customPrice&&product.price!==null) fail(400,'Produtos com valor livre não devem ter preço fixo.');
          ids.add(product.id);
        }
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
    if(path.endsWith('/delivered')&&request.method==='POST') {
      const body=await readBody(request);only(body,['id','operator','reference','confirmed']);
      if(body.confirmed!==true||!text(body.operator,2,100)||!text(body.reference,2,200)) fail(400,'Informe responsável e comprovante ou observação da entrega.');
      const row=await first(db,'SELECT * FROM infinite_operations WHERE id=?',body.id);
      if(!row) fail(404,'Pagamento não encontrado.');
      if(row.status!=='COMPLETED') fail(409,'Somente um pagamento confirmado e ainda não entregue pode ser validado.');
      const results=await db.batch([
        run(db,"UPDATE infinite_operations SET status='DELIVERED',operator=?,transfer_reference=?,sent_at=? WHERE id=? AND status='COMPLETED'",body.operator.trim(),body.reference.trim(),Date.now(),row.id),
        auditRow(db,'PRODUCT_DELIVERY_CONFIRMED',row.id,{operator:body.operator.trim(),reference:body.reference.trim()}),
      ]);
      if(!results[0].meta.changes) fail(409,'A entrega já foi validada por outra sessão.');
      return json(view(await first(db,'SELECT * FROM infinite_operations WHERE id=?',row.id)));
    }
    if(path.endsWith('/quote')&&request.method==='POST') {
      const body=await readBody(request);only(body,['amount','productId']);
      if(!enabled&&!isAdmin) fail(503,'Cobranças InfinitePay ainda não ativadas.');
      const {minAmount,maxAmount}=current.value;
      const product=current.value.products.find(item=>item.id===body.productId&&item.active);
      if(current.value.products.some(item=>item.active)&&!product) fail(400,'Selecione um produto ou serviço disponível.');
      if(product&&!product.customPrice&&body.amount!==product.price) fail(409,'O preço do produto foi alterado. Atualize a página.');
      if(!Number.isSafeInteger(body.amount)||body.amount<minAmount||body.amount>maxAmount) fail(400,`Informe um valor entre R$ ${(minAmount/100).toFixed(2)} e R$ ${(maxAmount/100).toFixed(2)}.`);
      return json({quote:{serviceAmount:body.amount,totalCharge:body.amount,productId:product?.id||null,productName:product?.name||current.value.serviceLabel},pricingRevision:current.revision,note:'O cliente paga o valor informado; formas de pagamento e parcelamento aparecem no checkout InfinitePay.'});
    }
    if(path.endsWith('/create')&&request.method==='POST') {
      if(!enabled) fail(503,'Cobranças InfinitePay ainda não ativadas.');
      const body=await readBody(request);only(body,['amount','totalCharge','productId','name','email','cpf','confirmed']);
      const {minAmount,maxAmount}=current.value;
      const product=current.value.products.find(item=>item.id===body.productId&&item.active);
      if(current.value.products.some(item=>item.active)&&!product) fail(400,'Selecione um produto ou serviço disponível.');
      if(product&&!product.customPrice&&body.amount!==product.price) fail(409,'O preço do produto foi alterado. Atualize a página.');
      if(body.confirmed!==true||!Number.isSafeInteger(body.amount)||body.amount<minAmount||body.amount>maxAmount||body.totalCharge!==body.amount) fail(400,'Confira o valor e a confirmação.');
      if(!text(body.name,3,140)||!email(body.email)||!isValidCPF(body.cpf)) fail(400,'Preencha nome, e-mail e CPF válidos.');
      if(!/^https:\/\/[^/]+$/.test(env.PUBLIC_BASE_URL||'')||!env.PII_ENCRYPTION_KEY) fail(503,'Endereço ou criptografia pendentes.');
      const key=request.headers.get('idempotency-key')||'';
      if(!/^[A-Za-z0-9-]{16,100}$/.test(key)) fail(400,'Não foi possível iniciar o pagamento. Atualize a página e tente novamente.');
      const hash=await sha256(JSON.stringify(body));
      let old=await first(db,'SELECT * FROM infinite_operations WHERE idempotency_key=?',key);
      if(old) {
        if(old.request_hash!==hash) fail(409,'Tentativa divergente.');
        return json(view(old));
      }
      const id='SV-'+crypto.randomUUID(),access=crypto.randomUUID()+crypto.randomUUID(),now=Date.now();
      const quote={serviceAmount:body.amount,totalCharge:body.amount,productId:product?.id||null,productName:product?.name||current.value.serviceLabel,serviceDescription:product?.description||product?.name||current.value.serviceLabel};
      const detail=await encryptPII(env,JSON.stringify({name:body.name.trim(),email:body.email.trim().toLowerCase(),cpf:normalizeCPF(body.cpf),productName:quote.productName,serviceDescription:quote.serviceDescription}));
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
          items:[{quantity:1,price:body.amount,description:`${quote.productName} — ${quote.serviceDescription}`}],
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
