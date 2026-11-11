import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SignInPrompt, useJunk } from './JunkApp';
import { createItem, getItem, getMember, updateItem, uploadPhoto } from './junkApi';
import { TermsSheet, checkPhoto } from './Safety';
import { CATEGORIES, CONDITIONS, inJunkApp, photoToJpeg } from './device';
import { appleDetect, hasAppleDetection } from './appleLabels';
import { BackButton } from './ItemPage';
import PieceThumb from './PieceThumb';
import PostPreview from './PostPreview';
import { namesToTeach, rememberNames, sendFixes } from './learning';
import { IconCamera, IconClose, IconPin, IconSparkle } from './icons';

const MAX_PHOTOS = 6;
// Item detection runs on the phone with Apple Vision (free, no limit; Tyler's choice 2026-11-09).
// Gemini is only used where Apple detection isn't available (the website during development).
// Set to true to also ask Gemini when Apple isn't sure what the photo shows.
const GEMINI_BACKUP = false;

const EMPTY = { title: '', description: '', category: '', condition: 'good', tags: [], pickup: '', spot: '', handoff: 'porch', firstCome: false };
const MAX_PIECES = 12;
let pieceSeq = 0;
const newPiece = (fields = {}) => ({ key: `n${++pieceSeq}`, title: '', category: '', box: null, photo: 0, gone: false, guess: null, ...fields });
const guessOf = (d) => (d && d.title ? { title: d.title, label: d.label || '', source: d.source || '', confidence: d.confidence, category: d.category, box: d.box || null } : null);

