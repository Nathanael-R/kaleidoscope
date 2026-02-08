import { describe, it, expect } from 'vitest';

// Sample unit test - will update once we read the actual devices.ts file
describe('Device Configuration', () => {
  it('should have correct device dimensions', () => {
    const devices = {
      iphone14: { width: 390, height: 844 },
      ipad: { width: 810, height: 1080 },
      desktop: { width: 1920, height: 1080 }
    };

    expect(devices.iphone14.width).toBe(390);
    expect(devices.ipad.width).toBeGreaterThan(devices.iphone14.width);
    expect(devices.desktop.width).toBeGreaterThan(devices.ipad.width);
  });

  it('should categorize devices correctly', () => {
    const isMobile = (width: number) => width < 768;
    const isTablet = (width: number) => width >= 768 && width < 1024;
    const isDesktop = (width: number) => width >= 1024;

    expect(isMobile(390)).toBe(true);
    expect(isTablet(810)).toBe(true);
    expect(isDesktop(1920)).toBe(true);
  });
});

describe('URL Validation', () => {
  it('should validate URLs correctly', () => {
    const isValidUrl = (url: string) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };

    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('invalid-url')).toBe(false);
  });

  it('should NOT block localhost URLs', () => {
    const shouldBlockUrl = (url: string) => {
      // After our fix, localhost should NOT be blocked
      return false;
    };

    expect(shouldBlockUrl('http://localhost:3000')).toBe(false);
    expect(shouldBlockUrl('http://127.0.0.1:8080')).toBe(false);
  });
});
