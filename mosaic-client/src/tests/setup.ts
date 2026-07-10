import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

Object.defineProperty(window, 'alert', {
  writable: true,
  value: () => {},
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];

  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
};

// Prevent happy-dom from performing real iframe navigations during component tests.
const happyDomWindow = window as typeof window & {
  happyDOM?: {
    settings?: {
      navigation?: {
        disableChildFrameNavigation?: boolean;
      };
    };
  };
};

if (happyDomWindow.happyDOM?.settings) {
  happyDomWindow.happyDOM.settings.navigation = {
    ...happyDomWindow.happyDOM.settings.navigation,
    disableChildFrameNavigation: true,
  };
}
