'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase/client';

interface AuthContextType {
  user: User | null;
  sessionUser: { email: string; name: string; picture?: string } | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionUser, setSessionUser] = useState<{ email: string; name: string; picture?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const { data } = await res.json();
          setSessionUser(data);
        }
      } catch {
        // No session
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });

    checkSession();
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      // Send token to server for verification and session creation
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Sign out from Firebase if server rejects
        await firebaseSignOut(auth);
        setError(data.message || 'Đăng nhập thất bại');
        setSessionUser(null);
        return;
      }

      setSessionUser(data.data);
      setError(null);
    } catch (err) {
      console.error('Sign in error:', err);
      setError('Đăng nhập thất bại. Vui lòng thử lại.');
      setSessionUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      await firebaseSignOut(auth);
      setSessionUser(null);
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, sessionUser, loading, error, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

