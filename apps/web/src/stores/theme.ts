import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { themes, type ThemeName, applyTheme } from '@/lib/themes';

interface ThemeState {
  currentTheme: ThemeName;
  setTheme: (name: ThemeName) => void;
  initialize: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentTheme: 'classic-grid',
      setTheme: (name) => {
        applyTheme(name);
        set({ currentTheme: name });
      },
      initialize: () => {
        const saved = localStorage.getItem('theme') as ThemeName | null;
        if (saved && themes[saved]) {
          applyTheme(saved);
          set({ currentTheme: saved });
        } else {
          applyTheme('classic-grid');
        }
      },
    }),
    { name: 'barberflow-theme' }
  )
);