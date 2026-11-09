// Deliberately match the customer's whole question. Compound requests stay with an advisor.
export function smsTopic(text: string): string {
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
  let reply:string|null=null;
  // STOP and its synonyms: Twilio blocks further texts itself; this also cancels the shop's scheduled reminders.
  if (optOut && /^\+[1-9]\d{7,14}$/.test(phone) && (params.get('OptOutType')==='STOP' || /^(stop(all)?|cancel|end|quit|unsubscribe|revoke|optout)$/i.test(text))) {
    try { await optOut(phone); } catch { /* the carrier opt-out still applies */ }
  }
  if (/^(?:SM|MM)[a-f\d]{32}$/i.test(sid) && /^\+[1-9]\d{7,14}$/.test(phone) && text && !params.get('OptOutType') && !/^(stop(all)?|cancel|end|quit|unsubscribe|revoke|optout|start|unstop|help|info|yes)$/i.test(text)) {
    reply=await receive(sid,phone,text,Number(params.get('NumMedia')||0)>0?'review':smsTopic(text));
  }
  const xml=reply?'<Message>'+reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</Message>':'';
  return new Response('<Response>'+xml+'</Response>',{headers:{'Content-Type':'text/xml; charset=utf-8'}});
}
