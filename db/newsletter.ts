const subscribersSql = `CREATE TABLE IF NOT EXISTS portal_newsletter_subscribers (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'site_popup',
  unsubscribe_token TEXT NOT NULL UNIQUE,
  consent_at TEXT NOT NULL,
  welcome_sent_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
const subscriberIndexSql = "CREATE INDEX IF NOT EXISTS portal_newsletter_subscribers_status_idx ON portal_newsletter_subscribers (status, created_at)";
const campaignsSql = `CREATE TABLE IF NOT EXISTS portal_newsletter_campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT NOT NULL DEFAULT '',
  heading TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT
)`;
const campaignIndexSql = "CREATE INDEX IF NOT EXISTS portal_newsletter_campaigns_created_idx ON portal_newsletter_campaigns (created_at)";

let ready: Promise<void> | null = null;
async function ensureNewsletterTables() {
  if (!ready) ready = import("cloudflare:workers").then(async ({ env }) => {
    await env.DB.batch([
      env.DB.prepare(subscribersSql), env.DB.prepare(subscriberIndexSql),
      env.DB.prepare(campaignsSql), env.DB.prepare(campaignIndexSql),
    ]);
  }).then(() => undefined).catch((error) => { ready = null; throw error; });
  await ready;
}

export type NewsletterSubscriber = { id:string; email:string; status:string; source:string; unsubscribeToken:string; consentAt:string; welcomeSentAt:string|null; unsubscribedAt:string|null; createdAt:string; updatedAt:string };
export type NewsletterCampaign = { id:string; subject:string; preheader:string; heading:string; intro:string; html:string; status:string; recipientCount:number; sentCount:number; failedCount:number; createdAt:string; sentAt:string|null };

function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value) && value.length <= 254;}

export async function subscribeNewsletter(rawEmail:string, source="site_popup") {
  const email=rawEmail.trim().toLocaleLowerCase("pt-BR");
  if(!validEmail(email)) throw new Error("INVALID_EMAIL");
  await ensureNewsletterTables(); const {env}=await import("cloudflare:workers");
  const existing=await env.DB.prepare("SELECT id, status, unsubscribe_token AS unsubscribeToken FROM portal_newsletter_subscribers WHERE email = ?").bind(email).first() as {id:string;status:string;unsubscribeToken:string}|null;
  if(existing?.status === "active") return {id:existing.id,email,unsubscribeToken:existing.unsubscribeToken,isNew:false};
  const now=new Date().toISOString(); const id=existing?.id||crypto.randomUUID(); const unsubscribeToken=existing?.unsubscribeToken||crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO portal_newsletter_subscribers (id,email,status,source,unsubscribe_token,consent_at,welcome_sent_at,unsubscribed_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,NULL,NULL,?,?) ON CONFLICT(email) DO UPDATE SET status='active',source=excluded.source,consent_at=excluded.consent_at,unsubscribed_at=NULL,updated_at=excluded.updated_at`)
    .bind(id,email,"active",source.slice(0,60),unsubscribeToken,now,now,now).run();
  return {id,email,unsubscribeToken,isNew:true};
}

export async function markWelcomeSent(id:string){await ensureNewsletterTables();const {env}=await import("cloudflare:workers");const now=new Date().toISOString();await env.DB.prepare("UPDATE portal_newsletter_subscribers SET welcome_sent_at=?,updated_at=? WHERE id=?").bind(now,now,id).run();}

export async function listNewsletterSubscribers():Promise<NewsletterSubscriber[]>{await ensureNewsletterTables();const {env}=await import("cloudflare:workers");const result=await env.DB.prepare(`SELECT id,email,status,source,unsubscribe_token AS unsubscribeToken,consent_at AS consentAt,welcome_sent_at AS welcomeSentAt,unsubscribed_at AS unsubscribedAt,created_at AS createdAt,updated_at AS updatedAt FROM portal_newsletter_subscribers ORDER BY created_at DESC`).all();return (result.results||[]) as NewsletterSubscriber[];}
export async function activeNewsletterSubscribers():Promise<NewsletterSubscriber[]>{return (await listNewsletterSubscribers()).filter((item:NewsletterSubscriber)=>item.status==="active");}
export async function deleteNewsletterSubscriber(id:string){await ensureNewsletterTables();const {env}=await import("cloudflare:workers");await env.DB.prepare("DELETE FROM portal_newsletter_subscribers WHERE id=?").bind(id).run();}
export async function unsubscribeNewsletter(token:string){await ensureNewsletterTables();const {env}=await import("cloudflare:workers");const now=new Date().toISOString();const result=await env.DB.prepare("UPDATE portal_newsletter_subscribers SET status='unsubscribed',unsubscribed_at=?,updated_at=? WHERE unsubscribe_token=?").bind(now,now,token).run();return Number(result.meta.changes||0)>0;}

export async function createNewsletterCampaign(input:{subject:string;preheader:string;heading:string;intro:string;html:string}){await ensureNewsletterTables();const {env}=await import("cloudflare:workers");const id=crypto.randomUUID();const createdAt=new Date().toISOString();await env.DB.prepare("INSERT INTO portal_newsletter_campaigns (id,subject,preheader,heading,intro,html,status,recipient_count,sent_count,failed_count,created_at,sent_at) VALUES (?,?,?,?,?,?,'draft',0,0,0,?,NULL)").bind(id,input.subject,input.preheader,input.heading,input.intro,input.html,createdAt).run();return {id,...input,status:"draft",recipientCount:0,sentCount:0,failedCount:0,createdAt,sentAt:null} satisfies NewsletterCampaign;}
export async function listNewsletterCampaigns():Promise<NewsletterCampaign[]>{await ensureNewsletterTables();const {env}=await import("cloudflare:workers");const result=await env.DB.prepare("SELECT id,subject,preheader,heading,intro,html,status,recipient_count AS recipientCount,sent_count AS sentCount,failed_count AS failedCount,created_at AS createdAt,sent_at AS sentAt FROM portal_newsletter_campaigns ORDER BY created_at DESC LIMIT 30").all();return (result.results||[]) as NewsletterCampaign[];}
export async function getNewsletterCampaign(id:string):Promise<NewsletterCampaign|null>{await ensureNewsletterTables();const {env}=await import("cloudflare:workers");return env.DB.prepare("SELECT id,subject,preheader,heading,intro,html,status,recipient_count AS recipientCount,sent_count AS sentCount,failed_count AS failedCount,created_at AS createdAt,sent_at AS sentAt FROM portal_newsletter_campaigns WHERE id=?").bind(id).first() as Promise<NewsletterCampaign|null>;}
export async function completeNewsletterCampaign(id:string,recipientCount:number,sentCount:number,failedCount:number){await ensureNewsletterTables();const {env}=await import("cloudflare:workers");await env.DB.prepare("UPDATE portal_newsletter_campaigns SET status=?,recipient_count=?,sent_count=?,failed_count=?,sent_at=? WHERE id=?").bind(failedCount&&sentCount?"partial":failedCount?"failed":"sent",recipientCount,sentCount,failedCount,new Date().toISOString(),id).run();}
