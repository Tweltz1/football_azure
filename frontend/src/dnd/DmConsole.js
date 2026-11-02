import React, { useCallback, useEffect, useRef, useState } from 'react';
import MiniMap from './MiniMap';
import { MONSTERS, SKILLS } from './rules';
import { SETTINGS, settingFor } from './settings';
import { dmIdeas, localNarration } from './story';
import {
  createCampaign, getCampaign, listCampaigns, narrate, saveCampaignNotes, saveSession,
} from './dndApi';

const AUTO_KEY = 'dq-dm-auto';
const readAuto = () => {
  try { return window.localStorage.getItem(AUTO_KEY) !== 'off'; } catch (error) { return true; }
};

/** Writes the next bit of story with the AI, or the built-in narrator when the AI isn't available. */
const useNarrator = (ai, user) => {
  const n = useRef(0);
  return useCallback(async (kind, detail = '', direction = '') => {
    n.current += 1;
    if (user) {
      try {
        // The server gives up on a busy AI after about 18 seconds; never leave the table waiting longer than that.
        const res = await Promise.race([
          narrate(kind, { ...ai, cueDetail: detail }, direction),
          new Promise((resolve) => { setTimeout(() => resolve(null), 19000); }),
        ]);
        if (res?.narration) return { text: res.narration, ideas: res.ideas || [], by: 'ai' };
      } catch (error) {
        // Not set up (503) or not signed in: fall through to the built-in narrator.
      }
    }
    return { text: localNarration({ kind, detail }, ai, n.current + Math.floor(Math.random() * 1000)), ideas: [], by: 'auto' };
  }, [ai, user]);
};

