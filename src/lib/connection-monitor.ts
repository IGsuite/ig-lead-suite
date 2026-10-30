import { getPrisma } from "@/lib/db";
import { decryptAccountPassword, encryptAccountPassword } from "@/lib/account-vault";
import { META_CREDENTIAL_KEY, metaStoredSchema, verifyMetaReporting } from "@/lib/meta-reporting";
import { GOOGLE_REPORT_KEY, googleReportConfigSchema } from "@/lib/google-ads-reporting";
import { N8N_CREDENTIAL_KEY, n8nConfigSchema } from "@/lib/n8n-connection";
import { companyEmailReadiness, companySmsReadiness } from "@/lib/go-live-providers";
import { credentialHealth, reportHealth, connectionEventChange, DAY, type ConnectionFinding } from "@/lib/connection-health";

/** Only existing company mappings and fixed read-only provider endpoints are used.
 * No login passwords are opened, no credentials renewed, and no dispatch functions run. */
export async function monitorConnections(now = new Date()) {
  const db = getPrisma();
  const companies = await db.entity.findMany({select: {id:true,domain:true,phoneNumbers:true}});
  const findings: ConnectionFinding[] = [];
  for (const company of companies) {
    const entityId = company.id;
    const add = (key:string,itemKey:string,title:string,health:Pick<ConnectionFinding,"state"|"detail">) => findings.push({entityId,key,itemKey,title,...health});
    const rows = await db.companyAccountCredential.findMany({where:{entityId,key:{in:[META_CREDENTIAL_KEY,GOOGLE_REPORT_KEY,N8N_CREDENTIAL_KEY]}},select:{id:true,key:true,encryptedValue:true,revision:true}});
    for (const row of rows) {
      const kind = row.key === META_CREDENTIAL_KEY ? "meta" : row.key === GOOGLE_REPORT_KEY ? "google" : "n8n";
      const item = kind === "meta" ? "facebook" : kind === "google" ? "google_ads" : "n8n";
      const title = kind === "meta" ? "Meta reporting" : kind === "google" ? "Google Ads reports" : "n8n notice access";
      try {
        const raw: unknown = JSON.parse(decryptAccountPassword(row.encryptedValue,entityId,row.key));
        if (kind === "meta") {
          // Only Abstract has a verified provider binding. Never borrow it for another entity.
          if (entityId !== "abstract") throw Error("Unmapped company");
          const config = metaStoredSchema.parse(raw);
          let health = credentialHealth({...config,expiresAt:config.snapshot.expiresAt},now);
          if (health.state !== "action_needed") {
            try {
              const snapshot = await verifyMetaReporting(config,fetch,now);
              const {lastFailureAt: _failure, ...retained} = config;
              void _failure;
              // CAS prevents a concurrent disconnect or replacement from being overwritten.
              const saved = await db.companyAccountCredential.updateMany({where:{id:row.id,revision:row.revision},data:{encryptedValue:encryptAccountPassword(JSON.stringify({...retained,snapshot}),entityId,row.key),revision:{increment:1},updatedBy:"connection-monitor"}});
              if (!saved.count) continue;
              if (health.state === "healthy") health = {state:"healthy",detail:"The expected company Page and configured reporting assets passed a live read check."};
            } catch {
              const saved=await db.companyAccountCredential.updateMany({where:{id:row.id,revision:row.revision},data:{encryptedValue:encryptAccountPassword(JSON.stringify({...config,lastFailureAt:now.toISOString()}),entityId,row.key),revision:{increment:1},updatedBy:"connection-monitor"}});
              if(!saved.count)continue;
              health = {state:"action_needed",detail:"Meta could not verify reporting access. Review the selected company assets, permissions and credential; a temporary provider outage is also possible."};
            }
          }
          add(kind,item,title,health);
        } else if (kind === "google") {
          if (entityId !== "abstract") throw Error("Unmapped company");
          const config = googleReportConfigSchema.parse(raw), validity = credentialHealth(config,now);
          add(kind,item,title,validity.state === "healthy" ? reportHealth(config,now) : validity);
        } else {
          const config = n8nConfigSchema.parse(raw), health = credentialHealth(config,now);
          const tested = await db.companySetupEvent.findFirst({where:{entityId,id:{startsWith:`n8n:${entityId}:connection_test:`},createdAt:{gte:new Date(config.issuedAt)}},select:{id:true}});
          // Event-driven workflows can legitimately be idle. No invented heartbeat timeout.
          add(kind,item,title,health.state !== "healthy" ? health : !tested ? {state:"action_needed",detail:"A notice key exists but its connection test has not reached Lead Suite."} : {...health,detail:"The tested workflow-notice key is valid. This check does not prove that idle n8n workflows are running."});
        }
      } catch { add(kind,item,title,{state:"action_needed",detail:"The protected connection record cannot be read or does not match a supported company. Ask the owner to repair the connection."}); }
    }
    // Removing a credential must not silently remove a previously monitored connection.
    const oldConnections = await db.companySetupEvent.findMany({where:{entityId,id:{in:[`connection:${entityId}:meta`,`connection:${entityId}:google`,`connection:${entityId}:n8n`]}},select:{id:true}});
    for (const old of oldConnections) {
      const key=old.id.split(":").at(-1)!;
      if (!findings.some(f=>f.entityId===entityId&&f.key===key)) add(key,key==="meta"?"facebook":key==="google"?"google_ads":"n8n","Stored connection",{state:"action_needed",detail:"A previously monitored connection record is missing. Reconnect this company."});
    }
    const setup = await db.companySetupItem.findMany({where:{entityId,key:{in:["email","sms"]}},select:{key:true,status:true}});
    for (const channel of ["email","sms"] as const) {
      const item = setup.find(s=>s.key===channel);
      if (!item || ["not_started","not_applicable"].includes(item.status)) continue;
      const checks = channel === "email" ? await companyEmailReadiness(company) : await companySmsReadiness(company,companies);
      for (const check of checks.filter(c=>["email-sender","email-tracking","sms-sender"].includes(c.id))) {
        add(check.id,channel,check.title,{state:check.state === "active" ? "healthy" : "action_needed",detail:check.detail});
      }
      // Sending switches and paused campaigns are deliberately not disconnection alarms.
    }
    const seo = await db.seoProject.findUnique({where:{entityId}});
    if (seo) {
      const broken = seo.automaticSync && (!process.env.AHREFS_API_KEY?.trim() || !!seo.syncError || !seo.lastCheckedAt || now.getTime()-seo.lastCheckedAt.getTime()>2*DAY);
      add("seo","ahrefs","SEO report feed",{state: !seo.automaticSync || broken ? "action_needed" : "healthy",detail:!seo.automaticSync ? "Reports are manual snapshots. Automatic SEO reporting is not connected." : broken ? "Automatic SEO reporting has no recent successful check. Review provider access and scheduled sync." : "Automatic SEO reporting has a successful recent check."});
    }
    await db.$transaction(async tx=>{
      for (const finding of findings.filter(f=>f.entityId===entityId)) {
        const id=`connection:${entityId}:${finding.key}`;
        const old=await tx.companySetupEvent.findUnique({where:{id},select:{message:true,acknowledgedAt:true}});
        const change=connectionEventChange(finding,old,now);
        if(change)await tx.companySetupEvent.upsert({where:{id},create:{id,entityId,itemKey:finding.itemKey,...change},update:change});
      }
      const heartbeat={entityId,itemKey:"website",message:"Connection monitor completed. Checks cover supported configured connectors only; saved links and passwords are not live checks.",acknowledgedAt:now,createdAt:now};
      await tx.companySetupEvent.upsert({where:{id:`connection-monitor:${entityId}`},create:{id:`connection-monitor:${entityId}`,...heartbeat},update:heartbeat});
    });
  }
  return {companies:companies.length,checks:findings.length,needsAttention:findings.filter(f=>f.state!=="healthy").length,sendsPerformed:false};
}
