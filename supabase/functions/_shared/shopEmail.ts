import type { SmsResult } from './shop.ts';

// Customer emails go out through Resend from one Talk Shops address (TALKSHOPS_EMAIL_FROM, e.g.
// "Talk Shops <updates@talkshops.app>"). Each email shows the shop's name as the sender name and, when
// the shop has set its email, uses it as Reply-To so customer replies reach the shop directly.
const addressOf = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
const safeName = (name: string) => name.replace(/["<>\r\n]/g, '').trim().slice(0, 80);

export interface EmailOpts { fromName?: string; replyTo?: string; /** Big button under the message; its link is dropped from the message text. */ button?: { label: string; url: string }; /** Small grey line at the bottom. */ footer?: string }

const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LINK = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;

/**
 * The same message as a simple branded page: the sender's name on top, the words, one button, a quiet footer.
 * Plain text still goes along with it, so mail apps that block HTML show the original message.
 */
export function emailHtml(text: string, opts: EmailOpts = {}): string {
  const first = text.match(LINK)?.[0];
  const button = opts.button ?? (first && /^https:\/\/talkshops\.app\//.test(first) ? { label: 'Open in Talk Shops', url: first } : undefined);
  let body = text;
  // Drop the button's link from the words, along with a lead-in like "Track it here:" that would be left pointing at nothing.
  if (button) body = body.split(button.url).map((part, i, all) => (i < all.length - 1 ? part.replace(/(^|[\n.!?])[^\n.!?:]{0,40}:[ \t]*$/, '$1') : part)).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const words = escHtml(body).replace(LINK, (u) => `<a href="${u}" style="color:#4f46e5">${u}</a>`).replace(/\n/g, '<br>');
  const name = escHtml(opts.fromName ? safeName(opts.fromName) : 'Talk Shops');
  const foot = [opts.footer, opts.fromName ? 'Sent with Talk Shops · talkshops.app' : 'Talk Shops · talkshops.app'].filter(Boolean).map((f) => escHtml(f!)).join('<br>');
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td style="background:#4f46e5;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">${name}</td></tr>
<tr><td style="padding:24px;color:#111827;font-size:16px;line-height:1.55">${words}</td></tr>
${button ? `<tr><td style="padding:0 24px 26px"><a href="${escHtml(button.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:10px">${escHtml(button.label)}</a></td></tr>` : ''}
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}

export function createShopEmailSender(key?: string, from?: string, request: typeof fetch = fetch) {
  if (!key || !from) return undefined;
  return {
    async send(to: string, subject: string, text: string, opts: EmailOpts = {}): Promise<SmsResult> {
      const name = opts.fromName ? safeName(opts.fromName) : '';
      const sender = name ? `"${name} via Talk Shops" <${addressOf(from)}>` : from;
      try {
        const response = await request('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: sender, to: [to], subject, text, html: emailHtml(text, opts), ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
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
