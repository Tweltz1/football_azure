import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { signIn, useAuth } from '../AuthContext';
import { distanceLabel, lastSpot, locate } from './device';
import { inbox as fetchInbox, myClaim } from './junkApi';
import { refreshTripToken, startTrip, stopTrip } from './trip';
import { IconBack, IconCar, IconChat, IconClose, IconGrid, IconPlus, IconUser } from './icons';
import Browse from './Browse';
import ItemPage from './ItemPage';
import PostItem from './PostItem';
import { Chat, Inbox } from './Messages';
import Me from './Me';
import './junk.css';

// The Junk App: free stuff people near you are giving away. Lives at /junk on the website and is what
// the Junk App iPhone app (ios-junk-app/) opens on.

const JunkContext = createContext(null);
export const useJunk = () => useContext(JunkContext);

const RADIUS_KEY = 'junk.radiusMi';
const readRadius = () => {
  try { return Number(window.localStorage.getItem(RADIUS_KEY)) || 10; } catch (error) { return 10; }
};

function SignInSheet({ reason, onClose }) {
  return (
    <div className="jk-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Sign in" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jk-icon-btn jk-sheet-close" onClick={onClose} aria-label="Close"><IconClose /></button>
        <div className="jk-sheet-mark" aria-hidden="true">C</div>
        <h2>Sign in to Curbsy</h2>
        <p className="jk-muted">{reason || 'Post your stuff, message neighbors, and keep track of what you\'re giving away.'}</p>
        <div className="jk-signin-buttons">
          <button type="button" className="jk-provider jk-provider-apple" onClick={() => signIn('apple')}>
            <span aria-hidden="true"></span> Continue with Apple
          </button>
          <button type="button" className="jk-provider" onClick={() => signIn('google')}>
            <span className="jk-g" aria-hidden="true">G</span> Continue with Google
          </button>
        </div>
        <p className="jk-legal">
          By continuing you agree to the <a href="/junk-terms.html">Terms</a> and <a href="/junk-privacy.html">Privacy Policy</a>.
          No hateful, illegal or unsafe items.
        </p>
      </div>
    </div>
  );
}

// The Terms and Privacy pages are plain web pages (they're also the App Store's links). Opening one used to
// replace the whole app with no way back, so inside the app they open in this full-screen panel instead,
// with a Done button that always returns to where you were.
const LEGAL_PAGE = /^\/junk-(terms|privacy)\.html$/;

function LegalPanel({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="jk-legal-panel" role="dialog" aria-modal="true" aria-label="Terms and Privacy">
      <div className="jk-legal-bar">
        <button type="button" className="jk-legal-done" onClick={onClose}><IconBack size={20} /> Back to Curbsy</button>
      </div>
      <iframe className="jk-legal-frame" src={src} title="Terms and Privacy" />
    </div>
  );
}

function TabBar({ unread }) {
  const { pathname } = useLocation();
  // Full-screen pages (an item, a chat, the post form) hide the tabs.
  if (/^\/junk\/(item|chat|post|edit)\b/.test(pathname)) return null;
  const tab = ({ isActive }) => `jk-tab${isActive ? ' is-active' : ''}`;
  return (
    <nav className="jk-tabbar" aria-label="Curbsy">
      <NavLink to="/junk" end className={tab}><IconGrid /><span>Browse</span></NavLink>
      <NavLink to="/junk/post" className="jk-tab jk-tab-post" aria-label="Post an item"><span className="jk-tab-post-dot"><IconPlus size={26} /></span></NavLink>
      <NavLink to="/junk/inbox" className={tab}>
        <span className="jk-tab-icon"><IconChat />{unread > 0 && <b className="jk-badge">{unread > 9 ? '9+' : unread}</b>}</span>
        <span>Messages</span>
      </NavLink>
      <NavLink to="/junk/me" className={tab}><IconUser /><span>Me</span></NavLink>
    </nav>
  );
}

/** "On your way to …" strip above the tabs while a claim is open, or why it ended. */
function TripBanner({ trip, onDismiss }) {
  const { pathname } = useLocation();
  if (!trip || !trip.claim) return null;
  const { claim, item } = trip;
  // Full-screen pages (an item, a chat, the post form) have their own bar at the bottom; the item page shows the trip itself.
  if (/^\/junk\/(item|chat|post|edit)\b/.test(pathname)) return null;
  if (!claim.open) {
    if (claim.state === 'picked_up' || claim.state === 'cancelled') return null;
    return (
      <div className="jk-trip-banner is-ended" role="status">
        <div className="jk-trip-text">
          <strong>Your claim was released</strong>
          <span>{item ? `${item.title}: ` : ''}{claim.reason || 'It\'s up for grabs again.'}</span>
        </div>
        <button type="button" className="jk-icon-btn" onClick={onDismiss} aria-label="Dismiss"><IconClose /></button>
      </div>
    );
  }
  return (
    <Link to={`/junk/item/${claim.itemId}`} className="jk-trip-banner" role="status">
      <span className="jk-trip-dot" aria-hidden="true"><IconCar size={20} /></span>
      <div className="jk-trip-text">
        <strong>{claim.state === 'arrived' ? 'You\'re there! Tap Got it once it\'s loaded' : `On your way to ${item ? item.title : 'your pickup'}`}</strong>
        {claim.state === 'active' && <span>{distanceLabel(claim.km)} · about {claim.etaMin} min</span>}
      </div>
    </Link>
  );
}

