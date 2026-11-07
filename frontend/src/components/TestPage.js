import React, { useEffect, useRef, useState } from 'react';

// Sandbox page: currently simulates a repair shop's own progress-update app
// (shop board, check-in, customer view). Sample data only; no real texts are sent.
const DEMO_URL = '/repair-shop-demo.html';

const TestPage = () => {
  const frameRef = useRef(null);
  const [height, setHeight] = useState('100vh');

  // Fill the screen below the site nav.
  useEffect(() => {
    const fit = () => {
      const top = frameRef.current ? frameRef.current.getBoundingClientRect().top + window.scrollY : 0;
      setHeight(`calc(100vh - ${Math.round(top) + 12}px)`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="shop-sim">
      <iframe
        ref={frameRef}
        title="Repair shop app"
        src={DEMO_URL}
        style={{ display: 'block', width: '100%', height, minHeight: 560, border: 0, borderRadius: 12 }}
      />
    </div>
  );
};

export default TestPage;
