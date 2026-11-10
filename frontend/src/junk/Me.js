import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SignInPrompt, useJunk } from './JunkApp';
import { deleteAccount, deleteSavedSearch, getMember, junkSignOut as signOut, myItems, savedSearches } from './junkApi';
import { ItemCard } from './Browse';
import { IconBox, IconClose, IconPlus } from './icons';
import { ContactSheet, StandingNotice } from './Safety';
import { setSharesCrops, sharesCrops } from './learning';
import { TipSheet } from './Plus';
import { PLUS_PRICE, alertStatus, canBuy, restore, turnOnAlerts } from './store';
import { CATEGORIES } from './device';

const savedLabel = (s) => {
  const cat = s.category && (CATEGORIES.find(([k]) => k === s.category) || [])[1];
  return [s.q && `“${s.q}”`, cat].filter(Boolean).join(' in ') || 'Anything';
};

/** Curbsy Plus status, or the offer. */
function PlusCard() {
  const { plus, askPlus } = useJunk();
  const on = !!(plus && plus.plus);
  return (
    <button type="button" className={`jk-plus-card${on ? ' is-on' : ''}`} onClick={() => askPlus('')}>
      <span className="jk-plus-badge">Curbsy <b>Plus</b></span>
      <strong>{on ? 'You\'re a Plus member' : 'Instant alerts, first look at new stuff, 100-mile search'}</strong>
      <small>{on ? 'Manage your subscription' : `${PLUS_PRICE} a month · cancel anytime`}</small>
    </button>
  );
}

/** Saved searches: new matches since you last looked, and alerts for Plus members. */
function SavedSearches() {
  const { plus, askPlus } = useJunk();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [alerts, setAlerts] = useState('none');
  const [note, setNote] = useState('');
  const on = !!(plus && plus.plus);
  useEffect(() => {
    savedSearches().then(setList).catch(() => setList([]));
    alertStatus().then(setAlerts);
  }, []);
  if (!list || !list.length) return null;
  const open = (s) => {
    const p = new URLSearchParams({ ...(s.q ? { q: s.q } : {}), ...(s.category ? { category: s.category } : {}), saved: s.id });
    navigate(`/junk?${p}`);
  };
  const remove = async (s) => {
    setList((prev) => prev.filter((x) => x.id !== s.id));
    await deleteSavedSearch(s.id).catch(() => {});
  };
  return (
    <>
      <div className="jk-list-head"><h2>Saved searches</h2></div>
      <ul className="jk-saved">
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" className="jk-saved-open" onClick={() => open(s)}>
              <strong>{savedLabel(s)}</strong>
              <small>Within {s.miles} mi{s.newCount > 0 ? '' : ' · nothing new'}</small>
            </button>
            {s.newCount > 0 && <b className="jk-badge jk-saved-count">{s.newCount > 9 ? '9+' : s.newCount} new</b>}
            <button type="button" className="jk-icon-btn" aria-label={`Delete saved search ${savedLabel(s)}`} onClick={() => remove(s)}><IconClose size={16} /></button>
          </li>
        ))}
      </ul>
      {note && <p className="jk-muted">{note}</p>}
      {on && alerts !== 'granted' && alerts !== 'none' && (
        <button type="button" className="jk-link" onClick={async () => { const r = await turnOnAlerts(); setNote(r.ok ? 'Alerts are on.' : r.reason); alertStatus().then(setAlerts); }}>
          Turn on alerts for these
        </button>
      )}
      {!on && (
        <button type="button" className="jk-link" onClick={() => askPlus('Get a notification the moment a match is posted, and save up to 10 searches.')}>
          Get instant alerts with Curbsy Plus
        </button>
      )}
    </>
  );
}

