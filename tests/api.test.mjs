import test from "node:test";
import assert from "node:assert/strict";
import { harness, simulate } from "./helpers.mjs";
test("API não confirma sem aceite explícito e rejeita cartão/dados pessoais", async () => {
  const h = harness(),
    c = h.client();
  const q = await c("quotes", { method: "POST", body: { pixAmount: 10000 } });
  assert.equal(q.status, 200);
  assert.equal(
    (
      await c("sandbox/confirm", {
        method: "POST",
        key: crypto.randomUUID(),
        body: {
          quoteId: q.data.id,
          installments: 6,
          scenario: "approved",
          confirmed: false,
          termsVersion: "sandbox-v1",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await c("quotes", {
        method: "POST",
        body: { pixAmount: 10000, cardNumber: "DO-NOT-ACCEPT" },
      })
    ).status,
    400,
  );
  assert.equal(
    h.sqlite.prepare("SELECT count(*) AS n FROM operations").get().n,
    0,
  );
});
test("idempotência e cotação única impedem operação duplicada", async () => {
  const h = harness(),
    c = h.client();
  const { r, body, key } = await simulate(c);
  assert.equal(r.status, 201);
  assert.equal(r.data.status, "COMPLETED");
  const repeated = await c("sandbox/confirm", { method: "POST", body, key });
  assert.equal(repeated.data.id, r.data.id);
  assert.equal(
    (
      await c("sandbox/confirm", {
        method: "POST",
        body: { ...body, scenario: "declined" },
        key,
      })
    ).status,
    409,
  );
  const sameQuote = await c("sandbox/confirm", {
    method: "POST",
    body,
    key: crypto.randomUUID(),
  });
  assert.equal(sameQuote.data.id, r.data.id);
  assert.equal(
    h.sqlite.prepare("SELECT count(*) AS n FROM operations").get().n,
    1,
  );
});
test("a consulta exige desafio de uso único e isola sessões", async () => {
  const h = harness(),
    a = h.client(),
    b = h.client();
  const { r } = await simulate(a);
  const invalid = await b("lookup/request", {
    method: "POST",
    body: { transactionId: r.data.id },
  });
  assert.equal(
    (
      await b("lookup/verify", {
        method: "POST",
        body: {
          challengeId: invalid.data.challengeId,
          code: invalid.data.demoCode,
        },
      })
    ).status,
    401,
  );
  const challenge = await a("lookup/request", {
    method: "POST",
    body: { transactionId: r.data.id },
  });
  const verify = {
    challengeId: challenge.data.challengeId,
    code: challenge.data.demoCode,
  };
  assert.equal(
    (await b("lookup/verify", { method: "POST", body: verify })).status,
    401,
  );
  assert.equal(
    (await a("lookup/verify", { method: "POST", body: verify })).data.id,
    r.data.id,
  );
  assert.equal(
    (await a("lookup/verify", { method: "POST", body: verify })).status,
    401,
  );
});
test("OTP expira e bloqueia após cinco tentativas erradas", async () => {
  const h = harness(),
    a = h.client();
  const { r } = await simulate(a);
  const challenge = (
    await a("lookup/request", {
      method: "POST",
      body: { transactionId: r.data.id },
    })
  ).data;
  const wrong = challenge.demoCode === "999999" ? "888888" : "999999";
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await a("lookup/verify", {
          method: "POST",
          body: { challengeId: challenge.challengeId, code: wrong },
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await a("lookup/verify", {
        method: "POST",
        body: { challengeId: challenge.challengeId, code: challenge.demoCode },
      })
    ).status,
    401,
  );
  const second = (
    await a("lookup/request", {
      method: "POST",
      body: { transactionId: r.data.id },
    })
  ).data;
  h.sqlite
    .prepare("UPDATE challenges SET expires=0 WHERE id=?")
    .run(second.challengeId);
  assert.equal(
    (
      await a("lookup/verify", {
        method: "POST",
        body: { challengeId: second.challengeId, code: second.demoCode },
      })
    ).status,
    401,
  );
});
test("produção, homologação e webhooks permanecem fechados sem integração", async () => {
  const h = harness(),
    c = h.client();
  assert.equal((await c("payments", { method: "POST", body: {} })).status, 503);
  assert.equal((await c("webhooks", { method: "POST", body: {} })).status, 503);
  for (const mode of ["production", "homologation", "unknown"]) {
    h.env.APP_ENV = mode;
    assert.equal(
      (await c("quotes", { method: "POST", body: { pixAmount: 10000 } }))
        .status,
      503,
    );
  }
});
test("todos os cenários mantêm pagamento e Pix separados", async () => {
  const h = harness(),
    c = h.client();
  for (const [scenario, status, pix] of [
    ["approved", "COMPLETED", "SENT"],
    ["declined", "PAYMENT_FAILED", "NOT_SENT"],
    ["review", "UNDER_REVIEW", "NOT_SENT"],
    ["pix_failed", "PIX_FAILED", "FAILED"],
  ]) {
    const { r } = await simulate(c, scenario);
    assert.equal(r.data.status, status);
    assert.equal(r.data.pixStatus, pix);
    assert.equal(r.data.simulated, true);
    assert.equal(r.data.emailDelivery, "NOT_CONFIGURED");
  }
});
test("admin exige segredo, rejeita conflito e invalida cotação antiga", async () => {
  const h = harness(),
    c = h.client();
  assert.equal((await c("admin/settings")).status, 401);
  const s = (await c("admin/settings", { admin: true })).data;
  const quote = (
    await c("quotes", { method: "POST", body: { pixAmount: 10000 } })
  ).data;
  s.value.gatewayFixedFee = 500;
  assert.equal(
    (await c("admin/settings", { method: "PUT", admin: true, body: s })).status,
    200,
  );
  assert.equal(
    (await c("admin/settings", { method: "PUT", admin: true, body: s })).status,
    409,
  );
  assert.equal(
    (
      await c("sandbox/confirm", {
        method: "POST",
        key: crypto.randomUUID(),
        body: {
          quoteId: quote.id,
          installments: 6,
          scenario: "approved",
          confirmed: true,
          termsVersion: "sandbox-v1",
        },
      })
    ).status,
    409,
  );
  const boot = (await c("bootstrap")).data;
  assert.ok(boot.offers[0].installmentAmount > 1490);
});
test("cotação de outra sessão e cotação expirada não são aceitas", async () => {
  const h = harness(),
    a = h.client(),
    b = h.client();
  const q = (await a("quotes", { method: "POST", body: { pixAmount: 10000 } }))
    .data;
  const body = {
    quoteId: q.id,
    installments: 6,
    scenario: "approved",
    confirmed: true,
    termsVersion: "sandbox-v1",
  };
  assert.equal(
    (
      await b("sandbox/confirm", {
        method: "POST",
        body,
        key: crypto.randomUUID(),
      })
    ).status,
    409,
  );
  h.sqlite.prepare("UPDATE quotes SET expires=0").run();
  assert.equal(
    (
      await a("sandbox/confirm", {
        method: "POST",
        body,
        key: crypto.randomUUID(),
      })
    ).status,
    409,
  );
});
test("limite de tentativas e cabeçalhos de proteção são aplicados", async () => {
  const h = harness(),
    c = h.client();
  const boot = await c("bootstrap");
  assert.match(
    boot.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.match(boot.headers.get("set-cookie"), /HttpOnly/);
  for (let i = 0; i < 30; i++)
    assert.equal(
      (await c("quotes", { method: "POST", body: { pixAmount: 10000 } }))
        .status,
      200,
    );
  assert.equal(
    (await c("quotes", { method: "POST", body: { pixAmount: 10000 } })).status,
    429,
  );
  assert.equal(
    (
      await c("quotes", {
        method: "POST",
        headers: { origin: "https://evil.test" },
        body: { pixAmount: 10000 },
      })
    ).status,
    403,
  );
});
