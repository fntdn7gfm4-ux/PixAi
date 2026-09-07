import { launchReadiness } from "./readiness.mjs";
import { launchPrice } from "./launch-pricing.mjs";
import {
  DEFAULT_SETTINGS,
  validateSettings,
  price,
  homeOffers,
  quoteOptions,
} from "./pricing.mjs";
import { sandboxTimeline } from "./states.mjs";
import { sha256, constantEqual, safeId } from "./security.mjs";
import { isValidCPF, normalizeCPF, maskedCpfMatches } from "./cpf.mjs";
import { encryptPII, decryptPII } from "./pii.mjs";
import {
  asaasFetch,
  findOrCreateCustomer,
  createCheckout,
  lookupPixKeyHolder,
  sendPixTransfer,
  verifyAsaasWebhookToken,
} from "./asaas.mjs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new Problem(status, message);
};
const run = (db, sql, ...args) => db.prepare(sql).bind(...args);
const first = (db, sql, ...args) => run(db, sql, ...args).first();
async function settings(db) {
  const r = await first(db, "SELECT * FROM settings WHERE id='pricing'");
  return {
    value: r
      ? validateSettings(JSON.parse(r.value))
      : structuredClone(DEFAULT_SETTINGS),
    revision: r?.revision || 0,
  };
}
const auditRow = (db, action, subject, detail = {}) =>
  run(
    db,
    "INSERT INTO audit (id,action,subject,detail,created_at) VALUES (?,?,?,?,?)",
    crypto.randomUUID(),
    action,
    subject,
    JSON.stringify(detail),
    Date.now(),
  );
