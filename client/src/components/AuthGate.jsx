import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { unlockSharedAudioContext } from '../utils/audioUnlock';

export function AuthStatusButton({ dark = false }) {
  const { user, authLoading, signInWithGoogle, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  if (authLoading) return null;

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // handled in AuthContext
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <div className="flex items-center space-x-3">
        <span
          className={`hidden sm:inline text-xs font-mono truncate max-w-[160px] ${
            dark ? 'text-[var(--text-muted-on-dark)]' : 'text-[var(--text-muted)]'
          }`}
          title={user.email || user.displayName || ''}
        >
          {user.displayName || user.email}
        </span>
        <button
          onClick={logout}
          className={`text-xs font-bold font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-colors ${
            dark
              ? 'border-white/20 text-[var(--text-on-dark)] hover:border-[var(--gold)] hover:text-[var(--gold)]'
              : 'border-black/15 text-[var(--text)] hover:bg-black/5'
          }`}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      disabled={busy}
      className={`text-xs font-bold font-mono uppercase tracking-wider px-3.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
        dark
          ? 'border-[var(--gold)]/60 text-[var(--gold)] hover:bg-[var(--gold)] hover:text-black'
          : 'border-black/15 bg-white text-[var(--text)] hover:border-[var(--gold)]'
      }`}
    >
      {busy ? 'Signing in...' : 'Sign In'}
    </button>
  );
}

export function AuthGate({ children, title = 'Sign in to continue', subtitle = 'Sign in with your Google account to browse personalized government schemes and eligibility insights.' }) {
  const { isAuthenticated, authLoading, authError, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="text-[var(--gold)] font-mono tracking-widest text-xs font-bold uppercase animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return children;
  }

  const handleGoogleSignIn = async () => {
    unlockSharedAudioContext();
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // handled in AuthContext
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-[var(--surface)] border border-black/10 rounded-2xl p-8 shadow-sm text-center">
        <div className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--gold)] mb-3">
          Govt Compass
        </div>
        <h2 className="text-2xl font-display font-bold text-[var(--text)] mb-3">
          {title}
        </h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-6">
          {subtitle}
        </p>

        <button
          onClick={handleGoogleSignIn}
          disabled={signingIn}
          className="w-full flex items-center justify-center gap-3 bg-[var(--text)] text-[var(--bg)] px-6 py-3 rounded-xl font-bold font-mono text-xs tracking-wider uppercase hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.24-.92 2.29-1.96 3v2.49h3.17c1.86-1.71 2.93-4.23 2.93-7.21 0-.4-.04-.8-.23-1.2z"
            />
            <path
              fill="currentColor"
              d="M12.17 22c2.65 0 4.88-.88 6.5-2.39l-3.17-2.49c-.88.59-2 .94-3.33.94-2.56 0-4.73-1.73-5.51-4.05H3.39v2.56C5 19.79 8.33 22 12.17 22z"
            />
            <path
              fill="currentColor"
              d="M6.66 14.01c-.2-.59-.31-1.22-.31-1.87s.11-1.28.31-1.87V7.71H3.39C2.72 9.04 2.34 10.55 2.34 12.14s.38 3.1 1.05 4.43l3.27-2.56z"
            />
            <path
              fill="currentColor"
              d="M12.17 6.22c1.44 0 2.74.5 3.76 1.47l2.82-2.82C17.04 3.27 14.82 2.28 12.17 2.28c-3.84 0-7.17 2.21-8.78 5.43l3.27 2.56c.78-2.32 2.95-4.05 5.51-4.05z"
            />
          </svg>
          <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
        </button>

        {authError && (
          <p className="mt-4 text-xs text-[var(--tape)] font-medium">{authError}</p>
        )}
      </div>
    </div>
  );
}
