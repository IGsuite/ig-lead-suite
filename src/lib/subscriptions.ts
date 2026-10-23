import { z } from "zod";

const safeUrl = z.string().trim().max(1000).refine(value => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      ![...url.searchParams.keys()].some(key => /^(token|api_?key|secret|password|access_token|code)$/i.test(key));
  } catch { return false; }
}, "Use a secure website link without passwords or access tokens.");
const calendarDate = z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, "Choose a valid renewal date.");

export const subscriptionInput = z.object({
  id: z.uuid().optional(), companyIds: z.array(z.string().min(1).max(100)).min(1).max(50).transform(ids => [...new Set(ids)]),
  service: z.string().trim().min(1).max(100), purpose: z.string().trim().min(1).max(500),
  loginUrl: safeUrl.refine(Boolean,"Enter the service login link."), username:z.string().trim().max(254).default(""),
  vaultUrl: safeUrl.default(""), plan:z.string().trim().max(100).default(""),
  amountCents:z.number().int().min(0).max(100_000_000).nullable().default(null),
  currency:z.enum(["USD","EUR","GBP","CAD"]).default("USD"),
  billingCycle:z.enum(["monthly","annual","usage","one_time","free"]).default("monthly"),
  renewalDate:calendarDate.default(""), status:z.enum(["active","trial","paused","cancelled","needs_review"]).default("needs_review"),
  notes:z.string().trim().max(2000).default(""),
}).strict();
export type SubscriptionInput = z.infer<typeof subscriptionInput>;
export type SubscriptionRecord = SubscriptionInput & {id:string};

/** Shared bills count once, in their original currency. Unknown/usage fees stay separate. */
export function subscriptionTotals(rows:SubscriptionRecord[]) {
  const unique = [...new Map(rows.map(row=>[row.id,row])).values()];
  const totals:Record<string,number>={}; let unpriced=0;
  for(const row of unique){
    if(!["active","trial"].includes(row.status))continue;
    if(["free","one_time"].includes(row.billingCycle))continue;
    if(row.billingCycle==="usage"||row.amountCents===null){unpriced++;continue;}
    if(!["monthly","annual"].includes(row.billingCycle))continue;
    totals[row.currency]=(totals[row.currency]||0)+row.amountCents/(row.billingCycle==="annual"?12:1);
  }
  return {monthly:totals,unpriced};
}
