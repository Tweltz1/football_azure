import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useJunk } from './JunkApp';
import { blockUser, deleteItem, getItem, reportItem, updateItem } from './junkApi';
import { categoryIcon, categoryLabel, conditionLabel, distanceLabel, timeAgo } from './device';
import { IconBack, IconBox, IconChat, IconCheck, IconEdit, IconFlag, IconSparkle, IconTrash } from './icons';

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
  const { me, spot, askSignIn } = useJunk();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null); // 'report' | 'confirm-delete'
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    getItem(id, spot).then((it) => { if (live) setItem(it); }).catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
    // The distance only needs the first spot we had.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
          {item.aiDetected && <span className="jk-pill jk-pill-ai"><IconSparkle size={14} /> Auto-detected</span>}
        </div>
        <h1>{item.title}</h1>
        <p className="jk-item-meta">
          {item.km !== undefined && <span>{distanceLabel(item.km)}</span>}
          <span>Posted {timeAgo(item.createdAt)}</span>
          <span>by {item.mine ? 'you' : item.ownerName}</span>
        </p>

        <div className="jk-facts">
          <div><span className="jk-fact-label">Category</span><span>{categoryIcon(item.category)} {categoryLabel(item.category)}</span></div>
          <div><span className="jk-fact-label">Condition</span><span>{conditionLabel(item.condition)}</span></div>
        </div>

        {item.description && <p className="jk-desc">{item.description}</p>}
        {item.pickup && (
          <div className="jk-pickup">
            <span className="jk-fact-label">Pickup</span>
            <p>{item.pickup}</p>
          </div>
        )}
        {item.tags.length > 0 && <p className="jk-taglist">{item.tags.map((t) => <span key={t}>#{t}</span>)}</p>}
        <p className="jk-safety">Meet in daylight, bring a friend for big items, and never send money for free stuff.</p>
        {notice && <p className="jk-notice" role="status">{notice}</p>}
      </section>

      <div className="jk-actionbar">
        {item.mine ? (
          <>
            <Link to={`/junk/edit/${item.id}`} className="jk-btn jk-btn-icon" aria-label="Edit"><IconEdit /></Link>
            {item.status === 'available' && <button type="button" className="jk-btn" disabled={busy} onClick={() => setStatus('pending')}>Pending</button>}
            {item.status !== 'available' && <button type="button" className="jk-btn" disabled={busy} onClick={() => setStatus('available')}>Relist</button>}
            {item.status !== 'gone'
              ? <button type="button" className="jk-btn jk-btn-primary jk-grow" disabled={busy} onClick={() => setStatus('gone')}><IconCheck /> Mark taken</button>
              : <button type="button" className="jk-btn jk-btn-danger jk-grow" disabled={busy} onClick={() => setMenu('confirm-delete')}><IconTrash /> Delete</button>}
          </>
        ) : (
          <button
            type="button"
            className="jk-btn jk-btn-primary jk-grow"
            disabled={item.status === 'gone'}
            onClick={() => (me ? navigate(`/junk/chat/${item.id}/${item.ownerId}`) : askSignIn('Sign in to message the person giving this away.'))}
          >
            <IconChat /> {item.status === 'gone' ? 'Already taken' : 'I want it'}
          </button>
        )}
      </div>

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
      {menu === 'confirm-delete' && (
        <div className="jk-sheet-backdrop" role="presentation" onClick={() => setMenu(null)}>
          <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Delete listing" onClick={(e) => e.stopPropagation()}>
            <h2>Delete this listing?</h2>
            <p className="jk-muted">The photos are deleted too. This can't be undone.</p>
            <button type="button" className="jk-btn jk-btn-danger jk-full" disabled={busy} onClick={remove}>Delete</button>
            <button type="button" className="jk-btn jk-full" onClick={() => setMenu(null)}>Keep it</button>
          </div>
        </div>
      )}
    </main>
  );
}
