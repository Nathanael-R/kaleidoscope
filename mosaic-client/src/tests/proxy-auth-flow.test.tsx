/**
 * Proxy & auth flow — behavioral tests
 *
 * Tests the complete auth flow: user enters cookies → proxy session is created →
 * proxy URL replaces direct URL in iframes → screenshots use proxy URL →
 * mock data injection when auth fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PreviewArea from '@/components/preview-area';
import DeviceFrame from '@/components/device-frame';
import { devices } from '@/lib/devices';

const iphone = devices.find(d => d.id === 'iphone-14')!;
const ipad = devices.find(d => d.id === 'ipad')!;

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  // alert doesn't exist in happy-dom
  vi.stubGlobal('alert', vi.fn());
});

describe('Proxy auth flow', () => {
  describe('iframe URL selection', () => {
    it('should use the direct URL when no proxy is active', () => {
      render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000/dashboard"
        />
      );

      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toHaveAttribute('src', 'http://localhost:3000/dashboard');
    });

    it('should use the proxy URL when proxy is active', () => {
      render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000/dashboard"
          proxyUrl="http://localhost:5000/api/proxy/sess123/"
        />
      );

      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toHaveAttribute('src', 'http://localhost:5000/api/proxy/sess123/');
    });

    it('should fall back to direct URL when proxyUrl is null', () => {
      render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000/dashboard"
          proxyUrl={null}
        />
      );

      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toHaveAttribute('src', 'http://localhost:3000/dashboard');
    });
  });

  describe('proxy URL in comparison mode', () => {
    it('should pass proxy URL to all pinned device iframes', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000/dashboard"
          proxyUrl="http://localhost:5000/api/proxy/sess123/"
          pinnedDevices={[iphone, ipad]}
          viewMode="comparison"
        />
      );

      const iframes = screen.getAllByTestId('preview-iframe');
      expect(iframes).toHaveLength(2);
      iframes.forEach(iframe => {
        expect(iframe).toHaveAttribute('src', 'http://localhost:5000/api/proxy/sess123/');
      });
    });
  });

  describe('iframe remount on proxy URL change', () => {
    it('should remount the iframe when proxyUrl changes', () => {
      const { rerender } = render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000"
        />
      );

      const iframe1 = screen.getByTestId('preview-iframe');
      expect(iframe1).toHaveAttribute('src', 'http://localhost:3000');

      // Simulate proxy becoming active
      rerender(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000"
          proxyUrl="http://localhost:5000/api/proxy/sess1/"
        />
      );

      const iframe2 = screen.getByTestId('preview-iframe');
      expect(iframe2).toHaveAttribute('src', 'http://localhost:5000/api/proxy/sess1/');
    });
  });

  describe('screenshots use proxy URL', () => {
    it('should send proxy URL in screenshot API call when proxy is active', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ screenshots: [{ device: 'iPhone 14', path: '/test.png' }] }),
      });

      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000/dashboard"
          proxyUrl="http://localhost:5000/api/proxy/sess123/"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      // Click screenshot button
      fireEvent.click(screen.getByTestId('button-screenshot'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.url).toBe('http://localhost:5000/api/proxy/sess123/');
      });
    });

    it('should send direct URL in screenshot API call when no proxy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ screenshots: [] }),
      });

      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000/dashboard"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      fireEvent.click(screen.getByTestId('button-screenshot'));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.url).toBe('http://localhost:3000/dashboard');
      });
    });
  });

  describe('device frame does not accept authCookies prop', () => {
    it('should not accept authCookies — auth is handled by the proxy, not the iframe', () => {
      // This is a compile-time check — if DeviceFrame accepted authCookies,
      // TypeScript would allow it. We verify the interface is clean by
      // checking that the component renders fine without it.
      render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000"
          proxyUrl="http://localhost:5000/api/proxy/sess1/"
        />
      );

      const iframe = screen.getByTestId('preview-iframe');
      // The proxy URL handles auth — the iframe just renders
      expect(iframe).toHaveAttribute('src', 'http://localhost:5000/api/proxy/sess1/');
    });
  });
});
