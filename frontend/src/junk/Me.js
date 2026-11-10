import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SignInPrompt, useJunk } from './JunkApp';
import { deleteAccount, getMember, junkSignOut as signOut, myItems } from './junkApi';
import { ItemCard } from './Browse';
import { IconBox, IconPlus } from './icons';
import { ContactSheet, StandingNotice } from './Safety';
import { setSharesCrops, sharesCrops } from './learning';

export default function Me() {
  const { me, authLoading } = useJunk();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contact, setContact] = useState(false);
  const [appeal, setAppeal] = useState(false);
  const [member, setMember] = useState(null);
  const [shareCrops, setShareCrops] = useState(sharesCrops);

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
        <button type="button" className="jk-row-btn" onClick={() => setContact(true)}>Contact Curbsy</button>
        <a className="jk-row-btn" href="/junk-terms.html">Terms of Use</a>
        <a className="jk-row-btn" href="/junk-privacy.html">Privacy Policy</a>
        <button type="button" className="jk-row-btn jk-danger-text" onClick={() => setConfirm(true)}>Delete my account</button>
      </div>

      {contact && <ContactSheet onClose={() => setContact(false)} />}
      {appeal && <ContactSheet appeal onClose={() => setAppeal(false)} />}
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
