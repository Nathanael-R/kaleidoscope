import { create } from 'zustand';

interface PreviewState {
  currentUrl: string;
  setCurrentUrl: (url: string) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  currentUrl: '',
  setCurrentUrl: (url) => set({ currentUrl: url }),
}));
