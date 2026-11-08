import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomingSms, smsTopic } from '../functions/_shared/shopSms.ts';
import { createHmac } from 'node:crypto';

test('automatic topics use the complete question; safety, approval and scheduling stay with staff',()=>{
  for(const [question,topic] of [['How’s my car coming?','status'],['What are your hours?','hours'],['Can you resend the estimate?','link'],['Is my car ready and safe to drive?','review'],['Go ahead with the brakes','review'],['Pickup at 4?','review']]) assert.equal(smsTopic(question),topic);
});
test('inbound webhook authenticates Twilio, excludes opt-outs and escapes returned shop text',async()=>{
  const cfg={url:'https://example.test/sms',token:'unit-test',account:'ACtest',to:'+15555550002'};
  async function send(text:string,valid=true){
    const form=new URLSearchParams({AccountSid:cfg.account,From:'+15555550001',To:cfg.to,MessageSid:'SM'+'a'.repeat(32),Body:text});
    const payload=cfg.url+[...form.keys()].sort().map(k=>k+form.get(k)).join('');
    const sig=createHmac('sha1',valid?cfg.token:'wrong').update(payload).digest('base64');
    return incomingSms(new Request(cfg.url,{method:'POST',body:form,headers:{'X-Twilio-Signature':sig}}),cfg,async()=> 'A & B <Shop>');
  }
  assert.equal((await send('status',false)).status,403);
  assert.match(await (await send('status')).text(),/A &amp; B &lt;Shop&gt;/);
  assert.equal(await (await send('STOP')).text(),'<Response></Response>');
});
