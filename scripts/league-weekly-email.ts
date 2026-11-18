// Hood League weekly start/sit email (in season). Run by .github/workflows/league-weekly-email.yml with Deno.
//
// For every team on a drafted Hood League roster whose owner has an email: this week's best lineup from Sleeper's
// projections (the same ones the Start/Sit page uses), who to sit, and who is on bye or hurt. Sent through Resend
// from weltzcraft.com. Each email has a one-click unsubscribe (league_email_prefs.weekly_off).
//
// Env: SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_ID (database queries through the Management API),
//      RESEND_API_KEY (a weltzcraft.com sending key), SEND=true to really send (anything else = dry run),
//      TEST_TO=<address> to send every email to that one address instead (for a preview).
// This repo's logs are public: it prints counts only, never names or addresses.

import { getWeekProjections, type ProjectedPlayer } from '../supabase/functions/_shared/startSit.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const PROJECT = env('SUPABASE_PROJECT_ID');
const SEND = env('SEND') === 'true';
const TEST_TO = env('TEST_TO').trim();
const FROM = 'Hood League <hoodleague@weltzcraft.com>';
const REPLY_TO = 'hoodgames@weltzcraft.com';

async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`SQL failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json() as T[];
}

const fetchJson = async (url: string) => {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`GET ${url} failed with ${r.status}`);
  return await r.json();
};

interface Row {
  league_name: string;
  team_name: string;
  owner: string;
  email: string;
  token: string;
  rs: Record<string, number> | null;
  roster: { position: string; player: { id: string; name: string; position: string; team: string } }[];
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pos = (p: string) => (p === 'DST' ? 'DEF' : p);

export interface LineupLine { slot: string; name: string; team: string; position: string; points: number; opponent: string | null; note: string }

/** Best lineup by projected PPR points for the league's starting spots; everyone else sits. */
export function lineup(roster: Row['roster'], rs: Row['rs'], proj: Map<string, ProjectedPlayer>) {
  const want: [string, string[], number][] = [
    ['QB', ['QB'], rs?.qb ?? 1], ['RB', ['RB'], rs?.rb ?? 2], ['WR', ['WR'], rs?.wr ?? 2], ['TE', ['TE'], rs?.te ?? 1],
    ['FLEX', ['RB', 'WR', 'TE'], rs?.flex ?? 1], ['SUPERFLEX', ['QB', 'RB', 'WR', 'TE'], rs?.superFlex ?? 0],
    ['K', ['K'], rs?.k ?? 1], ['DEF', ['DEF'], rs?.def ?? 1],
  ];
  const players = roster.map(({ player }) => {
    const p = proj.get(player.id);
    const out = Boolean(p?.onBye) || /^(out|ir|doubtful|sus|pup)/i.test(p?.injury ?? '');
    const note = p?.onBye ? 'on bye' : p?.injury ? p.injury : !p ? 'no projection' : '';
    return { slot: '', name: player.name, team: player.team, position: pos(player.position), points: out ? 0 : (p?.points.ppr ?? 0), opponent: p?.opponent ?? null, note };
  }).sort((a, b) => b.points - a.points);
  const used = new Set<number>();
  const start: LineupLine[] = [];
  for (const [slot, ok, n] of want) {
    for (let k = 0; k < n; k += 1) {
      const i = players.findIndex((p, j) => !used.has(j) && ok.includes(p.position));
      if (i < 0) break;
      used.add(i);
      start.push({ ...players[i], slot });
    }
  }
  const sit = players.filter((_, j) => !used.has(j));
  return { start, sit };
}

const line = (p: LineupLine) => `${p.slot ? `${p.slot}: ` : ''}${p.name} (${p.position}, ${p.team})${p.opponent ? ` vs ${p.opponent}` : ''} · ${p.points.toFixed(1)} pts${p.note ? ` · ${p.note}` : ''}`;

function render(row: Row, week: number, start: LineupLine[], sit: LineupLine[], unsub: string) {
  const subject = `Week ${week} start/sit for ${row.team_name || 'your team'}`;
  const warn = start.filter((p) => p.note);
  const text = [
    `Your Week ${week} lineup for ${row.team_name} (${row.league_name}), by projected PPR points:`, '',
    'START', ...start.map(line), '', 'SIT', ...(sit.length ? sit.map(line) : ['Nobody: every player starts.']), '',
    warn.length ? `Heads up: ${warn.map((p) => `${p.name} (${p.note})`).join(', ')}. Check for a replacement.\n` : '',
    'Ask about any matchup in the Start/Sit chat: https://hood-league.com/start-sit', '',
    `Don't want these weekly emails? Unsubscribe: ${unsub}`, 'Hood League by Weltzcraft Studios',
  ].join('\n');
  const rowHtml = (p: LineupLine) => `<tr><td style="padding:6px 8px;color:#8f9bd0;font-size:12px">${esc(p.slot || '')}</td><td style="padding:6px 8px">${esc(p.name)} <span style="color:#7a809b">${esc(p.position)} · ${esc(p.team)}${p.opponent ? ` vs ${esc(p.opponent)}` : ''}</span>${p.note ? ` <b style="color:#d9534f">${esc(p.note)}</b>` : ''}</td><td style="padding:6px 8px;text-align:right;font-weight:700">${p.points.toFixed(1)}</td></tr>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1b1f3a">
<p style="font-size:13px;color:#7a809b;margin:0">Hood League · Week ${week}</p>
<h1 style="font-size:22px;margin:4px 0 12px">Start/sit for ${esc(row.team_name)}</h1>
<p style="margin:0 0 12px">${esc(row.league_name)}. Best lineup by projected PPR points.</p>
<h2 style="font-size:15px;margin:16px 0 4px">Start</h2><table style="width:100%;border-collapse:collapse">${start.map(rowHtml).join('')}</table>
<h2 style="font-size:15px;margin:16px 0 4px">Sit</h2><table style="width:100%;border-collapse:collapse">${sit.length ? sit.map(rowHtml).join('') : '<tr><td style="padding:6px 8px">Nobody: every player starts.</td></tr>'}</table>
<p style="margin:18px 0"><a href="https://hood-league.com/start-sit" style="background:#4f6bff;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700">Ask about a matchup</a></p>
<p style="font-size:12px;color:#7a809b">You get this because you have a team in a Hood League league. <a href="${esc(unsub)}" style="color:#7a809b">Unsubscribe</a> · Hood League by Weltzcraft Studios</p>
</div>`;
  return { subject, text, html };
}