async function limited(db, key, max, window = 60000) {
  const bucket = Math.floor(Date.now() / window),
    id = `${key}:${bucket}`;
  const row = await first(
    db,
    "INSERT INTO rate_limits(id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
    id,
    (bucket + 1) * window,
  );
  if (row.count > max)
    fail(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
}
async function readBody(request) {
  if (
    !(request.headers.get("content-type") || "").startsWith("application/json")
  )
    fail(415, "Use JSON.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Dados ausentes.");
  let chunks = [],
    length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16384) {
      await reader.cancel();
      fail(413, "Requisição muito grande.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(all));
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw Error();
    return value;
  } catch {
    fail(400, "Dados inválidos.");
  }
}
function only(body, fields) {
  if (Object.keys(body).some((k) => !fields.includes(k)))
    fail(
      400,
      "Campo não permitido. Não envie dados de cartão ou documentos neste ambiente.",
    );
}
function publicQuote(q) {
  const {
    gatewayCost,
    taxCost,
    fraudCost,
    operationalCost,
    netRevenue,
    profit,
    margin,
    gatewayRate,
    targetProfit,
    ...safe
  } = q;
  return safe;
}
function receipt(row) {
  const data = JSON.parse(row.value);
  return {
    ...data,
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    environment: row.environment,
    emailDelivery: "NOT_CONFIGURED",
    provider: "Nenhum parceiro conectado — teste",
    recipient: { name: "Pessoa de teste", key: "t••••@exemplo.invalid" },
    card: { brand: "Cartão fictício", last4: "0000" },
    paymentStatus: data.timeline.includes("PAYMENT_APPROVED")
      ? "APPROVED"
      : row.status === "PAYMENT_FAILED"
        ? "FAILED"
        : "UNDER_REVIEW",
    pixStatus: data.timeline.includes("PIX_SENT")
      ? "SENT"
      : row.status === "PIX_FAILED"
        ? "FAILED"
        : "NOT_SENT",
  };
}
function realConfigured(env) { return launchReadiness(env).ready; }
async function realPricing(env, db) {
  const s=await settings(db);
  const fees=await asaasFetch(env,'GET','/myAccount/fees/');
  const card=fees?.payment?.creditCard, pix=fees?.transfer?.pix;
  if(!card || !pix || ![card.operationValue,pix.feeValue,card.oneInstallmentPercentage,card.upToSixInstallmentsPercentage,card.upToTwelveInstallmentsPercentage].every(x=>typeof x==='number' && Number.isFinite(x) && x>=0)) fail(503,'Tarifas oficiais indisponíveis.');
  const value=structuredClone(s.value);
  // Budget normal tariffs, even during promotions / free monthly quotas.
  value.gatewayRates=Array.from({length:12},(_,i)=>Math.ceil((i===0?card.oneInstallmentPercentage:i<6?card.upToSixInstallmentsPercentage:card.upToTwelveInstallmentsPercentage)*10000));
  value.gatewayFixedFee=Math.ceil((card.operationValue+pix.feeValue)*100);
  return {...s,value,perInstallmentFee:Math.ceil(card.operationValue*100)};
}
async function realSession(db, request, ctx) {
  let sid = (request.headers.get("cookie") || "").match(
    /(?:^|; )pixai_session=([A-Za-z0-9-]+)/,
  )?.[1];
  if (
    !sid ||
    !(await first(
      db,
      "SELECT id FROM sessions WHERE id=? AND expires>?",
      sid,
      Date.now(),
    ))
  ) {
    sid = crypto.randomUUID();
    await run(
      db,
      "INSERT INTO sessions(id,expires) VALUES (?,?)",
      sid,
      Date.now() + 86400000,
    ).run();
    ctx.cookie = `pixai_session=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  }
  return sid;
}
function realReceipt(row) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    environment: row.provider_environment,
    checkoutUrl: row.status === "AWAITING_PAYMENT" ? row.checkout_url : null,
    quote: publicQuote(JSON.parse(row.value)),
  };
}
async function realQuotes(request, env, db, sid) {
  await limited(db, `real-quotes:${sid}`, 30);
  const body = await readBody(request);
  only(body, ["pixAmount"]);
  if(env.FUNDING_MODE==='prefunded' && body.pixAmount>Number(env.PREFUND_MAX_OUTSTANDING_CENTS)) fail(400,'Valor acima do capital disponível para esta operação.');
  const s = await realPricing(env, db);
  let options;
  try {
    options = quoteOptions(body.pixAmount, s.value).map(q=>({...launchPrice(body.pixAmount,q.installments,s.value,s.perInstallmentFee,s.value.offers.find(o=>o.pixAmount===body.pixAmount&&o.installments===q.installments)?.installmentFloor||0),recommended:q.recommended}));
  } catch (e) {
    fail(400, e.message);
  }
  const id = crypto.randomUUID(),
    expires = Date.now() + 600000;
  await run(
    db,
    "INSERT INTO quotes(id,session,value,expires,revision) VALUES (?,?,?,?,?)",
    id,
    sid,
    JSON.stringify(options),
    expires,
    s.revision,
  ).run();
  return json({
    id,
    expires,
    options: options.map(publicQuote),
    environment: env.ASAAS_ENV,
  });
}
async function realConfirm(request, env, db, sid) {
  await limited(db, `real-confirm:${sid}`, 10, 3600000);
  const body = await readBody(request);
  only(body, [
    "quoteId",
    "installments",
    "cpf",
    "name",
    "email",
    "pixKey",
    "pixKeyType",
    "confirmed",
    "termsVersion",
  ]);
  if (body.confirmed !== true || body.termsVersion !== "real-v1")
    fail(400, "A confirmação explícita é obrigatória.");
  const key = request.headers.get("idempotency-key");
  if (!safeId(key)) fail(400, "Chave de idempotência inválida.");
  if (!["CPF", "EMAIL", "PHONE", "EVP"].includes(body.pixKeyType))
    fail(400, "Tipo de chave Pix inválido.");
  if (!isValidCPF(body.cpf)) fail(400, "CPF inválido.");
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 140
  )
    fail(400, "Nome inválido.");
  if (
    typeof body.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
  )
    fail(400, "E-mail inválido.");
  if (
    typeof body.pixKey !== "string" ||
    !body.pixKey.trim() ||
    body.pixKey.length > 140
  )
    fail(400, "Chave Pix inválida.");
  const cpf = normalizeCPF(body.cpf);
  if (body.pixKeyType !== "CPF" || normalizeCPF(body.pixKey) !== cpf)
    fail(400, "Nesta integração, utilize a chave Pix CPF igual ao CPF informado.");
  body.pixKey = cpf;
  if (body.email.length > 254) fail(400, "E-mail inválido.");
  const hash = await sha256(
    JSON.stringify([
      sid,
      body.quoteId,
      body.installments,
      cpf,
      body.pixKeyType,
      body.pixKey, body.name.trim(), body.email.trim().toLowerCase(), body.termsVersion,
    ]),
  );
  const existing = await first(
    db,
    "SELECT * FROM real_operations WHERE idempotency_key=?",
    key,
  );
  if (existing) {
    if (existing.session !== sid || existing.request_hash !== hash)
      fail(409, "Chave já usada para outra solicitação.");
    return json(realReceipt(existing));
  }
  const q = await first(
    db,
    "SELECT * FROM quotes WHERE id=? AND session=?",
    body.quoteId,
    sid,
  );
  if (!q || q.expires < Date.now())
    fail(409, "A cotação expirou. Escolha o valor novamente.");
  const s = await realPricing(env, db);
  if (q.revision !== s.revision)
    fail(409, "Os preços mudaram. Gere uma nova cotação.");
  const saved = JSON.parse(q.value).find(
    (o) => o.installments === body.installments,
  );
  if (!saved) fail(400, "Parcelamento inválido.");
  const offer = s.value.offers.find(
    (o) =>
      o.pixAmount === saved.pixAmount && o.installments === saved.installments,
  );
  const fresh = launchPrice(
    saved.pixAmount,
    saved.installments,
    s.value,
    s.perInstallmentFee,
    offer?.installmentFloor || 0,
  );
  if (fresh.totalCharge !== saved.totalCharge)
    fail(409, "Cotação divergente. Gere novamente.");
  let masked;
  try {
    masked = await lookupPixKeyHolder(env, {
      type: body.pixKeyType,
      key: body.pixKey,
    });
  } catch {
    fail(502, "Não foi possível validar a chave Pix agora. Tente novamente.");
  }
  if (!masked) fail(400, "Chave Pix não encontrada.");
  if (!maskedCpfMatches(cpf, masked))
    fail(
      403,
      "A chave Pix informada precisa pertencer ao CPF de quem está pagando.",
    );
  await limited(
    db,
    `real-ops:${sid}`,
    s.value.maxOperationsPerSession,
    86400000,
  );
  const id = crypto.randomUUID();
  const [cpfEncrypted, pixKeyEncrypted] = await Promise.all([
    encryptPII(env, cpf), encryptPII(env, body.pixKey),
  ]);
  // Reserve the quote before any non-idempotent provider write. An uncertain
  // outcome stays reserved and must be reconciled; never blindly recreate it.
  try {
    await run(db, "INSERT INTO real_operations(id,session,quote_id,idempotency_key,request_hash,status,cpf_encrypted,pix_key_type,pix_key_encrypted,value,created_at,provider_environment) VALUES (?,?,?,?,?,'CHECKOUT_CREATING',?,?,?,?,?,?)",
      id,sid,q.id,key,hash,cpfEncrypted,body.pixKeyType,pixKeyEncrypted,JSON.stringify(fresh),Date.now(),env.ASAAS_ENV).run();
  } catch (e) {
    const winner=await first(db,"SELECT * FROM real_operations WHERE idempotency_key=? OR quote_id=?",key,q.id);
    if(winner && winner.session===sid && winner.request_hash===hash) return json(realReceipt(winner),202);
    if(winner) fail(409,"Esta cotação já foi utilizada.");
    throw e;
  }
  try {
    const customerId=await findOrCreateCustomer(env,{cpf,name:body.name.trim(),email:body.email.trim()});
    await run(db,"UPDATE real_operations SET asaas_customer_id=? WHERE id=?",customerId,id).run();
    const callback=env.PUBLIC_BASE_URL+"/#real-result?op="+id;
    const checkout=await createCheckout(env,{customerId,valueCents:fresh.totalCharge,installments:fresh.installments,externalReference:id,successUrl:callback,cancelUrl:callback,expiredUrl:callback});
    const link=checkout.link || (env.ASAAS_ENV==='production'?'https://asaas.com':'https://sandbox.asaas.com')+'/checkoutSession/show/'+encodeURIComponent(checkout.id);
    const url=new URL(link);
    if(!checkout.id || url.protocol!=='https:' || !['asaas.com','www.asaas.com','sandbox.asaas.com'].includes(url.hostname)) throw Error('Invalid checkout response');
    await db.batch([
      run(db,"UPDATE real_operations SET status='AWAITING_PAYMENT',asaas_checkout_id=?,checkout_url=? WHERE id=?",checkout.id,link,id),
      auditRow(db,'REAL_CHECKOUT_CREATED',id,{checkoutId:checkout.id}),
    ]);
    return json(realReceipt(await first(db,"SELECT * FROM real_operations WHERE id=?",id)),201);
  } catch {
    await run(db,"UPDATE real_operations SET status='CHECKOUT_UNCERTAIN' WHERE id=? AND status='CHECKOUT_CREATING'",id).run();
    fail(502,"Não foi possível confirmar a criação do checkout. Não repita o pagamento; consulte esta operação.");
  }
}

async function realStatus(db, sid, id) {
  if (!safeId(id)) fail(400, "Identificador inválido.");
  const row = await first(
    db,
    "SELECT * FROM real_operations WHERE id=? AND session=?",
    id,
    sid,
  );
  if (!row) fail(404, "Operação não encontrada nesta sessão.");
  return json(realReceipt(row));
}
const toCents = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.abs(v*100-Math.round(v*100)) < 0.00001 ? Math.round(v*100) : null;
async function reconcilePayment(env,db,row,expectedPaymentId=null) {
  if(!row.asaas_checkout_id) fail(503,'Checkout ainda não conciliado.');
  const result=await asaasFetch(env,'GET','/payments?checkoutSession='+encodeURIComponent(row.asaas_checkout_id)+'&limit=100');
  const payments=result?.data;
  if(!Array.isArray(payments) || result.hasMore || !payments.length) fail(503,'Cobranças ainda não disponíveis para conciliação.');
  const q=JSON.parse(row.value);
  const ids=new Set();
  let gross=0, received=0;
  for(const p of payments) {
    if(!p.id || ids.has(p.id) || p.customer!==row.asaas_customer_id || p.billingType!=='CREDIT_CARD' || toCents(p.value)===null || (p.checkoutSession && p.checkoutSession!==row.asaas_checkout_id)) fail(409,'Cobrança divergente; revisão obrigatória.');
    ids.add(p.id); gross+=toCents(p.value);
    if(p.status==='RECEIVED' && toCents(p.netValue)!==null) received+=toCents(p.netValue);
  }
  if(gross!==q.totalCharge) fail(409,'Total das cobranças diverge da cotação.');
  if(expectedPaymentId && !ids.has(expectedPaymentId)) fail(409,'Evento não pertence ao checkout.');
  const disputed=payments.some(p=>/REFUND|CHARGEBACK/.test(p.status) || p.deleted || p.refunds?.length);
  const failed=payments.some(p=>['OVERDUE','CANCELED','REPROVED_BY_RISK_ANALYSIS'].includes(p.status));
  const funded=payments.every(p=>p.status==='RECEIVED') && received>=q.pixAmount;
  const approved=payments.every(p=>['CONFIRMED','RECEIVED'].includes(p.status));
  let next=disputed?'PAYMENT_DISPUTED':failed?'PAYMENT_FAILED':funded?'FUNDS_AVAILABLE':approved&&env.FUNDING_MODE==='prefunded'?'PAYMENT_APPROVED':'AWAITING_FUNDS';
  await run(db,"UPDATE real_operations SET status=? WHERE id=? AND (status IN ('AWAITING_PAYMENT','AWAITING_FUNDS','FUNDS_AVAILABLE','PAYMENT_APPROVED') OR ?='PAYMENT_DISPUTED')",next,row.id,next).run();
  if(funded && !disputed) await run(db,'UPDATE real_operations SET funding_exposure=0 WHERE id=?',row.id).run();
  await auditRow(db,'PAYMENT_RECONCILED',row.id,{gross,received,paymentCount:payments.length,status:next}).run();
  return {funded:funded&&!disputed&&!failed,approved:approved&&!disputed&&!failed,payments};
}
async function triggerPixTransfer(env, db, operationId) {
  const row=await first(db,'SELECT * FROM real_operations WHERE id=?',operationId);
  if(!row || !['FUNDS_AVAILABLE','PAYMENT_APPROVED'].includes(row.status) || !row.review_reference) fail(409,'Pagamento conciliado e revisão de identidade são obrigatórios.');
  const verified=await reconcilePayment(env,db,row);
  const prefunded=env.FUNDING_MODE==='prefunded' && verified.approved;
  if(!verified.funded && !prefunded) fail(409,'Liquidação do cartão ainda não concluída.');
  const q=JSON.parse(row.value);
  const [balance,fees]=await Promise.all([asaasFetch(env,'GET','/finance/balance'),asaasFetch(env,'GET','/myAccount/fees/')]);
  const transferFee=toCents(fees?.transfer?.pix?.feeValue);
  const reserve=Number(env.PREFUND_RESERVE_CENTS || 0),exposure=verified.funded?0:q.pixAmount;
  const cap=Number(env.PREFUND_MAX_OUTSTANDING_CENTS || 0);
  if(transferFee===null || toCents(balance?.balance)===null || toCents(balance.balance)<q.pixAmount+transferFee+reserve) fail(409,'Saldo disponível insuficiente para Pix, tarifa e reserva.');
  const claim=await run(db,"UPDATE real_operations SET status='PIX_SUBMITTING',funding_exposure=? WHERE id=? AND status IN ('FUNDS_AVAILABLE','PAYMENT_APPROVED') AND NOT EXISTS (SELECT 1 FROM real_operations WHERE id<>? AND status IN ('PIX_SUBMITTING','PIX_PROCESSING','PIX_UNCERTAIN')) AND (?=0 OR (SELECT COALESCE(SUM(funding_exposure),0) FROM real_operations)+?<=?)",exposure,row.id,row.id,exposure,exposure,cap).run();
  if(!claim.meta.changes) fail(409,'Transferência já iniciada ou operação bloqueada.');
  try {
    const transfer=await sendPixTransfer(env,{valueCents:q.pixAmount,pixAddressKey:await decryptPII(env,row.pix_key_encrypted),pixAddressKeyType:row.pix_key_type,externalReference:row.id,description:'Pix '+row.id});
    if(!transfer?.id) throw Error('Missing transfer ID');
    await run(db,"UPDATE real_operations SET status='PIX_PROCESSING',asaas_transfer_id=? WHERE id=? AND status='PIX_SUBMITTING'",transfer.id,row.id).run();
  } catch {
    await run(db,"UPDATE real_operations SET status='PIX_UNCERTAIN' WHERE id=? AND status='PIX_SUBMITTING'",row.id).run();
    // A timeout may have accepted the transfer. Never resend automatically.
    fail(502,'Resultado da transferência incerto. Conciliação obrigatória, sem reenvio automático.');
  }
}
async function processAsaasEvent(env,db,event) {
  const externalRef=event.payment?.externalReference || event.transfer?.externalReference;
  const checkoutId=event.checkout?.id || event.payment?.checkoutSession;
  let row=checkoutId?await first(db,'SELECT * FROM real_operations WHERE asaas_checkout_id=?',checkoutId):null;
  if(!row && event.transfer?.id) row=await first(db,'SELECT * FROM real_operations WHERE asaas_transfer_id=?',event.transfer.id);
  if(!row && externalRef) row=await first(db,'SELECT * FROM real_operations WHERE id=?',externalRef);
  if(!row) fail(503,'Evento ainda não associado; aguarde a conciliação.');
  if(row.provider_environment!==env.ASAAS_ENV) fail(409,'Ambiente divergente.');
  if(event.event.startsWith('PAYMENT_') || event.event==='CHECKOUT_PAID') {
    await reconcilePayment(env,db,row,event.payment?.id);
  } else if(event.event.startsWith('TRANSFER_')) {
    if(!row.asaas_transfer_id || event.transfer?.id!==row.asaas_transfer_id) fail(409,'Transferência não registrada.');
    const transfer=await asaasFetch(env,'GET','/transfers/'+encodeURIComponent(row.asaas_transfer_id));
    const pix=await decryptPII(env,row.pix_key_encrypted);
    if(transfer.id!==row.asaas_transfer_id || transfer.externalReference!==row.id || toCents(transfer.value)!==JSON.parse(row.value).pixAmount || transfer.operationType!=='PIX' || transfer.bankAccount?.pixAddressKey!==pix) fail(409,'Transferência divergente.');
    const next=transfer.status==='DONE'?'COMPLETED':['FAILED','CANCELLED'].includes(transfer.status)?'PIX_FAILED':null;
    if(next) await run(db,"UPDATE real_operations SET status=?,funding_exposure=CASE WHEN ?='PIX_FAILED' THEN 0 ELSE funding_exposure END WHERE id=? AND status='PIX_PROCESSING'",next,next,row.id).run();
  } else if(['CHECKOUT_CANCELED','CHECKOUT_EXPIRED'].includes(event.event)) {
    const current=await asaasFetch(env,'GET','/checkouts/'+encodeURIComponent(row.asaas_checkout_id));
    if(['CANCELED','EXPIRED'].includes(current.status)) await run(db,"UPDATE real_operations SET status='PAYMENT_FAILED' WHERE id=? AND status='AWAITING_PAYMENT'",row.id).run();
  }
}
async function realPaymentWebhook(request, env, db) {
  if(!(await verifyAsaasWebhookToken(request,env,'ASAAS_WEBHOOK_TOKEN'))) fail(401,'Token inválido.');
  const event=await readBody(request);
  if(typeof event.id!=='string' || event.id.length>200 || typeof event.event!=='string' || event.event.length>100) fail(400,'Evento inválido.');
  const serialized=JSON.stringify(event), digest=await sha256(serialized);
  await run(db,"INSERT OR IGNORE INTO asaas_inbox(id,digest,payload_encrypted,status,received_at) VALUES (?,?,?,'PENDING',?)",event.id,digest,await encryptPII(env,serialized),Date.now()).run();
  const existing=await first(db,'SELECT * FROM asaas_inbox WHERE id=?',event.id);
  if(existing.digest!==digest) fail(409,'Mesmo ID com conteúdo divergente.');
  if(existing.status==='DONE') return json({received:true,duplicate:true});
  await processAsaasEvent(env,db,event);
  await run(db,"UPDATE asaas_inbox SET status='DONE',processed_at=? WHERE id=?",Date.now(),event.id).run();
  return json({received:true});
}
async function decideTransferAuthorization(env, db, body) {
  if (body?.type !== "TRANSFER")
    return {
      status: "REFUSED",
      reason:
        "Somente transferências Pix desta aplicação são esperadas nesta conta.",
    };
  const transfer = body.transfer || {};
  const externalRef = transfer.externalReference;
  if (!externalRef) return { status: "REFUSED", reason: "Sem referência interna." };
  const row = await first(
    db,
    "SELECT * FROM real_operations WHERE id=?",
    externalRef,
  );
  if (!row) return { status: "REFUSED", reason: "Operação não encontrada." };
  if (row.status !== "PIX_PROCESSING" || !row.asaas_transfer_id || transfer.id !== row.asaas_transfer_id || transfer.operationType !== "PIX")
    return {
      operationId: row.id,
      status: "REFUSED",
      reason: `Estado inesperado: ${row.status}.`,
    };
  const value = JSON.parse(row.value);
  const transferCents = toCents(transfer.value);
  if (
    transferCents === null || transferCents !== value.pixAmount
  )
    return {
      operationId: row.id,
      status: "REFUSED",
      reason: "Valor da transferência não confere.",
    };
  let pixKey;
  try {
    pixKey = await decryptPII(env, row.pix_key_encrypted);
  } catch {
    return {
      operationId: row.id,
      status: "REFUSED",
      reason: "Falha ao validar a chave Pix registrada.",
    };
  }
  if (transfer.bankAccount?.pixAddressKey !== pixKey)
    return {
      operationId: row.id,
      status: "REFUSED",
      reason: "Chave Pix não confere com a operação.",
    };
  const claim = await run(db, "UPDATE real_operations SET authorized_transfer_id=? WHERE id=? AND status='PIX_PROCESSING' AND (authorized_transfer_id IS NULL OR authorized_transfer_id=?)",transfer.id,row.id,transfer.id).run();
  if(!claim.meta.changes) return {status:"REFUSED",reason:"Autorização conflitante."};
  return {
    operationId: row.id,
    status: "APPROVED",
    reason: "Confere com a operação registrada.",
  };
}
async function realAuthorizeWebhook(request, env, db) {
  if (!(await verifyAsaasWebhookToken(request, env, "ASAAS_WITHDRAWAL_TOKEN")))
    return json({ status: "REFUSED", refuseReason: "Token inválido." }, 401);
  let body;
  try {
    body = await readBody(request);
  } catch {
    return json({ status: "REFUSED", refuseReason: "JSON inválido." });
  }
  const decision = await decideTransferAuthorization(env, db, body);
  await run(
    db,
    "INSERT INTO withdrawal_authorizations(id,operation_id,decision,reason,payload,created_at) VALUES (?,?,?,?,?,?)",
    crypto.randomUUID(),
    decision.operationId || null,
    decision.status,
    decision.reason,
    JSON.stringify({digest: await sha256(JSON.stringify(body)), transferId: body.transfer?.id || null}),
    Date.now(),
  ).run();
  return json(
    decision.status === "APPROVED"
      ? { status: "APPROVED" }
      : { status: "REFUSED", refuseReason: decision.reason },
  );
}
async function realApi(request, env, ctx, path) {
  if (!env.DB)
    fail(503, "O armazenamento do ambiente ainda não está configurado.");
  const db = env.DB;
  if (path.startsWith('/api/real/admin/')) {
    await limited(db,'real-admin:'+await sha256(request.headers.get('CF-Connecting-IP')||'local'),30);
    const token=request.headers.get('authorization')?.replace(/^Bearer /,'') || '';
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length<32 || !(await constantEqual(token,env.ADMIN_TOKEN))) fail(401,'Acesso administrativo obrigatório.');
    if (request.method!=='GET' && request.headers.get('origin')!==new URL(request.url).origin) fail(403,'Origem obrigatória para ação administrativa.');
    if (path==='/api/real/admin/readiness' && request.method==='GET') return json(launchReadiness(env));
    if (path==='/api/real/admin/account' && request.method==='GET') {
      const [fees,balance]=await Promise.all([asaasFetch(env,'GET','/myAccount/fees/'),asaasFetch(env,'GET','/finance/balance')]);
      return json({environment:env.ASAAS_ENV,creditCard:fees.payment?.creditCard,pixTransfer:fees.transfer?.pix,balance:balance.balance});
    }
    if (path==='/api/real/admin/replay' && request.method==='POST') {
      const body=await readBody(request); only(body,[]);
      const pending=await run(db,"SELECT * FROM asaas_inbox WHERE status='PENDING' ORDER BY received_at LIMIT 20").all();
      let processed=0;
      for(const item of pending.results) {
        try {
          await processAsaasEvent(env,db,JSON.parse(await decryptPII(env,item.payload_encrypted)));
          await run(db,"UPDATE asaas_inbox SET status='DONE',processed_at=? WHERE id=?",Date.now(),item.id).run();processed++;
        } catch { /* Retain for next attempt; never record provider payloads in logs. */ }
      }
      return json({processed,remainingInBatch:pending.results.length-processed});
    }
    if (path==='/api/real/admin/operations' && request.method==='GET') {
      const rows=await run(db,'SELECT * FROM real_operations ORDER BY created_at DESC LIMIT 100').all();
      const pending=await first(db,"SELECT count(*) AS count FROM asaas_inbox WHERE status='PENDING'");
      return json({operations:rows.results.map(realReceipt),pendingEvents:pending.count});
    }
    if (path==='/api/real/admin/reconcile' && request.method==='POST') {
      const body=await readBody(request); only(body,['id']);
      const row=await first(db,'SELECT * FROM real_operations WHERE id=?',body.id);
      if(!row || row.provider_environment!==env.ASAAS_ENV) fail(404,'Operação não encontrada neste ambiente.');
      await reconcilePayment(env,db,row);
      return json(realReceipt(await first(db,'SELECT * FROM real_operations WHERE id=?',body.id)));
    }
    if (path==='/api/real/admin/release' && request.method==='POST') {
      if(!realConfigured(env)) fail(503,'Homologação pendente.');
      const body=await readBody(request); only(body,['id','reviewReference','confirmed','pixAmount']);
      if(body.confirmed!==true || typeof body.reviewReference!=='string' || body.reviewReference.length<10 || body.reviewReference.length>200) fail(400,'Informe a referência da revisão de identidade e o aceite explícito.');
      const row=await first(db,'SELECT * FROM real_operations WHERE id=?',body.id);
      if(!row || row.provider_environment!==env.ASAAS_ENV || JSON.parse(row.value).pixAmount!==body.pixAmount) fail(409,'Operação divergente.');
      await db.batch([run(db,"UPDATE real_operations SET review_reference=? WHERE id=? AND status IN ('FUNDS_AVAILABLE','PAYMENT_APPROVED')",body.reviewReference,body.id),auditRow(db,'IDENTITY_REVIEW_RECORDED',body.id,{reference:body.reviewReference})]);
      await triggerPixTransfer(env,db,body.id);
      return json(realReceipt(await first(db,'SELECT * FROM real_operations WHERE id=?',body.id)));
    }
    fail(404,'Recurso administrativo não encontrado.');
  }

  const ip = await sha256(request.headers.get("CF-Connecting-IP") || "local");
  await limited(db, `real-ip:${ip}`, 240);
  if (path === "/api/real/webhooks/payment" && request.method === "POST")
    return realPaymentWebhook(request, env, db);
  if (path === "/api/real/webhooks/authorize" && request.method === "POST")
    return realAuthorizeWebhook(request, env, db);
  if (!realConfigured(env) && !path.startsWith("/api/real/status/"))
    fail(503, "Pagamentos indisponíveis enquanto a integração é homologada.");
  const origin = new URL(request.url).origin;
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") &&
    request.headers.get("origin") !== origin
  )
    fail(403, "Origem não permitida.");
  const sid = await realSession(db, request, ctx);
  if (path === "/api/real/quotes" && request.method === "POST")
    return realQuotes(request, env, db, sid);
  if (path === "/api/real/confirm" && request.method === "POST")
    return realConfirm(request, env, db, sid);
  if (path.startsWith("/api/real/status/") && request.method === "GET")
    return realStatus(db, sid, path.slice("/api/real/status/".length));
  fail(404, "Recurso não encontrado.");
}
async function api(request, env, ctx) {
  const path = new URL(request.url).pathname;
  if (path === "/api/health")
    return json({
      status: "ok",
      environment: env.APP_ENV || "sandbox",
      paymentsEnabled: realConfigured(env),
      provider: env.ASAAS_API_KEY ? "asaas" : "unconfigured",
      providerEnvironment: env.ASAAS_ENV || null,
      storage: !!env.DB,
      version: "2.0.0",
    });
  if (!env.DB)
    fail(503, "O armazenamento do ambiente ainda não está configurado.");
  const db = env.DB;
  if ((env.APP_ENV || "sandbox") !== "sandbox" && path !== '/api/bootstrap' && !path.startsWith('/api/admin/'))
    fail(
      503,
      "Operações indisponíveis: integração oficial e homologação pendentes.",
    );
  const origin = new URL(request.url).origin;
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") &&
    request.headers.get("origin") !== origin
  )
    fail(403, "Origem não permitida.");
  const ip = await sha256(request.headers.get("CF-Connecting-IP") || "local");
  await limited(db, `ip:${ip}`, 240);
  let sid = (request.headers.get("cookie") || "").match(
    /(?:^|; )pixai_session=([A-Za-z0-9-]+)/,
  )?.[1];
  if (
    !sid ||
    !(await first(
      db,
      "SELECT id FROM sessions WHERE id=? AND expires>?",
      sid,
      Date.now(),
    ))
  ) {
    sid = crypto.randomUUID();
    await run(
      db,
      "INSERT INTO sessions(id,expires) VALUES (?,?)",
      sid,
      Date.now() + 86400000,
    ).run();
    ctx.cookie = `pixai_session=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  }
  if (path.startsWith("/api/admin")) {
    await limited(db, `admin:${ip}`, 30);
    const token =
      request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    if (
      !env.ADMIN_TOKEN ||
      env.ADMIN_TOKEN.length < 32 ||
      !(await constantEqual(token, env.ADMIN_TOKEN))
    )
      fail(401, "Informe a chave administrativa configurada no servidor.");
    if (path === "/api/admin/settings" && request.method === "GET")
      return json(await settings(db));
    if (path === "/api/admin/settings" && request.method === "PUT") {
      const body = await readBody(request);
      only(body, ["value", "revision"]);
      let value;
      try {
        value = validateSettings(body.value);
      } catch (e) {
        fail(400, e.message);
      }
      const current = await settings(db);
      if (body.revision !== current.revision)
        fail(
          409,
          "Os preços foram alterados em outra sessão. Recarregue antes de salvar.",
        );
      const statement =
        current.revision === 0
          ? run(
              db,
              "INSERT OR IGNORE INTO settings(id,value,revision,updated_at) VALUES ('pricing',?,1,?)",
              JSON.stringify(value),
              Date.now(),
            )
          : run(
              db,
              "UPDATE settings SET value=?,revision=revision+1,updated_at=? WHERE id='pricing' AND revision=?",
              JSON.stringify(value),
              Date.now(),
              body.revision,
            );
      const result = await db.batch([
        statement,
        auditRow(db, "PRICING_UPDATE_ATTEMPT", "pricing", {
          previousRevision: current.revision,
        }),
      ]);
      if (!result[0].meta.changes)
        fail(409, "Conflito de edição. Recarregue os preços.");
      return json(await settings(db));
    }
    if (path === "/api/admin/dashboard" && request.method === "GET") {
      const rows = await run(
        db,
        "SELECT * FROM operations ORDER BY created_at DESC LIMIT 500",
      ).all();
      const all = await first(db, "SELECT count(*) AS total FROM operations");
      const quoteCount = await first(
        db,
        "SELECT count(*) AS total FROM quotes",
      );
      const totals = {
        operations: rows.results.length,
        volume: 0,
        revenue: 0,
        gatewayFees: 0,
        profit: 0,
        pixSent: 0,
        pixFailed: 0,
        underReview: 0,
        chargebacks: 0,
      };
      for (const r of rows.results) {
        const q = JSON.parse(r.value).quote;
        totals.volume += q.pixAmount;
        totals.revenue += q.totalCharge;
        totals.gatewayFees += q.gatewayCost;
        totals.profit += q.profit;
        totals.pixSent += r.status === "COMPLETED" ? 1 : 0;
        totals.pixFailed += r.status === "PIX_FAILED" ? 1 : 0;
        totals.underReview += r.status === "UNDER_REVIEW" ? 1 : 0;
        totals.chargebacks += r.status === "CHARGEBACK" ? 1 : 0;
      }
      return json({
        totals: {
          ...totals,
          average: totals.operations ? totals.volume / totals.operations : 0,
          margin: totals.volume ? totals.profit / totals.volume : 0,
        },
        totalOperations: all.total,
        quoteCount: quoteCount.total,
        conversion: quoteCount.total ? all.total / quoteCount.total : 0,
        scope:
          "Últimas 500 operações de teste. Valores projetados, sem receita real.",
        operations: rows.results.slice(0, 50).map(receipt),
        integrations: {
          payments: "unconfigured",
          pix: "unconfigured",
          kyc: "unconfigured",
          email: "unconfigured",
          production: "blocked",
        },
      });
    }
    fail(404, "Recurso administrativo não encontrado.");
  }
  if (path === "/api/bootstrap" && request.method === "GET") {
    const s = await settings(db);
    return json({
      environment: env.APP_ENV || "sandbox",
      paymentsEnabled: realConfigured(env),
      providerEnvironment: env.ASAAS_ENV || null,
      minAmount: s.value.minAmount,
      maxAmount: s.value.maxAmount,
      offers: homeOffers(s.value).map(publicQuote),
      revision: s.revision,
    });
  }
  if (path === "/api/quotes" && request.method === "POST") {
    await limited(db, `quotes:${sid}`, 30);
    const body = await readBody(request);
    only(body, ["pixAmount"]);
    const s = await settings(db);
    let options;
    try {
      options = quoteOptions(body.pixAmount, s.value);
    } catch (e) {
      fail(400, e.message);
    }
    const id = crypto.randomUUID(),
      expires = Date.now() + 600000;
    await run(
      db,
      "INSERT INTO quotes(id,session,value,expires,revision) VALUES (?,?,?,?,?)",
      id,
      sid,
      JSON.stringify(options),
      expires,
      s.revision,
    ).run();
    return json({
      id,
      expires,
      options: options.map(publicQuote),
      environment: "sandbox",
    });
  }
  if (path === "/api/sandbox/confirm" && request.method === "POST") {
    await limited(db, `confirm:${sid}`, 10);
    const body = await readBody(request);
    only(body, [
      "quoteId",
      "installments",
      "scenario",
      "confirmed",
      "termsVersion",
    ]);
    const key = request.headers.get("idempotency-key");
    if (!safeId(key)) fail(400, "Chave de idempotência inválida.");
    if (body.confirmed !== true || body.termsVersion !== "sandbox-v1")
      fail(400, "A confirmação explícita da simulação é obrigatória.");
    if (
      !["approved", "declined", "review", "pix_failed"].includes(body.scenario)
    )
      fail(400, "Cenário inválido.");
    const hash = await sha256(
      JSON.stringify([
        sid,
        body.quoteId,
        body.installments,
        body.scenario,
        body.termsVersion,
      ]),
    );
    const existing = await first(
      db,
      "SELECT * FROM operations WHERE idempotency_key=?",
      key,
    );
    if (existing) {
      if (existing.session !== sid || existing.request_hash !== hash)
        fail(409, "Chave já usada para outra solicitação.");
      return json(receipt(existing));
    }
    const q = await first(
      db,
      "SELECT * FROM quotes WHERE id=? AND session=?",
      body.quoteId,
      sid,
    );
    if (!q || q.expires < Date.now())
      fail(409, "A cotação expirou. Escolha o valor novamente.");
    const s = await settings(db);
    if (q.revision !== s.revision)
      fail(409, "Os preços mudaram. Gere uma nova cotação.");
    const saved = JSON.parse(q.value).find(
      (o) => o.installments === body.installments,
    );
    if (!saved) fail(400, "Parcelamento inválido.");
    const offer = s.value.offers.find(
      (o) =>
        o.pixAmount === saved.pixAmount &&
        o.installments === saved.installments,
    );
    const fresh = price(
      saved.pixAmount,
      saved.installments,
      s.value,
      null,
      offer?.installmentFloor || 0,
    );
    if (fresh.totalCharge !== saved.totalCharge)
      fail(409, "Cotação divergente. Gere novamente.");
    // Atomic daily/session limit. No real identities are accepted by this demo-only endpoint.
    await limited(
      db,
      `operations:${sid}`,
      s.value.maxOperationsPerSession,
      86400000,
    );
    const timeline = sandboxTimeline(body.scenario),
      status = timeline.at(-1);
    const id = `TEST-PIX-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const value = {
      quote: fresh,
      timeline,
      scenario: body.scenario,
      termsVersion: body.termsVersion,
      simulated: true,
    };
    try {
      await db.batch([
        run(
          db,
          "INSERT INTO operations(id,session,quote_id,idempotency_key,request_hash,environment,status,value,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          id,
          sid,
          q.id,
          key,
          hash,
          "sandbox",
          status,
          JSON.stringify(value),
          Date.now(),
        ),
        auditRow(db, "SANDBOX_CONFIRMED", id, { status, quoteId: q.id }),
      ]);
    } catch (e) {
      const winner = await first(
        db,
        "SELECT * FROM operations WHERE idempotency_key=? OR quote_id=?",
        key,
        q.id,
      );
      if (winner && winner.session === sid && winner.request_hash === hash)
        return json(receipt(winner));
      if (winner) fail(409, "Esta cotação já foi utilizada.");
      throw e;
    }
    return json(
      receipt(await first(db, "SELECT * FROM operations WHERE id=?", id)),
      201,
    );
  }
  if (path === "/api/lookup/request" && request.method === "POST") {
    await limited(db, `otp:${sid}`, 5, 600000);
    await limited(db, `otp-ip:${ip}`, 15, 600000);
    const body = await readBody(request);
    only(body, ["transactionId"]);
    if (
      typeof body.transactionId !== "string" ||
      body.transactionId.length > 80
    )
      fail(400, "Código inválido.");
    // Fixtures only: no email delivery or real personal data is claimed or accepted.
    const tx = await first(
      db,
      "SELECT id FROM operations WHERE id=? AND session=?",
      body.transactionId,
      sid,
    );
    const id = crypto.randomUUID(),
      bytes = crypto.getRandomValues(new Uint32Array(1)),
      code = String(bytes[0] % 1000000).padStart(6, "0");
    await run(
      db,
      "INSERT INTO challenges(id,session,transaction_id,digest,expires,attempts,consumed) VALUES (?,?,?,?,?,0,0)",
      id,
      sid,
      tx ? tx.id : "unavailable",
      await sha256(`${id}:${code}`),
      Date.now() + 300000,
    ).run();
    return json({
      challengeId: id,
      demoCode: code,
      delivery: "DEMO_ONLY",
      message:
        "Código de demonstração. Nenhum e-mail foi enviado. A consulta de teste vale apenas nesta sessão.",
    });
  }
  if (path === "/api/lookup/verify" && request.method === "POST") {
    await limited(db, `verify:${sid}`, 15, 600000);
    const body = await readBody(request);
    only(body, ["challengeId", "code"]);
    if (!safeId(body.challengeId) || !/^\d{6}$/.test(body.code || ""))
      fail(400, "Informe os seis dígitos.");
    const c = await first(
      db,
      "UPDATE challenges SET attempts=attempts+1 WHERE id=? AND session=? AND consumed=0 AND expires>? AND attempts<5 RETURNING *",
      body.challengeId,
      sid,
      Date.now(),
    );
    if (
      !c ||
      !(await constantEqual(c.digest, await sha256(`${c.id}:${body.code}`)))
    )
      fail(401, "Código inválido ou expirado.");
    const consumed = await run(
      db,
      "UPDATE challenges SET consumed=1 WHERE id=? AND consumed=0",
      c.id,
    ).run();
    if (!consumed.meta.changes) fail(401, "Código já utilizado.");
    const tx = await first(
      db,
      "SELECT * FROM operations WHERE id=? AND session=?",
      c.transaction_id,
      sid,
    );
    if (!tx) fail(401, "Transação não disponível nesta sessão de teste.");
    await auditRow(db, "RECEIPT_VIEWED", tx.id).run();
    return json(receipt(tx));
  }
  if (
    path === "/api/payments" ||
    path === "/api/webhooks" ||
    path === "/api/checkout" ||
    path === "/api/production/confirm"
  )
    fail(
      503,
      "Pagamentos reais bloqueados. Parceiro oficial não configurado e não homologado.",
    );
  fail(404, "Recurso não encontrado.");
}
export default {
  async fetch(request, env = {}) {
    let response;
    const ctx = {};
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith("/api/real/"))
        response = await realApi(request, env, ctx, pathname);
      else if (pathname.startsWith("/api/"))
        response = await api(request, env, ctx);
      else
        response = env.ASSETS
          ? await env.ASSETS.fetch(request)
          : new Response("Frontend não configurado", { status: 503 });
    } catch (e) {
      response = json(
        {
          error: e.status
            ? e.message
            : "Não foi possível concluir. Tente novamente.",
          code: e.status || 500,
        },
        e.status || 500,
      );
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (new URL(request.url).protocol === "https:")
      headers.set("Strict-Transport-Security", "max-age=31536000");
    if (ctx.cookie) headers.append("Set-Cookie", ctx.cookie);
    return new Response(response.body, { status: response.status, headers });
  },
};
