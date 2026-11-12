import React, { useState } from 'react';
import { deleteAccount } from '../junk/junkApi';
import { supabase } from '../supabaseClient';
import './DeleteAccount.css';

// "Delete account" for Hood League and Hood Games (App Store guideline 5.1.1(v): an app that lets people
// make an account must let them delete it in the app). The sign-in is shared with Curbsy, so this uses the
// same server route Curbsy's "Delete my account" does: it removes their Curbsy posts and photos and then the
// sign-in itself, for every app.
export default function DeleteAccount({ className = '', onDeleted }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      if (onDeleted) onDeleted();
      else window.location.assign('/');
    } catch (err) {
      setError(err?.message || 'Could not delete the account. Try again.');
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={`delete-account-link ${className}`} onClick={() => setOpen(true)}>
        Delete account
      </button>
    );
  }
  return (
    <div className={`delete-account-box ${className}`} role="group" aria-label="Delete account">
      <strong>Delete your account?</strong>
      <p>
        Your sign-in is deleted, along with your saved profile, characters and scores. Hood League, Hood Games and
        Curbsy share one sign-in, so it's removed from all of them. This can't be undone.
      </p>
      {error && <p className="delete-account-error" role="alert">{error}</p>}
      <div className="delete-account-actions">
        <button type="button" className="delete-account-confirm" disabled={busy} onClick={remove}>
          {busy ? 'Deleting…' : 'Delete everything'}
        </button>
        <button type="button" className="delete-account-cancel" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
