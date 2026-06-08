import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface AppState {
  themeMode: ThemeMode;
  isOnline: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setIsOnline: (online: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  themeMode: 'system',
  isOnline: true,
  setThemeMode: (mode) => set({ themeMode: mode }),
  setIsOnline: (online) => set({ isOnline: online }),
}));
