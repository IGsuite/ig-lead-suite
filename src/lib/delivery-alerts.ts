import type { Prisma } from "@/generated/prisma/client";
export async function recordDeliveryAlert(db:Pick<Prisma.TransactionClient,"campaign"|"companySetupEvent">,job:{campaignId:string;entityId:string;channel:string},reason:string){
  const campaign=await db.campaign.findUnique({where:{id:job.campaignId},select:{name:true}});
  const message=`${job.channel==="sms"?"Text":"Email"} delivery needs attention in “${campaign?.name||"campaign"}”. ${reason.slice(0,500)} Open delivery details before retrying.`;
  await db.companySetupEvent.upsert({where:{id:`delivery:${job.campaignId}`},create:{id:`delivery:${job.campaignId}`,entityId:job.entityId,itemKey:job.channel==="sms"?"sms":"email",message},update:{message,acknowledgedAt:null,createdAt:new Date()}});
}
