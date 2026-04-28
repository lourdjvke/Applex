import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, dbGet, dbSet, db } from './firebase';
import { ref, onValue } from 'firebase/database';
import { UserProfile } from '../types';

interface AuthContextType {
  user: any | null; // Using any for compatibility with plain object hydration
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('aiplex_auth_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem('aiplex_user_profile');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(!navigator.onLine ? false : true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      // If we are offline and have cached user, we might be getting a null back from Firebase init 
      // but we want to keep the cached version for shell UI
      if (!u && !navigator.onLine && user) {
        setLoading(false);
        return;
      }

      setUser(u);
      if (u) {
        localStorage.setItem('aiplex_auth_user', JSON.stringify({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL
        }));

        const profileRef = ref(db, `users/${u.uid}/profile`);
       
        unsubscribeProfile = onValue(profileRef, (snap) => {
          if (snap.exists()) {
            const p = snap.val() as UserProfile;
            setProfile(p);
            localStorage.setItem('aiplex_user_profile', JSON.stringify(p));
            setLoading(false);
          } else {
            // Initialize profile if new
            const p: UserProfile = {
              uid: u.uid,
              displayName: u.displayName || 'New User',
              email: u.email || '',
              bio: '',
              avatarBase64: u.photoURL || '',
              role: 'user',
              createdAt: Date.now(),
              installedApps: {}
            };
            dbSet(`users/${u.uid}/profile`, p);
          }
        }, (err) => {
          console.error("Profile fetch error:", err);
          // If error (like offline), stop loading if we have cache
          if (!navigator.onLine) setLoading(false);
        });
      } else {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        setUser(null);
        setProfile(null);
        localStorage.removeItem('aiplex_auth_user');
        localStorage.removeItem('aiplex_user_profile');
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const signOut = () => auth.signOut();

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
