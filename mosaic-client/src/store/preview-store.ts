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

const getStoredDarkMode = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('kaleidoscope-dark-mode') === 'true';
  } catch {
    return false;
  }
};

const setStoredDarkMode = (value: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('kaleidoscope-dark-mode', String(value));
  } catch {
    // Ignore storage errors (privacy modes, disabled storage)
  }
};

const applyDarkModeClass = (enabled: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', enabled);
};

// Read initial dark mode preference from localStorage and apply to DOM immediately
const storedDark = getStoredDarkMode();
if (storedDark) {
  applyDarkModeClass(true);
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  currentUrl: '',
  setCurrentUrl: (url) => set({ currentUrl: url }),
  proxyUrl: null,
  setProxyUrl: (url) => set({ proxyUrl: url }),
  darkMode: storedDark,
  setDarkMode: (dark) => {
    setStoredDarkMode(dark);
    applyDarkModeClass(dark);
    set({ darkMode: dark });
  },
  toggleDarkMode: () => {
    const next = !get().darkMode;
    setStoredDarkMode(next);
    applyDarkModeClass(next);
    set({ darkMode: next });
  },
}));
