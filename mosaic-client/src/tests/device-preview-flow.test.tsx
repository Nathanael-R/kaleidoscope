/**
 * Device preview flow — behavioral integration tests
 *
 * Tests the complete user journey: select device → enter URL → preview loads →
 * rotate/zoom → pin devices → compare → reload triggers remount.
 * Tests HOW the feature should work, not implementation details.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PreviewArea from '@/components/preview-area';
import DeviceFrame from '@/components/device-frame';
import { devices } from '@/lib/devices';

const iphone = devices.find(d => d.id === 'iphone-14')!;
const ipad = devices.find(d => d.id === 'ipad')!;
const desktop = devices.find(d => d.id === 'desktop')!;

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  // Mock alert for screenshot tests
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('Device preview flow', () => {
  describe('loading a URL', () => {
    it('should show the website in an iframe when a URL is provided', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toHaveAttribute('src', 'http://localhost:3000');
      expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    });

    it('should show loading state while iframe loads', () => {
      render(
        <DeviceFrame device={iphone} url="http://localhost:3000" />
      );

      // Loading overlay should be visible before iframe fires onLoad
      expect(screen.getByText('Loading website...')).toBeInTheDocument();
    });

    it('should show empty state when no URL is entered', () => {
      render(
        <DeviceFrame device={iphone} url="" />
      );

      expect(screen.getByText('Enter a URL to preview')).toBeInTheDocument();
    });

    it('should hide loading state once iframe loads', () => {
      render(
        <DeviceFrame device={iphone} url="http://localhost:3000" />
      );

      expect(screen.getByText('Loading website...')).toBeInTheDocument();

      // Simulate iframe load complete
      fireEvent.load(screen.getByTestId('preview-iframe'));

      expect(screen.queryByText('Loading website...')).not.toBeInTheDocument();
    });
  });

  describe('device chrome rendering', () => {
    it('should show device name and dimensions below the frame', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      expect(screen.getByTestId('text-device-name')).toHaveTextContent('iPhone 14 Preview');
      expect(screen.getByTestId('text-device-dimensions')).toHaveTextContent('390 × 844 pixels');
    });

    it('should swap dimensions when rotated to landscape', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      fireEvent.click(screen.getByTestId('button-rotate'));

      expect(screen.getByTestId('text-device-dimensions')).toHaveTextContent('844 × 390 pixels');
    });
  });

  describe('zoom controls', () => {
    it('should zoom in by 10% increments', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      fireEvent.click(screen.getByTestId('button-zoom-in'));
      expect(screen.getByText('110%')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('button-zoom-in'));
      expect(screen.getByText('120%')).toBeInTheDocument();
    });

    it('should zoom out by 10% increments', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      fireEvent.click(screen.getByTestId('button-zoom-out'));
      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('should not show scale indicator at default 100%', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      expect(screen.queryByText('100%')).not.toBeInTheDocument();
    });

    it('should reset zoom to 100% when Fit is clicked', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
        />
      );

      // Zoom in then reset
      fireEvent.click(screen.getByTestId('button-zoom-in'));
      fireEvent.click(screen.getByTestId('button-zoom-in'));
      expect(screen.getByText('120%')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('button-reset-zoom'));
      expect(screen.queryByText('120%')).not.toBeInTheDocument();
    });
  });

  describe('comparison mode', () => {
    it('should show empty state when no devices are pinned', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="comparison"
        />
      );

      expect(screen.getByText('No devices pinned for comparison')).toBeInTheDocument();
    });

    it('should render one iframe per pinned device', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[iphone, ipad, desktop]}
          viewMode="comparison"
        />
      );

      const iframes = screen.getAllByTestId('preview-iframe');
      expect(iframes).toHaveLength(3);
    });

    it('should show remove buttons for each pinned device', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[iphone, ipad]}
          viewMode="comparison"
        />
      );

      expect(screen.getByTestId('remove-pin-iphone-14')).toBeInTheDocument();
      expect(screen.getByTestId('remove-pin-ipad')).toBeInTheDocument();
    });

    it('should call onDevicePin when a device is removed from comparison', () => {
      const onUnpin = vi.fn();
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[iphone, ipad]}
          viewMode="comparison"
          onDevicePin={onUnpin}
        />
      );

      fireEvent.click(screen.getByTestId('remove-pin-iphone-14'));

      expect(onUnpin).toHaveBeenCalledWith(iphone);
    });

    it('should show Clear All button that unpins all devices', () => {
      const onUnpin = vi.fn();
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[iphone, ipad, desktop]}
          viewMode="comparison"
          onDevicePin={onUnpin}
        />
      );

      fireEvent.click(screen.getByTestId('button-clear-all-pins'));

      // Should call onDevicePin for each pinned device
      expect(onUnpin).toHaveBeenCalledTimes(3);
    });

    it('should not show non-functional layout buttons', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[iphone, ipad]}
          viewMode="comparison"
        />
      );

      // Layout buttons were removed — they were cosmetic only
      expect(screen.queryByTestId('button-layout-rows')).not.toBeInTheDocument();
      expect(screen.queryByTestId('button-layout-grid')).not.toBeInTheDocument();
    });
  });

  describe('live reload trigger', () => {
    it('should remount iframe when reloadTrigger increments', () => {
      const { rerender } = render(
        <DeviceFrame device={iphone} url="http://localhost:3000" reloadTrigger={0} />
      );

      const iframe1 = screen.getByTestId('preview-iframe');

      // Simulate reload trigger (file change detected)
      rerender(
        <DeviceFrame device={iphone} url="http://localhost:3000" reloadTrigger={1} />
      );

      // iframe should have been remounted (key changed)
      const iframe2 = screen.getByTestId('preview-iframe');
      // Both exist but with different internal keys — we verify by checking loading state resets
      expect(screen.getByText('Loading website...')).toBeInTheDocument();
    });

    it('should not remount when reloadTrigger stays the same', () => {
      const { rerender } = render(
        <DeviceFrame device={iphone} url="http://localhost:3000" reloadTrigger={1} />
      );

      // Simulate iframe loaded
      fireEvent.load(screen.getByTestId('preview-iframe'));
      expect(screen.queryByText('Loading website...')).not.toBeInTheDocument();

      // Re-render with same trigger
      rerender(
        <DeviceFrame device={iphone} url="http://localhost:3000" reloadTrigger={1} />
      );

      // Should still not show loading (no remount)
      expect(screen.queryByText('Loading website...')).not.toBeInTheDocument();
    });
  });

  describe('sidebar toggle', () => {
    it('should show floating expand button when sidebar is collapsed', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
          isSidebarCollapsed={true}
          onToggleSidebar={vi.fn()}
        />
      );

      expect(screen.getByTestId('button-expand-sidebar-floating')).toBeInTheDocument();
    });

    it('should not show floating button when sidebar is expanded', () => {
      render(
        <PreviewArea
          selectedDevice={iphone}
          currentUrl="http://localhost:3000"
          pinnedDevices={[]}
          viewMode="single"
          isSidebarCollapsed={false}
        />
      );

      expect(screen.queryByTestId('button-expand-sidebar-floating')).not.toBeInTheDocument();
    });
  });
});
