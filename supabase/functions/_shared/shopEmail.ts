import type { SmsResult } from './shop.ts';

export function createShopEmailSender(key?: string, from?: string, request: typeof fetch = fetch) {
  if (!key || !from) return undefined;
  return {
    async send(to: string, subject: string, text: string): Promise<SmsResult> {
      try {
        const response = await request('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) return { delivery: 'sent' };
        return { delivery: 'failed', note: 'Email provider returned ' + response.status + '. Check the sending domain and recipient.' };
      } catch {
        return { delivery: 'failed', note: 'The email provider did not confirm the send.' };
      }
    },
  };
}
