import React from 'react';

/** The part of the photo showing one thing (from the phone's object detector), or nothing. */
export default function PieceThumb({ photo, box, url }) {
  const src = url || (photo && (photo.preview || photo.url));
  if (!src) return <span className="jk-piece-thumb is-empty" aria-hidden="true" />;
  if (!box) return <span className="jk-piece-thumb" style={{ backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden="true" />;
  // Zoom the photo so the thing fills the square, centered on it (keeps the photo's shape).
  const side = Math.min(1, Math.max(box.w, box.h, 0.08));
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const style = {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${100 / side}% auto`,
    backgroundPosition: `${side >= 1 ? 50 : Math.min(100, Math.max(0, ((cx - side / 2) / (1 - side)) * 100))}% ${Math.round(cy * 100)}%`,
  };
  return <span className="jk-piece-thumb" style={style} aria-hidden="true" />;
}
