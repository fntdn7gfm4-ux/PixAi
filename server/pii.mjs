const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (b64) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function importKey(env) {
  if (!env.PII_ENCRYPTION_KEY)
    throw Error("PII_ENCRYPTION_KEY não configurada.");
  const raw = base64ToBytes(env.PII_ENCRYPTION_KEY);
  if (raw.length !== 32)
    throw Error("PII_ENCRYPTION_KEY deve ser uma chave AES-256 em base64.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptPII(env, plaintext) {
  const key = await importKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ct))}`;
}
export async function decryptPII(env, stored) {
  const [ivB64, ctB64] = String(stored).split(":");
  if (!ivB64 || !ctB64) throw Error("Valor cifrado inválido.");
  const key = await importKey(env);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64) },
    key,
    base64ToBytes(ctB64),
  );
  return new TextDecoder().decode(pt);
}
