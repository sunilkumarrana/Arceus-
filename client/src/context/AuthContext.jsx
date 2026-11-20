import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { setAuthTokenProvider } from '../api/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [idToken, setIdToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          setIdToken(token);
        } catch (err) {
          console.error('Failed to get ID token:', err);
          setIdToken(null);
        }
      } else {
        setIdToken(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setAuthTokenProvider(async () => {
      if (auth.currentUser) {
        const freshToken = await auth.currentUser.getIdToken();
        setIdToken(freshToken);
        return freshToken;
      }
      return idToken;
    });
  }, [idToken]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      if (result.user) {
        const token = await result.user.getIdToken();
        setIdToken(token);
      }
      return result.user;
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      setAuthError(err?.message || 'Sign-in failed. Please try again.');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
    setIdToken(null);
    sessionStorage.removeItem('cachedRecommendations');
    sessionStorage.removeItem('cachedRecommendationsPage');
    sessionStorage.removeItem('hasSeenLoading');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        authLoading,
        authError,
        isAuthenticated: Boolean(user),
        signInWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
