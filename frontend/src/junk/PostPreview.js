import React, { useState } from 'react';
import { categoryIcon, categoryLabel, conditionLabel } from './device';
import PieceThumb from './PieceThumb';
import { IconBack, IconBox, IconCheck, IconEdit, IconSparkle } from './icons';

/**
 * The listing the way neighbors will see it, shown before a new post goes live (Tyler, 2026-11-10).
 * Built from what's in the form, so nothing is saved until "Post it" is tapped.
 * `item` has the form's fields plus `photos` (the form's photo objects) and `pieces` (named things only).
 */
export default function PostPreview({ item, saving, error, onEdit, onPost }) {
  const [photo, setPhoto] = useState(0);
  const multi = item.pieces.length > 0;
  const photos = item.photos.length ? item.photos : [null];
  const cover = item.photos[0];

  return (
    <main className="jk-page jk-item jk-preview">
      <div className="jk-gallery">
        <div className="jk-gallery-track" onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {photos.map((p, i) => (
            <div className="jk-gallery-slide" key={p ? p.key : i}>
              {p ? <img src={p.preview || p.url} alt={i === 0 ? item.title : ''} /> : <div className="jk-card-nophoto"><IconBox size={48} /></div>}
            </div>
          ))}
        </div>
        {photos.length > 1 && (
          <div className="jk-dots" aria-hidden="true">{photos.map((_, i) => <span key={i} className={i === photo ? 'is-on' : ''} />)}</div>
        )}
        <div className="jk-gallery-bar">
          <button type="button" className="jk-icon-btn jk-back" onClick={onEdit} aria-label="Back to editing"><IconBack /></button>
          <span className="jk-preview-flag">Preview</span>
        </div>
      </div>

      <section className="jk-item-body">
        <p className="jk-preview-note">This is how neighbors will see your post. Nothing is shared until you tap Post.</p>

        <div className="jk-preview-card-wrap">
          <span className="jk-fact-label">In the list</span>
          <div className="jk-card jk-preview-card" aria-hidden="true">
            <div className="jk-card-photo">
              {cover ? <img src={cover.preview || cover.url} alt="" /> : <div className="jk-card-nophoto"><IconBox size={32} /></div>}
              <span className="jk-free-tag">FREE</span>
              {multi && <span className="jk-count-tag">{item.pieces.length} things</span>}
            </div>
            <div className="jk-card-body">
              <h3>{item.title}</h3>
              <p className="jk-card-meta"><span>Right nearby</span><span>just now</span>{item.firstCome && <span>First come</span>}</p>
            </div>
          </div>
        </div>

        <div className="jk-item-tags">
          <span className="jk-free-pill">FREE</span>
          {multi && <span className="jk-pill">{item.pieces.length} of {item.pieces.length} left</span>}
          {item.firstCome && <span className="jk-pill jk-pill-fcfs">First come, first served</span>}
          {item.aiDetected && <span className="jk-pill jk-pill-ai"><IconSparkle size={14} /> Auto-detected</span>}
          <span className="jk-pill">{item.handoff === 'meet' ? 'Meet in person' : 'Porch pickup (no contact)'}</span>
        </div>
        <h1>{item.title}</h1>
        <p className="jk-item-meta">
          <span>How far away it is</span>
          <span>Posted just now</span>
          <span>by you</span>
        </p>

        <div className="jk-facts">
          {!multi && <div><span className="jk-fact-label">Category</span><span>{categoryIcon(item.category)} {categoryLabel(item.category)}</span></div>}
          <div><span className="jk-fact-label">Condition</span><span>{conditionLabel(item.condition)}</span></div>
        </div>

        {multi && (
          <div className="jk-pickup">
            <span className="jk-fact-label">What's in it</span>
            <ul className="jk-pieces">
              {item.pieces.map((p) => (
                <li key={p.key}>
                  <PieceThumb photo={p.box ? item.photos[p.photo] || cover : null} box={p.box} category={p.category} />
                  <span className="jk-piece-text">
                    <b>{p.title}</b>
                    <small>{categoryIcon(p.category)} {categoryLabel(p.category)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.description && <p className="jk-desc">{item.description}</p>}
        {item.pickup && (
          <div className="jk-pickup">
            <span className="jk-fact-label">Pickup</span>
            <p>{item.pickup}</p>
          </div>
        )}
        {item.spot.trim()
          ? <p className="jk-muted jk-spot-note">Your exact spot stays hidden. Neighbors see it only after they tap "I'm on my way" or you message them back.</p>
          : <p className="jk-muted jk-spot-note">No exact spot added. Neighbors will see how far away it is and can message you.</p>}
        <p className="jk-safety">
          {item.handoff === 'meet' ? 'Meet in a public place in daylight, like a store parking lot. ' : ''}
          Bring a friend for big items, tell someone where you're going, and never send money for free stuff.
        </p>
        {error && <p className="jk-error" role="alert">{error}</p>}
      </section>

      <div className="jk-actionbar">
        <button type="button" className="jk-btn" disabled={saving} onClick={onEdit}><IconEdit /> Edit</button>
        <button type="button" className="jk-btn jk-btn-primary jk-grow" disabled={saving} onClick={onPost}>
          <IconCheck /> {saving ? 'Posting…' : multi ? `Post ${item.pieces.length} things` : 'Post it'}
        </button>
      </div>
    </main>
  );
}
