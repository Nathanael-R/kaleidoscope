import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecentUrls } from '@/hooks/use-recent-urls';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

describe('useRecentUrls', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('starts with empty list when localStorage is empty', () => {
    const { result } = renderHook(() => useRecentUrls());
    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('initializes from localStorage synchronously (no loading flash)', () => {
    // Pre-populate localStorage
    store['devicePreview_recentUrls'] = JSON.stringify([
      { url: 'https://example.com', domain: 'example.com', timestamp: 1000 },
    ]);

    const { result } = renderHook(() => useRecentUrls());

    // Data available immediately on first render - no loading state
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].url).toBe('https://example.com');
  });

  it('adds a URL and persists to localStorage', () => {
    const { result } = renderHook(() => useRecentUrls());

    act(() => {
      result.current.addRecentUrl('https://myapp.com/dashboard');
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].url).toBe('https://myapp.com/dashboard');
    expect(result.current.data[0].domain).toBe('myapp.com');
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('deduplicates URLs - same URL moves to top', () => {
    const { result } = renderHook(() => useRecentUrls());

    act(() => {
      result.current.addRecentUrl('https://a.com');
      result.current.addRecentUrl('https://b.com');
      result.current.addRecentUrl('https://a.com'); // duplicate
    });

    expect(result.current.data).toHaveLength(2);
    // Most recent first
    expect(result.current.data[0].url).toBe('https://a.com');
    expect(result.current.data[1].url).toBe('https://b.com');
  });

  it('caps at 10 URLs', () => {
    const { result } = renderHook(() => useRecentUrls());

    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.addRecentUrl(`https://site${i}.com`);
      }
    });

    expect(result.current.data).toHaveLength(10);
    // Most recent should be site14, oldest kept should be site5
    expect(result.current.data[0].url).toBe('https://site14.com');
    expect(result.current.data[9].url).toBe('https://site5.com');
  });

  it('clears all URLs', () => {
    const { result } = renderHook(() => useRecentUrls());

    act(() => {
      result.current.addRecentUrl('https://a.com');
      result.current.addRecentUrl('https://b.com');
    });
    expect(result.current.data).toHaveLength(2);

    act(() => {
      result.current.clearRecentUrls();
    });

    expect(result.current.data).toEqual([]);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('devicePreview_recentUrls');
  });

  it('handles invalid URLs gracefully', () => {
    const { result } = renderHook(() => useRecentUrls());

    act(() => {
      result.current.addRecentUrl('not-a-url');
    });

    // Should not crash, URL just won't be added (URL constructor throws)
    expect(result.current.data).toHaveLength(0);
  });
});
