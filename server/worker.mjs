import {
  DEFAULT_SETTINGS,
  validateSettings,
  price,
  homeOffers,
  quoteOptions,
} from "./pricing.mjs";
import { sandboxTimeline } from "./states.mjs";
import { sha256, constantEqual, safeId } from "./security.mjs";

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
async function api(request, env, ctx) {
  const path = new URL(request.url).pathname;
  if (path === "/api/health")
    return json({
      status: "ok",
      environment: env.APP_ENV || "sandbox",
      paymentsEnabled: false,
      provider: "unconfigured",
      storage: !!env.DB,
      version: "2.0.0",
    });
  if (!env.DB)
    fail(503, "O armazenamento do ambiente ainda não está configurado.");
  const db = env.DB;
  if ((env.APP_ENV || "sandbox") !== "sandbox")
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
      environment: "sandbox",
      paymentsEnabled: false,
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
      if (new URL(request.url).pathname.startsWith("/api/"))
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
