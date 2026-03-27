import { expect, afterEach, vi } from 'vitest';
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

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Prevent happy-dom from performing real iframe navigations during component tests.
const happyDomWindow = window as typeof window & {
  happyDOM?: {
    settings?: {
      disableIframePageLoading?: boolean;
    };
  };
};

if (happyDomWindow.happyDOM?.settings) {
  happyDomWindow.happyDOM.settings.disableIframePageLoading = true;
}

const originalConsoleError = console.error.bind(console);
vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  const message = args
    .map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)))
    .join(' ');

  if (message.includes('Iframe page loading is disabled.')) {
    return;
  }

  originalConsoleError(...args);
});
