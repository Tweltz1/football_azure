import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useJunk } from './JunkApp';
import { searchItems } from './junkApi';
import { CATEGORIES, MILES, distanceLabel, milesToKm, timeAgo } from './device';
import { IconBox, IconClose, IconPin, IconSearch } from './icons';

export function ItemCard({ item }) {
  return (
    <Link to={`/junk/item/${item.id}`} className={`jk-card${item.status === 'pending' ? ' is-pending' : ''}`}>
      <div className="jk-card-photo">
        {item.photos[0]
          ? <img src={item.photos[0]} alt="" loading="lazy" />
          : <div className="jk-card-nophoto"><IconBox size={32} /></div>}
        <span className="jk-free-tag">FREE</span>
        {item.status === 'pending' && <span className="jk-status-tag">Pending pickup</span>}
      </div>
      <div className="jk-card-body">
        <h3>{item.title}</h3>
        <p className="jk-card-meta">
          {item.km !== undefined && <span>{distanceLabel(item.km)}</span>}
          <span>{timeAgo(item.createdAt)}</span>
        </p>
      </div>
    </Link>
  );
}

const SKELETONS = Array.from({ length: 6 }, (_, i) => i);

export default function Browse() {
  const { spot, spotError, locating, refreshSpot, radiusMi, setRadiusMi } = useJunk();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('near');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [showRadius, setShowRadius] = useState(false);
  const inputRef = useRef(null);

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!spot) return undefined;
    let live = true;
    setError('');
    setItems((prev) => (prev && prev.length ? prev : null));
    searchItems({ lat: spot.lat, lng: spot.lng, km: milesToKm(radiusMi).toFixed(1), q: query, category, sort })
      .then((list) => { if (live) setItems(list); })
      .catch((err) => { if (live) { setError(err.message); setItems([]); } });
    return () => { live = false; };
  }, [spot, radiusMi, query, category, sort]);

  const searching = Boolean(query || category);

  return (
    <main className="jk-page jk-browse">
      <header className="jk-browse-head">
        <div className="jk-brand-row">
          <div>
            <p className="jk-kicker">Free stuff near you</p>
            <h1 className="jk-brand">Junk<span>App</span></h1>
          </div>
          <button type="button" className="jk-chip jk-chip-place" onClick={() => setShowRadius((v) => !v)} aria-expanded={showRadius}>
            <IconPin size={16} /> {radiusMi} mi
          </button>
        </div>
        <form className="jk-search" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); inputRef.current?.blur(); }} role="search">
          <IconSearch size={20} />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search free stuff, like “dresser”"
            enterKeyHint="search"
            aria-label="Search free stuff"
          />
          {q && <button type="button" className="jk-search-clear" onClick={() => setQ('')} aria-label="Clear search"><IconClose size={16} /></button>}
        </form>
        {showRadius && (
          <div className="jk-radius" role="group" aria-label="How far to look">
            <p>Show items within</p>
            <div className="jk-radius-options">
              {MILES.map((mi) => (
                <button key={mi} type="button" className={`jk-chip${mi === radiusMi ? ' is-on' : ''}`} onClick={() => { setRadiusMi(mi); setShowRadius(false); }}>
                  {mi} mi
                </button>
              ))}
            </div>
            <button type="button" className="jk-link" onClick={() => { refreshSpot(); setShowRadius(false); }}>Update my location</button>
          </div>
        )}
        <div className="jk-cats" role="list">
          <button type="button" role="listitem" className={`jk-cat${!category ? ' is-on' : ''}`} onClick={() => setCategory('')}>
            <span aria-hidden="true">✨</span>All
          </button>
          {CATEGORIES.map(([key, label, icon]) => (
            <button key={key} type="button" role="listitem" className={`jk-cat${category === key ? ' is-on' : ''}`} onClick={() => setCategory(category === key ? '' : key)}>
              <span aria-hidden="true">{icon}</span>{label}
            </button>
          ))}
        </div>
      </header>

      {!spot && (
        <div className="jk-empty">
          <div className="jk-empty-art" aria-hidden="true"><IconPin size={34} /></div>
          <h2>{locating ? 'Finding you…' : 'Where are you?'}</h2>
          <p className="jk-muted">{spotError || 'Junk App uses your location to show free stuff close by. Your exact spot is never shown to anyone.'}</p>
          {!locating && <button type="button" className="jk-btn jk-btn-primary" onClick={refreshSpot}>Use my location</button>}
        </div>
      )}

      {spot && (
        <>
          <div className="jk-list-head">
            <h2>{searching ? `${items ? items.length : '…'} ${items && items.length === 1 ? 'match' : 'matches'}` : 'Up for grabs'}</h2>
            <div className="jk-seg" role="group" aria-label="Sort">
              <button type="button" className={sort === 'near' ? 'is-on' : ''} onClick={() => setSort('near')}>Closest</button>
              <button type="button" className={sort === 'new' ? 'is-on' : ''} onClick={() => setSort('new')}>Newest</button>
            </div>
          </div>
          {error && <p className="jk-error">{error}</p>}
          {items === null && (
            <div className="jk-grid">{SKELETONS.map((i) => <div key={i} className="jk-card jk-skeleton" />)}</div>
          )}
          {items && items.length > 0 && (
            <div className="jk-grid">{items.map((item) => <ItemCard key={item.id} item={item} />)}</div>
          )}
          {items && items.length === 0 && !error && (
            <div className="jk-empty">
              <div className="jk-empty-art" aria-hidden="true"><IconBox size={34} /></div>
              <h2>{searching ? 'Nothing like that yet' : 'Nothing nearby yet'}</h2>
              <p className="jk-muted">
                {searching
                  ? `No free ${query || 'items'} within ${radiusMi} miles. Try a bigger radius or check back soon.`
                  : 'Be the first! Post something you\'re getting rid of and a neighbor can grab it.'}
              </p>
              {radiusMi < 50
                ? <button type="button" className="jk-btn" onClick={() => setRadiusMi(MILES.find((m) => m > radiusMi) || 50)}>Look further</button>
                : <Link to="/junk/post" className="jk-btn jk-btn-primary">Post an item</Link>}
            </div>
          )}
        </>
      )}
    </main>
  );
}