export default function DmConsole({ screen, send, header, user, onSignIn }) {
  const dm = screen.dm;
  const [tab, setTab] = useState('story');
  const [auto, setAuto] = useState(readAuto);
  const [draft, setDraft] = useState(null); // { text, by, cue }
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState('');
  const [selected, setSelected] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [spawnId, setSpawnId] = useState('');
  const [spawnAt, setSpawnAt] = useState(false);
  const [checkSkill, setCheckSkill] = useState('Perception');
  const [checkDc, setCheckDc] = useState(12);
  const [checkWho, setCheckWho] = useState('');
  const [nextSetting, setNextSetting] = useState('');
  const [xp, setXp] = useState(50);
  const [item, setItem] = useState('');
  const [campaigns, setCampaigns] = useState(null);
  const [campaignDetail, setCampaignDetail] = useState(null);
  const [newName, setNewName] = useState('');
  const [notes, setNotes] = useState('');
  const [note, setNote] = useState('');
  const handledCue = useRef(0); // 0: the cue waiting when the DM's phone opens gets narrated too
  const writer = useNarrator(dm?.ai || {}, user);

  const dmSend = (payload) => send('act', { type: 'dm', dm: payload });
  const pushNarration = (text, by) => dmSend({ type: 'narrate', text, by });

  useEffect(() => { try { window.localStorage.setItem(AUTO_KEY, auto ? 'on' : 'off'); } catch (error) { /* ignore */ } }, [auto]);

  // A new cue from the table: draft narration for it. In auto mode it goes straight to the TV.
  const cueId = dm?.cue?.id || 0;
  useEffect(() => {
    if (!dm?.cue || cueId === handledCue.current) return;
    handledCue.current = cueId;
    const c = dm.cue;
    setBusy(true);
    writer(c.kind, c.detail).then((res) => {
      setBusy(false);
      if (auto) pushNarration(res.text, res.by);
      else setDraft({ ...res, cue: c });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueId]);

  // Campaigns load once the DM is signed in.
  useEffect(() => {
    if (!user || campaigns) return;
    listCampaigns().then((list) => setCampaigns(list || [])).catch((e) => { setCampaigns([]); setNote(e.message); });
  }, [user, campaigns]);

  if (!dm) return null;

  const tokens = dm.tokens;
  const sel = tokens.find((t) => t.id === selected) || null;
  const heroes = tokens.filter((t) => t.side === 'party');
  const scenesLeft = dm.scene < dm.scenes.length - 1;
  const ideas = dmIdeas(dm.ai, Math.floor(cueId));

  const ask = async (kind, detail = '', dir = '') => {
    setBusy(true);
    const res = await writer(kind, detail, dir);
    setBusy(false);
    setDraft({ ...res, cue: { kind, detail } });
    setTab('story');
  };

  const onMapTap = (x, y, token) => {
    if (placing && sel) {
      dmSend({ type: 'place', target: sel.id, x, y });
      setPlacing(false);
      return;
    }
    if (spawnAt && spawnId) {
      dmSend({ type: 'spawn', monster: spawnId, x, y });
      setSpawnAt(false);
      return;
    }
    setSelected(token ? token.id : null);
  };

  const pickCampaign = async (c) => {
    setNote('Loading campaign…');
    try {
      const detail = await getCampaign(c.id);
      setCampaignDetail(detail);
      setNotes(detail.campaign.notes || '');
      send('act', {
        type: 'campaign',
        campaign: {
          id: detail.campaign.id,
          name: detail.campaign.name,
          notes: detail.campaign.notes || '',
          summaries: (detail.sessions || []).map((s) => s.summary).filter(Boolean).slice(-5),
          pastQuests: (detail.sessions || []).map((s) => s.questTitle).filter(Boolean),
        },
      });
      setNote(`Playing in ${detail.campaign.name}.`);
    } catch (e) {
      setNote(e.message);
    }
  };

  const makeCampaign = async () => {
    if (!newName.trim()) return;
    try {
      const c = await createCampaign(newName.trim());
      setCampaigns([c, ...(campaigns || [])]);
      setNewName('');
      pickCampaign(c);
    } catch (e) { setNote(e.message); }
  };

  const saveNow = async () => {
    if (!dm.campaign) { setNote('Pick or create a campaign first.'); return; }
    setNote('Writing a recap and saving…');
    const recap = await writer('recap', '', 'Summarize this session in 3 to 5 sentences for the campaign log: what happened, who did what, what is still unresolved.');
    try {
      const record = dm.record;
      await saveSession(dm.campaign.id, { ...record, summary: recap.text }, record.party.filter((p) => p.characterId));
      setNote('Session saved to the campaign ✓');
      if (campaignDetail) pickCampaign(campaignDetail.campaign);
    } catch (e) {
      setNote(`Couldn't save: ${e.message}`);
    }
  };

  const tabs = [['story', '📜 Story'], ['table', '🗺️ Table'], ['scene', '🎬 Scene'], ['campaign', '📚 Campaign']];

  return (
    <div className="lcp dqp dqdm">
      {header}
      <div className="dqp-status is-dm">
        <span>🎲 DM · {settingFor(dm.ai.setting).emoji} {dm.ai.settingName} · Scene {dm.scene + 1}/{dm.scenes.length}</span>
        <span>{dm.mode === 'combat' ? `⚔️ Round ${dm.round}` : '🧭 Exploring'}</span>
      </div>
      <div className="lcp-tabs dqp-tabs">
        {tabs.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === 'story' && (
        <div className="dqdm-story">
          <label className="dqdm-auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-send narration to the TV ({user ? 'AI narrator' : 'built-in narrator, sign in for AI'})
          </label>
          {busy && <p className="dqdm-busy">✨ The narrator is writing…</p>}
          {draft && (
            <div className="dqdm-draft">
              <small>Draft for: {draft.cue?.kind}{draft.by === 'ai' ? ' · AI' : ' · built-in'}</small>
              <textarea value={draft.text} rows={5} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
              <div className="dqp-row">
                <button type="button" className="lc-btn" onClick={() => { pushNarration(draft.text, draft.by === 'ai' ? 'ai' : 'dm'); setDraft(null); }}>📺 Send to TV</button>
                <button type="button" className="lc-btn lc-btn-ghost" onClick={() => ask(draft.cue?.kind || 'free', draft.cue?.detail || '', direction)}>✨ Rewrite</button>
                <button type="button" className="lcp-link" onClick={() => setDraft(null)}>Skip</button>
              </div>
              {draft.ideas?.length > 0 && <ul className="dqdm-ideas">{draft.ideas.map((i) => <li key={i}>{i}</li>)}</ul>}
            </div>
          )}
          <form className="dqdm-direct" onSubmit={(e) => { e.preventDefault(); ask('free', '', direction); }}>
            <input value={direction} onChange={(e) => setDirection(e.target.value.slice(0, 240))} placeholder="Direct the narrator: “the innkeeper is lying”, “describe the dragon”…" />
            <button type="submit" className="lc-btn" disabled={busy}>✨ Ask</button>
          </form>
          <form className="dqdm-direct" onSubmit={(e) => { e.preventDefault(); const t = e.target.elements.say.value.trim(); if (t) { pushNarration(t, 'dm'); e.target.reset(); } }}>
            <input name="say" placeholder="Or type it yourself and send it to the TV" maxLength={600} />
            <button type="submit" className="lc-btn lc-btn-ghost">📺 Say</button>
          </form>
          {dm.requests.length > 0 && (
            <div className="dqdm-requests">
              <h3>Players want to…</h3>
              {dm.requests.slice().reverse().map((r) => (
                <div key={r.id} className="dqdm-request">
                  <p><b>{r.who}:</b> {r.text}</p>
                  <div className="dqp-row">
                    <button type="button" className="lc-btn lc-btn-ghost" onClick={() => ask('action', `${r.who} tries: ${r.text}`, 'Narrate what happens. If it needs a roll, say which check.')}>✨ Narrate</button>
                    <button type="button" className="lc-btn lc-btn-ghost" onClick={() => { setCheckWho(r.cid); setTab('scene'); }}>🎲 Call a check</button>
                    <button type="button" className="lcp-link" onClick={() => dmSend({ type: 'dismissRequest', id: r.id })}>Done</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="dqdm-ideasbox">
            <h3>Ideas to keep it fresh</h3>
            <ul className="dqdm-ideas">{ideas.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
          <div className="dqp-log">{dm.log.slice(-12).reverse().map((l, i) => <p key={i} className={`is-${l.kind}`}>{l.text}</p>)}</div>
        </div>
      )}

      {tab === 'table' && (
        <div className="dqp-mapwrap">
          <div className="dqp-hint">{placing ? `Tap where ${sel?.name} should go.` : spawnAt ? 'Tap where it appears.' : 'Tap a token to manage it. Faded monsters are still hidden.'}</div>
          <MiniMap packed={dm.map} tokens={tokens} marks={Object.fromEntries([[dm.turnId, 'turn'], ...(sel ? [[sel.id, 'target']] : []), ...tokens.filter((t) => t.hidden).map((t) => [t.id, 'hidden'])])} onTap={onMapTap} />
          {sel && (
            <div className="dqdm-token">
              <b>{sel.name}</b> <span>{sel.hp}/{sel.maxHp} HP · AC {sel.ac}</span>
              <div className="dqp-row">
                {[-10, -5, -1, 1, 5, 10].map((n) => <button key={n} type="button" className="lc-btn lc-btn-ghost" onClick={() => dmSend({ type: 'hp', target: sel.id, amount: n })}>{n > 0 ? `+${n}` : n}</button>)}
              </div>
              <div className="dqp-row">
                <button type="button" className="lc-btn lc-btn-ghost" onClick={() => setPlacing(true)}>✋ Move</button>
                {sel.side === 'foe' ? (
                  <button type="button" className="lc-btn lc-btn-ghost" onClick={() => { dmSend({ type: 'remove', target: sel.id }); setSelected(null); }}>🗑 Remove</button>
                ) : (
                  <button type="button" className="lc-btn lc-btn-ghost" onClick={() => dmSend({ type: 'revive', target: sel.id })}>✨ Revive</button>
                )}
              </div>
              {sel.side === 'party' && (
                <form className="dqdm-direct" onSubmit={(e) => { e.preventDefault(); if (item.trim()) { dmSend({ type: 'give', target: sel.id, item }); setItem(''); } }}>
                  <input value={item} onChange={(e) => setItem(e.target.value.slice(0, 40))} placeholder="Give an item" />
                  <button type="submit" className="lc-btn lc-btn-ghost">🎁 Give</button>
                </form>
              )}
            </div>
          )}
          <div className="dqdm-spawn">
            <select value={spawnId} onChange={(e) => setSpawnId(e.target.value)} aria-label="Monster">
              <option value="">Add a monster…</option>
              {settingFor(dm.ai.setting).monsters.map(([id]) => <option key={id} value={id}>{MONSTERS[id].glyph} {MONSTERS[id].name} (here)</option>)}
              {Object.values(MONSTERS).map((m) => <option key={`all${m.id}`} value={m.id}>{m.glyph} {m.name}</option>)}
            </select>
            <button type="button" className="lc-btn lc-btn-ghost" disabled={!spawnId} onClick={() => dmSend({ type: 'spawn', monster: spawnId })}>Near the exit</button>
            <button type="button" className="lc-btn lc-btn-ghost" disabled={!spawnId} onClick={() => setSpawnAt(true)}>Tap a spot</button>
          </div>
        </div>
      )}

      {tab === 'scene' && (
        <div className="dqdm-scene">
          <div className="dqp-row">
            {dm.mode === 'combat' ? (
              <>
                <button type="button" className="lc-btn" onClick={() => dmSend({ type: 'nextTurn' })}>⏭ Skip turn</button>
                <button type="button" className="lc-btn lc-btn-ghost" onClick={() => dmSend({ type: 'endCombat' })}>🏳️ End fight</button>
              </>
            ) : (
              <>
                <button type="button" className="lc-btn" onClick={() => dmSend({ type: 'startCombat' })}>⚔️ Roll initiative</button>
                <button type="button" className="lc-btn lc-btn-ghost" onClick={() => dmSend({ type: 'reveal' })}>👁 Reveal monsters</button>
                <button type="button" className="lc-btn lc-btn-ghost" onClick={() => dmSend({ type: 'shortRest' })}>🔥 Short rest</button>
              </>
            )}
          </div>
          <h3>Travel</h3>
          <p className="dqp-fine">Route: {dm.scenes.map((s, i) => `${i === dm.scene ? '▶ ' : ''}${settingFor(s).name}`).join(' → ')}{dm.atExit ? ' · The party is at the exit.' : ''}</p>
          <div className="dqp-row">
            <select value={nextSetting} onChange={(e) => setNextSetting(e.target.value)} aria-label="Place">
              <option value="">{scenesLeft ? `Next: ${settingFor(dm.scenes[dm.scene + 1]).name}` : 'Pick a place'}</option>
              {Object.values(SETTINGS).map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
            </select>
            <button type="button" className="lc-btn" disabled={dm.mode === 'combat'} onClick={() => dmSend({ type: 'nextScene', setting: nextSetting || null })}>🚪 Go to next scene</button>
            <button type="button" className="lc-btn lc-btn-ghost" disabled={dm.mode === 'combat'} onClick={() => dmSend({ type: 'rerollScene', setting: nextSetting || null })}>🎲 New map here</button>
          </div>
          <h3>Skill check</h3>
          <div className="dqp-row">
            <select value={checkSkill} onChange={(e) => setCheckSkill(e.target.value)} aria-label="Skill">{Object.keys(SKILLS).map((s) => <option key={s}>{s}</option>)}</select>
            <label className="dqdm-dc">DC <input type="number" min={5} max={30} value={checkDc} onChange={(e) => setCheckDc(e.target.value)} /></label>
            <select value={checkWho} onChange={(e) => setCheckWho(e.target.value)} aria-label="Who">
              <option value="">Everyone</option>
              {heroes.map((h) => <option key={h.id} value={h.cid}>{h.name}</option>)}
            </select>
            <button type="button" className="lc-btn" onClick={() => dmSend({ type: 'check', skill: checkSkill, dc: Number(checkDc), cid: checkWho || null })}>🎲 Ask for the roll</button>
          </div>
          {dm.check && (
            <p className="dqp-fine">{dm.check.skill} DC {dm.check.dc}: {Object.values(dm.check.results).map((r) => `${r.name} ${r.total}${r.ok ? '✓' : '✗'}`).join(', ') || 'waiting…'} <button type="button" className="lcp-link" onClick={() => dmSend({ type: 'clearCheck' })}>clear</button></p>
          )}
          <h3>Rewards</h3>
          <div className="dqp-row">
            <label className="dqdm-dc">XP each <input type="number" min={0} max={5000} value={xp} onChange={(e) => setXp(e.target.value)} /></label>
            <button type="button" className="lc-btn" onClick={() => dmSend({ type: 'xp', amount: Number(xp) })}>⭐ Award</button>
          </div>
          <h3>The quest</h3>
          <p className="dqp-fine"><b>{dm.quest.title}.</b> For {dm.quest.patron}. Villain: {dm.quest.villain}. Secret twist: {dm.quest.twist}. Reward: {dm.quest.reward}.</p>
          <div className="dqp-row">
            <button type="button" className="lc-btn lc-btn-ghost" onClick={() => send('act', { type: 'newQuest' })}>🆕 New quest, same heroes</button>
            <button type="button" className="lcp-link" onClick={() => send('act', { type: 'lobby' })}>Back to lobby</button>
          </div>
        </div>
      )}

      {tab === 'campaign' && (
        <div className="dqdm-campaign">
          {!user ? (
            <>
              <p>Sign in with Google to keep a campaign: every session's recap, plus each hero's level, loot and history over time.</p>
              <button type="button" className="lcp-google" onClick={onSignIn}><span className="lcp-g">G</span> Sign in with Google</button>
            </>
          ) : (
            <>
              <p>{dm.campaign ? <>Playing in <b>{dm.campaign.name}</b>.</> : 'No campaign picked: this is a one-shot.'}</p>
              <button type="button" className="lc-btn" disabled={!dm.campaign} onClick={saveNow}>💾 Save this session</button>
              {note && <p className="dqp-fine">{note}</p>}
              <h3>Your campaigns</h3>
              {(campaigns || []).map((c) => (
                <button key={c.id} type="button" className={`dqdm-camp${dm.campaign?.id === c.id ? ' is-on' : ''}`} onClick={() => pickCampaign(c)}>
                  <b>{c.name}</b><small>{c.sessions || 0} sessions{c.updatedAt ? ` · last ${new Date(c.updatedAt).toLocaleDateString()}` : ''}</small>
                </button>
              ))}
              <form className="dqdm-direct" onSubmit={(e) => { e.preventDefault(); makeCampaign(); }}>
                <input value={newName} onChange={(e) => setNewName(e.target.value.slice(0, 60))} placeholder="New campaign name" />
                <button type="submit" className="lc-btn lc-btn-ghost">➕ Create</button>
              </form>
              {campaignDetail && (
                <div className="dqdm-history">
                  <h3>DM notes</h3>
                  <textarea value={notes} rows={4} onChange={(e) => setNotes(e.target.value.slice(0, 2000))} placeholder="Secrets, NPCs, plot threads. The AI narrator reads these." />
                  <button type="button" className="lc-btn lc-btn-ghost" onClick={() => saveCampaignNotes(campaignDetail.campaign.id, notes).then(() => setNote('Notes saved ✓')).catch((e) => setNote(e.message))}>Save notes</button>
                  <h3>Heroes</h3>
                  {(campaignDetail.characters || []).map((ch) => (
                    <details key={ch.id} className="dqdm-char">
                      <summary><b>{ch.name}</b> · Level {ch.level} {ch.classId} · {ch.xp} XP · {ch.ownerName || 'player'}</summary>
                      <p>HP {ch.hp}/{ch.maxHp} · {ch.gold} gold · {(ch.inventory || []).join(', ')}</p>
                      <ul>{(ch.history || []).slice().reverse().map((h, i) => <li key={i}>{h.date?.slice(0, 10)}: {h.quest} (+{h.xp || 0} XP){h.note ? ` · ${h.note}` : ''}</li>)}</ul>
                    </details>
                  ))}
                  <h3>Past sessions</h3>
                  {(campaignDetail.sessions || []).slice().reverse().map((s) => (
                    <details key={s.id} className="dqdm-char">
                      <summary>{s.playedAt?.slice(0, 10)} · {s.questTitle}</summary>
                      <p>{s.summary}</p>
                    </details>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
