import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useJunk } from './JunkApp';
import {
  blockUser, cancelClaim, claimItem, deleteItem, finishClaim, getItem, releaseClaim, reportItem, updateItem,
} from './junkApi';
import { categoryIcon, categoryLabel, conditionLabel, distanceLabel, locate, timeAgo } from './device';
import PieceThumb from './PieceThumb';
import { ContactSheet, MemberCard, SafetyTipsSheet, SpotCard, shareTrip, tipsSeen } from './Safety';
import { IconBack, IconBox, IconCar, IconChat, IconCheck, IconEdit, IconFlag, IconSparkle, IconTrash } from './icons';

const TREND = { closer: 'getting closer', steady: 'not much closer yet', away: 'heading away' };
/** Close enough to the item to tap "Got it" (the server agrees at 0.6 km). */
const NEAR_KM = 0.6;

/** What's going on with an "I'm on my way" claim, for whoever is looking. */
function TripCard({ claim, onRelease, busy, item }) {
  if (!claim) return null;
  if (claim.mine && !claim.open) {
    if (claim.state === 'picked_up' || claim.state === 'cancelled') return null;
    return (
      <div className="jk-trip-card is-ended" role="status">
        <strong>Your claim was released</strong>
        <span>{claim.reason || 'It\'s up for grabs again.'}</span>
      </div>
    );
  }
  if (!claim.open) return null;
  if (claim.mine) {
    return (
      <div className="jk-trip-card is-mine" role="status">
        <span className="jk-trip-dot" aria-hidden="true"><IconCar size={20} /></span>
        {claim.state === 'arrived' ? (
          <><strong>You made it!</strong><span>Tap Got it once it's in your car.</span></>
        ) : (
          <>
            <strong>You're on your way</strong>
            <span>{distanceLabel(claim.km)} · about {claim.etaMin} min · {TREND[claim.trend] || 'tracking'}</span>
            <small>Keep location on for Curbsy. If you stop heading here, the claim is released so someone else can grab it.</small>
            {item && <button type="button" className="jk-link jk-share-trip" onClick={() => shareTrip(item, claim)}>Share my trip with a friend</button>}
          </>
        )}
      </div>
    );
  }
  if (claim.forMyItem) {
    return (
      <div className="jk-trip-card" role="status">
        <span className="jk-trip-dot" aria-hidden="true"><IconCar size={20} /></span>
        {claim.state === 'arrived'
          ? <><strong>{claim.claimerName} is there now</strong><span>Mark it taken once it's gone.</span></>
          : <><strong>{claim.claimerName} is on the way</strong><span>{distanceLabel(claim.km)} · about {claim.etaMin} min · {TREND[claim.trend] || 'tracking'}</span></>}
        <button type="button" className="jk-link-btn" disabled={busy} onClick={onRelease}>Cancel their claim</button>
      </div>
    );
  }
  return (
    <div className="jk-trip-card" role="status">
      <span className="jk-trip-dot" aria-hidden="true"><IconCar size={20} /></span>
      <strong>{claim.state === 'arrived' ? 'Someone is picking it up now' : `Someone's on the way, about ${claim.etaMin} min out`}</strong>
      <span>If they don't make it, it goes back up for grabs.</span>
    </div>
  );
}

