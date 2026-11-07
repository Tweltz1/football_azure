import React from 'react';
import '../App.css';

const DEMO_URL = '/repair-shop-demo.html';

// Sandbox page for trying out new features before they get a real home in the app.
const TestPage = () => (
  <div className="page-shell test-page">
    <section className="page-hero">
      <p className="page-kicker">Sandbox</p>
      <h1>Test</h1>
      <p>A scratch space for trying out new features. Nothing here affects leagues or drafts.</p>
    </section>

    <section className="panel-card" style={{ marginTop: 24 }}>
      <p className="section-kicker">Work in progress</p>
      <h2 style={{ marginTop: 4 }}>Repair shop progress updates</h2>
      <p>
        A clickable prototype of an app that lets car repair shops text customers as their car
        moves through check-in, diagnosis, approval, parts, repair and pickup. It uses sample
        data and sends no real texts.{' '}
        <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Open full screen</a>
      </p>
      <iframe
        title="Repair shop progress updates prototype"
        src={DEMO_URL}
        loading="lazy"
        style={{
          width: '100%',
          height: '85vh',
          minHeight: 640,
          border: '1px solid rgba(127, 127, 127, 0.35)',
          borderRadius: 12,
          marginTop: 12,
          background: '#fff',
        }}
      />
    </section>
  </div>
);

export default TestPage;
