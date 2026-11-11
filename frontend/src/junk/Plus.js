import React, { useEffect, useState } from 'react';
import { useJunk } from './JunkApp';
import { getPartners, tapPartner } from './junkApi';
import { PLUS_PRICE, PLUS_PRODUCT, TIP_PRODUCTS, buy, canBuy, canRedeem, loadProducts, manageSubscription, redeemCode, restore, turnOnAlerts } from './store';
import { IconClose } from './icons';

// How Curbsy pays for itself: Curbsy Plus, tips, junk haulers and local sponsors.
// Server side: supabase/functions/_shared/junkPlus.ts.

const PERKS = [
  ['🔔', 'Instant alerts', 'Get a notification the moment something you want is posted. Save up to 10 searches.'],
  ['⏱️', 'First look', 'See new listings 10 minutes before everyone else.'],
  ['🗺️', 'Search up to 100 miles', 'Free accounts search up to 25.'],
  ['✨', 'No sponsor cards', 'Just free stuff in your feed.'],
];

const endDate = (iso) => {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }); } catch (error) { return ''; }
};

/** The Curbsy Plus sheet: what you get, the price, and Apple's required subscription terms. */
export function PlusSheet({ reason, onClose }) {
  const { me, plus, setPlus, askSignIn } = useJunk();
  const [product, setProduct] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let live = true;
    loadProducts([PLUS_PRODUCT]).then((list) => { if (live) setProduct(list[0] || null); });
    return () => { live = false; };
  }, []);

  const price = product ? product.price : PLUS_PRICE;
  const subscribe = async () => {
    if (!me) { onClose(); askSignIn('Sign in to get Curbsy Plus. It stays with your account.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await buy(PLUS_PRODUCT, me.userId);
      if (r.status === 'purchased') {
        if (r.plus) setPlus(r.plus);
        if (r.plus && r.plus.plus) {
          setDone('Welcome to Curbsy Plus!');
          turnOnAlerts().catch(() => {});
        } else {
          setError((r.plus && r.plus.note) || 'Apple finished the purchase but we couldn\'t confirm it yet. Tap Restore purchases in a minute.');
        }
      } else if (r.status === 'pending') {
        setDone('Your purchase is waiting for approval. Plus turns on as soon as it goes through.');
      } else if (r.status === 'failed') {
        setError('The purchase didn\'t go through. You weren\'t charged.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const doRestore = async () => {
    if (!me) { onClose(); askSignIn('Sign in to restore your purchases.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await restore();
      if (r) setPlus(r);
      if (r && r.plus) setDone('Curbsy Plus is back on.');
      else setError((r && r.note) || 'No Curbsy Plus subscription found for this Apple ID.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doRedeem = async () => {
    if (!me) { onClose(); askSignIn('Sign in first so your promo code stays with your account.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await redeemCode();
      if (r) setPlus(r);
      if (r && r.plus) {
        setDone('Welcome to Curbsy Plus!');
        turnOnAlerts().catch(() => {});
      } else if (r && r.note) {
        setError(r.note);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jk-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="jk-sheet jk-plus-sheet" role="dialog" aria-modal="true" aria-label="Curbsy Plus" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jk-icon-btn jk-sheet-close" onClick={onClose} aria-label="Close"><IconClose /></button>
        <p className="jk-plus-badge">Curbsy <b>Plus</b></p>
        <h2>{done || (plus && plus.plus ? 'You\'re a Plus member' : 'Get the good stuff first')}</h2>
        {reason && !done && !(plus && plus.plus) && <p className="jk-muted">{reason}</p>}
        <ul className="jk-perks">
          {PERKS.map(([icon, title, text]) => (
            <li key={title}><span aria-hidden="true">{icon}</span><div><strong>{title}</strong><small>{text}</small></div></li>
          ))}
        </ul>
        {error && <p className="jk-error">{error}</p>}
        {plus && plus.plus ? (
          <>
            <p className="jk-muted jk-center">Paid through {endDate(plus.expiresAt)}. It renews monthly unless you cancel.</p>
            <button type="button" className="jk-btn jk-full" onClick={() => manageSubscription()}>Manage subscription</button>
            <button type="button" className="jk-btn jk-btn-primary jk-full" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <button type="button" className="jk-btn jk-btn-primary jk-full jk-plus-buy" disabled={busy || !canBuy()} onClick={subscribe}>
              {busy ? 'One moment…' : `Subscribe for ${price}/month`}
            </button>
            {!canBuy() && <p className="jk-muted jk-center">Update Curbsy from the App Store to subscribe.</p>}
            <button type="button" className="jk-link jk-center-block" disabled={busy || !canBuy()} onClick={doRestore}>Restore purchases</button>
            {canRedeem() && <button type="button" className="jk-link jk-center-block" disabled={busy} onClick={doRedeem}>Have a promo code?</button>}
          </>
        )}
        <p className="jk-legal">
          Curbsy Plus is {price} a month, charged to your Apple ID. It renews every month unless you cancel at least 24 hours
          before the end of the month, in Settings &gt; your name &gt; Subscriptions. Listing and claiming free stuff stays free for everyone.
          {' '}<a href="/junk-terms.html">Terms of Use</a> · <a href="/junk-privacy.html">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

/** "Support Curbsy": one-time tips. */
export function TipSheet({ onClose }) {
  const { me, setPlus } = useJunk();
  const [products, setProducts] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    let live = true;
    loadProducts(TIP_PRODUCTS).then((list) => {
      if (live) setProducts(TIP_PRODUCTS.map((id) => list.find((p) => p.id === id)).filter(Boolean));
    });
    return () => { live = false; };
  }, []);

  const tip = async (id) => {
    setBusy(id);
    setError('');
    try {
      const r = await buy(id, me.userId);
      if (r.status === 'purchased') { setThanks(true); if (r.plus) setPlus(r.plus); }
      else if (r.status === 'failed') setError('That didn\'t go through. You weren\'t charged.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="jk-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Support Curbsy" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jk-icon-btn jk-sheet-close" onClick={onClose} aria-label="Close"><IconClose /></button>
        <h2>{thanks ? 'Thank you! 💚' : 'Support Curbsy'}</h2>
        <p className="jk-muted">
          {thanks
            ? 'Your tip keeps Curbsy free and keeps good stuff out of the landfill.'
            : 'Curbsy is free and run by one person. A tip helps pay for the servers. It\'s a one-time payment and doesn\'t unlock anything.'}
        </p>
        {error && <p className="jk-error">{error}</p>}
        {!thanks && (
          <div className="jk-tips">
            {!canBuy() && <p className="jk-muted">Update Curbsy from the App Store to leave a tip.</p>}
            {canBuy() && products === null && <p className="jk-muted">Loading…</p>}
            {canBuy() && products && products.length === 0 && <p className="jk-muted">Tips aren't available right now.</p>}
            {(products || []).map((p, i) => (
              <button key={p.id} type="button" className="jk-tip" disabled={!!busy} onClick={() => tip(p.id)}>
                <span aria-hidden="true">{['☕', '🍕', '🎉'][i] || '💚'}</span>
                <strong>{p.title}</strong>
                <b>{busy === p.id ? '…' : p.price}</b>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="jk-btn jk-full" onClick={onClose}>{thanks ? 'Done' : 'Not now'}</button>
      </div>
    </div>
  );
}

/** One sponsor card in the Browse feed (none for Plus members). */
export function SponsorCard({ sponsor }) {
  const href = sponsor.url || (sponsor.phone ? `tel:${sponsor.phone.replace(/[^\d+]/g, '')}` : null);
  const tap = () => { tapPartner(sponsor.id).catch(() => {}); };
  const body = (
    <>
      <span className="jk-sponsor-tag">Sponsored</span>
      <strong>{sponsor.name}</strong>
      {sponsor.blurb && <small>{sponsor.blurb}</small>}
      {href && <span className="jk-sponsor-go">{sponsor.url ? 'Visit' : 'Call'} ›</span>}
    </>
  );
  return href
    ? <a className="jk-card jk-sponsor" href={href} target="_blank" rel="noopener noreferrer" onClick={tap}>{body}</a>
    : <div className="jk-card jk-sponsor">{body}</div>;
}

/** Sponsor for this spot, or null. */
export function useSponsor() {
  const { spot, plus } = useJunk();
  const [sponsor, setSponsor] = useState(null);
  const isPlus = !!(plus && plus.plus);
  useEffect(() => {
    if (!spot || isPlus) { setSponsor(null); return undefined; }
    let live = true;
    getPartners('sponsor', spot).then((list) => { if (live) setSponsor((list && list[0]) || null); }).catch(() => {});
    return () => { live = false; };
  }, [spot, isPlus]);
  return sponsor;
}

const mapsSearch = (what, item) => `https://maps.apple.com/?q=${encodeURIComponent(what)}${item.lat !== undefined ? `&sll=${item.lat},${item.lng}` : ''}`;

/** On the poster's own listing: "Nobody coming? Get it hauled away" with local haulers. */
export function HaulerCard({ item }) {
  const [haulers, setHaulers] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || item.lat === undefined) return undefined;
    let live = true;
    getPartners('hauler', { lat: item.lat, lng: item.lng }).then((list) => { if (live) setHaulers(list || []); }).catch(() => { if (live) setHaulers([]); });
    return () => { live = false; };
  }, [open, item.lat, item.lng]);
  const tap = (p) => { tapPartner(p.id, item.id).catch(() => {}); };

  if (!open) {
    return (
      <button type="button" className="jk-hauler-open" onClick={() => setOpen(true)}>
        <span aria-hidden="true">🚚</span> Nobody coming for it? <b>Get it hauled away</b>
      </button>
    );
  }
  return (
    <div className="jk-hauler">
      <strong>Get it hauled away</strong>
      <small>Local junk haulers and donation pickups can take it for you, usually for a fee.</small>
      {haulers === null && <p className="jk-muted">Looking nearby…</p>}
      {(haulers || []).map((h) => (
        <div key={h.id} className="jk-hauler-row">
          <div><b>{h.name}</b>{h.blurb && <small>{h.blurb}</small>}</div>
          <div className="jk-hauler-actions">
            {h.phone && <a className="jk-chip" href={`tel:${h.phone.replace(/[^\d+]/g, '')}`} onClick={() => tap(h)}>Call</a>}
            {h.url && <a className="jk-chip" href={h.url} target="_blank" rel="noopener noreferrer" onClick={() => tap(h)}>Website</a>}
          </div>
        </div>
      ))}
      {haulers && haulers.length === 0 && (
        <div className="jk-hauler-actions">
          <a className="jk-chip" href={mapsSearch('junk removal', item)} target="_blank" rel="noopener noreferrer">Find junk removal</a>
          <a className="jk-chip" href={mapsSearch('donation pickup', item)} target="_blank" rel="noopener noreferrer">Find donation pickup</a>
        </div>
      )}
    </div>
  );
}
