import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const GOOGLE_REPORT_KEY = "internal_google_ads_reports_v1";
export const GOOGLE_REPORT_ACCOUNT = "4209975325";
const metric = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s);
export const googleReportSchema = z.object({
  accountId: z.literal(GOOGLE_REPORT_ACCOUNT), collectedAt: z.iso.datetime(),
  dateStart: day, dateEnd: day, currency: z.literal("USD"), timeZone: z.string().min(1).max(100),
  campaigns: z.array(z.object({
    id: z.string().regex(/^\d{1,30}$/), name: z.string().max(300), status: z.enum(["ENABLED", "PAUSED", "REMOVED"]),
    impressions: metric.int(), clicks: metric.int(), costMicros: metric, conversions: metric,
  }).strict()).max(200),
}).strict().superRefine((v,ctx) => {
  const duration = Date.parse(v.dateEnd) - Date.parse(v.dateStart);
  if (duration < 0 || duration > 31 * 86400_000) ctx.addIssue({code:"custom",message:"Invalid reporting period"});
  if(new Set(v.campaigns.map(c=>c.id)).size!==v.campaigns.length) ctx.addIssue({code:"custom",message:"Duplicate campaigns"});
});
export type GoogleReport = z.infer<typeof googleReportSchema>;
export const googleReportConfigSchema = z.object({
  hash:z.string().regex(/^[a-f0-9]{64}$/), issuedAt:z.iso.datetime(), expiresAt:z.iso.datetime(), revoked:z.boolean(),
  report:googleReportSchema.nullable(), receivedAt:z.iso.datetime().nullable(),
}).strict();
export type GoogleReportConfig = z.infer<typeof googleReportConfigSchema>;
export function newGoogleReportAccess(now=new Date()) {
  const token=`suite_gads.abstract.${randomBytes(32).toString("base64url")}`;
  const config:GoogleReportConfig={hash:createHash("sha256").update(token).digest("hex"),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+90*86400_000).toISOString(),revoked:false,report:null,receivedAt:null};
  return {token,config};
}
export function validGoogleReportAccess(authorization:string|null,config:GoogleReportConfig,now=new Date()) {
  if(config.revoked||Date.parse(config.expiresAt)<=now.getTime())return false;
  const token=/^Bearer (suite_gads\.abstract\.[A-Za-z0-9_-]{43})$/.exec(authorization||"")?.[1];
  return !!token&&timingSafeEqual(createHash("sha256").update(token).digest(),Buffer.from(config.hash,"hex"));
}
export function validateGoogleReportTime(report:GoogleReport,now=new Date()) {
  const age=now.getTime()-Date.parse(report.collectedAt);
  return age>=-300_000&&age<=3600_000&&Date.parse(report.dateEnd)<=now.getTime()+86400_000;
}
export function publicGoogleReport(config:GoogleReportConfig|null,revision:number,now=new Date()) {
  return {revision,accountId:GOOGLE_REPORT_ACCOUNT,expiresAt:config?.expiresAt,receivedAt:config?.receivedAt,
    state:!config?"not_connected":config.revoked?"revoked":Date.parse(config.expiresAt)<=now.getTime()?"expired":!config.receivedAt?"awaiting_report":now.getTime()-Date.parse(config.receivedAt)>2*86400_000?"stale":"receiving_reports",
    report:config?.revoked?null:config?.report??null,adChangesEnabled:false};
}
/** Fixed destination and account; AdsApp is used only for report reads. No mutation calls. */
export function googleAdsReportScript(token:string) {
  if(!/^suite_gads\.abstract\.[A-Za-z0-9_-]{43}$/.test(token))throw Error("Invalid report key");
  return `// Abstract Capital Group — Google Ads reporting only. No ad or budget changes.
// Install in customer 420-997-5325. Schedule daily. Key expires after 90 days.
function main() {
  var account = AdsApp.currentAccount();
  if (account.getCustomerId().replace(/-/g, '') !== '${GOOGLE_REPORT_ACCOUNT}') throw new Error('Wrong company account');
  if (account.getCurrencyCode() !== 'USD') throw new Error('Unexpected account currency');
  var rows = AdsApp.search('SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS');
  var campaigns = [];
  while (rows.hasNext()) {
    if (campaigns.length >= 200) throw new Error('Report exceeds 200 campaigns; no partial report sent');
    var row = rows.next();
    campaigns.push({id:String(row.campaign.id),name:row.campaign.name,status:row.campaign.status,impressions:Number(row.metrics.impressions||0),clicks:Number(row.metrics.clicks||0),costMicros:Number(row.metrics.costMicros||0),conversions:Number(row.metrics.conversions||0)});
  }
  var zone = account.getTimeZone();
  // LAST_30_DAYS includes the 30 days before today, excluding today.
  var end = new Date(Date.now()-86400000), start = new Date(Date.now()-30*86400000);
  var payload = {accountId:'${GOOGLE_REPORT_ACCOUNT}',collectedAt:new Date().toISOString(),dateStart:Utilities.formatDate(start,zone,'yyyy-MM-dd'),dateEnd:Utilities.formatDate(end,zone,'yyyy-MM-dd'),currency:'USD',timeZone:zone,campaigns:campaigns};
  var response = UrlFetchApp.fetch('https://www.igleadsuite.com/api/webhooks/google-ads-report',{method:'post',contentType:'application/json',headers:{Authorization:${JSON.stringify(`Bearer ${token}`)}},payload:JSON.stringify(payload),followRedirects:false,muteHttpExceptions:true});
  if(response.getResponseCode()!==200) throw new Error('Lead Suite report was not accepted. Status '+response.getResponseCode());
  Logger.log('Abstract report accepted by Lead Suite. No ads or budgets changed.');
}
`;
}
