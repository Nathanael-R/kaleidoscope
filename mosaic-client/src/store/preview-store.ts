import { create } from 'zustand';

interface PreviewState {
  currentUrl: string;
  setCurrentUrl: (url: string) => void;
  proxyUrl: string | null;
  setProxyUrl: (url: string | null) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
}

// Read initial dark mode preference from localStorage and apply to DOM immediately
const storedDark = typeof window !== 'undefined'
  ? localStorage.getItem('kaleidoscope-dark-mode') === 'true'
  : false;
if (storedDark) {
  document.documentElement.classList.add('dark');
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  currentUrl: '',
  setCurrentUrl: (url) => set({ currentUrl: url }),
  proxyUrl: null,
  setProxyUrl: (url) => set({ proxyUrl: url }),
  darkMode: storedDark,
  setDarkMode: (dark) => {
    localStorage.setItem('kaleidoscope-dark-mode', String(dark));
    document.documentElement.classList.toggle('dark', dark);
    set({ darkMode: dark });
  },
  toggleDarkMode: () => {
    const next = !get().darkMode;
    localStorage.setItem('kaleidoscope-dark-mode', String(next));
    document.documentElement.classList.toggle('dark', next);
    set({ darkMode: next });
  },
}));
