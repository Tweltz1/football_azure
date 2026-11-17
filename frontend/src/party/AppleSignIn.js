import React from 'react';
import { canSignInWithApple, signInWithApple } from './account';

/**
 * "Sign in with Apple", shown next to every Google button inside the iPhone apps (App Store guideline 4.8
 * asks for it wherever another sign-in is offered). On the website it renders nothing.
 * `before` runs first, e.g. to save the table code so the page comes back to it after the reload.
 */
export default function AppleSignIn({ label = 'Sign in with Apple', className = 'lcp-google', before }) {
  if (!canSignInWithApple()) return null;
  return (
    <button type="button" className={className} onClick={() => { if (before) before(); signInWithApple(); }}>
      <span className="lcp-g"></span> {label}
    </button>
  );
}
