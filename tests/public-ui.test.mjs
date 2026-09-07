import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('rotas públicas não mostram fluxos fictícios nem habilitam cobrança durante preparação',async()=>{
  const script=readFileSync('public/app.js','utf8');
  for(const hash of ['#home','#installments','#payment','#result','#lookup','#terms','#privacy']) {
    const elements=new Map();
    const document={querySelector:(sel)=>{if(!elements.has(sel))elements.set(sel,{innerHTML:'',textContent:'',focus(){}});return elements.get(sel);},addEventListener(){}};
    const window={addEventListener(){},scrollTo(){}};
    const context={document,window,location:{hash},URLSearchParams,Intl,setTimeout:()=>1,clearTimeout(){},fetch:async()=>({ok:true,json:async()=>({environment:'sandbox',paymentsEnabled:false})})};
    await runInNewContext('(async()=>{'+script+'})()',context);
    const html=elements.get('#main').innerHTML;
    assert.doesNotMatch(html,/ambiente de teste|termos do teste|simulaç|fictíci|sandbox/i);
    assert.doesNotMatch(html,/id="real-confirm-form"|id="confirm-form"/);
    assert.ok(html.length>100);
  }
});
