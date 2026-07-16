import { create } from 'zustand';

export type AuthorActivity =
  | 'story'
  | 'entities'
  | 'timeline'
  | 'graph'
  | 'search'
  | 'tasks'
  | 'projects'
  | 'settings';

type UiState = {
  activeAuthorActivity: AuthorActivity;
  setActiveAuthorActivity: (activity: AuthorActivity) => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeAuthorActivity: 'story',
  setActiveAuthorActivity: (activity) => set({ activeAuthorActivity: activity })
}));
