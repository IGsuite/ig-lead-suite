import { z } from "zod";

export const publicWebsite = z.string().url().max(1000).refine(value => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
  } catch { return false; }
}, "Use an HTTPS website address without login details or query parameters.");
const count = z.number().int().min(0).max(10_000_000);
export const seoProjectInput = z.object({
  entityId:z.string().min(1).max(100), providerProjectId:z.string().regex(/^\d{1,15}$/),
  website:publicWebsite, automaticSync:z.boolean().default(false),
}).strict();
export const seoFindingInput = z.object({
  key:z.string().min(1).max(150), title:z.string().trim().min(1).max(300),
  priority:z.enum(["error","warning","notice"]), count,
  recommendation:z.string().trim().max(3000).default("Review the affected pages in Ahrefs before changing WordPress."),
  urls:z.array(publicWebsite).max(100).default([]),
}).strict();
export const seoReportInput = z.object({
  entityId:z.string().min(1).max(100), providerProjectId:z.string().regex(/^\d{1,15}$/),
  auditedAt:z.iso.datetime({offset:true}).refine(value=>Date.parse(value)<=Date.now()+60_000,"Audit date cannot be in the future."),
  healthScore:z.number().int().min(0).max(100), internalPages:count, errorUrls:count,
  // Only a complete provider response may automatically close absent findings.
  complete:z.boolean().default(false), findings:z.array(seoFindingInput).max(300),
}).strict().superRefine((value,ctx)=>{
  if(value.errorUrls>value.internalPages)ctx.addIssue({code:"custom",message:"Error pages cannot exceed crawled internal pages."});
  if(new Set(value.findings.map(f=>f.key)).size!==value.findings.length)ctx.addIssue({code:"custom",message:"Each finding needs a unique issue key."});
});
export type SeoReportInput = z.infer<typeof seoReportInput>;
export type SeoFinding = z.infer<typeof seoFindingInput>;
export const seoTaskPatch = z.object({
  id:z.uuid(), status:z.enum(["open","in_progress","fix_reported"]).optional(),
  assignee:z.string().trim().max(254).optional(),notes:z.string().trim().max(4000).optional(),
}).strict();
export function ahrefsReportUrl(projectId:string){return `https://app.ahrefs.com/site-audit/${encodeURIComponent(projectId)}/issues`;}
export function seoRecommendation(title:string):string {
  if(/404|4xx/i.test(title))return "Inspect the affected URLs and incoming links. Restore intended pages, redirect replaced pages to a relevant replacement, and remove outdated links.";
  if(/sitemap/i.test(title))return "Review the affected sitemap entries. Keep final canonical, indexable public pages; preserve intentional exclusions for private pages.";
  if(/orphan|incoming internal link/i.test(title))return "Review public pages and add relevant internal links. Do not expose private client or application pages merely to clear this flag.";
  if(/description/i.test(title))return "Review the search description for each affected public page and write a useful, accurate summary. Avoid padding solely to meet a length score.";
  if(/noindex|nofollow/i.test(title))return "Check whether this is intentional for login, client, application or confirmation pages. Preserve necessary privacy and indexing restrictions.";
  if(/schema|open graph/i.test(title))return "Check the affected page content and existing SEO plugin. Add accurate structured information or social-sharing tags only where appropriate.";
  if(/slow|file size/i.test(title))return "Review page load and the named resources. Optimize assets without changing the design or breaking forms, then retest.";
  return "Review the affected pages in Ahrefs. Confirm this finding needs a change before editing WordPress, then verify with a later audit.";
}
/** Same-crawl replays and historical reports must not overwrite current IT work. */
export function isNewerAudit(incoming:string|Date, latest?:string|Date|null){return !latest||new Date(incoming).getTime()>new Date(latest).getTime();}
export function nextSeoTaskStatus(previous:string|undefined, present:boolean, complete:boolean){
  if(present)return previous==="verified_fixed"?"open":previous||"open";
  return complete?"verified_fixed":previous||"open";
}
