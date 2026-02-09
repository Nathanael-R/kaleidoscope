import type { RecentUrl } from "@/types";
import { useState, useCallback } from "react";

const RECENT_URLS_KEY = 'devicePreview_recentUrls';
const MAX_RECENT_URLS = 10;

// Helper functions for localStorage operations
function getStoredRecentUrls(): RecentUrl[] {
  try {
    const stored = localStorage.getItem(RECENT_URLS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error reading recent URLs from localStorage:', error);
    return [];
  }
}

function setStoredRecentUrls(urls: RecentUrl[]): void {
  try {
    localStorage.setItem(RECENT_URLS_KEY, JSON.stringify(urls));
  } catch (error) {
    console.error('Error saving recent URLs to localStorage:', error);
  }
}

export function useRecentUrls() {
  // localStorage is synchronous - use lazy initializer instead of useEffect
  const [recentUrls, setRecentUrls] = useState<RecentUrl[]>(() => getStoredRecentUrls());

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
        setStoredRecentUrls(trimmed);
        
        return trimmed;
      });
    } catch (error) {
      console.error('Error adding recent URL:', error);
    }
  }, []);

  const clearRecentUrls = useCallback(() => {
    setRecentUrls([]);
    localStorage.removeItem(RECENT_URLS_KEY);
  }, []);

  return {
    data: recentUrls,
    isLoading: false as const,
    addRecentUrl,
    clearRecentUrls
  };
}

export function useValidateUrl() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(async (url: string) => {
    setIsPending(true);
    try {
      if (!url) {
        return { valid: false, message: "URL is required" };
      }

      // Basic URL validation
      try {
        new URL(url);
      } catch (error) {
        console.error('Invalid URL format:', error);
        return { valid: false, message: "Invalid URL format" };
      }

      // For client-side validation, we'll just validate the format
      // We can't do network requests to check accessibility due to CORS
      return { 
        valid: true, 
        accessible: true, // Assume accessible for client-side validation
        message: "URL format is valid"
      };
    } catch (error) {
        console.error('Invalid URL format:', error);
      return { valid: false, message: "Failed to validate URL" };
    } finally {
      setIsPending(false);
    }
  }, []);

  return {
    mutateAsync: mutate,
    isPending
  };
}