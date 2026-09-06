export const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function constantEqual(a,b) {
 const [x,y]=await Promise.all([sha256(a),sha256(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;
}
export function safeId(x) { return typeof x==='string' && /^[A-Za-z0-9_-]{16,100}$/.test(x); }
export async function verifySignature(raw,timestamp,signature,secret,now=Date.now()) {
 if(!secret||!/^[0-9]{13}$/.test(timestamp||'')||Math.abs(now-Number(timestamp))>300000||!/^[a-f0-9]{64}$/.test(signature||'')) return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`));
 const hex=Array.from(new Uint8Array(mac)).map(x=>x.toString(16).padStart(2,'0')).join('');
 return constantEqual(hex,signature);
}
