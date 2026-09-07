import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS} from '../server/pricing.mjs';
import {launchPrice} from '../server/launch-pricing.mjs';
test('margem de lançamento é ao menos 30% da cobrança após todos os custos configurados',()=>{
  for(const taxRate of [0,60000,155000]) for(const fraudReserve of [0,10000,50000]) {
    const s={...structuredClone(DEFAULT_SETTINGS),taxRate,fraudReserve,operationalCost:150,gatewayFixedFee:249,gatewayRates:[29900,...Array(5).fill(34900),...Array(6).fill(39900)]};
    for(const amount of [2000,5000,10000,25000,100000]) for(let n=1;n<=12;n++) {
      const q=launchPrice(amount,n,s,49);
      assert.ok(q.profit*100>=q.totalCharge*30);
      assert.equal(q.profit,q.totalCharge-q.pixAmount-q.gatewayCost-q.taxCost-q.fraudCost-q.operationalCost);
      assert.ok(q.gatewayCost>=249+(n-1)*49);
    }
  }
});
test('custos que inviabilizam a margem bloqueiam a oferta',()=>{
  const s={...structuredClone(DEFAULT_SETTINGS),gatewayRates:Array(12).fill(690000),fraudReserve:20000};
  assert.throws(()=>launchPrice(10000,6,s),/inviabilizam/);
});
