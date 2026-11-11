import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomingSms, incomingTelnyxSms, smsTopic } from '../functions/_shared/shopSms.ts';
import { createHmac } from 'node:crypto';

test('automatic topics use the complete question; safety, approval and scheduling stay with staff',()=>{
  for(const [question,topic] of [['How’s my car coming?','status'],['What are your hours?','hours'],['Can you resend the estimate?','link'],['Is my car ready and safe to drive?','review'],['Go ahead with the brakes','review'],['Pickup at 4?','review']]) assert.equal(smsTopic(question),topic);
});
test('inbound webhook authenticates Twilio, excludes opt-outs and escapes returned shop text',async()=>{
  const cfg={url:'https://example.test/sms',token:'unit-test',account:'ACtest',to:'+15555550002'};
  let waiting=false;
  async function send(text:string,valid=true){
    const form=new URLSearchParams({AccountSid:cfg.account,From:'+15555550001',To:cfg.to,MessageSid:'SM'+'a'.repeat(32),Body:text});
    const payload=cfg.url+[...form.keys()].sort().map(k=>k+form.get(k)).join('');
    const sig=createHmac('sha1',valid?cfg.token:'wrong').update(payload).digest('base64');
    return incomingSms(new Request(cfg.url,{method:'POST',body:form,headers:{'X-Twilio-Signature':sig}}),cfg,async()=> 'A & B <Shop>',undefined,
      async()=>waiting?(waiting=false,'Thanks! Shop has you down for Tue, Nov 10 at 10:00 AM.'):null);
  }
  assert.equal((await send('status',false)).status,403);
  assert.match(await (await send('status')).text(),/A &amp; B &lt;Shop&gt;/);
  assert.equal(await (await send('STOP')).text(),'<Response></Response>');
  // YES confirms a moved appointment; with nothing waiting it is a keyword and gets no reply.
  assert.equal(await (await send('YES')).text(),'<Response></Response>');
  waiting=true;
  assert.equal(await (await send('Yes!')).text(),'<Response><Message>Thanks! Shop has you down for Tue, Nov 10 at 10:00 AM.</Message></Response>');
});
test('Telnyx inbound webhook checks the Ed25519 signature, age and number, and replies through the API',async()=>{
  const { generateKeyPairSync, sign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const now = 1_800_000_000_000;
  const cfg = { publicKey: raw.toString('base64'), to: '+15555550002', now: () => now };
  const replies: [string,string][] = [], stops: string[] = [];
  async function send(text: string, opts: { forge?: boolean; age?: number; to?: string; type?: string } = {}) {
    const body = JSON.stringify({ data: { event_type: opts.type ?? 'message.received', payload: {
      id: '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b', from: { phone_number: '+15555550001' }, to: [{ phone_number: opts.to ?? cfg.to }], text, media: [] } } });
    const stamp = String(Math.floor(now / 1000) - (opts.age ?? 0));
    const sig = sign(null, Buffer.from(stamp + '|' + (opts.forge ? body + ' ' : body)), privateKey).toString('base64');
    return incomingTelnyxSms(new Request('https://example.test/sms', { method: 'POST', body, headers: { 'telnyx-signature-ed25519': sig, 'telnyx-timestamp': stamp } }),
      cfg, async () => 'A & B <Shop> — open', async (p) => { stops.push(p); }, async (p, t) => { replies.push([p, t]); });
  }
  assert.equal((await send('status', { forge: true })).status, 403);
  assert.equal((await send('status', { age: 600 })).status, 403, 'too old');
  assert.equal((await send('status', { to: '+15555550009' })).status, 403, 'another number');
  assert.equal((await send('status', { type: 'message.finalized' })).status, 200);
  assert.equal(replies.length, 0);
  assert.equal((await send('status')).status, 200);
  assert.deepEqual(replies, [['+15555550001', 'A & B <Shop> - open']]);
  assert.equal((await send('STOP')).status, 200);
  assert.deepEqual(stops, ['+15555550001']);
  assert.equal(replies.length, 1, 'no reply to STOP');
});