if (import.meta.main) {
  if (!PROJECT || !env('SUPABASE_ACCESS_TOKEN')) throw new Error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID.');
  const projections = await getWeekProjections(fetchJson, new Date());
  if (projections.seasonType !== 'regular') { console.log(`Not the regular season (${projections.seasonType}); nothing to send.`); Deno.exit(0); }
  const proj = new Map(projections.players.map((p) => [p.id, p]));

  // Teams with a drafted roster in a league from the last ten months, and their owners' unsubscribe tokens.
  const teams = `select l.name as league_name, t->>'name' as team_name, t->>'ownerId' as owner, l.data->'rosterSettings' as rs, t->'roster' as roster
    from public.leagues l, jsonb_array_elements(coalesce(l.data->'teams', '[]'::jsonb)) t
    where l.created_at > now() - interval '300 days' and coalesce(l.data->>'status', '') = 'completed'
      and jsonb_array_length(coalesce(t->'roster', '[]'::jsonb)) > 0 and coalesce(t->>'ownerId', '') <> ''`;
  await sql(`insert into public.league_email_prefs (user_id) select distinct x.owner from (${teams}) x
    join auth.users u on u.id::text = x.owner on conflict (user_id) do nothing`);
  const rows = await sql<Row>(`select x.*, u.email, p.token from (${teams}) x
    join auth.users u on u.id::text = x.owner
    join public.league_email_prefs p on p.user_id = x.owner
    where not p.weekly_off and coalesce(u.email, '') <> ''`);

  const base = `https://${PROJECT}.supabase.co/functions/v1/api/league/email-off`;
  let sent = 0, failed = 0;
  for (const row of rows) {
    const { start, sit } = lineup(row.roster, row.rs, proj);
    const unsub = `${base}?u=${encodeURIComponent(row.owner)}&t=${encodeURIComponent(row.token)}`;
    const mail = render(row, projections.week, start, sit, unsub);
    if (!SEND && !TEST_TO) continue;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [TEST_TO || row.email], reply_to: REPLY_TO, subject: mail.subject, text: mail.text, html: mail.html,
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    });
    if (r.ok) sent += 1; else { failed += 1; console.log(`send failed: ${r.status}`); }
    if (TEST_TO && sent >= 3) break;
    await new Promise((res) => setTimeout(res, 600)); // Resend allows 2 requests a second.
  }
  console.log(`LEAGUE_EMAIL_JSON ${JSON.stringify({ week: projections.week, teams: rows.length, sent, failed, mode: TEST_TO ? 'test' : SEND ? 'send' : 'dry-run' })}`);
}
