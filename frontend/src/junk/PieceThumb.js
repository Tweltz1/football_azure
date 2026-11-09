import React, { useState } from 'react';
import { categoryIcon } from './device';

/**
 * One thing's part of the photo (the box the phone found it in), zoomed to fill a square. Without a box it
 * shows the thing's category icon instead of the whole photo.
 */
export default function PieceThumb({ photo, box, url, category }) {
  const src = url || (photo && (photo.preview || photo.url));
  const [size, setSize] = useState(null); // the photo's own width and height, once loaded
  if (!src || !box) return <span className="jk-piece-thumb is-empty" aria-hidden="true">{category ? categoryIcon(category) : null}</span>;
  let style = { visibility: 'hidden' };
  if (size) {
    const { w: W, h: H } = size;
    // A square around the thing, a little bigger than it, in photo pixels.
    const side = Math.max(box.w * W, box.h * H, 8) * 1.12;
    const cx = (box.x + box.w / 2) * W, cy = (box.y + box.h / 2) * H;
    style = {
      width: `${(W / side) * 100}%`,
      height: `${(H / side) * 100}%`,
      left: `${(-(cx - side / 2) / side) * 100}%`,
      top: `${(-(cy - side / 2) / side) * 100}%`,
    };
  }
  return (
    <span className="jk-piece-thumb is-crop" aria-hidden="true">
      <img src={src} alt="" style={style} onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
    </span>
  );
}
