import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function vaultKey(){
  const raw=process.env.ACCOUNT_VAULT_KEY?.trim();
  if(!raw||! /^[A-Za-z0-9+/]{43}=$/.test(raw))throw Error("The account password vault is not configured.");
  const key=Buffer.from(raw,"base64");if(key.length!==32)throw Error("The account password vault is not configured.");return key;
}
export function accountVaultConfigured(){try{vaultKey();return true;}catch{return false;}}
function context(entityId:string,key:string){return Buffer.from(JSON.stringify(["ig-company-account-v1",entityId,key]));}
export function encryptAccountPassword(password:string,entityId:string,itemKey:string){
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",vaultKey(),iv,{authTagLength:16});
  cipher.setAAD(context(entityId,itemKey));
  const encrypted=Buffer.concat([cipher.update(password,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64"),cipher.getAuthTag().toString("base64"),encrypted.toString("base64")].join(".");
}
export function decryptAccountPassword(value:string,entityId:string,itemKey:string){
  const [version,nonce,tag,data,...extra]=value.split(".");
  if(version!=="v1"||!nonce||!tag||!data||extra.length)throw Error("Could not decrypt this account password.");
  const iv=Buffer.from(nonce,"base64"),authTag=Buffer.from(tag,"base64");
  if(iv.length!==12||authTag.length!==16)throw Error("Could not decrypt this account password.");
  const decipher=createDecipheriv("aes-256-gcm",vaultKey(),iv,{authTagLength:16});
  decipher.setAAD(context(entityId,itemKey));decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(data,"base64")),decipher.final()]).toString("utf8");
}
