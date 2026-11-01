import { useEffect, useState } from 'react';

/** Shows a long list a page at a time; the page resets when resetKey changes (new filter, search, sort). */
export const useShowMore = (items, step, resetKey) => {
  const [count, setCount] = useState(step);
  useEffect(() => {
    setCount(step);
  }, [resetKey, step]);
  return {
    shown: items.slice(0, count),
    hidden: Math.max(0, items.length - count),
    showMore: () => setCount((current) => current + step),
  };
};

export const ShowMoreButton = ({ hidden, step, onClick }) => (hidden > 0 ? (
  <button type="button" className="show-more-button" onClick={onClick}>
    Show {Math.min(step, hidden)} more <span>({hidden} left)</span>
  </button>
) : null);
