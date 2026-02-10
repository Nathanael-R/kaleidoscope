import { create } from 'zustand';

interface PreviewState {
  currentUrl: string;
  setCurrentUrl: (url: string) => void;
  proxyUrl: string | null;
  setProxyUrl: (url: string | null) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  currentUrl: '',
  setCurrentUrl: (url) => set({ currentUrl: url }),
  proxyUrl: null,
  setProxyUrl: (url) => set({ proxyUrl: url }),
}));
