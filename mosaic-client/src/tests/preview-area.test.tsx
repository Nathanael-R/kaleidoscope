import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PreviewArea from '@/components/preview-area';
import { devices } from '@/lib/devices';

const iphone = devices.find(d => d.id === 'iphone-14')!;
const ipad = devices.find(d => d.id === 'ipad')!;
const desktop = devices.find(d => d.id === 'desktop')!;

describe('PreviewArea', () => {
  const defaultProps = {
    selectedDevice: iphone,
    currentUrl: 'http://localhost:3000',
    pinnedDevices: [] as typeof devices,
    viewMode: 'single' as const,
  };

  describe('single mode', () => {
    it('shows selected device name in header', () => {
      render(<PreviewArea {...defaultProps} />);

      expect(screen.getByTestId('text-device-name')).toHaveTextContent('iPhone 14 Preview');
    });

    it('shows device dimensions in header', () => {
      render(<PreviewArea {...defaultProps} />);

      expect(screen.getByTestId('text-device-dimensions')).toHaveTextContent('390 × 844 pixels');
    });

    it('renders a single device frame with iframe', () => {
      render(<PreviewArea {...defaultProps} />);

      const iframes = screen.getAllByTestId('preview-iframe');
      expect(iframes).toHaveLength(1);
      expect(iframes[0]).toHaveAttribute('src', 'http://localhost:3000');
    });

    it('passes proxy URL through to device frame', () => {
      render(
        <PreviewArea
          {...defaultProps}
          proxyUrl="http://localhost:5000/api/proxy/s1/"
        />
      );

      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toHaveAttribute('src', 'http://localhost:5000/api/proxy/s1/');
    });
  });

  describe('comparison mode - empty', () => {
    it('shows "No devices pinned" when comparison mode has no pins', () => {
      render(
        <PreviewArea {...defaultProps} viewMode="comparison" pinnedDevices={[]} />
      );

      expect(screen.getByText('No devices pinned for comparison')).toBeInTheDocument();
    });

    it('shows keyboard hints in empty comparison state', () => {
      render(
        <PreviewArea {...defaultProps} viewMode="comparison" pinnedDevices={[]} />
      );

      expect(screen.getByText('to pin current device')).toBeInTheDocument();
      expect(screen.getByText('to toggle comparison mode')).toBeInTheDocument();
    });

    it('shows comparison header text', () => {
      render(
        <PreviewArea {...defaultProps} viewMode="comparison" pinnedDevices={[]} />
      );

      expect(screen.getByTestId('text-device-name')).toHaveTextContent('Comparing 0 Devices');
      expect(screen.getByTestId('text-device-dimensions')).toHaveTextContent('Side-by-side device comparison');
    });
  });

  describe('comparison mode - with pinned devices', () => {
    it('renders a device frame for each pinned device', () => {
      render(
        <PreviewArea
          {...defaultProps}
          viewMode="comparison"
          pinnedDevices={[iphone, ipad, desktop]}
        />
      );

      // Should have 3 device frames (one per pinned device)
      const iframes = screen.getAllByTestId('preview-iframe');
      expect(iframes).toHaveLength(3);
    });

    it('shows device names in comparison headers', () => {
      render(
        <PreviewArea
          {...defaultProps}
          viewMode="comparison"
          pinnedDevices={[iphone, ipad]}
        />
      );

      expect(screen.getByText('Comparing 2 devices')).toBeInTheDocument();
    });

    it('shows individual device names for each pinned frame', () => {
      render(
        <PreviewArea
          {...defaultProps}
          viewMode="comparison"
          pinnedDevices={[iphone, desktop]}
        />
      );

      // Each pinned device name appears in comparison header + device label
      expect(screen.getAllByText('iPhone 14').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Desktop HD').length).toBeGreaterThanOrEqual(1);
    });

    it('shows remove button for each pinned device', () => {
      render(
        <PreviewArea
          {...defaultProps}
          viewMode="comparison"
          pinnedDevices={[iphone, ipad]}
        />
      );

      expect(screen.getByTestId('remove-pin-iphone-14')).toBeInTheDocument();
      expect(screen.getByTestId('remove-pin-ipad')).toBeInTheDocument();
    });

    it('calls onDevicePin when remove button is clicked', () => {
      const onDevicePin = vi.fn();
      render(
        <PreviewArea
          {...defaultProps}
          viewMode="comparison"
          pinnedDevices={[iphone, ipad]}
          onDevicePin={onDevicePin}
        />
      );

      fireEvent.click(screen.getByTestId('remove-pin-iphone-14'));

      expect(onDevicePin).toHaveBeenCalledWith(iphone);
    });

    it('shows "Clear All" button to remove all pins', () => {
      render(
        <PreviewArea
          {...defaultProps}
          viewMode="comparison"
          pinnedDevices={[iphone, ipad]}
        />
      );

      expect(screen.getByTestId('button-clear-all-pins')).toBeInTheDocument();
    });

    it('shows "Reset Layout" button for repositioning', () => {
      render(
        <PreviewArea
          {...defaultProps}
          viewMode="comparison"
          pinnedDevices={[iphone]}
        />
      );

      expect(screen.getByTestId('button-reset-positions')).toBeInTheDocument();
    });

    it('shows drag instructions', () => {
      render(
        <PreviewArea
          {...defaultProps}
          viewMode="comparison"
          pinnedDevices={[iphone]}
        />
      );

      expect(screen.getByText('Drag devices to reposition')).toBeInTheDocument();
    });
  });

  describe('toolbar controls', () => {
    it('toggles landscape on Rotate click', () => {
      render(<PreviewArea {...defaultProps} />);

      // Initially portrait: 390 × 844
      expect(screen.getByTestId('text-device-dimensions')).toHaveTextContent('390 × 844');

      fireEvent.click(screen.getByTestId('button-rotate'));

      // After rotate: dimensions swap to 844 × 390
      expect(screen.getByTestId('text-device-dimensions')).toHaveTextContent('844 × 390');
    });

    it('toggles back to portrait on second Rotate click', () => {
      render(<PreviewArea {...defaultProps} />);

      fireEvent.click(screen.getByTestId('button-rotate'));
      fireEvent.click(screen.getByTestId('button-rotate'));

      expect(screen.getByTestId('text-device-dimensions')).toHaveTextContent('390 × 844');
    });

    it('shows scale indicator after zoom in', () => {
      render(<PreviewArea {...defaultProps} />);

      fireEvent.click(screen.getByTestId('button-zoom-in'));

      // Should show 110% (1 + 0.1 = 1.1)
      expect(screen.getByText('110%')).toBeInTheDocument();
    });

    it('shows scale indicator after zoom out', () => {
      render(<PreviewArea {...defaultProps} />);

      fireEvent.click(screen.getByTestId('button-zoom-out'));

      // Should show 90% (1 - 0.1 = 0.9)
      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('hides scale indicator at 100% (default)', () => {
      render(<PreviewArea {...defaultProps} />);

      // No scale indicator at default zoom
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
    });

    it('resets zoom to 100% when Fit is clicked', () => {
      render(<PreviewArea {...defaultProps} />);

      // Zoom in twice
      fireEvent.click(screen.getByTestId('button-zoom-in'));
      fireEvent.click(screen.getByTestId('button-zoom-in'));
      expect(screen.getByText('120%')).toBeInTheDocument();

      // Reset
      fireEvent.click(screen.getByTestId('button-reset-zoom'));

      // Scale indicator should disappear (back to 100%)
      expect(screen.queryByText('120%')).not.toBeInTheDocument();
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
    });
  });

  describe('sidebar toggle', () => {
    it('shows floating sidebar button when sidebar is collapsed', () => {
      render(<PreviewArea {...defaultProps} isSidebarCollapsed={true} onToggleSidebar={vi.fn()} />);

      expect(screen.getByTestId('button-expand-sidebar-floating')).toBeInTheDocument();
    });

    it('hides floating sidebar button when sidebar is open', () => {
      render(<PreviewArea {...defaultProps} isSidebarCollapsed={false} />);

      expect(screen.queryByTestId('button-expand-sidebar-floating')).not.toBeInTheDocument();
    });
  });
});
