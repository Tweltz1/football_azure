import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { signIn, useAuth } from '../AuthContext';
import { lastSpot, locate } from './device';
import { inbox as fetchInbox } from './junkApi';
import { IconChat, IconClose, IconGrid, IconPlus, IconUser } from './icons';
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
          <button type="button" className="jk-provider" onClick={() => signIn('github')}>Continue with GitHub</button>
        </div>
        <p className="jk-legal">
          By continuing you agree to the <a href="/junk-terms.html">Terms</a> and <a href="/junk-privacy.html">Privacy Policy</a>.
          No hateful, illegal or unsafe items.
        </p>
      </div>
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

  const value = useMemo(() => ({
    me, authLoading: loading, spot, spotError, locating, refreshSpot, radiusMi, setRadiusMi,
    askSignIn: (reason) => setSignInReason(reason || ''), refreshUnread,
  }), [me, loading, spot, spotError, locating, refreshSpot, radiusMi, refreshUnread]);

  return (
    <JunkContext.Provider value={value}>
      <div className="jk-app">
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
        <TabBar unread={unread} />
        {signInReason !== null && !me && <SignInSheet reason={signInReason} onClose={() => setSignInReason(null)} />}
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
