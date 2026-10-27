import { z } from "zod";

export const setupStatuses={not_started:"Not started",in_progress:"In progress",needs_owner:"Needs your help",ready_for_review:"Ready for review",tested:"Tested by owner",not_applicable:"Not needed"} as const;
export type SetupStatus=keyof typeof setupStatuses;
const allSetupItems=[
  {key:"website",title:"Website & hosting / WordPress",category:"Website",url:"",steps:["Confirm the company website and its actual hosting or WordPress/admin login link.","Invite the owner and the appropriate website editor through the hosting provider.","Record who manages the website and where changes are reviewed; do not create a replacement site."]},
  {key:"facebook",title:"Facebook & Meta Business Suite",category:"Social media",url:"https://business.facebook.com/",steps:["Find the existing company Page and business portfolio before creating another.","Use Meta team invitations to grant company-specific access.","Record the Page URL, business/account reference and the login used."]},
  {key:"instagram",title:"Instagram",category:"Social media",url:"https://www.instagram.com/",steps:["Find or create this company's professional profile.","Link it to the correct company Meta portfolio where appropriate.","Record the profile URL and account owner; have the owner verify the connection."]},
  {key:"linkedin",title:"LinkedIn company page",category:"Social media",url:"https://www.linkedin.com/company/setup/new/",steps:["Search for an existing company page before creating another.","Assign access through company-page admin roles.","Record the page URL and who has owner/admin access."]},
  {key:"tiktok",title:"TikTok",category:"Social media",url:"https://www.tiktok.com/",steps:["Locate or create the company's profile.","Use the correct company identity and business access.","Record its public profile URL and account owner."]},
  {key:"youtube",title:"YouTube",category:"Social media",url:"https://studio.youtube.com/",steps:["Check for an existing company channel.","Use channel permissions to invite the right team members.","Record the channel URL and managing account."]},
  {key:"x",title:"X",category:"Social media",url:"https://x.com/",steps:["Check whether this company needs an X profile.","Find an existing account before creating a new one.","Record its profile link and owner, or request that the owner mark it not needed."]},
  {key:"ahrefs",title:"Ahrefs SEO audits",category:"SEO & analytics",url:"https://app.ahrefs.com/",steps:["Create a separate website project for this company and verify ownership.","Arrange any website verification changes through that company's website project.","Set weekly audits and record the project URL. Free audits do not mean automatic CRM reporting is connected."]},
  {key:"search_console",title:"Google Search Console",category:"SEO & analytics",url:"https://search.google.com/search-console",steps:["Check the Google account for an existing website property.","Add and verify the company domain if it is missing; owner assistance may be needed for DNS.","Record the exact property reference and Google account used."]},
  {key:"analytics",title:"Google Analytics",category:"SEO & analytics",url:"https://analytics.google.com/",steps:["Check for existing tracking before creating another property or installing another tag.","Use a separate property for this company's website.","Record the property ID and ask the website project to confirm tracking works."]},
  {key:"google_business",title:"Google Business Profile — if eligible",category:"SEO & analytics",url:"https://business.google.com/",steps:["Check for an existing listing and whether the business meets customers in person.","A mailbox or online-only presence alone does not qualify for a Google Maps listing.","Ask the owner to confirm eligibility and complete verification, or mark this not needed."]},
  {key:"google_ads",title:"Google Ads",category:"Advertising",url:"https://ads.google.com/",steps:["Find an existing company advertising account or prepare a separate account.","Record the customer ID and invite the company owner.","Leave campaigns, budgets and paid subscriptions inactive until the owner approves."]},
  {key:"email",title:"Business email & Smartlead",category:"Messaging",url:"https://app.smartlead.ai/",steps:["Record the company's intended sending mailbox and business email provider.","Have the owner approve any mailbox authorization, plan or DNS changes.","Record setup details without launching a campaign or changing sending limits."]},
  {key:"sms",title:"Telnyx & SMS registration",category:"Messaging",url:"https://portal.telnyx.com/",steps:["Identify the correct company account, business identity and dedicated phone number.","Prepare direct opt-in, privacy and messaging-policy links with the owner.","Record registration status. Do not submit paid reviews, enable sending or send texts without approval."]},
  {key:"n8n",title:"n8n — marketing workflows",category:"Operations",url:"https://app.n8n.cloud/",steps:["Use the n8n workspace dedicated to Lead Suite marketing; keep the main command center separate.","Save the marketing workspace URL and login here. Do not put API keys or webhook secrets in these notes.","The owner can open Marketing workflows to prepare a company-specific connection test. Lead verification, paid lookups and sending remain off until separately configured."]},
  {key:"igf",title:"IGF Ventures command-center handoff",category:"Operations",url:"",steps:["Wait for the IGF Ventures connection instructions from the owner.","Record the company mapping and authorized handoff destination.","Ask the owner to verify the connection; do not paste access tokens into notes."]},
] as const;
// Keep dormant channel definitions and saved records available for a future reactivation.
export const setupCatalog=allSetupItems.filter(item=>!["youtube","x"].includes(item.key));
export const activeSetupKeys=setupCatalog.map(item=>item.key);
export const setupLink=z.string().trim().max(1000).refine(value=>{
  if(!value)return true;
  try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&![...u.searchParams.keys()].some(k=>/^(token|api_?key|secret|password|access_token|code)$/i.test(k));}catch{return false;}
},"Use an HTTPS link without passwords or access tokens.");
export const setupItemInput=z.object({
  entityId:z.string().min(1).max(100),key:z.string().refine(value=>setupCatalog.some(item=>item.key===value),"Unknown checklist item"),
  status:z.enum(["not_started","in_progress","needs_owner","ready_for_review","tested","not_applicable"]),
  accountName:z.string().trim().max(150).default(""),username:z.string().trim().max(254).default(""),
  loginUrl:setupLink.default(""),profileUrl:setupLink.default(""),vaultUrl:setupLink.default(""),
  accountReference:z.string().trim().max(200).default(""),assignee:z.string().trim().max(254).default(""),
  notes:z.string().trim().max(3000).default(""),
}).strict();
export function setupCanVerify(role:string|undefined,status:string){return role==="admin"||!["tested","not_applicable"].includes(status);}
