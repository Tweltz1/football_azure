// Live end-to-end check of Curbsy and ToteTrack on the real backend, as two throwaway test accounts that are
// deleted at the end (the app's own Delete account path, then an admin clean-up in case that failed).
// Curbsy: terms, photo upload, post, browse, open, message, reply, inbox, report, block, Plus, delete.
// ToteTrack: tote + photo + list sync, other users can't see them, household invite/join/leave, delete account.
// Env: SUPABASE_ACCESS_TOKEN (management API, to read the project's keys).
const REF = 'nkwedlskhnojseeroezm';
const BASE = `https://${REF}.supabase.co`;
const API = `${BASE}/functions/v1/api/junk`;
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDFooorzzuCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/9k=';
// Middle of the Pacific, so the test listing never shows up near a real person.
const SPOT = { lat: 0.5123, lng: -140.4321 };
const out = [];
const ok = (name, pass, note = '') => { out.push({ name, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${note ? ' - ' + note : ''}`); };

(async () => {
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } })).json();
  const anon = keys.find((k) => k.name === 'anon').api_key;
  const service = keys.find((k) => k.name === 'service_role').api_key;
  const admin = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  const made = [];
  const user = async (tag) => {
    const email = `e2e-${tag}-${Date.now()}@test.weltzcraft.com`;
    const u = await (await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name: `Test ${tag}` } }) })).json();
    if (!u.id) throw new Error('create user: ' + JSON.stringify(u).slice(0, 200));
    made.push(u.id);
    const link = await (await fetch(`${BASE}/auth/v1/admin/generate_link`, { method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email }) })).json();
    const hashed = link.hashed_token || link.properties?.hashed_token;
    const s = await (await fetch(`${BASE}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hashed }) })).json();
    if (!s.access_token) throw new Error('sign in: ' + JSON.stringify(s).slice(0, 200));
    return { id: u.id, email, H: { apikey: anon, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } };
  };
  const j = async (who, method, path, body) => {
    const r = await fetch(`${API}/${path}`, { method, headers: who.H, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch { d = t; }
    return { s: r.status, d };
  };
  const rest = async (who, method, path, body, extra = {}) => {
    const r = await fetch(`${BASE}/rest/v1/${path}`, { method, headers: { ...who.H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch { d = t; }
    return { s: r.status, d };
  };
  const rpc = (who, fn, args = {}) => rest(who, 'POST', `rpc/${fn}`, args);

  try {
    // ---------------- Curbsy ----------------
    const A = await user('giver'), B = await user('taker');
    ok('Curbsy: two test accounts signed in', true);
    for (const w of [A, B]) { const r = await j(w, 'POST', 'terms', { agree: true }); ok(`Curbsy: accept Terms (${w === A ? 'A' : 'B'})`, r.s === 200, `${r.s}`); }
    const ph = await j(A, 'POST', 'photos', { image: JPEG, detect: false });
    ok('Curbsy: upload photo', ph.s === 200 && !!ph.d.path, `${ph.s} ${typeof ph.d === 'string' ? ph.d : ''}`);
    const post = await j(A, 'POST', 'items', { title: 'Test wood chair', description: 'Automated test, removed right away.', category: 'furniture', condition: 'good', pickup: 'Porch', photos: ph.d.path ? [ph.d.path] : [], ...SPOT });
    ok('Curbsy: post a listing', post.s === 200 && !!post.d.id, `${post.s} ${typeof post.d === 'string' ? post.d : post.d.title}`);
    const id = post.d.id;
    // Non-Plus members see new posts after Plus's 30-minute head start, so check from the poster's side and that B doesn't see it yet.
    const early = await j(B, 'GET', `items?lat=${SPOT.lat}&lng=${SPOT.lng}&km=40`);
    ok('Curbsy: Plus head start hides brand-new post from free members', early.s === 200 && !early.d.some?.((x) => x.id === id), `${early.s}`);
    const browse = await j(A, 'GET', `items?lat=${SPOT.lat}&lng=${SPOT.lng}&km=40`);
    ok('Curbsy: listing shows in nearby browse', browse.s === 200 && Array.isArray(browse.d) && browse.d.some((x) => x.id === id), `${browse.s} ${Array.isArray(browse.d) ? browse.d.length + ' found' : browse.d}`);
    const search = await j(A, 'GET', `items?lat=${SPOT.lat}&lng=${SPOT.lng}&km=40&q=chair`);
    ok('Curbsy: search finds it', search.s === 200 && Array.isArray(search.d) && search.d.some((x) => x.id === id), `${search.s}`);
    const open = await j(B, 'GET', `items/${id}?lat=${SPOT.lat}&lng=${SPOT.lng}`);
    ok('Curbsy: open listing', open.s === 200 && open.d.title === 'Test wood chair', `${open.s}`);
    if (open.d.photos?.[0]) { const p = await fetch(open.d.photos[0].url || open.d.photos[0]); ok('Curbsy: listing photo loads', p.ok, `${p.status}`); }
    const m1 = await j(B, 'POST', `chat/${id}/${A.id}`, { body: 'Hi, is this still available?' });
    ok('Curbsy: message the poster', m1.s === 200, `${m1.s} ${typeof m1.d === 'string' ? m1.d : ''}`);
    const inboxA = await j(A, 'GET', 'inbox');
    ok('Curbsy: poster sees it in inbox', inboxA.s === 200 && inboxA.d.some?.((t) => t.itemId === id && t.unread > 0), `${inboxA.s}`);
    const m2 = await j(A, 'POST', `chat/${id}/${B.id}`, { body: 'Yes, come by anytime.' });
    ok('Curbsy: poster replies', m2.s === 200, `${m2.s}`);
    const chatB = await j(B, 'GET', `chat/${id}/${A.id}`);
    ok('Curbsy: chat shows both messages', chatB.s === 200 && chatB.d.messages?.length === 2, `${chatB.s} ${chatB.d.messages?.length}`);
    const mine = await j(A, 'GET', 'mine');
    ok('Curbsy: My listings', mine.s === 200 && mine.d.some?.((x) => x.id === id), `${mine.s}`);
    const plus = await j(B, 'GET', 'plus');
    ok('Curbsy: Plus status loads', plus.s === 200, `${plus.s} ${JSON.stringify(plus.d).slice(0, 80)}`);
    const rep = await j(B, 'POST', `items/${id}/report`, { reason: 'Automated test report' });
    ok('Curbsy: report listing', rep.s === 200, `${rep.s}`);
    const blk = await j(B, 'POST', 'block', { userId: A.id });
    ok('Curbsy: block user', blk.s === 200, `${blk.s}`);
    const after = await j(B, 'GET', `items?lat=${SPOT.lat}&lng=${SPOT.lng}&km=40`);
    ok('Curbsy: blocked user\'s listing is hidden', after.s === 200 && !after.d.some?.((x) => x.id === id), `${after.s}`);
    const m3 = await j(B, 'POST', `chat/${id}/${A.id}`, { body: 'Hello again' });
    ok('Curbsy: blocked user can\'t be messaged', m3.s === 403, `${m3.s}`);
    for (const w of [A, B]) {
      const del = await j(w, 'DELETE', 'account');
      ok(`Curbsy: delete account (${w === A ? 'A' : 'B'})`, del.s === 200, `${del.s} ${typeof del.d === 'string' ? del.d : ''}`);
      const gone = await fetch(`${BASE}/auth/v1/admin/users/${w.id}`, { headers: admin });
      ok(`Curbsy: account really gone (${w === A ? 'A' : 'B'})`, gone.status === 404, `${gone.status}`);
    }
    const ghost = await j(B, 'GET', `items/${id}`);
    ok('Curbsy: listing removed with the account', ghost.s === 404 || ghost.s === 401, `${ghost.s}`);

    // ---------------- ToteTrack ----------------
    const O = await user('owner'), M = await user('member');
    ok('ToteTrack: two test accounts signed in', true);
    const now = Date.now();
    const tote = { user_id: O.id, id: 'tote-e2e-1', data: { id: 'tote-e2e-1', name: 'Garage bin 1', items: [{ id: 'i1', name: 'Hammer' }] }, deleted: false, updated_at: now };
    let r = await rest(O, 'POST', 'totetrack_totes?on_conflict=user_id,id', [tote], { Prefer: 'resolution=merge-duplicates,return=minimal' });
    ok('ToteTrack: back up a tote', r.s === 201 || r.s === 204 || r.s === 200, `${r.s} ${typeof r.d === 'string' ? r.d.slice(0, 120) : JSON.stringify(r.d).slice(0, 120)}`);
    r = await rest(O, 'GET', `totetrack_totes?select=id,data&user_id=eq.${O.id}`);
    ok('ToteTrack: read it back (new phone)', r.s === 200 && r.d[0]?.data?.name === 'Garage bin 1', `${r.s}`);
    r = await rest(O, 'POST', 'totetrack_photos?on_conflict=user_id,name', [{ user_id: O.id, name: 'p1.jpg', data: JPEG.split(',')[1], updated_at: now }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
    ok('ToteTrack: back up a photo', r.s < 300, `${r.s} ${typeof r.d === 'string' ? r.d.slice(0, 120) : JSON.stringify(r.d).slice(0, 120)}`);
    r = await rest(O, 'POST', 'totetrack_lists?on_conflict=user_id', [{ user_id: O.id, data: [{ id: 'l1', name: 'Camping' }], updated_at: now }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
    ok('ToteTrack: back up packing lists', r.s < 300, `${r.s} ${typeof r.d === 'string' ? r.d.slice(0, 120) : JSON.stringify(r.d).slice(0, 120)}`);
    r = await rest(M, 'GET', `totetrack_totes?select=id&user_id=eq.${O.id}`);
    ok('ToteTrack: another account can\'t see them', r.s === 200 && r.d.length === 0, `${r.s} ${r.d.length}`);
    r = await rest(M, 'POST', 'totetrack_totes', [{ ...tote, id: 'evil' }]);
    ok('ToteTrack: another account can\'t write them', r.s >= 400, `${r.s}`);
    const code = await rpc(O, 'totetrack_household_invite');
    ok('ToteTrack: household invite code', code.s === 200 && /^[A-Z2-9]{6}$/.test(code.d), `${code.s} ${typeof code.d === 'string' && code.d.length > 6 ? code.d.slice(0, 100) : ''}`);
    const join = await rpc(M, 'totetrack_household_join', { invite: code.d });
    ok('ToteTrack: family member joins', join.s === 200 && join.d.role === 'member' && join.d.space === O.id, `${join.s} ${JSON.stringify(join.d).slice(0, 120)}`);
    r = await rest(M, 'GET', `totetrack_totes?select=id&user_id=eq.${O.id}`);
    ok('ToteTrack: member sees shared totes', r.s === 200 && r.d.length === 1, `${r.s}`);
    r = await rest(M, 'POST', 'totetrack_totes?on_conflict=user_id,id', [{ ...tote, id: 'tote-e2e-2', data: { id: 'tote-e2e-2', name: 'Shared bin' } }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
    ok('ToteTrack: member adds a shared tote', r.s < 300, `${r.s}`);
    r = await rest(M, 'GET', `totetrack_lists?select=data&user_id=eq.${O.id}`);
    ok('ToteTrack: member sees shared packing lists', r.s === 200 && r.d.length === 1, `${r.s} ${JSON.stringify(r.d).slice(0, 80)}`);
    const info = await rpc(O, 'totetrack_household_info');
    ok('ToteTrack: owner sees 2 people', info.s === 200 && info.d.members?.length === 2, `${info.s} ${info.d.members?.length}`);
    const leave = await rpc(M, 'totetrack_household_leave');
    ok('ToteTrack: member leaves', leave.s === 200 && leave.d.role === 'solo', `${leave.s}`);
    r = await rest(M, 'GET', `totetrack_totes?select=id&user_id=eq.${O.id}`);
    ok('ToteTrack: after leaving, no access', r.s === 200 && r.d.length === 0, `${r.s}`);
    for (const w of [O, M]) {
      const del = await rpc(w, 'totetrack_delete_account');
      ok(`ToteTrack: delete account (${w === O ? 'owner' : 'member'})`, del.s === 200 && del.d === 'account', `${del.s} ${JSON.stringify(del.d)}`);
    }
    r = await fetch(`${BASE}/rest/v1/totetrack_totes?select=id&user_id=eq.${O.id}`, { headers: admin });
    ok('ToteTrack: totes erased with the account', (await r.json()).length === 0);
  } catch (e) {
    ok('script', false, e.message);
  } finally {
    for (const id of made) await fetch(`${BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin }).catch(() => {});
  }
  const failed = out.filter((x) => !x.pass);
  console.log(`\n${out.length - failed.length}/${out.length} passed`);
  if (failed.length) process.exitCode = 1;
})();
