import { gsmText } from './smsFit.ts';
import { autoTopic } from './smsTopicModel.ts';
// Exact everyday phrasings first, then the trained text sorter (smsTopicModel.ts), which answers only when it is
// very sure and the text has nothing a person should see (safety, money, a time, several questions).
export function smsTopic(text: string): string {
  const exact = exactTopic(text);
  return exact !== 'review' ? exact : autoTopic(text);
}
function exactTopic(text: string): string {
  const q = text.toLowerCase().trim().replace(/[’']/g, '').replace(/[?!.]+$/, '').replace(/\s+/g,' ');
  if (/^(?:status|(?:any |an? )?updates?(?: on (?:my|the) (?:car|vehicle|repair))?|(?:whats|what is) (?:the |my )?(?:repair )?status|hows (?:my|the) (?:car|repair|vehicle)(?: coming| doing)?|is my (?:car|vehicle) ready)$/.test(q)) return 'status';
  if (/^(?:hours|(?:what are|whats) your (?:shop |business )?hours|when (?:do you (?:open|close)|are you open)|are you (?:still )?open)$/.test(q)) return 'hours';
  if (/^(?:(?:can|could) you |please )?(?:re)?send (?:me )?(?:my |the )?(?:estimate|estimate link)(?: again| please)?$/.test(q)) return 'link';
  return 'review';
}

type SmsConfig = { token: string; account: string; to: string; url: string };
export async function incomingSms(req: Request, cfg: SmsConfig, receive: (sid:string,phone:string,text:string,topic:string)=>Promise<string|null>, optOut?: (phone:string)=>Promise<void>): Promise<Response> {
  if (!cfg.token || !cfg.to || !cfg.account) return new Response('SMS is not configured.', {status:503});
  const params = new URLSearchParams(await req.text());
  const signature = req.headers.get('X-Twilio-Signature') || '';
  const denied = () => new Response('Invalid SMS signature.', {status:403});
  if (!/^[A-Za-z0-9+/]{27}=$/.test(signature)) return denied();
  const names = [...new Set(params.keys())].sort();
  const payload = cfg.url + names.map(k=>[...new Set(params.getAll(k))].sort().map(v=>k+v).join('')).join('');
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(cfg.token),{name:'HMAC',hash:'SHA-1'},false,['verify']);
  if (!await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),new TextEncoder().encode(payload)) ||
      params.get('AccountSid')!==cfg.account || params.get('To')!==cfg.to) return denied();
  const sid=params.get('MessageSid')||'', phone=params.get('From')||'', text=(params.get('Body')||'').trim().slice(0,1600);
  const reply=await answer(sid,phone,text,Number(params.get('NumMedia')||0)>0,!!params.get('OptOutType'),params.get('OptOutType')==='STOP',/^(?:SM|MM)[a-f\d]{32}$/i.test(sid),receive,optOut);
  const xml=reply?'<Message>'+reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</Message>':'';
  return new Response('<Response>'+xml+'</Response>',{headers:{'Content-Type':'text/xml; charset=utf-8'}});
}

const OPT_OUT=/^(stop(all)?|cancel|end|quit|unsubscribe|revoke|optout)$/i;
const KEYWORD=/^(stop(all)?|cancel|end|quit|unsubscribe|revoke|optout|start|unstop|help|info|yes)$/i;
/** Shared by both providers: honor opt-outs, then hand an ordinary text to the shop and return any automatic reply. */
async function answer(sid:string,phone:string,text:string,hasMedia:boolean,isKeyword:boolean,isStop:boolean,validSid:boolean,
  receive:(sid:string,phone:string,text:string,topic:string)=>Promise<string|null>, optOut?:(phone:string)=>Promise<void>): Promise<string|null> {
  // STOP and its synonyms: the carrier/provider blocks further texts itself; this also cancels the shop's scheduled reminders.
  if (optOut && /^\+[1-9]\d{7,14}$/.test(phone) && (isStop || OPT_OUT.test(text))) {
    try { await optOut(phone); } catch { /* the carrier opt-out still applies */ }
  }
  if (!validSid || !/^\+[1-9]\d{7,14}$/.test(phone) || !text || isKeyword || KEYWORD.test(text)) return null;
  const reply=await receive(sid,phone,text,hasMedia?'review':smsTopic(text));
  return reply?gsmText(reply):null; // plain characters: a bullet or dash would bill the reply as Unicode
}

const b64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
type TelnyxConfig = { publicKey: string; to: string; now?: () => number };
/**
 * Telnyx inbound-message webhook (JSON, signed with Ed25519 over "<timestamp>|<raw body>").
 * Telnyx has no reply-in-response like Twilio's TwiML, so an automatic reply goes out through `sendReply`.
 * `to` is TELNYX_FROM: the Talk Shops number (+1...) or its Messaging Profile id.
 */
export async function incomingTelnyxSms(req: Request, cfg: TelnyxConfig, receive: (sid:string,phone:string,text:string,topic:string)=>Promise<string|null>,
  optOut: ((phone:string)=>Promise<void>)|undefined, sendReply: (phone:string,text:string)=>Promise<unknown>): Promise<Response> {
  if (!cfg.publicKey || !cfg.to) return new Response('SMS is not configured.', {status:503});
  const raw = await req.text();
  const signature = req.headers.get('telnyx-signature-ed25519') || '', stamp = req.headers.get('telnyx-timestamp') || '';
  const denied = () => new Response('Invalid SMS signature.', {status:403});
  const nowSec = Math.floor((cfg.now?.() ?? Date.now())/1000);
  // A five-minute window stops an old, captured request from being replayed.
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature) || !/^\d{9,11}$/.test(stamp) || Math.abs(nowSec-Number(stamp))>300) return denied();
  try {
    const key = await crypto.subtle.importKey('raw', b64(cfg.publicKey), {name:'Ed25519'}, false, ['verify']);
    if (!await crypto.subtle.verify({name:'Ed25519'}, key, b64(signature), new TextEncoder().encode(stamp+'|'+raw))) return denied();
  } catch { return denied(); }
  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response('Bad JSON.', {status:400}); }
  const ok = () => Response.json({ok:true});
  // Delivery reports (message.sent, message.finalized) arrive here too; only incoming texts matter.
  if (event?.data?.event_type !== 'message.received') return ok();
  const m = event.data.payload ?? {};
  const toNumbers: string[] = Array.isArray(m.to) ? m.to.map((t:any)=>t?.phone_number) : [];
  if (cfg.to.startsWith('+') ? !toNumbers.includes(cfg.to) : m.messaging_profile_id !== cfg.to) return denied();
  const sid = String(m.id||''), phone = String(m.from?.phone_number||''), text = String(m.text||'').trim().slice(0,1600);
  const reply = await answer(sid,phone,text,Array.isArray(m.media)&&m.media.length>0,false,false,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid),receive,optOut);
  if (reply) await sendReply(phone, reply);
  return ok();
}
