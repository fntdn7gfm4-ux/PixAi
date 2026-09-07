import {price, validateSettings} from './pricing.mjs';
const ceilDiv=(a,b)=>(a+b-1n)/b;
// Launch margin is profit / total charged, not markup over the Pix amount.
export function launchPrice(amount,n,settings,perInstallmentFee=0,floor=0) {
  validateSettings(settings);
  const ppm=1000000n, margin=BigInt(settings.minimumProfitRate);
  const rate=BigInt(settings.gatewayRates[n-1]+settings.taxRate+settings.fraudReserve);
  if(margin+rate>=ppm) throw Error('Custos e margem inviabilizam a oferta.');
  const fee=settings.gatewayFixedFee+Math.max(0,n-1)*perInstallmentFee;
  // Three extra cents cover separate upwards rounding of percentage costs.
  const gross=ceilDiv(BigInt(amount+fee+settings.operationalCost+3)*ppm,ppm-rate-margin);
  const target=Number(ceilDiv(gross*margin,ppm));
  const q=price(amount,n,{...settings,minimumProfitAmount:Math.max(settings.minimumProfitAmount,target)}, {rate:settings.gatewayRates[n-1],fixedFee:fee},floor);
  if(BigInt(q.profit)*ppm<BigInt(q.totalCharge)*margin) throw Error('Margem insuficiente após arredondamento.');
  return {...q,margin:q.profit/q.totalCharge};
}
