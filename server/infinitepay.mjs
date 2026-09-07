// Official contract: https://www.infinitepay.io/checkout-documentacao
const origin = 'https://api.checkout.infinitepay.io';
export async function infiniteRequest(path, body) {
  const response = await fetch(origin + path, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body), signal: AbortSignal.timeout(12000), redirect:'error',
  });
  if (!response.ok) throw Error('InfinitePay indisponível para esta solicitação.');
  return response.json();
}
export function checkoutUrl(value) {
  const u = new URL(value);
  if(u.protocol!=='https:' || u.username || u.password ||
    !['checkout.infinitepay.com.br','checkout.infinitepay.io','pay.infinitepay.io'].includes(u.hostname))
    throw Error('Endereço de checkout inválido.');
  return u.href;
}
export function verifiedPayment(result, total) {
  return result?.success===true && result.paid===true && result.amount===total &&
    Number.isSafeInteger(result.paid_amount) && result.paid_amount>=total &&
    Number.isInteger(result.installments) && result.installments>=1 && result.installments<=12 &&
    result.capture_method==='credit_card';
}
