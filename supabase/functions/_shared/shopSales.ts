import type { Res } from './handlers.ts';
import type { ShopDeps } from './shop.ts';

// Public sales form: fixed destination, validated Reply-To, and a shared database quota.
export async function salesRoute(deps: ShopDeps, method: string, body: Record<string, unknown>): Promise<Res> {
  if (method !== 'POST') return { status: 405, body: 'Use the contact sales form to send a request.' };
  if (body.website) return { status: 200, body: { sent: true } };
  const read = (key: string, max: number) => typeof body[key] === 'string' && (body[key] as string).length <= max ? (body[key] as string).trim() : '';
  const name = read('name', 100), email = read('email', 254).toLowerCase(), shop = read('shop', 160);
  const phone = read('phone', 40), message = read('message', 4000);
  if (!name || !shop || !message || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\r\n]/.test(name + shop + phone)) {
    return { status: 400, body: 'Enter your name, a valid email, shop name and request.' };
  }
  if (!deps.email || !deps.claimSalesRequest) return { status: 503, body: 'We could not send your request. Please try again or email support@talkshops.app.' };
  try {
    if (!await deps.claimSalesRequest(email)) return { status: 429, body: 'Too many requests. Please try again later or email support@talkshops.app.' };
    const result = await deps.email.send('support@talkshops.app', 'Talk Shops sales inquiry',
      `New sales request\n\nName: ${name}\nEmail: ${email}\nShop: ${shop}\nPhone: ${phone || 'Not provided'}\n\nRequest:\n${message}`,
      { replyTo: email });
    if (result.delivery === 'sent') return { status: 200, body: { sent: true } };
  } catch { /* Keep provider and database details private; the form preserves the draft for retry. */ }
  return { status: 502, body: 'We could not send your request. Please try again or email support@talkshops.app.' };
}
