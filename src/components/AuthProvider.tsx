// AUTH PROVIDER: Client-side auth context that checks login status on mount.
//
// Fetches /api/auth/me to determine if the user is authenticated.
// If not authenticated, redirects to /login (unless already there).
// Provides { user, loading } to child components via useAuth() hook.
//
// Usage:
//   import { useAuth } from '@/components/AuthProvider';
//   const { user, loading } = useAuth();

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { AuthUser, AuthContextValue } from '@/types/auth';

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const json = await res.json();
          setUser({ email: json.data.email });
        } else if (res.status === 401) {
          // Not authenticated — redirect to login unless already there
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
            return;
          }
        }
      } catch {
        // Network error — don't redirect, let user retry
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
