import {randomUUID} from "node:crypto";
import {manualPackageInput,readManualPackages} from "@/lib/manual-packages";
import {audienceContactKey} from "@/lib/audience-filters";
import {verifyContact} from "@/lib/verify";
import type {Lead} from "@/lib/types";
import type {z} from "zod";

export function planManualPackage(original:Lead[],optOuts:{contact:string}[],raw:z.infer<typeof manualPackageInput>){
  const input=manualPackageInput.parse(raw);
  for(const [i,row] of input.rows.entries()){
    const v=verifyContact(row);
    if((!row.email&&!row.phone)||(row.email&&v.emailStatus==="invalid")||(row.phone&&v.phoneStatus==="invalid"))throw new Error(`Contact ${i+1}: enter a valid email or phone`);
  }
  const leads=original.map(l=>({...l})),changes:Array<{lead:Lead;created:boolean}>=[];
  const existingPackage=leads.flatMap(l=>readManualPackages(l.manualPackages)).find(p=>p.id===input.id);
  const pkg={id:input.id,name:existingPackage?.name||input.name};
  const selected=new Set<string>();let created=0,existing=0,alreadyInPackage=0,blocked=0,conflicts=0;
  for(const row of input.rows){
    const email=audienceContactKey(row,"email"),phone=audienceContactKey(row,"sms");
    const matches=leads.filter(l=>(email&&audienceContactKey(l,"email")===email)||(phone&&audienceContactKey(l,"sms")===phone));
    if(matches.length>1){conflicts++;continue;}
    const found=matches[0];
    if((found&&(found.optedOut||found.status==="opted_out"||found.status==="converted"||found.convertedEntityId))||optOuts.some(o=>o.contact.includes("@") ? email&&audienceContactKey({email:o.contact},"email")===email : phone&&audienceContactKey({phone:o.contact},"sms")===phone)){blocked++;continue;}
    if(found){
      if(selected.has(found.id)){alreadyInPackage++;continue;}
      const packages=readManualPackages(found.manualPackages);
      if(packages.some(p=>p.id===pkg.id))alreadyInPackage++;
      else{found.manualPackages=[...packages,pkg];changes.push({lead:found,created:false});existing++;}
      selected.add(found.id);
    }else{
      const now=new Date().toISOString();
      const added:Lead={id:`lead-manual-${randomUUID()}`,firstName:row.firstName||undefined,lastName:row.lastName||undefined,businessName:row.businessName||undefined,email:row.email||undefined,phone:row.phone||undefined,source:"Manual",groupName:"Manual",purchaseDate:now.slice(0,10),costCents:0,offeredEntityIds:[],lastEntityId:null,convertedEntityId:null,status:"available",optedOut:false,...verifyContact(row),verifiedAt:now,createdAt:now,manualPackages:[pkg]};
      leads.push(added);changes.push({lead:added,created:true});selected.add(added.id);created++;
    }
  }
  return {leads,changes,result:{package:pkg,created,existing,alreadyInPackage,blocked,conflicts,selectedCount:selected.size,total:leads.filter(l=>readManualPackages(l.manualPackages).some(p=>p.id===pkg.id)).length}};
}
