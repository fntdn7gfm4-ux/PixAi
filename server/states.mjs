export const TRANSITIONS = {
 CREATED:['AWAITING_PAYMENT'], AWAITING_PAYMENT:['PROCESSING_PAYMENT','PAYMENT_FAILED'],
 PROCESSING_PAYMENT:['PAYMENT_APPROVED','PAYMENT_FAILED','UNDER_REVIEW'],
 PAYMENT_APPROVED:['PIX_PROCESSING','UNDER_REVIEW','REFUNDED','CHARGEBACK'],
 PIX_PROCESSING:['PIX_SENT','PIX_FAILED','UNDER_REVIEW'], PIX_SENT:['COMPLETED','CHARGEBACK'],
 COMPLETED:['REFUNDED','CHARGEBACK'], PAYMENT_FAILED:[], PIX_FAILED:['PIX_PROCESSING','REFUNDED','UNDER_REVIEW','CHARGEBACK'],
 UNDER_REVIEW:['PAYMENT_APPROVED','PAYMENT_FAILED','REFUNDED','CHARGEBACK'], REFUNDED:[], CHARGEBACK:[]
};
export function transition(from,to) { if(!TRANSITIONS[from]?.includes(to)) throw Error(`Transição não permitida: ${from} → ${to}`); return to; }
export function sandboxTimeline(scenario) {
 const states=['CREATED','AWAITING_PAYMENT','PROCESSING_PAYMENT'];
 if(scenario==='declined') states.push('PAYMENT_FAILED');
 else if(scenario==='review') states.push('UNDER_REVIEW');
 else states.push('PAYMENT_APPROVED','PIX_PROCESSING',...(scenario==='pix_failed'?['PIX_FAILED']:['PIX_SENT','COMPLETED']));
 states.slice(1).forEach((s,i)=>transition(states[i],s)); return states;
}
