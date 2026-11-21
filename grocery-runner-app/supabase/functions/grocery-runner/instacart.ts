// Instacart Developer Platform (https://docs.instacart.com/developer_platform_api). Turns a Shop Stride
// list into an Instacart shopping list page; the shopper picks a store there and orders pickup or delivery.
//
// Secrets: INSTACART_API_KEY (from the Instacart Developer Platform dashboard) and INSTACART_ENV
// ("production" once Instacart has approved the production key; anything else uses the development server).
import { instacartBody, ListLine, listKey } from './instacartList.ts';

export const instacartReady = () => Boolean(Deno.env.get('INSTACART_API_KEY'));

const base = () =>
  Deno.env.get('INSTACART_ENV') === 'production' ? 'https://connect.instacart.com' : 'https://connect.dev.instacart.tools';

// Instacart asks partners to reuse a link until the list changes. Links are made with expires_in 30 days;
// keep them for a day here.
const KEEP_MS = 24 * 60 * 60_000;
const links = new Map<string, { at: number; url: string }>();

export async function instacartLink(items: unknown): Promise<{ url: string }> {
  const key = Deno.env.get('INSTACART_API_KEY');
  if (!key) throw new Error('Instacart is not set up on the server yet.');
  const lines: ListLine[] = (Array.isArray(items) ? items : [])
    // deno-lint-ignore no-explicit-any
    .map((i: any) => (typeof i === 'string' ? { name: i } : { name: String(i?.name ?? ''), amount: i?.amount ? String(i.amount) : undefined }))
    .filter((l) => l.name.trim());
  if (!lines.length) throw new Error('Add something to the list first.');
  const id = listKey(lines);
  const hit = links.get(id);
  if (hit && Date.now() - hit.at < KEEP_MS) return { url: hit.url };

  const res = await fetch(`${base()}/idp/v1/products/products_link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(instacartBody(lines)),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.products_link_url) {
    console.error('Instacart products_link failed', res.status, JSON.stringify(body).slice(0, 500));
    throw new Error('Instacart did not answer. Try again in a minute.');
  }
  if (links.size > 2000) links.delete(links.keys().next().value!);
  links.set(id, { at: Date.now(), url: body.products_link_url });
  return { url: body.products_link_url };
}
