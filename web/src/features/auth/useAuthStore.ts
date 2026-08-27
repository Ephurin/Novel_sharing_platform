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

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('ephurin_access_token'),
  user: null,
  sessionStatus: localStorage.getItem('ephurin_access_token') ? 'unknown' : 'guest',
  beginRestore: () => set({ sessionStatus: 'restoring' }),
  setUser: (user) => set({ user, sessionStatus: 'authenticated' }),
  setSession: ({ accessToken, user }) => {
    localStorage.setItem('ephurin_access_token', accessToken);
    set({ accessToken, user, sessionStatus: 'authenticated' });
  },
  clearSession: () => {
    localStorage.clear();
    sessionStorage.clear();
    set({ accessToken: null, user: null, sessionStatus: 'guest' });
  }
}));
