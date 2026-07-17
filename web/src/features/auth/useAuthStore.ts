import { create } from 'zustand';
import type { AuthUser } from './auth-types';

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (input: { accessToken: string; user: AuthUser }) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('ephurin_access_token'),
  user: null,
  setSession: ({ accessToken, user }) => {
    localStorage.setItem('ephurin_access_token', accessToken);
    set({ accessToken, user });
  },
  clearSession: () => {
    localStorage.removeItem('ephurin_access_token');
    set({ accessToken: null, user: null });
  }
}));
