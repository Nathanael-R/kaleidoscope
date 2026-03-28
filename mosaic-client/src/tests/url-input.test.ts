import { describe, expect, it } from 'vitest';
import {
  detectPreviewTargetMode,
  isLikelyPublicHttpUrl,
  looksLikeLocalDevelopmentUrl,
  normalizePreviewUrl,
} from '@/lib/url-input';

describe('url input helpers', () => {
  it('detects local development inputs', () => {
    expect(looksLikeLocalDevelopmentUrl('localhost:3000')).toBe(true);
    expect(looksLikeLocalDevelopmentUrl('3000')).toBe(true);
    expect(looksLikeLocalDevelopmentUrl('192.168.1.25:8080')).toBe(true);
    expect(looksLikeLocalDevelopmentUrl('beautifulteachers.com')).toBe(false);
  });

  it('detects the appropriate preview mode', () => {
    expect(detectPreviewTargetMode('http://localhost:5173')).toBe('local');
    expect(detectPreviewTargetMode('https://example.com')).toBe('production');
  });

  it('normalizes production domains without forcing www', () => {
    const result = normalizePreviewUrl('beautifulteachers.com', 'production');
    expect(result).toEqual({
      normalizedUrl: 'https://beautifulteachers.com',
      error: null,
    });
  });

  it('normalizes local inputs with http and localhost shortcuts', () => {
    expect(normalizePreviewUrl('localhost:3000', 'local')).toEqual({
      normalizedUrl: 'http://localhost:3000',
      error: null,
    });
    expect(normalizePreviewUrl('3000', 'local')).toEqual({
      normalizedUrl: 'http://localhost:3000',
      error: null,
    });
  });

  it('flags only public URLs as proxy-eligible', () => {
    expect(isLikelyPublicHttpUrl('https://example.com')).toBe(true);
    expect(isLikelyPublicHttpUrl('http://localhost:3000')).toBe(false);
    expect(isLikelyPublicHttpUrl('http://192.168.1.25:3000')).toBe(false);
  });
});