/** "Chair and lamp", "Chair, lamp and 3 more" (same as the server's name for a post of several things). */
export function bundleTitle(pieces) {
  const names = pieces.map((p, n) => (n ? p.title.charAt(0).toLowerCase() + p.title.slice(1) : p.title));
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`.slice(0, 80);
}

export default function PostItem() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { me, authLoading, spot, refreshSpot, locating, spotError } = useJunk();
  const [photos, setPhotos] = useState([]); // { key, path?, url?, preview, uploading, error }
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!editing);
  // A new post is shown the way neighbors will see it before it goes live.
  const [previewing, setPreviewing] = useState(false);
  // Curbsy rules: agreed once before the first post (the server asks again if it hasn't been).
  const [askTerms, setAskTerms] = useState(false);
  const retryAfterTerms = useRef(null);
  // What the phone's photo check saw (sent with the listing so the server can check it too).
  const photoLabels = useRef([]);
  // Several things in one post, each claimable and taken on its own.
  const [pieces, setPieces] = useState([]);
  const multi = pieces.length > 0;
  const piecesRef = useRef(pieces);
  piecesRef.current = pieces;
  const fileRef = useRef(null);
  const detectAsked = useRef(false);
  // What the phone guessed for the post's name, and the photo it looked at (for the learning loop).
  const guessRef = useRef(null);
  const guessPhoto = useRef(null);
  const touchedRef = useRef(touched);
  touchedRef.current = touched;

  useEffect(() => {
    if (!me || editing) return;
    getMember().then((m) => { if (m && !m.terms) setAskTerms(true); }).catch(() => {});
  }, [me, editing]);

  useEffect(() => {
    if (!editing || !me) return;
    getItem(id).then((item) => {
      if (!item.mine) { navigate(`/junk/item/${id}`, { replace: true }); return; }
      setForm({ title: item.title, description: item.description, category: item.category, condition: item.condition, tags: item.tags, pickup: item.pickup, spot: item.spot || '', handoff: item.handoff || 'porch', firstCome: !!item.firstCome });
      setPieces((item.pieces || []).map((p) => ({ ...newPiece(), ...p, key: p.id })));
      setPhotos(item.photos.map((url) => ({ key: url, url, preview: url, path: decodeURIComponent(url.split('/junk-photos/')[1] || '') })));
      setDetected(item.aiDetected);
      setLoaded(true);
    }).catch((err) => { setError(err.message); setLoaded(true); });
  }, [editing, id, me, navigate]);

  if (!me) {
    return (
      <main className="jk-page">
        <div className="jk-topbar"><BackButton /><h1>Post an item</h1></div>
        {authLoading ? null : <SignInPrompt title="Give something away" text="Sign in to post free stuff for neighbors to pick up." />}
      </main>
    );
  }

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTouched((t) => ({ ...t, [key]: true }));
  };

  // Fill in whatever the person hasn't typed yet with what Apple or Gemini saw.
  const applyDetection = (d) => {
    if (!d) return;
    const t = touchedRef.current;
    // A photo of several things: each becomes its own row in the post, with its part of the photo, so people
    // can claim them one by one. Same kind twice gets numbered ("Battery 1", "Battery 2").
    const found = (d.things || []).filter((x) => x.title).slice(0, MAX_PIECES);
    const seen = {};
    found.forEach((x) => { seen[x.title] = (seen[x.title] || 0) + 1; });
    const counter = {};
    const things = found.map((x) => (seen[x.title] > 1 ? { ...x, title: `${x.title} ${(counter[x.title] = (counter[x.title] || 0) + 1)}` } : x));
    const blank = (list) => list.every((p) => !p.title.trim());
    if (things.length >= 2) {
      setPieces((list) => (list.length && !blank(list) ? list : things.map((x) => newPiece({ title: x.title, category: x.category, box: x.box, photo: 0, guess: guessOf(x) }))));
      setForm((f) => ({
        ...f,
        description: t.description && f.description ? f.description : d.description || f.description,
        condition: t.condition ? f.condition : d.condition || f.condition,
        tags: d.tags && d.tags.length ? d.tags : f.tags,
      }));
      setDetected(true);
      setAiNote(`Found ${things.length} things, each listed separately`);
      return;
    }
    // Listing several things already: the one thing found goes in the first empty row, not the post's name.
    if (piecesRef.current.length) {
      if (d.title) {
        setPieces((list) => {
          const k = list.findIndex((p) => !p.title.trim());
          return k < 0 ? list : list.map((p, n) => (n === k ? { ...p, title: d.title, category: d.category || p.category, guess: guessOf(d) } : p));
        });
      }
      setDetected(true);
      setAiNote(d.title ? `Looks like: ${d.title}` : '');
      return;
    }
    if (!t.title && d.title) guessRef.current = guessOf(d);
    setForm((f) => ({
      ...f,
      title: t.title && f.title ? f.title : d.title || f.title,
      description: t.description && f.description ? f.description : d.description || f.description,
      category: t.category && f.category ? f.category : d.category || f.category,
      condition: t.condition ? f.condition : d.condition || f.condition,
      tags: d.tags && d.tags.length ? d.tags : f.tags,
    }));
    setDetected(true);
    setAiNote(d.title ? `Looks like: ${d.title}` : '');
  };

  const setPiece = (key, patch) => setPieces((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const dropPiece = (key) => setPieces((list) => {
    const next = list.filter((p) => p.key !== key);
    return next.length < 2 && !editing ? [] : next;
  });
  // Listing several things by hand: what's in the name box becomes the first thing, and the post is named after them.
  const startMulti = () => {
    if (pieces.length) return;
    setPieces([newPiece({ title: form.title.trim(), category: form.category, guess: guessRef.current }), newPiece()]);
    setForm((f) => ({ ...f, title: '' }));
  };
  const named = pieces.filter((p) => p.title.trim().length >= 2);

  const addFiles = async (fileList) => {
    const files = [...fileList].slice(0, MAX_PHOTOS - photos.length);
    if (!files.length) return;
    setError('');
    for (const file of files) {
      const key = `${Date.now()}-${Math.random()}`;
      let preview;
      try {
        preview = await photoToJpeg(file);
      } catch (err) {
        setError(err.message);
        continue;
      }
      // Free on-phone check (explicit photos, weapons, drugs) before anything is uploaded.
      const safe = await checkPhoto(preview);
      if (!safe.ok) {
        setError(safe.reason);
        continue;
      }
      photoLabels.current = [...photoLabels.current, ...(safe.labels || [])].slice(-60);
      setPhotos((list) => [...list, { key, preview, uploading: true }]);
      // Only the first photo of a new listing is sent for detection.
      const detect = !editing && !detectAsked.current;
      if (detect) { detectAsked.current = true; setDetecting(true); }
      try {
        const apple = detect && hasAppleDetection() ? await appleDetect(preview) : null;
        // Never Gemini inside the iPhone app (Apple only); only the website during development falls back to it.
        const askGemini = detect && (!apple || !apple.confident) && (GEMINI_BACKUP || (!hasAppleDetection() && !inJunkApp()));
        const res = await uploadPhoto(preview, askGemini);
        setPhotos((list) => list.map((p) => (p.key === key ? { ...p, path: res.path, url: res.url, uploading: false } : p)));
        if (detect) {
          if (!res.detected && apple && apple.person) setAiNote('Make sure the photo shows just the item');
          else {
            if (apple && !res.detected) guessPhoto.current = preview;
            applyDetection(res.detected || apple);
          }
        }
      } catch (err) {
        setPhotos((list) => list.filter((p) => p.key !== key));
        setError(err.message);
        if (detect) detectAsked.current = false;
      } finally {
        if (detect) setDetecting(false);
      }
    }
  };

  const removePhoto = (key) => setPhotos((list) => list.filter((p) => p.key !== key));

  // What's wrong with the form, or '' when it's ready to post.
  const problem = () => {
    if (photos.some((p) => p.uploading)) return 'Hang on, photos are still uploading.';
    if (multi && named.length < 2) return 'Name at least two things, or remove the extra rows.';
    if (!multi && !form.title.trim()) return 'Give it a name, like "Wood dresser".';
    if (!editing && !spot) return 'Turn on location so people nearby can find it.';
    return '';
  };

  const submit = (e) => {
    e.preventDefault();
    const wrong = problem();
    setError(wrong);
    if (wrong) return;
    if (editing) { save(); return; }
    setPreviewing(true);
    window.scrollTo(0, 0);
  };

  const backToForm = () => {
    setPreviewing(false);
    setError('');
    window.scrollTo(0, 0);
  };

  const save = async () => {
    const wrong = problem();
    setError(wrong);
    if (wrong) return;
    setSaving(true);
    try {
      const fields = {
        ...form,
        title: form.title.trim() || (multi ? bundleTitle(named) : ''),
        category: multi ? (named[0].category || 'other') : form.category || 'other',
        pieces: multi ? named.map((p) => ({ id: p.id, title: p.title.trim(), category: p.category || 'other', box: p.box, photo: p.photo, gone: !!p.gone })) : [],
        photos: photos.map((p) => p.path).filter(Boolean),
        aiDetected: detected,
        labels: photoLabels.current,
      };
      const item = editing ? await updateItem(id, fields) : await createItem({ ...fields, lat: spot.lat, lng: spot.lng });
      if (!editing && guessPhoto.current) {
        const finished = multi ? named : [{ guess: guessRef.current, title: form.title, category: form.category }];
        rememberNames(finished);
        const fixes = namesToTeach(finished);
        if (fixes.length) sendFixes(fixes, guessPhoto.current);
      }
      navigate(`/junk/item/${item.id}`, { replace: true });
    } catch (err) {
      setSaving(false);
      if (err.status === 428) {
        retryAfterTerms.current = () => save();
        setAskTerms(true);
        return;
      }
      setError(err.message);
    }
  };

  if (!loaded) return <main className="jk-page"><div className="jk-topbar"><BackButton /></div></main>;

  const terms = askTerms && (
    <TermsSheet
      onDone={() => {
        setAskTerms(false);
        const retry = retryAfterTerms.current;
        retryAfterTerms.current = null;
        if (retry) retry();
      }}
      onCancel={() => {
        setAskTerms(false);
        if (!retryAfterTerms.current) navigate('/junk', { replace: true });
        retryAfterTerms.current = null;
      }}
    />
  );

  if (previewing) {
    const title = form.title.trim() || (multi ? bundleTitle(named) : '');
    return (
      <>
        <PostPreview
          item={{ ...form, title, pieces: multi ? named : [], photos: photos.filter((p) => p.path), aiDetected: detected }}
          saving={saving}
          error={error}
          onEdit={backToForm}
          onPost={save}
        />
        {terms}
      </>
    );
  }

  return (
    <main className="jk-page jk-post">
      <div className="jk-topbar">
        <BackButton to={editing ? `/junk/item/${id}` : '/junk'} />
        <h1>{editing ? 'Edit listing' : 'Give something away'}</h1>
      </div>

      <form onSubmit={submit} className="jk-form">
        <section>
          <div className="jk-photo-row">
            {photos.map((p, i) => (
              <div key={p.key} className={`jk-thumb${p.uploading ? ' is-uploading' : ''}`}>
                <img src={p.preview} alt={i === 0 ? "Cover" : `Extra shot ${i}`} />
                {i === 0 && <span className="jk-thumb-cover">Cover</span>}
                <button type="button" className="jk-thumb-x" onClick={() => removePhoto(p.key)} aria-label="Remove photo"><IconClose size={14} /></button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" className={`jk-add-photo${photos.length ? '' : ' is-big'}`} onClick={() => fileRef.current?.click()}>
                <IconCamera size={photos.length ? 24 : 34} />
                <span>{photos.length ? 'Add' : 'Snap or pick a photo'}</span>
                {!photos.length && <small>We'll figure out what it is for you</small>}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          {detecting && <p className="jk-ai-status is-working"><IconSparkle size={16} /> Figuring out what this is…</p>}
          {!detecting && aiNote && <p className="jk-ai-status"><IconSparkle size={16} /> {aiNote}. Edit anything below.</p>}
        </section>

        {multi ? (
          <div className="jk-field">
            <span>What's in it</span>
            <ul className="jk-pieces-edit">
              {pieces.map((p, n) => (
                <li key={p.key} className={p.gone ? 'is-gone' : ''}>
                  <PieceThumb photo={p.box ? photos[p.photo] : null} box={p.box} category={p.category} />
                  <input value={p.title} onChange={(e) => setPiece(p.key, { title: e.target.value })} placeholder="Name this thing" maxLength={60} aria-label={`Thing ${n + 1}`} />
                  <select value={p.category || 'other'} onChange={(e) => setPiece(p.key, { category: e.target.value })} aria-label="Category">
                    {CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  {editing && p.id ? (
                    <button type="button" className={`jk-chip jk-chip-small${p.gone ? ' is-on' : ''}`} onClick={() => setPiece(p.key, { gone: !p.gone })}>{p.gone ? 'Taken' : 'Mark taken'}</button>
                  ) : (
                    <button type="button" className="jk-thumb-x jk-piece-x" onClick={() => dropPiece(p.key)} aria-label="Remove"><IconClose size={14} /></button>
                  )}
                </li>
              ))}
            </ul>
            {pieces.length < MAX_PIECES && <button type="button" className="jk-link" onClick={() => setPieces((list) => [...list, newPiece()])}>+ Add another thing</button>}
            <p className="jk-hint">People can claim one thing or take it all. Each one comes off the list when it's picked up.</p>
          </div>
        ) : null}

        <label className="jk-field">
          <span>{multi ? <>Name for the post <em>optional</em></> : 'What is it?'}</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={80}
            placeholder={multi ? (named.length >= 2 ? bundleTitle(named) : 'Garage cleanout') : 'Wood dresser'} />
        </label>
        {!multi && <button type="button" className="jk-link jk-multi-link" onClick={startMulti}>+ Giving away several things? List them in one post</button>}

        {!multi && <div className="jk-field">
          <span>Category</span>
          <div className="jk-choice-row">
            {CATEGORIES.map(([key, label, icon]) => (
              <button type="button" key={key} className={`jk-chip${form.category === key ? ' is-on' : ''}`} onClick={() => set('category', key)}>
                <span aria-hidden="true">{icon}</span> {label}
              </button>
            ))}
          </div>
        </div>}

        <div className="jk-field">
          <span>Condition</span>
          <div className="jk-choice-row">
            {CONDITIONS.map(([key, label]) => (
              <button type="button" key={key} className={`jk-chip${form.condition === key ? ' is-on' : ''}`} onClick={() => set('condition', key)}>{label}</button>
            ))}
          </div>
        </div>

        <label className="jk-field">
          <span>Description <em>optional</em></span>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={1000}
            placeholder="Size, what's wrong with it, anything worth knowing" />
        </label>

        <label className="jk-field">
          <span>Pickup details <em>optional</em></span>
          <textarea value={form.pickup} onChange={(e) => set('pickup', e.target.value)} rows={2} maxLength={300}
            placeholder="On the curb, grab it anytime. Or: message me to set a time." />
        </label>

        <div className="jk-field">
          <span>How does pickup work?</span>
          <div className="jk-seg jk-seg-wide" role="group" aria-label="Pickup style">
            <button type="button" className={form.handoff !== 'meet' ? 'is-on' : ''} onClick={() => set('handoff', 'porch')}>Porch / curb (no contact)</button>
            <button type="button" className={form.handoff === 'meet' ? 'is-on' : ''} onClick={() => set('handoff', 'meet')}>Meet in person</button>
          </div>
          <small className="jk-muted">
            {form.handoff === 'meet' ? 'Safest in a public place in daylight, like a store parking lot.' : 'Safest: leave it out and nobody has to meet.'}
          </small>
        </div>

        <label className="jk-field">
          <span>Exact spot <em>private</em></span>
          <textarea value={form.spot} onChange={(e) => set('spot', e.target.value)} rows={2} maxLength={300}
            placeholder="Street address, which door or side of the house" />
          <small className="jk-muted">Only shown to someone on their way to get it, or someone you've written back to. Everyone else sees the distance.</small>
        </label>

        <label className="jk-toggle">
          <input type="checkbox" checked={form.firstCome} onChange={(e) => set('firstCome', e.target.checked)} />
          <span>
            <strong>First come, first served</strong>
            <small>"I'm on my way" won't hold it for one person. Everyone still sees it, with how many are heading over.</small>
          </span>
        </label>

        {!editing && (
          <div className="jk-location-note">
            <IconPin size={18} />
            <p>
              {spot ? 'Listed at your current spot. Others only see how far away it is, never your address.'
                : locating ? 'Finding your location…' : spotError || 'Location is needed so neighbors can find it.'}
            </p>
            {!spot && !locating && <button type="button" className="jk-link" onClick={refreshSpot}>Try again</button>}
          </div>
        )}

        {error && <p className="jk-error" role="alert">{error}</p>}
        <div className="jk-form-actions">
          <button type="submit" className="jk-btn jk-btn-primary jk-full" disabled={saving || detecting}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Preview your post'}
          </button>
        </div>
      </form>

      {terms}
    </main>
  );
}

