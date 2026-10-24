import { create } from 'zustand';
import type { AuthUser } from './auth-types';

export type SessionStatus = 'unknown' | 'restoring' | 'authenticated' | 'guest';

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  sessionStatus: SessionStatus;
  beginRestore: () => void;
  setUser: (user: AuthUser) => void;
  setSession: (input: { accessToken: string; user: AuthUser }) => void;
  clearSession: () => void;
};

function readStoredToken() {
  try { return localStorage.getItem('ephurin_access_token'); }
  catch { return null; }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: readStoredToken(),
  user: null,
  sessionStatus: readStoredToken() ? 'unknown' : 'guest',
  beginRestore: () => set({ sessionStatus: 'restoring' }),
  setUser: (user) => set({ user, sessionStatus: 'authenticated' }),
  setSession: ({ accessToken, user }) => {
    try { localStorage.setItem('ephurin_access_token', accessToken); } catch { /* Storage may be disabled. */ }
    set({ accessToken, user, sessionStatus: 'authenticated' });
  },
  clearSession: () => {
    try { localStorage.removeItem('ephurin_access_token'); sessionStorage.clear(); } catch { /* Storage may be disabled. */ }
    set({ accessToken: null, user: null, sessionStatus: 'guest' });
  }
}));
