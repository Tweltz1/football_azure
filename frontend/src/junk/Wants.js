import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJunk } from './JunkApp';
import { askForItem, closeWant, nearbyWants } from './junkApi';
import { CATEGORIES, distanceLabel, timeAgo } from './device';

/**
 * "Looking for": neighbors ask for something; anyone with one taps "I have one", posts it, and the asker
 * gets a message about the new listing. Shown at the top of Browse (only the rough distance, never the spot).
 */
export default function Wants() {
  const { spot, me, askSignIn } = useJunk();
  const navigate = useNavigate();
  const [wants, setWants] = useState([]);
  const [asking, setAsking] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!spot) return undefined;
    let live = true;
    nearbyWants(spot).then((list) => { if (live) setWants(Array.isArray(list) ? list : []); }).catch(() => {});
    return () => { live = false; };
  }, [spot]);

  if (!spot) return null;

  const ask = async (e) => {
    e.preventDefault();
    if (!me) { askSignIn('Sign in to ask your neighbors for something.'); return; }
    if (title.trim().length < 2) { setNote('Say what you\'re looking for.'); return; }
    setBusy(true);
    setNote('');
    try {
      const want = await askForItem({ title: title.trim(), category: category || 'other', lat: spot.lat, lng: spot.lng });
      setWants((list) => [want, ...list]);
      setTitle('');
      setCategory('');
      setAsking(false);
      setNote('Posted. Neighbors who have one can post it for you, and you\'ll get a message.');
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };

  const haveOne = (w) => {
    if (!me) { askSignIn('Sign in to post it for them.'); return; }
    const q = new URLSearchParams({ want: w.id, title: w.title, category: w.category || '', who: w.ownerName || 'A neighbor' });
    navigate(`/junk/post?${q.toString()}`);
  };

  const close = async (w) => {
    try {
      await closeWant(w.id);
      setWants((list) => list.filter((x) => x.id !== w.id));
    } catch (err) {
      setNote(err.message);
    }
  };

  return (
    <section className="jk-wants" aria-label="Neighbors are looking for">
      <div className="jk-wants-head">
        <h2>{wants.length ? 'Neighbors are looking for' : 'Looking for something?'}</h2>
        {!asking && <button type="button" className="jk-chip" onClick={() => (me ? setAsking(true) : askSignIn('Sign in to ask your neighbors for something.'))}>Ask for something</button>}
      </div>
      {asking && (
        <form className="jk-want-form" onSubmit={ask}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="What do you need? Like “crib” or “moving boxes”" aria-label="What are you looking for?" autoFocus />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">Category (optional)</option>
            {CATEGORIES.map(([key, label, icon]) => <option key={key} value={key}>{icon} {label}</option>)}
          </select>
          <div className="jk-empty-actions">
            <button type="submit" className="jk-btn jk-btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Ask neighbors'}</button>
            <button type="button" className="jk-link" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </form>
      )}
      {note && <p className="jk-muted" role="status">{note}</p>}
      {wants.length > 0 && (
        <ul className="jk-wants-list">
          {wants.slice(0, 6).map((w) => (
            <li key={w.id}>
              <span className="jk-want-text">
                <b>{w.title}</b>
                <small>{w.mine ? 'You asked' : `${w.ownerName || 'A neighbor'}${w.km ? ` · ${distanceLabel(w.km)}` : ''}`} · {timeAgo(w.createdAt)}</small>
              </span>
              {w.mine
                ? <button type="button" className="jk-btn" onClick={() => close(w)}>Got it</button>
                : <button type="button" className="jk-btn jk-btn-primary" onClick={() => haveOne(w)}>I have one</button>}
            </li>
          ))}
        </ul>
      )}
      {!wants.length && !asking && <p className="jk-muted">Ask for what you need, and neighbors who have one can post it for you.</p>}
    </section>
  );
}