function Shell() {
  const { user, loading } = useAuth();
  // Hood League's offline/guest fallbacks aren't real sign-ins; the Junk App needs a live account.
  const me = user && !user.offline && user.userId ? user : null;
  const [spot, setSpot] = useState(lastSpot);
  const [spotError, setSpotError] = useState('');
  const [locating, setLocating] = useState(false);
  const [radiusMi, setRadiusMiState] = useState(readRadius);
  const [signInReason, setSignInReason] = useState(null);
  const [unread, setUnread] = useState(0);
  const [trip, setTrip] = useState(null); // { claim, item } for my latest "I'm on my way"
  const [dismissedTrip, setDismissedTrip] = useState(null);
  const [legal, setLegal] = useState(null); // Terms or Privacy page open in the panel
  const closeLegal = useCallback(() => setLegal(null), []);

  // Any Terms or Privacy link in the app (sign-in, Me, the Terms check, Curbsy Plus…) opens the panel.
  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      let url;
      try { url = new URL(a.getAttribute('href'), window.location.href); } catch (error) { return; }
      if (url.origin !== window.location.origin || !LEGAL_PAGE.test(url.pathname)) return;
      e.preventDefault();
      setLegal(url.pathname + url.hash);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const refreshSpot = useCallback(async () => {
    setLocating(true);
    setSpotError('');
    try {
      setSpot(await locate());
    } catch (error) {
      setSpotError(error.message);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => { refreshSpot(); }, [refreshSpot]);

  // The site's dark page background would show when iOS bounces past the top or bottom,
  // and the strip behind the clock, so both match the Junk App (see body.jk-body in junk.css).
  useEffect(() => {
    document.body.classList.add('jk-body');
    document.title = 'Curbsy';
    return () => document.body.classList.remove('jk-body');
  }, []);

  const setRadiusMi = (mi) => {
    setRadiusMiState(mi);
    try { window.localStorage.setItem(RADIUS_KEY, String(mi)); } catch (error) { /* ignore */ }
  };

  const refreshUnread = useCallback(async () => {
    if (!me) { setUnread(0); return; }
    try {
      const list = await fetchInbox();
      setUnread(list.reduce((n, t) => n + t.unread, 0));
    } catch (error) { /* keep the old count */ }
  }, [me]);

  useEffect(() => {
    refreshUnread();
    const t = window.setInterval(refreshUnread, 30000);
    return () => window.clearInterval(t);
  }, [refreshUnread]);

  const refreshTrip = useCallback(async () => {
    if (!me) { setTrip(null); return; }
    try {
      const t = await myClaim();
      setTrip(t && t.claim ? t : null);
    } catch (error) { /* keep what we had */ }
  }, [me]);

  useEffect(() => { refreshTrip(); }, [refreshTrip]);

  // While a claim is open: keep the position going to the server and check on it every 20 seconds.
  const tripOpen = !!(trip && trip.claim && trip.claim.open);
  useEffect(() => {
    if (!tripOpen) { stopTrip(); return undefined; }
    startTrip((res) => {
      if (res && res.claim) setTrip((prev) => (prev ? { ...prev, claim: res.claim } : prev));
    }).catch(() => {});
    const t = window.setInterval(() => { refreshTrip(); refreshTripToken(); }, 20000);
    const onShow = () => { if (document.visibilityState === 'visible') { refreshTrip(); refreshTripToken(); } };
    document.addEventListener('visibilitychange', onShow);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [tripOpen, refreshTrip]);

  const value = useMemo(() => ({
    me, authLoading: loading, spot, spotError, locating, refreshSpot, radiusMi, setRadiusMi,
    askSignIn: (reason) => setSignInReason(reason || ''), refreshUnread, trip, setTrip, refreshTrip,
  }), [me, loading, spot, spotError, locating, refreshSpot, radiusMi, refreshUnread, trip, refreshTrip]);

  const showTrip = trip && trip.claim && dismissedTrip !== trip.claim.id ? trip : null;

  return (
    <JunkContext.Provider value={value}>
      <div className={`jk-app${showTrip ? ' has-trip' : ''}`}>
        <Routes>
          <Route path="/junk" element={<Browse />} />
          <Route path="/junk/item/:id" element={<ItemPage />} />
          <Route path="/junk/post" element={<PostItem />} />
          <Route path="/junk/edit/:id" element={<PostItem />} />
          <Route path="/junk/inbox" element={<Inbox />} />
          <Route path="/junk/chat/:itemId/:otherId" element={<Chat />} />
          <Route path="/junk/me" element={<Me />} />
          <Route path="*" element={<Browse />} />
        </Routes>
        <TripBanner trip={showTrip} onDismiss={() => setDismissedTrip(trip.claim.id)} />
        <TabBar unread={unread} />
        {signInReason !== null && !me && <SignInSheet reason={signInReason} onClose={() => setSignInReason(null)} />}
        {legal && <LegalPanel src={legal} onClose={closeLegal} />}
      </div>
    </JunkContext.Provider>
  );
}

export default function JunkApp() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

/** Shown on pages that need an account when nobody is signed in. */
export function SignInPrompt({ title, text }) {
  const { askSignIn } = useJunk();
  return (
    <div className="jk-empty">
      <div className="jk-empty-art" aria-hidden="true"><IconUser size={34} /></div>
      <h2>{title}</h2>
      <p className="jk-muted">{text}</p>
      <button type="button" className="jk-btn jk-btn-primary" onClick={() => askSignIn(text)}>Sign in</button>
    </div>
  );
}