export default function Me() {
  const { me, authLoading, setPlus } = useJunk();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contact, setContact] = useState(false);
  const [appeal, setAppeal] = useState(false);
  const [member, setMember] = useState(null);
  const [shareCrops, setShareCrops] = useState(sharesCrops);
  const [tips, setTips] = useState(false);
  const [business, setBusiness] = useState(false);
  const [restoreNote, setRestoreNote] = useState('');

  useEffect(() => {
    if (!me) return;
    myItems().then(setItems).catch((err) => setError(err.message));
    getMember().then(setMember).catch(() => {});
  }, [me]);

  const removeAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      await signOut();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
      setConfirm(false);
    }
  };

  if (!me) {
    return (
      <main className="jk-page">
        <header className="jk-page-head"><h1>Me</h1></header>
        {!authLoading && <SignInPrompt title="Your stuff" text="Sign in to post items and see what you're giving away." />}
        <p className="jk-legal jk-center"><a href="/junk-terms.html">Terms</a> · <a href="/junk-privacy.html">Privacy</a></p>
      </main>
    );
  }

  const live = (items || []).filter((i) => i.status !== 'gone');
  const gone = (items || []).filter((i) => i.status === 'gone');
  return (
    <main className="jk-page">
      <header className="jk-page-head jk-me-head">
        <div className="jk-avatar" aria-hidden="true">{(me.userDetails || '?').slice(0, 1).toUpperCase()}</div>
        <div>
          <h1>{me.userDetails || 'You'}</h1>
          <p className="jk-muted">{items ? `${live.length} up for grabs · ${gone.length} given away` : ' '}</p>
        </div>
      </header>

      {error && <p className="jk-error">{error}</p>}
      <StandingNotice member={member} onAppeal={() => setAppeal(true)} />
      <PlusCard />
      <SavedSearches />
      <div className="jk-list-head"><h2>Your listings</h2><Link to="/junk/post" className="jk-chip"><IconPlus size={16} /> Post</Link></div>
      {items && items.length === 0 && (
        <div className="jk-empty jk-empty-small">
          <div className="jk-empty-art" aria-hidden="true"><IconBox size={30} /></div>
          <p className="jk-muted">Nothing posted yet. Snap a photo of something you're getting rid of.</p>
        </div>
      )}
      {live.length > 0 && <div className="jk-grid">{live.map((i) => <ItemCard key={i.id} item={i} />)}</div>}
      {gone.length > 0 && (
        <>
          <div className="jk-list-head"><h2>Given away</h2></div>
          <div className="jk-grid jk-grid-faded">{gone.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        </>
      )}

      <label className="jk-toggle jk-learn-toggle">
        <input type="checkbox" checked={shareCrops} onChange={(e) => { setSharesCrops(e.target.checked); setShareCrops(e.target.checked); }} />
        <span>
          <strong>Help improve item recognition</strong>
          <small>When you fix a name Curbsy guessed, also send a small picture of just that item so it learns. Your full photo and location stay on your phone. Off unless you turn it on.</small>
        </span>
      </label>

      <div className="jk-settings">
        <button type="button" className="jk-row-btn" onClick={() => signOut()}>Sign out</button>
        <button type="button" className="jk-row-btn" onClick={() => setTips(true)}>💚 Support Curbsy with a tip</button>
        {canBuy() && (
          <button
            type="button"
            className="jk-row-btn"
            onClick={async () => {
              setRestoreNote('Checking…');
              try {
                const r = await restore();
                if (r) setPlus(r);
                setRestoreNote(r && r.plus ? 'Curbsy Plus is on.' : (r && r.note) || 'Nothing to restore for this Apple ID.');
              } catch (err) { setRestoreNote(err.message); }
            }}
          >
            Restore purchases{restoreNote && <small className="jk-row-note"> · {restoreNote}</small>}
          </button>
        )}
        <button type="button" className="jk-row-btn" onClick={() => setContact(true)}>Contact Curbsy</button>
        <button type="button" className="jk-row-btn" onClick={() => setBusiness(true)}>Advertise your business on Curbsy</button>
        <a className="jk-row-btn" href="/junk-terms.html">Terms of Use</a>
        <a className="jk-row-btn" href="/junk-privacy.html">Privacy Policy</a>
        <button type="button" className="jk-row-btn jk-danger-text" onClick={() => setConfirm(true)}>Delete my account</button>
      </div>

      {contact && <ContactSheet onClose={() => setContact(false)} />}
      {appeal && <ContactSheet appeal onClose={() => setAppeal(false)} />}
      {business && <ContactSheet business onClose={() => setBusiness(false)} />}
      {tips && <TipSheet onClose={() => setTips(false)} />}
      {confirm && (
        <div className="jk-sheet-backdrop" role="presentation" onClick={() => setConfirm(false)}>
          <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Delete account" onClick={(e) => e.stopPropagation()}>
            <h2>Delete your account?</h2>
            <p className="jk-muted">
              Your listings, photos and messages are deleted, and so is your sign-in. This also removes the account from
              Hood League and Hood Games, since they share it. This can't be undone.
            </p>
            <button type="button" className="jk-btn jk-btn-danger jk-full" disabled={deleting} onClick={removeAccount}>
              {deleting ? 'Deleting…' : 'Delete everything'}
            </button>
            <button type="button" className="jk-btn jk-full" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </main>
  );
}
