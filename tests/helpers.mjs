import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../server/worker.mjs';
export function harness() {
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(`drizzle/${name}`,'utf8'));
 const DB={prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(items){sqlite.exec('BEGIN');try{const r=[];for(const item of items)r.push(await item.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const env={DB,APP_ENV:'sandbox',ADMIN_TOKEN:'test-admin-token-with-at-least-32-characters'};
 function client(){let cookie='';return async(path,{method='GET',body,key,admin=false,headers={}}={})=>{const r=await worker.fetch(new Request(`https://pixai.test/api/${path}`,{method,headers:{cookie,...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{}),...(admin?{authorization:`Bearer ${env.ADMIN_TOKEN}`} :{}),...headers},body:body?JSON.stringify(body):undefined}),env);if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json(),headers:r.headers};};}
 return {sqlite,env,client};
}
export async function simulate(call,scenario='approved') { const q=await call('quotes',{method:'POST',body:{pixAmount:10000}});const body={quoteId:q.data.id,installments:6,scenario,confirmed:true,termsVersion:'sandbox-v1'},key=crypto.randomUUID();const r=await call('sandbox/confirm',{method:'POST',body,key});return {r,q,body,key}; }
