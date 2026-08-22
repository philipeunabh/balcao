import { createTransport } from "nodemailer";
import { readPrivateSetting } from "./settings";

export type SmtpSettings={host:string;port:number;secure:boolean;username:string;password:string;fromName:string;fromEmail:string;replyTo:string};

function cleanHeader(value:string){return value.replace(/[\r\n]+/g," ").trim();}

export async function readSmtpSettings(override?:Partial<SmtpSettings>):Promise<SmtpSettings>{
  const values=await Promise.all(["smtp_host","smtp_port","smtp_secure","smtp_username","smtp_password","smtp_from_name","smtp_from_email","smtp_reply_to"].map(readPrivateSetting));
  return {host:String(override?.host||values[0]||"").trim(),port:Number(override?.port||values[1]||465),secure:override?.secure??String(values[2]||"true")!=="false",username:String(override?.username||values[3]||"").trim(),password:String(override?.password||values[4]||""),fromName:String(override?.fromName||values[5]||"Jornal Balcão").trim(),fromEmail:String(override?.fromEmail||values[6]||"").trim().toLowerCase(),replyTo:String(override?.replyTo||values[7]||"").trim().toLowerCase()};
}

export function validateSmtpSettings(settings:SmtpSettings){if(!settings.host||!settings.username||!settings.password||!settings.fromEmail)throw new Error("SMTP_NOT_CONFIGURED");if(settings.port===25)throw new Error("SMTP_PORT_25_BLOCKED");if(![465,587,2525].includes(settings.port))throw new Error("SMTP_PORT_UNSUPPORTED");}

export async function sendSmtpMessages(messages:Array<{to:string;subject:string;html:string}>,override?:Partial<SmtpSettings>){
  if(!messages.length)return {sent:0,failed:0};
  const settings=await readSmtpSettings(override);validateSmtpSettings(settings);
  const transport=createTransport({
    host:settings.host,
    port:settings.port,
    secure:settings.secure||settings.port===465,
    auth:{user:settings.username,pass:settings.password},
    requireTLS:!settings.secure&&settings.port!==465,
    connectionTimeout:15_000,
    greetingTimeout:15_000,
    socketTimeout:30_000,
  });
  let sent=0;let failed=0;
  for(const message of messages){
    try{
      await transport.sendMail({from:{name:cleanHeader(settings.fromName),address:settings.fromEmail},to:cleanHeader(message.to).toLowerCase(),replyTo:settings.replyTo||undefined,subject:cleanHeader(message.subject),html:message.html});
      sent+=1;
    }catch{failed+=1;}
  }
  transport.close();
  return {sent,failed};
}
