import test from "node:test";
import assert from "node:assert/strict";
import { isValidCPF, normalizeCPF, maskedCpfMatches } from "../server/cpf.mjs";
import { encryptPII, decryptPII } from "../server/pii.mjs";
import {
  asaasFetch,
  findOrCreateCustomer,
  createCheckout,
  lookupPixKeyHolder,
  sendPixTransfer,
  verifyAsaasWebhookToken,
} from "../server/asaas.mjs";

test("isValidCPF aceita CPFs válidos e rejeita inválidos/repetidos", () => {
  assert.equal(isValidCPF("529.982.247-25"), true);
  assert.equal(isValidCPF("52998224725"), true);
  assert.equal(isValidCPF("111.111.111-11"), false);
  assert.equal(isValidCPF("529.982.247-24"), false);
  assert.equal(isValidCPF("123"), false);
  assert.equal(isValidCPF(""), false);
  assert.equal(isValidCPF(null), false);
});

test("maskedCpfMatches confere apenas os dígitos visíveis da máscara do Asaas", () => {
  const cpf = "52998224725";
  assert.equal(maskedCpfMatches(cpf, "***.982.247-**"), true);
  assert.equal(maskedCpfMatches(cpf, "***.000.000-**"), false);
  assert.equal(maskedCpfMatches(cpf, null), false);
  assert.equal(maskedCpfMatches("123", "***.982.247-**"), false);
  assert.equal(
    maskedCpfMatches(normalizeCPF("529.982.247-25"), "***.982.247-**"),
    true,
  );
});

test("encryptPII/decryptPII faz round-trip e usa IV diferente a cada chamada", async () => {
  const env = { PII_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
  const a = await encryptPII(env, "52998224725");
  const b = await encryptPII(env, "52998224725");
  assert.notEqual(a, b);
  assert.equal(await decryptPII(env, a), "52998224725");
  assert.equal(await decryptPII(env, b), "52998224725");
});

test("decryptPII falha com chave incorreta", async () => {
  const env1 = { PII_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") };
  const env2 = { PII_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64") };
  const stored = await encryptPII(env1, "segredo");
  await assert.rejects(() => decryptPII(env2, stored));
});

test("verifyAsaasWebhookToken exige token configurado com pelo menos 16 caracteres e compara em tempo constante", async () => {
  const env = { ASAAS_WEBHOOK_TOKEN: "token-configurado-do-asaas" };
  const ok = new Request("https://x.test", {
    headers: { "asaas-access-token": "token-configurado-do-asaas" },
  });
  const bad = new Request("https://x.test", {
    headers: { "asaas-access-token": "errado" },
  });
  const missing = new Request("https://x.test");
  assert.equal(await verifyAsaasWebhookToken(ok, env, "ASAAS_WEBHOOK_TOKEN"), true);
  assert.equal(await verifyAsaasWebhookToken(bad, env, "ASAAS_WEBHOOK_TOKEN"), false);
  assert.equal(
    await verifyAsaasWebhookToken(missing, env, "ASAAS_WEBHOOK_TOKEN"),
    false,
  );
  assert.equal(
    await verifyAsaasWebhookToken(ok, { ASAAS_WEBHOOK_TOKEN: "" }, "ASAAS_WEBHOOK_TOKEN"),
    false,
  );
});

function fakeFetch(handler) {
  return async (url, init) => {
    const res = handler(url, init ? JSON.parse(init.body || "null") : null, init);
    return {
      ok: res.status < 400,
      status: res.status,
      json: async () => res.body,
    };
  };
}

test("asaasFetch envia access_token no header e propaga erro em respostas não-ok", async () => {
  const calls = [];
  const fx = fakeFetch((url, body, init) => {
    calls.push({ url, body, headers: init.headers });
    return { status: 200, body: { ok: true } };
  });
  const env = { ASAAS_API_KEY: "chave-de-teste", ASAAS_ENV: "sandbox" };
  const r = await asaasFetch(env, "POST", "/x", { a: 1 }, fx);
  assert.deepEqual(r, { ok: true });
  assert.equal(calls[0].headers.access_token, "chave-de-teste");
  assert.match(calls[0].url, /^https:\/\/api-sandbox\.asaas\.com\/v3\/x$/);

  const fxFail = fakeFetch(() => ({
    status: 400,
    body: { errors: [{ description: "valor inválido" }] },
  }));
  await assert.rejects(
    () => asaasFetch(env, "POST", "/x", {}, fxFail),
    /valor inválido/,
  );
});

test("findOrCreateCustomer reaproveita cliente existente por CPF em vez de duplicar", async () => {
  const calls = [];
  const fx = fakeFetch((url) => {
    calls.push(url);
    if (url.includes("/customers?"))
      return { status: 200, body: { data: [{ id: "cus_existing" }] } };
    return { status: 200, body: { id: "cus_new" } };
  });
  const id = await findOrCreateCustomer(
    { ASAAS_API_KEY: "k" },
    { cpf: "52998224725", name: "Teste", email: "t@t.com" },
    fx,
  );
  assert.equal(id, "cus_existing");
  assert.equal(calls.length, 1);
});

test("createCheckout usa checkout hospedado (nunca recebe dados de cartão)", async () => {
  let sentBody;
  const fx = fakeFetch((url, body) => {
    sentBody = body;
    return { status: 200, body: { id: "chk_1", link: "https://asaas.com/x" } };
  });
  const r = await createCheckout(
    { ASAAS_API_KEY: "k" },
    {
      customerId: "cus_1",
      valueCents: 15490,
      installments: 6,
      externalReference: "OP1",
      successUrl: "https://a/#s",
      cancelUrl: "https://a/#c",
      expiredUrl: "https://a/#e",
    },
    fx,
  );
  assert.equal(r.link, "https://asaas.com/x");
  assert.equal(sentBody.billingTypes[0], "CREDIT_CARD");
  assert.equal(sentBody.items[0].value, 154.9);
  assert.ok(!("creditCard" in sentBody));
  assert.ok(!("card" in sentBody));
});

test("lookupPixKeyHolder retorna null em 404 e propaga outros erros", async () => {
  const notFound = fakeFetch(() => ({ status: 404, body: { errors: [] } }));
  assert.equal(
    await lookupPixKeyHolder({ ASAAS_API_KEY: "k" }, { type: "CPF", key: "x" }, notFound),
    null,
  );
  const serverError = fakeFetch(() => ({
    status: 500,
    body: { errors: [{ description: "fora do ar" }] },
  }));
  await assert.rejects(() =>
    lookupPixKeyHolder({ ASAAS_API_KEY: "k" }, { type: "CPF", key: "x" }, serverError),
  );
});

test("sendPixTransfer converte centavos para reais corretamente", async () => {
  let sentBody;
  const fx = fakeFetch((url, body) => {
    sentBody = body;
    return { status: 200, body: { id: "transfer_1", status: "PENDING" } };
  });
  await sendPixTransfer(
    { ASAAS_API_KEY: "k" },
    {
      valueCents: 10000,
      pixAddressKey: "52998224725",
      pixAddressKeyType: "CPF",
      externalReference: "OP1",
      description: "Pix OP1",
    },
    fx,
  );
  assert.equal(sentBody.value, 100);
  assert.equal(sentBody.pixAddressKeyType, "CPF");
});
