import type { SmsResult } from './shop.ts';

// Customer emails go out through Resend from one Talk Shops address (TALKSHOPS_EMAIL_FROM, e.g.
// "Talk Shops <updates@talkshops.app>"). Each email shows the shop's name as the sender name and, when
// the shop has set its email, uses it as Reply-To so customer replies reach the shop directly.
const addressOf = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
const safeName = (name: string) => name.replace(/["<>\r\n]/g, '').trim().slice(0, 80);

export function createShopEmailSender(key?: string, from?: string, request: typeof fetch = fetch) {
  if (!key || !from) return undefined;
  return {
    async send(to: string, subject: string, text: string, opts: { fromName?: string; replyTo?: string } = {}): Promise<SmsResult> {
      const name = opts.fromName ? safeName(opts.fromName) : '';
      const sender = name ? `"${name} via Talk Shops" <${addressOf(from)}>` : from;
      try {
        const response = await request('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: sender, to: [to], subject, text, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) return { delivery: 'sent' };
        // Resend answers with JSON like {"name":"validation_error","message":"The talkshops.app domain is not verified..."}.
        const detail = await response.text().catch(() => '');
        let reason = detail.slice(0, 200);
        try { const j = JSON.parse(detail); if (j?.message) reason = j.message; } catch { /* not JSON */ }
        return { delivery: 'failed', note: `Email failed (${response.status}): ${reason}`.slice(0, 280) };
      } catch {
        return { delivery: 'failed', note: 'The email provider did not confirm the send.' };
      }
    },
  };
}