/** On a shared listing (first come, first served, or several things): everyone heading over, for the poster. */
function ClaimersCard({ claimers, pieces, onRelease, busy }) {
  if (!claimers || !claimers.length) return null;
  const names = (ids) => (ids && ids.length && pieces.length ? pieces.filter((p) => ids.includes(p.id)).map((p) => p.title).join(', ') : '');
  return (
    <div className="jk-trip-card jk-claimers" role="status">
      <span className="jk-trip-dot" aria-hidden="true"><IconCar size={20} /></span>
      <strong>{claimers.length === 1 ? '1 person is on the way' : `${claimers.length} people are on the way`}</strong>
      <ul>
        {claimers.map((c) => (
          <li key={c.id}>
            <span>
              <b>{c.claimerName}</b>{names(c.pieceIds) ? ` for ${names(c.pieceIds)}` : ''}
              <small>{c.state === 'arrived' ? 'There now' : `${distanceLabel(c.km)} · about ${c.etaMin} min · ${TREND[c.trend] || 'tracking'}`}</small>
            </span>
            <button type="button" className="jk-link-btn" disabled={busy} onClick={() => onRelease(c.id)}>Cancel</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The things in a multi-item post, with what's taken and what someone is coming for. */
function PieceList({ item, myIds, pick, onPick, onToggleTaken, busy }) {
  return (
    <ul className="jk-pieces">
      {item.pieces.map((p) => {
        const mine = myIds.has(p.id);
        const free = !p.gone && (item.firstCome || !p.held || mine);
        const state = p.gone ? 'Taken' : mine ? 'You\'re coming for this' : p.held ? (item.firstCome ? 'Someone\'s heading over' : 'Someone\'s on the way') : '';
        return (
          <li key={p.id} className={p.gone ? 'is-gone' : p.held && !item.firstCome && !mine ? 'is-held' : ''}>
            <PieceThumb url={p.box ? item.photos[p.photo] || item.photos[0] : null} box={p.box} category={p.category} />
            <span className="jk-piece-text">
              <b>{p.title}</b>
              <small>{categoryIcon(p.category)} {categoryLabel(p.category)}{state ? ` · ${state}` : ''}</small>
            </span>
            {onToggleTaken && (
              <button type="button" className={`jk-chip jk-chip-small${p.gone ? ' is-on' : ''}`} disabled={busy} onClick={() => onToggleTaken(p)}>
                {p.gone ? 'Taken' : 'Mark taken'}
              </button>
            )}
            {onPick && free && !mine && (
              <input type="checkbox" className="jk-piece-pick" checked={pick.has(p.id)} onChange={() => onPick(p.id)} aria-label={`Pick ${p.title}`} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

const REPORT_REASONS = ['Not free / asking for money', 'Spam or scam', 'Offensive or unsafe', 'Not allowed (weapons, drugs, animals…)', 'Already gone'];

export function BackButton({ to = '/junk' }) {
  const navigate = useNavigate();
  const back = () => {
    if (window.history.length > 1 && window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(to);
  };
  return <button type="button" className="jk-icon-btn jk-back" onClick={back} aria-label="Back"><IconBack /></button>;
}

export default function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me, spot, askSignIn, trip, setTrip } = useJunk();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null); // 'report' | 'confirm-delete' | 'claim'
  const [notice, setNotice] = useState('');
  const [pick, setPick] = useState(() => new Set()); // things picked on a multi-item post

  useEffect(() => {
    let live = true;
    getItem(id, spot).then((it) => { if (live) setItem(it); }).catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
    // The distance only needs the first spot we had.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // My own trip to this item (kept live by the app shell), else whatever claim the item came with.
  const myTrip = item && trip && trip.claim && trip.claim.itemId === item.id ? trip.claim : null;
  const claim = myTrip || (item && item.claim);
  const claimOpen = !!(claim && claim.open);
  // Several people can be on the way: a first come, first served listing, or a post of several things.
  const pieces = (item && item.pieces) || [];
  const multiItem = pieces.length > 0;
  const shared = !!(item && (item.firstCome || multiItem));
  const othersOnTheWay = item ? Math.max(0, (item.onTheWay || 0) - (claimOpen && claim.mine ? 1 : 0)) : 0;
  const myIds = new Set(claimOpen && claim.mine ? (claim.pieceIds && claim.pieceIds.length ? claim.pieceIds : pieces.map((p) => p.id)) : []);
  const freePieces = pieces.filter((p) => !p.gone && (item.firstCome || !p.held) && !myIds.has(p.id));
  const reload = () => getItem(id, spot).then(setItem).catch(() => {});

  // The poster (and anyone looking) sees the trip move along.
  const watching = !!(item && ((item.claim && item.claim.open && !myTrip) || item.onTheWay > 0));
  useEffect(() => {
    if (!watching) return undefined;
    const t = window.setInterval(() => { getItem(id, spot).then(setItem).catch(() => {}); }, 20000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, id]);

  // which: on a multi-item post, the ids picked (leave out to take everything that's left).
  // The first time, safety tips come before the trip starts.
  const [tipsFor, setTipsFor] = useState(null);
  const [appealing, setAppealing] = useState(false);
  const startClaim = async (which) => {
    if (!tipsSeen()) { setMenu(null); setTipsFor({ which }); return; }
    setMenu(null);
    setBusy(true);
    setNotice('');
    try {
      const here = await locate();
      const res = await claimItem(item.id, here, which);
      setItem({ ...item, claim: res.claim });
      setTrip({ claim: res.claim, item });
      setPick(new Set());
      setNotice('Claimed! We let the poster know you\'re coming. Drive safe.');
      reload();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelTrip = async () => {
    setBusy(true);
    try {
      const res = await cancelClaim();
      setTrip(res.claim ? { claim: res.claim, item } : null);
      setItem({ ...item, claim: null });
      setNotice('Trip cancelled. It\'s up for grabs again.');
      reload();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const gotIt = async () => {
    setBusy(true);
    try {
      const res = await finishClaim();
      setTrip({ claim: res.claim, item });
      if (shared) {
        setItem({ ...item, claim: null });
        setNotice(multiItem ? 'Enjoy! Those are marked as taken.' : 'Enjoy!');
        reload();
      } else {
        setItem({ ...item, status: 'gone', claim: null });
        setNotice('Enjoy! It\'s marked as taken.');
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const release = async (claimId) => {
    setBusy(true);
    try {
      setItem(await releaseClaim(item.id, typeof claimId === 'string' ? claimId : undefined));
      setNotice('Released. It\'s up for grabs again.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status) => {
    setBusy(true);
    try {
      setItem(await updateItem(item.id, { status }));
      setNotice(status === 'gone' ? 'Marked as taken. It\'s off the map.' : status === 'pending' ? 'Marked as pending pickup.' : 'Back up for grabs.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  // The poster marks one thing in a multi-item post taken (or back up).
  const toggleTaken = async (piece) => {
    setBusy(true);
    try {
      const next = await updateItem(item.id, { pieces: pieces.map((p) => ({ ...p, gone: p.id === piece.id ? !p.gone : p.gone })) });
      setItem(next);
      setNotice(next.status === 'gone' ? 'Everything\'s taken. It\'s off the map.' : piece.gone ? `${piece.title} is back up for grabs.` : `${piece.title} marked taken.`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const togglePick = (pid) => setPick((s) => {
    const next = new Set(s);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    return next;
  });

  const remove = async () => {
    setBusy(true);
    try {
      await deleteItem(item.id);
      navigate('/junk/me', { replace: true });
    } catch (err) {
      setNotice(err.message);
      setBusy(false);
    }
  };

  const report = async (reason) => {
    setMenu(null);
    try {
      await reportItem(item.id, reason);
      setNotice('Thanks. We\'ll take a look. Listings with several reports are hidden automatically.');
    } catch (err) {
      setNotice(err.message);
    }
  };

  const block = async () => {
    setMenu(null);
    try {
      await blockUser(item.ownerId);
      navigate('/junk', { replace: true });
    } catch (err) {
      setNotice(err.message);
    }
  };

  if (error) {
    return (
      <main className="jk-page">
        <div className="jk-topbar"><BackButton /></div>
        <div className="jk-empty"><div className="jk-empty-art" aria-hidden="true"><IconBox size={34} /></div><h2>Gone already</h2><p className="jk-muted">{error}</p></div>
      </main>
    );
  }
  if (!item) {
    return (
      <main className="jk-page jk-item">
        <div className="jk-gallery jk-skeleton" />
        <div className="jk-item-body"><div className="jk-skeleton-line" /><div className="jk-skeleton-line short" /></div>
      </main>
    );
  }

  const photos = item.photos.length ? item.photos : [null];
  return (
    <main className="jk-page jk-item">
      <div className="jk-gallery">
        <div className="jk-gallery-track" onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {photos.map((src, i) => (
            <div className="jk-gallery-slide" key={src || i}>
              {src ? <img src={src} alt={i === 0 ? item.title : ''} /> : <div className="jk-card-nophoto"><IconBox size={48} /></div>}
            </div>
          ))}
        </div>
        {photos.length > 1 && (
          <div className="jk-dots" aria-hidden="true">{photos.map((_, i) => <span key={i} className={i === photo ? 'is-on' : ''} />)}</div>
        )}
        <div className="jk-gallery-bar">
          <BackButton />
          {!item.mine && (
            <button type="button" className="jk-icon-btn" onClick={() => (me ? setMenu('report') : askSignIn('Sign in to report a listing.'))} aria-label="Report or block">
              <IconFlag />
            </button>
          )}
        </div>
      </div>

      <section className="jk-item-body">
        <div className="jk-item-tags">
          <span className="jk-free-pill">FREE</span>
          {item.status === 'pending' && <span className="jk-pill jk-pill-warn">Pending pickup</span>}
          {item.status === 'gone' && <span className="jk-pill">Taken</span>}
          {multiItem && <span className="jk-pill">{pieces.filter((p) => !p.gone).length} of {pieces.length} left</span>}
          {item.firstCome && <span className="jk-pill jk-pill-fcfs">First come, first served</span>}
          {shared && othersOnTheWay > 0 && <span className="jk-pill jk-pill-warn">{othersOnTheWay} on the way</span>}
          {item.aiDetected && <span className="jk-pill jk-pill-ai"><IconSparkle size={14} /> Auto-detected</span>}
          <span className="jk-pill">{item.handoff === 'meet' ? 'Meet in person' : 'Porch pickup (no contact)'}</span>
        </div>
        {item.mine && item.status === 'hidden' && (
          <div className="jk-standing" role="status">
            <strong>Hidden after reports</strong>
            <p>Neighbors reported this listing, so it's hidden while a person reviews it. If it follows the rules, ask for a review and we'll put it back up.</p>
            <button type="button" className="jk-btn jk-full" onClick={() => setAppealing(true)}>Ask for a review</button>
          </div>
        )}
        <h1>{item.title}</h1>
        <p className="jk-item-meta">
          {item.km !== undefined && <span>{distanceLabel(item.km)}</span>}
          <span>Posted {timeAgo(item.createdAt)}</span>
          <span>by {item.mine ? 'you' : item.ownerName}</span>
        </p>

        <div className="jk-facts">
          {!multiItem && <div><span className="jk-fact-label">Category</span><span>{categoryIcon(item.category)} {categoryLabel(item.category)}</span></div>}
          <div><span className="jk-fact-label">Condition</span><span>{conditionLabel(item.condition)}</span></div>
        </div>

        {multiItem && (
          <div className="jk-pickup">
            <span className="jk-fact-label">What's in it</span>
            <PieceList item={item} myIds={myIds} pick={pick} busy={busy}
              onPick={!item.mine && item.status === 'available' && !claimOpen ? togglePick : null}
              onToggleTaken={item.mine && item.status !== 'hidden' ? toggleTaken : null} />
          </div>
        )}

        {item.mine && shared
          ? <ClaimersCard claimers={item.claimers} pieces={pieces} busy={busy} onRelease={release} />
          : <TripCard claim={claim} busy={busy} onRelease={release} item={item} />}
        {!item.mine && shared && othersOnTheWay > 0 && !(claimOpen && claim.mine) && (
          <p className="jk-muted jk-fcfs-note">
            {othersOnTheWay === 1 ? '1 person is' : `${othersOnTheWay} people are`} heading over{item.firstCome ? '. First come, first served, so it may go before you get there.' : ' for some of this.'}
          </p>
        )}

        {item.description && <p className="jk-desc">{item.description}</p>}
        {item.pickup && (
          <div className="jk-pickup">
            <span className="jk-fact-label">Pickup</span>
            <p>{item.pickup}</p>
          </div>
        )}
        <SpotCard item={item} />
        {!item.mine && item.owner && <MemberCard name={item.ownerName} owner={item.owner} />}
        {item.tags.length > 0 && <p className="jk-taglist">{item.tags.map((t) => <span key={t}>#{t}</span>)}</p>}
        <p className="jk-safety">
          {item.handoff === 'meet' ? 'Meet in a public place in daylight, like a store parking lot. ' : ''}
          Bring a friend for big items, tell someone where you're going, and never send money for free stuff.
        </p>
        {notice && <p className="jk-notice" role="status">{notice}</p>}
      </section>

      <div className="jk-actionbar">
        {item.mine ? (
          <>
            <Link to={`/junk/edit/${item.id}`} className="jk-btn jk-btn-icon" aria-label="Edit"><IconEdit /></Link>
            {item.status !== 'gone' && (
              <button type="button" className="jk-btn jk-btn-icon" aria-label="Delete listing" disabled={busy} onClick={() => setMenu('confirm-delete')}><IconTrash /></button>
            )}
            {item.status === 'available' && <button type="button" className="jk-btn" disabled={busy} onClick={() => setStatus('pending')}>Pending</button>}
            {item.status !== 'available' && <button type="button" className="jk-btn" disabled={busy} onClick={() => setStatus('available')}>Relist</button>}
            {item.status !== 'gone'
              ? <button type="button" className="jk-btn jk-btn-primary jk-grow" disabled={busy} onClick={() => setStatus('gone')}><IconCheck /> Mark taken</button>
              : <button type="button" className="jk-btn jk-btn-danger jk-grow" disabled={busy} onClick={() => setMenu('confirm-delete')}><IconTrash /> Delete</button>}
          </>
        ) : (
          <>
            <button
              type="button"
              className="jk-btn jk-btn-icon"
              aria-label="Message the poster"
              disabled={item.status === 'gone'}
              onClick={() => (me ? navigate(`/junk/chat/${item.id}/${item.ownerId}`) : askSignIn('Sign in to message the person giving this away.'))}
            >
              <IconChat />
            </button>
            {claimOpen && claim.mine ? (
              <>
                <button type="button" className="jk-btn" disabled={busy} onClick={cancelTrip}>Cancel trip</button>
                <button
                  type="button"
                  className="jk-btn jk-btn-primary jk-grow"
                  disabled={busy || (claim.state !== 'arrived' && !(claim.km <= NEAR_KM))}
                  onClick={gotIt}
                >
                  <IconCheck /> Got it
                </button>
              </>
            ) : (
              <button
                type="button"
                className="jk-btn jk-btn-primary jk-grow"
                disabled={busy || item.status !== 'available' || (shared ? multiItem && !freePieces.length : claimOpen)}
                onClick={() => (me ? setMenu('claim') : askSignIn('Sign in to claim it and let the poster know you\'re coming.'))}
              >
                <IconCar /> {item.status === 'gone' ? 'Already taken' : item.status === 'pending' ? 'On hold'
                  : multiItem ? (!freePieces.length ? 'All spoken for' : pick.size ? `I'm coming for ${pick.size}` : 'I\'m on my way')
                    : !shared && claimOpen ? 'Someone\'s on the way' : 'I\'m on my way'}
              </button>
            )}
          </>
        )}
      </div>

      {appealing && <ContactSheet appeal itemId={item.id} onClose={() => setAppealing(false)} />}
      {tipsFor && (
        <SafetyTipsSheet
          handoff={item.handoff}
          onDone={() => { const { which } = tipsFor; setTipsFor(null); startClaim(which); }}
          onCancel={() => setTipsFor(null)}
        />
      )}
      {menu === 'report' && (
        <div className="jk-sheet-backdrop" role="presentation" onClick={() => setMenu(null)}>
          <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Report" onClick={(e) => e.stopPropagation()}>
            <h2>What's wrong?</h2>
            <div className="jk-sheet-list">
              {REPORT_REASONS.map((r) => <button type="button" key={r} onClick={() => report(r)}>{r}</button>)}
              <button type="button" className="jk-danger-text" onClick={block}>Block {item.ownerName} (hide all their posts and messages)</button>
            </div>
            <button type="button" className="jk-btn jk-full" onClick={() => setMenu(null)}>Cancel</button>
          </div>
        </div>
      )}
      {menu === 'claim' && (
        <div className="jk-sheet-backdrop" role="presentation" onClick={() => setMenu(null)}>
          <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="I'm on my way" onClick={(e) => e.stopPropagation()}>
            <h2>Heading over now?</h2>
            {multiItem && (
              <PieceList item={item} myIds={myIds} pick={pick} busy={busy} onPick={togglePick} onToggleTaken={null} />
            )}
            <p className="jk-muted">
              {item.firstCome
                ? <>This one is first come, first served: others can head over too, so it may go before you get there. We'll tell {item.ownerName} you're coming.</>
                : <>We'll mark {multiItem ? 'what you pick' : 'it'} as spoken for and tell {item.ownerName} you're coming.</>} Curbsy checks your location during the trip:
              if you stop heading this way, turn around, or location goes off, the claim is released so someone else can grab it.
            </p>
            <p className="jk-muted">{item.ownerName} only sees how far away you are, never where you are.</p>
            {multiItem ? (
              <>
                <button type="button" className="jk-btn jk-btn-primary jk-full" disabled={busy || !pick.size} onClick={() => startClaim([...pick])}>
                  <IconCar /> {pick.size ? `Coming for ${pick.size === 1 ? pieces.find((p) => pick.has(p.id))?.title || '1 thing' : `${pick.size} things`}` : 'Tick what you want above'}
                </button>
                <button type="button" className="jk-btn jk-full" disabled={busy || !freePieces.length} onClick={() => startClaim()}>
                  Take it all ({freePieces.length})
                </button>
              </>
            ) : (
              <button type="button" className="jk-btn jk-btn-primary jk-full" disabled={busy} onClick={() => startClaim()}><IconCar /> I'm on my way</button>
            )}
            <button type="button" className="jk-btn jk-full" onClick={() => setMenu(null)}>Not yet</button>
          </div>
        </div>
      )}
      {menu === 'confirm-delete' && (
        <div className="jk-sheet-backdrop" role="presentation" onClick={() => setMenu(null)}>
          <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Delete listing" onClick={(e) => e.stopPropagation()}>
            <h2>Delete this listing?</h2>
            <p className="jk-muted">The photos are deleted too. This can't be undone.</p>
            {claimOpen && claim.forMyItem && (
              <p className="jk-muted">{claim.claimerName} is on the way. We'll let them know it's no longer available.</p>
            )}
            {shared && item.claimers && item.claimers.length > 0 && (
              <p className="jk-muted">{item.claimers.length === 1 ? `${item.claimers[0].claimerName} is` : `${item.claimers.length} people are`} on the way. We'll let them know it's no longer available.</p>
            )}
            <button type="button" className="jk-btn jk-btn-danger jk-full" disabled={busy} onClick={remove}>Delete</button>
            <button type="button" className="jk-btn jk-full" onClick={() => setMenu(null)}>Keep it</button>
          </div>
        </div>
      )}
    </main>
  );
}
