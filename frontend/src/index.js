import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import { AuthProvider } from './AuthContext';
import ErrorBoundary from './ErrorBoundary';
// iPhone app: nearby-phones drafts (does nothing on the website).
import './offline/nearbyDraft';

ReactDOM.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
  document.getElementById('root')
);

// Lets the site open with no internet for a draft saved to this device (see public/sw.js).
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  // When a fixed offline cache takes over, reload once so the page comes from it.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Offline support is unavailable:', error));
  });
}
