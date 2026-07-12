import type { RecentUrl } from "@/types";
import { useState, useCallback, useEffect } from "react";
import { detectPreviewTargetMode, type PreviewTargetMode } from "@/lib/url-input";

const LEGACY_RECENT_URLS_KEY = 'devicePreview_recentUrls';
const MAX_RECENT_URLS = 10;

function getRecentUrlsKey(mode: PreviewTargetMode): string {
  return `devicePreview_recentUrls_${mode}`;
}

// Helper functions for localStorage operations
function getStoredRecentUrls(mode: PreviewTargetMode): RecentUrl[] {
  try {
    const modeKey = getRecentUrlsKey(mode);
    const stored = localStorage.getItem(modeKey);
    if (stored) {
      return JSON.parse(stored);
    }

    const legacyStored = localStorage.getItem(LEGACY_RECENT_URLS_KEY);
    if (!legacyStored) return [];

    const parsed = JSON.parse(legacyStored) as RecentUrl[];
    const migrated = parsed
      .filter((item) => item?.url && detectPreviewTargetMode(item.url) === mode)
      .slice(0, MAX_RECENT_URLS);

    if (migrated.length > 0) {
      localStorage.setItem(modeKey, JSON.stringify(migrated));
    }

    return migrated;
  } catch (error) {
    console.error('Error reading recent URLs from localStorage:', error);
    return [];
  }
}

function setStoredRecentUrls(mode: PreviewTargetMode, urls: RecentUrl[]): void {
  try {
    localStorage.setItem(getRecentUrlsKey(mode), JSON.stringify(urls));
  } catch (error) {
    console.error('Error saving recent URLs to localStorage:', error);
  }
}

export function useRecentUrls(mode: PreviewTargetMode = 'production') {
  // localStorage is synchronous - use lazy initializer instead of useEffect
  const [recentUrls, setRecentUrls] = useState<RecentUrl[]>(() => getStoredRecentUrls(mode));

  useEffect(() => {
    setRecentUrls(getStoredRecentUrls(mode));
  }, [mode]);

  const addRecentUrl = useCallback((url: string) => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      const newUrl: RecentUrl = {
        url,
        domain,
        timestamp: Date.now()
      };

      setRecentUrls(prevUrls => {
        // Remove existing entry with same URL
        const filtered = prevUrls.filter(item => item.url !== url);
        
        // Add new entry at the beginning
        const updated = [newUrl, ...filtered];
        
        // Keep only the most recent MAX_RECENT_URLS entries
        const trimmed = updated.slice(0, MAX_RECENT_URLS);
        
        // Save to localStorage
        setStoredRecentUrls(mode, trimmed);
        
        return trimmed;
      });
    } catch {
      // Ignore malformed URLs from user input rather than logging noisy test/runtime errors.
    }
  }, [mode]);

  const refreshRecentUrls = useCallback(() => {
    setRecentUrls(getStoredRecentUrls(mode));
  }, [mode]);

  const clearRecentUrls = useCallback(() => {
    setRecentUrls([]);
    localStorage.removeItem(getRecentUrlsKey(mode));
  }, [mode]);

  return {
    data: recentUrls,
    isLoading: false as const,
    addRecentUrl,
    clearRecentUrls,
    refreshRecentUrls,
  };
}
