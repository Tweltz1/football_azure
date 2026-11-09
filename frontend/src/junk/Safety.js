import React, { useState } from 'react';
import { agreeToTerms, contactCurbsy } from './junkApi';
import { IconClose } from './icons';

// Curbsy's free safety checks on the phone, plus the Terms and Contact sheets (App Store guideline 1.2).
// The server checks every listing's words too (supabase/functions/_shared/junkSafety.ts).

const plugin = () => (typeof window !== 'undefined' && window.Capacitor?.Plugins?.PhotoSafety) || null;

/** Above this the photo is refused as explicit (on-device NSFW model, 0 = fine, 1 = explicit). */
export const NSFW_LIMIT = 0.8;
// Apple Vision labels that mean the photo shows something Curbsy doesn't allow.
const BLOCKED_LABELS = [
  [/\b(gun|guns|handgun|rifle|pistol|firearm|revolver|shotgun|ammunition|bullet|weapon|weapons|grenade|sword|knife_switchblade)\b/, 'Weapons can\'t be listed on Curbsy.'],
  [/\b(cannabis|marijuana|bong|syringe|pill|pills|cigarette|cigar|vape|tobacco)\b/, 'Drugs, medicine and tobacco can\'t be listed on Curbsy.'],
  [/\b(nudity|nude|lingerie_sexy|sexual)\b/, 'This photo can\'t be posted.'],
];

/**
 * Checks a photo on the phone before it's uploaded. Returns { ok: true } or { ok: false, reason }.
 * Outside the iPhone app (or on an old build without the check) it always says ok; the words, reports and
 * daily review still apply there.
 */
export async function checkPhoto(jpegDataUrl) {
  const PhotoSafety = plugin();
  if (!PhotoSafety) return { ok: true };
  try {
    const res = await PhotoSafety.check({ image: jpegDataUrl });
    if (res && typeof res.nsfw === 'number' && res.nsfw >= NSFW_LIMIT) {
      return { ok: false, reason: 'This photo looks like it might be explicit, so it can\'t be posted. Try a photo of just the item.' };
    }
    for (const { label, confidence } of (res && res.labels) || []) {
      if (confidence < 0.5) continue;
      const hit = BLOCKED_LABELS.find(([re]) => re.test(String(label).toLowerCase()));
      if (hit) return { ok: false, reason: `${hit[1]} If we got this wrong, try another photo.` };
    }
    return { ok: true, labels: (res && res.labels) || [] };
  } catch (error) {
    return { ok: true };
  }
}

/** One-time "I agree" before posting or messaging. */
export function TermsSheet({ onDone, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const agree = async () => {
    setBusy(true);
    setError('');
    try {
      await agreeToTerms();
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="jk-sheet-backdrop" role="presentation" onClick={onCancel}>
      <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Curbsy rules" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jk-icon-btn jk-sheet-close" onClick={onCancel} aria-label="Close"><IconClose /></button>
        <h2>Curbsy rules</h2>
        <p className="jk-muted">Listings are public, so before you post or message, please agree to keep it safe:</p>
        <ul className="jk-rules">
          <li>Only free stuff. No weapons, drugs, alcohol, tobacco, medicine, adult items, recalled or hazardous goods, or animals.</li>
          <li>No hateful, sexual, violent or abusive posts or messages. There's zero tolerance.</li>
          <li>Report anything that breaks the rules. Reported listings are reviewed within 24 hours, and people who break the rules are removed.</li>
        </ul>
        {error && <p className="jk-error">{error}</p>}
        <button type="button" className="jk-btn jk-btn-primary jk-full" disabled={busy} onClick={agree}>
          {busy ? 'Saving…' : 'I agree'}
        </button>
        <p className="jk-legal">Read the full <a href="/junk-terms.html">Terms of Use</a>.</p>
      </div>
    </div>
  );
}

/** "Contact Curbsy": questions, complaints and problem reports go to the person running the app. */
export function ContactSheet({ onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const send = async (e) => {
    e.preventDefault();
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    setError('');
    try {
      await contactCurbsy(text.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="jk-sheet-backdrop" role="presentation" onClick={onClose}>
      <form className="jk-sheet" role="dialog" aria-modal="true" aria-label="Contact Curbsy" onClick={(e) => e.stopPropagation()} onSubmit={send}>
        <button type="button" className="jk-icon-btn jk-sheet-close" onClick={onClose} aria-label="Close"><IconClose /></button>
        <h2>Contact Curbsy</h2>
        {sent ? (
          <>
            <p className="jk-muted">Thanks, we got it. Problems with listings or people are looked at within 24 hours.</p>
            <button type="button" className="jk-btn jk-full" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <p className="jk-muted">Report a person or a problem, or ask a question. To report a listing, you can also use the flag on its page.</p>
            <textarea className="jk-input jk-contact-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} placeholder="What's going on?" aria-label="Message" />
            {error && <p className="jk-error">{error}</p>}
            <button type="submit" className="jk-btn jk-btn-primary jk-full" disabled={busy || text.trim().length < 3}>{busy ? 'Sending…' : 'Send'}</button>
          </>
        )}
      </form>
    </div>
  );
}
