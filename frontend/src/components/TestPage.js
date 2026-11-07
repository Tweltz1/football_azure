import React from 'react';
import '../App.css';

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
      <p>Nothing is being tested right now.</p>
    </section>
  </div>
);

export default TestPage;
