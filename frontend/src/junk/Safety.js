import React, { useState } from 'react';
import { agreeToTerms, appealCurbsy, contactCurbsy } from './junkApi';
import { setSharesCrops } from './learning';
import { IconClose, IconPin } from './icons';

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

/**
 * One-time "I agree" before posting or messaging. It also asks, as a separate choice with two equal buttons,
 * whether item pictures may be shared to teach item recognition (the Me tab switch changes it later).
 */
export function TermsSheet({ onDone, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const agree = async (share) => {
    setBusy(true);
    setError('');
    try {
      await agreeToTerms();
      setSharesCrops(share);
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
        <div className="jk-learn-ask">
          <strong>Help Curbsy learn what things are?</strong>
          <p className="jk-muted">When you name an item, Curbsy can send a small picture of just that item so it gets better at
            naming things for everyone. Your full photo and location stay on your phone. You can change this any time
            in the Me tab.</p>
        </div>
        {error && <p className="jk-error">{error}</p>}
        <button type="button" className="jk-btn jk-btn-primary jk-full" disabled={busy} onClick={() => agree(true)}>
          {busy ? 'Saving…' : 'I agree, and help Curbsy learn'}
        </button>
        <button type="button" className="jk-btn jk-full jk-terms-only" disabled={busy} onClick={() => agree(false)}>
          I agree, without sharing pictures
        </button>
        <p className="jk-legal">Read the full <a href="/junk-terms.html">Terms of Use</a> and <a href="/junk-privacy.html">Privacy Policy</a>.</p>
      </div>
    </div>
  );
}

/** "Contact Curbsy": questions, complaints and problem reports go to the person running the app. */
/** appeal: true for "Appeal" (a ban, a strike, or with itemId a hidden listing). */
export function ContactSheet({ onClose, appeal = false, itemId = null, business = false }) {
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
      if (appeal) await appealCurbsy(text.trim(), itemId);
      else await contactCurbsy(business ? `[Advertise or partner] ${text.trim()}` : text.trim());
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
        <h2>{appeal ? 'Appeal' : business ? 'Advertise on Curbsy' : 'Contact Curbsy'}</h2>
        {sent ? (
          <>
            <p className="jk-muted">
              {appeal ? 'Thanks. A person reviews every appeal within 24 hours. If it was a mistake, the warning or ban is lifted.' : 'Thanks, we got it. Problems with listings or people are looked at within 24 hours.'}
            </p>
            <button type="button" className="jk-btn jk-full" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <p className="jk-muted">
              {appeal
                ? 'Think this was a mistake? Tell us what happened. A person reads every appeal.'
                : business ? 'Run a junk hauling, moving, thrift or donation business? Tell us your business name, area, and the best way to reach you.'
                : 'Report a person or a problem, or ask a question. To report a listing, you can also use the flag on its page.'}
            </p>
            <textarea className="jk-input jk-contact-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} placeholder={appeal ? 'What happened?' : 'What\'s going on?'} aria-label="Message" />
            {error && <p className="jk-error">{error}</p>}
            <button type="submit" className="jk-btn jk-btn-primary jk-full" disabled={busy || text.trim().length < 3}>{busy ? 'Sending…' : 'Send'}</button>
          </>
        )}
      </form>
    </div>
  );
}

// ---- Safer pickups ----

const TIPS_KEY = 'junk.safetyTipsSeen';
export const tipsSeen = () => {
  try { return window.localStorage.getItem(TIPS_KEY) === '1'; } catch (error) { return false; }
};
const markTipsSeen = () => {
  try { window.localStorage.setItem(TIPS_KEY, '1'); } catch (error) { /* private mode: shown again next time */ }
};

/** Shown before someone's first "I'm on my way". */
export function SafetyTipsSheet({ handoff, onDone, onCancel }) {
  return (
    <div className="jk-sheet-backdrop" role="presentation" onClick={onCancel}>
      <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Pickup safety" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jk-icon-btn jk-sheet-close" onClick={onCancel} aria-label="Close"><IconClose /></button>
        <h2>Before you head over</h2>
        <ul className="jk-rules">
          {handoff === 'meet'
            ? <li>This one is handed over in person. Meet somewhere public in daylight, like a store parking lot.</li>
            : <li>This is a porch or curb pickup. Grab it from where it's left, and don't go inside anyone's home.</li>}
          <li>Tell a friend where you're going. "Share my trip" sends them the spot and your arrival time.</li>
          <li>Bring someone along for big items.</li>
          <li>Everything on Curbsy is free. Never send money, deposits or codes, and keep chatting in the app.</li>
          <li>If something feels off, leave, then report or block the person.</li>
        </ul>
        <button type="button" className="jk-btn jk-btn-primary jk-full" onClick={() => { markTipsSeen(); onDone(); }}>Got it, I'm on my way</button>
      </div>
    </div>
  );
}

/** The private pickup spot, or where it will show up. */
export function SpotCard({ item }) {
  if (item.spotOk && (item.spot || typeof item.lat === 'number')) {
    const map = typeof item.lat === 'number' ? `https://maps.apple.com/?ll=${item.lat},${item.lng}&q=${encodeURIComponent(item.title)}` : null;
    return (
      <div className="jk-pickup jk-spot">
        <span className="jk-fact-label">Exact spot {item.mine ? '(private)' : '(shared with you)'}</span>
        {item.spot ? <p>{item.spot}</p> : <p className="jk-muted">No exact spot added.</p>}
        {map && !item.mine && <a className="jk-link" href={map} target="_blank" rel="noreferrer"><IconPin size={16} /> Open in Maps</a>}
      </div>
    );
  }
  if (item.hasSpot) {
    return <p className="jk-muted jk-spot-note">The exact spot is shared once you tap "I'm on my way" or the poster messages you back.</p>;
  }
  return null;
}

const PROVIDERS = { apple: 'Apple', google: 'Google', github: 'GitHub' };
const monthYear = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/** Who's giving it away: how long they've been here, how they sign in, and what they've given. */
export function MemberCard({ name, owner }) {
  return (
    <div className="jk-member">
      <div className="jk-avatar jk-avatar-sm" aria-hidden="true">{(name || '?').slice(0, 1).toUpperCase()}</div>
      <div>
        <strong>{name}</strong>
        {owner.verified && <span className="jk-pill jk-pill-verified">✓ Verified neighbor</span>}
        {owner.isNew && !owner.verified && <span className="jk-pill jk-pill-warn">New member</span>}
        <p className="jk-muted">
          {[
            owner.since ? `Joined ${monthYear(owner.since)}` : null,
            owner.provider && PROVIDERS[owner.provider] ? `Signed in with ${PROVIDERS[owner.provider]}` : null,
            `${owner.given} given away`,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

/** "Share my trip": sends a friend where you're going and roughly when you'll get there. */
export async function shareTrip(item, claim) {
  const map = typeof item.lat === 'number' ? ` https://maps.apple.com/?ll=${item.lat},${item.lng}` : '';
  const eta = claim && claim.etaMin ? `, about ${claim.etaMin} min away` : '';
  const text = `I'm picking up "${item.title}" through Curbsy${eta}.${item.spot ? ` Spot: ${item.spot}.` : ''}${map}`;
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (error) {
    if (error && error.name === 'AbortError') return;
  }
  window.location.href = `sms:&body=${encodeURIComponent(text)}`;
}

/** Me tab: a warning after one strike, or the ban notice, each with Appeal. Nothing when in good standing. */
export function StandingNotice({ member, onAppeal }) {
  if (!member) return null;
  if (member.banned) {
    return (
      <div className="jk-standing is-banned" role="status">
        <strong>Your account is paused</strong>
        <p>You can browse, but not post, message or claim, after repeated or serious rule breaks. If we got it wrong, appeal and a person will review it within 24 hours.</p>
        <button type="button" className="jk-btn jk-full" onClick={onAppeal}>Appeal</button>
      </div>
    );
  }
  if (member.strikes > 0) {
    return (
      <div className="jk-standing" role="status">
        <strong>You have 1 warning</strong>
        <p>One of your listings broke the Curbsy rules and was taken down. A second one pauses your account. If this was a mistake, appeal it.</p>
        <button type="button" className="jk-btn jk-full" onClick={onAppeal}>Appeal</button>
      </div>
    );
  }
  return null;
}
