// Official contract: https://www.infinitepay.io/checkout-documentacao
// The second origin is the compatibility endpoint still maintained by InfinitePay.
const origins = [
  'https://api.checkout.infinitepay.io',
  'https://api.infinitepay.io/invoices/public/checkout',
];
export async function infiniteRequest(path, body) {
  const failures=[];
  for(const origin of origins) {
    try {
      const response = await fetch(origin + path, {
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(12000),
      });
      if(response.ok) return await response.json();
      const detail=await response.text().catch(()=>'');
      failures.push(`${new URL(origin).hostname}:HTTP_${response.status}${detail?':'+detail.slice(0,300):''}`);
    } catch(error) {
      failures.push(`${new URL(origin).hostname}:${error?.name||'FETCH_ERROR'}`);
    }
  }
  const error=Error('InfinitePay indisponível para esta solicitação.');
  error.diagnostic=failures.join(',');
  throw error;
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
    ['credit_card','pix'].includes(result.capture_method);
}
