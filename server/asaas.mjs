import { constantEqual, safeId } from "./security.mjs";
const BASE_URL = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};
class AsaasError extends Error {
  constructor(status, body) {
    super(body?.errors?.[0]?.description || "Falha na comunicação com o Asaas.");
    this.status = status;
    this.body = body;
  }
}
function baseUrl(env) {
  const mode = env.ASAAS_ENV === "production" ? "production" : "sandbox";
  return BASE_URL[mode];
}
export async function asaasFetch(env, method, path, body, fetchImpl = fetch) {
  if (!env.ASAAS_API_KEY) throw Error("ASAAS_API_KEY não configurada.");
  const r = await fetchImpl(`${baseUrl(env)}${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      access_token: env.ASAAS_API_KEY,
      "user-agent": "PixAI/2.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new AsaasError(r.status, data);
  return data;
}
const centsToReais = (cents) => Math.round(cents) / 100;
export async function findOrCreateCustomer(
  env,
  { cpf, name, email },
  fetchImpl = fetch,
) {
  const existing = await asaasFetch(
    env,
    "GET",
    `/customers?cpfCnpj=${encodeURIComponent(cpf)}&limit=1`,
    null,
    fetchImpl,
  );
  if (existing?.data?.[0]?.id) return existing.data[0].id;
  const created = await asaasFetch(
    env,
    "POST",
    "/customers",
    { name, cpfCnpj: cpf, email },
    fetchImpl,
  );
  return created.id;
}
export async function createCheckout(
  env,
  {
    customerId,
    valueCents,
    installments,
    externalReference,
    successUrl,
    cancelUrl,
    expiredUrl,
  },
  fetchImpl = fetch,
) {
  return asaasFetch(
    env,
    "POST",
    "/checkouts",
    {
      customer: customerId,
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: [installments > 1 ? "INSTALLMENT" : "DETACHED"],
      ...(installments > 1 ? { installment: { maxInstallmentCount: installments } } : {}),
      minutesToExpire: 30,
      externalReference,
      callback: { successUrl, cancelUrl, expiredUrl },
      items: [
        {
          name: "Pix via cartao",
          description: `Pix em ${installments}x — pedido ${externalReference}`,
          value: centsToReais(valueCents),
          quantity: 1,
        },
      ],
    },
    fetchImpl,
  );
}
// Returns the masked cpfCnpj (e.g. ***.202.745-**) registered for a Pix key,
// or null if the key is unknown. Rate-limited by Asaas to 5 req/min/account.
export async function lookupPixKeyHolder(
  env,
  { type, key },
  fetchImpl = fetch,
) {
  try {
    const r = await asaasFetch(
      env,
      "GET",
      `/pix/addressKeys/external?type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`,
      null,
      fetchImpl,
    );
    return r?.cpfCnpj || null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}
export async function sendPixTransfer(
  env,
  { valueCents, pixAddressKey, pixAddressKeyType, externalReference, description },
  fetchImpl = fetch,
) {
  return asaasFetch(
    env,
    "POST",
    "/transfers",
    {
      value: centsToReais(valueCents),
      pixAddressKey,
      pixAddressKeyType,
      operationType: "PIX",
      externalReference,
      description,
    },
    fetchImpl,
  );
}
export async function verifyAsaasWebhookToken(request, env, envVar) {
  const token = request.headers.get("asaas-access-token") || "";
  const expected = env[envVar] || "";
  if (!expected || expected.length < 16) return false;
  return constantEqual(token, expected);
}
export function isSafeExternalReference(value) {
  return safeId(value);
}
