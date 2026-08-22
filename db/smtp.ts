import { readPrivateSetting } from "./settings";

export type SmtpSettings={host:string;port:number;secure:boolean;username:string;password:string;fromName:string;fromEmail:string;replyTo:string};
type SocketLike={readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>;opened:Promise<unknown>;close:()=>Promise<void>;startTls:()=>SocketLike};

function cleanHeader(value:string){return value.replace(/[\r\n]+/g," ").trim();}
function base64Utf8(value:string){const bytes=new TextEncoder().encode(value);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);}
function foldBase64(value:string){return base64Utf8(value).match(/.{1,76}/g)?.join("\r\n")||"";}
function encodedHeader(value:string){return `=?UTF-8?B?${base64Utf8(cleanHeader(value))}?=`;}

async function channel(socket:SocketLike){
  const reader=socket.readable.getReader();const writer=socket.writable.getWriter();const decoder=new TextDecoder();let buffer="";
  const read=async()=>{for(;;){const match=buffer.match(/(?:^|\r\n)(\d{3}) ([^\r\n]*)\r\n/);if(match){const end=(match.index||0)+match[0].length;const text=buffer.slice(0,end);buffer=buffer.slice(end);return {code:Number(match[1]),text};}const part=await reader.read();if(part.done)throw new Error("SMTP_CONNECTION_CLOSED");buffer+=decoder.decode(part.value,{stream:true});}};
  const write=async(value:string)=>writer.write(new TextEncoder().encode(value));
  const command=async(value:string,expected:number[])=>{await write(`${value}\r\n`);const response=await read();if(!expected.includes(response.code))throw new Error(`SMTP_${response.code}:${response.text.slice(0,220)}`);return response;};
  return {read,write,command,release(){reader.releaseLock();writer.releaseLock();}};
}

export async function readSmtpSettings(override?:Partial<SmtpSettings>):Promise<SmtpSettings>{
  const values=await Promise.all(["smtp_host","smtp_port","smtp_secure","smtp_username","smtp_password","smtp_from_name","smtp_from_email","smtp_reply_to"].map(readPrivateSetting));
  return {host:String(override?.host||values[0]||"").trim(),port:Number(override?.port||values[1]||465),secure:override?.secure??String(values[2]||"true")!=="false",username:String(override?.username||values[3]||"").trim(),password:String(override?.password||values[4]||""),fromName:String(override?.fromName||values[5]||"Jornal Balcão").trim(),fromEmail:String(override?.fromEmail||values[6]||"").trim().toLowerCase(),replyTo:String(override?.replyTo||values[7]||"").trim().toLowerCase()};
}

export function validateSmtpSettings(settings:SmtpSettings){if(!settings.host||!settings.username||!settings.password||!settings.fromEmail)throw new Error("SMTP_NOT_CONFIGURED");if(settings.port===25)throw new Error("SMTP_PORT_25_BLOCKED");if(![465,587,2525].includes(settings.port))throw new Error("SMTP_PORT_UNSUPPORTED");}

export async function sendSmtpMessages(messages:Array<{to:string;subject:string;html:string}>,override?:Partial<SmtpSettings>){
  if(!messages.length)return {sent:0,failed:0};const settings=await readSmtpSettings(override);validateSmtpSettings(settings);
  const {connect}=await import("cloudflare:sockets") as {connect:(address:{hostname:string;port:number},options:{secureTransport:"on"|"starttls"})=>SocketLike};
  let socket=connect({hostname:settings.host,port:settings.port},{secureTransport:settings.secure||settings.port===465?"on":"starttls"});await socket.opened;let smtp=await channel(socket);const greeting=await smtp.read();if(greeting.code!==220)throw new Error(`SMTP_${greeting.code}`);
  await smtp.command("EHLO jornalbalcao.com.br",[250]);
  if(!settings.secure&&settings.port!==465){await smtp.command("STARTTLS",[220]);smtp.release();socket=socket.startTls();await socket.opened;smtp=await channel(socket);await smtp.command("EHLO jornalbalcao.com.br",[250]);}
  await smtp.command("AUTH LOGIN",[334]);await smtp.command(base64Utf8(settings.username),[334]);await smtp.command(base64Utf8(settings.password),[235]);
  let sent=0;let failed=0;
  for(const message of messages){try{const to=cleanHeader(message.to).toLowerCase();await smtp.command(`MAIL FROM:<${settings.fromEmail}>`,[250]);await smtp.command(`RCPT TO:<${to}>`,[250,251]);await smtp.command("DATA",[354]);const headers=[`From: ${encodedHeader(settings.fromName)} <${settings.fromEmail}>`,`To: <${to}>`,`Subject: ${encodedHeader(message.subject)}`,settings.replyTo?`Reply-To: <${settings.replyTo}>`:"","MIME-Version: 1.0","Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: base64",`Message-ID: <${crypto.randomUUID()}@jornalbalcao.com.br>`].filter(Boolean).join("\r\n");await smtp.write(`${headers}\r\n\r\n${foldBase64(message.html)}\r\n.\r\n`);const response=await smtp.read();if(response.code!==250)throw new Error(`SMTP_${response.code}`);sent+=1;}catch{failed+=1;await smtp.command("RSET",[250]).catch(()=>undefined);}}
  await smtp.command("QUIT",[221]).catch(()=>undefined);await socket.close().catch(()=>undefined);return {sent,failed};
}
