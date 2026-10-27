export type DeliveryCounts=Record<string,number>;
export function deliveryTotals(counts:DeliveryCounts){
  return {queued:(counts.queued||0)+(counts.processing||0),accepted:counts.accepted||0,sent:counts.sent||0,delivered:counts.delivered||0,failed:(counts.failed||0)+(counts.bounced||0),uncertain:counts.uncertain||0,skipped:counts.skipped||0};
}
export function providerFailureReason(value:unknown):string {
  if(!Array.isArray(value))return "Provider reported a delivery failure. Review delivery details before retrying.";
  const errors=value.filter(e=>e&&typeof e==="object").slice(0,3) as Array<Record<string,unknown>>;
  const text=errors.map(e=>[e.code,e.title,e.detail].filter(v=>typeof v==="string"||typeof v==="number").join(" — ")).join("; ");
  return (text||"Provider reported a delivery failure.").replace(/https?:\/\/\S+/g,"[provider reference]").slice(0,600);
}
