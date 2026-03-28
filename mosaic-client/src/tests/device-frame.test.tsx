import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import DeviceFrame from '@/components/device-frame';
import { devices } from '@/lib/devices';

const iphone = devices.find(d => d.id === 'iphone-14')!;
const iphone16 = devices.find(d => d.id === 'iphone-16')!;
const samsungS24Ultra = devices.find(d => d.id === 'samsung-s24-ultra')!;
const desktop = devices.find(d => d.id === 'desktop')!;

describe('DeviceFrame', () => {
  describe('empty state', () => {
    it('shows "Enter a URL" prompt when no URL is provided', () => {
      render(<DeviceFrame device={iphone} url="" />);
      expect(screen.getByText('Enter a URL to preview')).toBeInTheDocument();
    });

    it('does not render an iframe when no URL is provided', () => {
      render(<DeviceFrame device={iphone} url="" />);
      expect(screen.queryByTestId('preview-iframe')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('renders an iframe with the given URL', () => {
      render(<DeviceFrame device={iphone} url="http://localhost:3000" />);
      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'http://localhost:3000');
    });

    it('shows loading spinner on initial render with URL', () => {
      render(<DeviceFrame device={iphone} url="http://localhost:3000" />);
      expect(screen.getByText('Loading website...')).toBeInTheDocument();
    });

    it('hides loading spinner after iframe fires onLoad', () => {
      render(<DeviceFrame device={iphone} url="http://localhost:3000" />);
      const iframe = screen.getByTestId('preview-iframe');

      fireEvent.load(iframe);

      expect(screen.queryByText('Loading website...')).not.toBeInTheDocument();
    });

    it('hides iframe while loading', () => {
      render(<DeviceFrame device={iphone} url="http://localhost:3000" />);
      const iframe = screen.getByTestId('preview-iframe');
      // Iframe is hidden during loading
      expect(iframe).toHaveStyle({ display: 'none' });
    });

    it('shows iframe after load completes', () => {
      render(<DeviceFrame device={iphone} url="http://localhost:3000" />);
      const iframe = screen.getByTestId('preview-iframe');

      fireEvent.load(iframe);

      expect(iframe).toHaveStyle({ display: 'block' });
    });
  });

  describe('proxy URL', () => {
    it('uses proxy URL as iframe src when provided', () => {
      render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000"
          proxyUrl="http://localhost:5000/api/proxy/session123/"
        />
      );
      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toHaveAttribute('src', 'http://localhost:5000/api/proxy/session123/');
    });

    it('falls back to direct URL when proxyUrl is null', () => {
      render(
        <DeviceFrame device={iphone} url="http://localhost:3000" proxyUrl={null} />
      );
      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toHaveAttribute('src', 'http://localhost:3000');
    });

    it('includes proxy indicator in aria-label', () => {
      render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000"
          proxyUrl="http://localhost:5000/api/proxy/session123/"
        />
      );
      const iframe = screen.getByTestId('preview-iframe');
      expect(iframe).toHaveAttribute(
        'aria-label',
        expect.stringContaining('(via proxy)')
      );
    });
  });

  describe('device dimensions', () => {
    it('renders mobile frame with correct device chrome', () => {
      const { container } = render(
        <DeviceFrame device={iphone} url="http://localhost:3000" />
      );
      // Mobile frame has rounded-[3rem] class
      const frame = container.querySelector('.rounded-\\[3rem\\]');
      expect(frame).toBeInTheDocument();
    });

    it('renders desktop frame without mobile chrome', () => {
      const { container } = render(
        <DeviceFrame device={desktop} url="http://localhost:3000" />
      );
      // Desktop doesn't have the mobile bezel class
      expect(container.querySelector('.rounded-\\[3rem\\]')).not.toBeInTheDocument();
    });

    it('swaps width and height in landscape mode', () => {
      render(<DeviceFrame device={iphone} url="http://localhost:3000" isLandscape />);
      // In landscape, the device label should show swapped dimensions
      expect(screen.getByText('844 × 390')).toBeInTheDocument();
    });

    it('shows portrait dimensions by default', () => {
      render(<DeviceFrame device={iphone} url="http://localhost:3000" />);
      expect(screen.getByText('390 × 844')).toBeInTheDocument();
    });

    it('renders Dynamic Island chrome for newer iPhones', () => {
      render(<DeviceFrame device={iphone16} url="http://localhost:3000" />);

      expect(screen.getByTestId('device-top-feature')).toHaveAttribute('data-feature-type', 'dynamic-island');
    });

    it('renders punch-hole chrome for newer Samsung devices', () => {
      render(<DeviceFrame device={samsungS24Ultra} url="http://localhost:3000" />);

      expect(screen.getByTestId('device-top-feature')).toHaveAttribute('data-feature-type', 'camera-hole');
    });
  });

  describe('mobile status chrome', () => {
    it('uses a transparent status bar and updates the clock over time', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'));

      try {
        render(<DeviceFrame device={iphone16} url="http://localhost:3000" />);

        const statusBar = screen.getByTestId('device-status-bar');
        expect(statusBar).toHaveClass('bg-transparent');

        const initialTime = screen.getByTestId('device-status-time').textContent;

        vi.setSystemTime(new Date('2026-03-28T10:01:05.000Z'));
        act(() => {
          vi.advanceTimersByTime(31000);
        });

        expect(screen.getByTestId('device-status-time').textContent).not.toBe(initialTime);
      } finally {
        vi.useRealTimers();
      }
    });

    it('expands Dynamic Island on hover and click', () => {
      render(<DeviceFrame device={iphone16} url="http://localhost:3000" />);

      const dynamicIsland = screen.getByTestId('device-top-feature');
      expect(dynamicIsland).toHaveAttribute('data-feature-type', 'dynamic-island');
      expect(dynamicIsland).toHaveAttribute('data-expanded', 'false');

      fireEvent.mouseEnter(dynamicIsland);
      expect(dynamicIsland).toHaveAttribute('data-expanded', 'true');

      fireEvent.mouseLeave(dynamicIsland);
      expect(dynamicIsland).toHaveAttribute('data-expanded', 'false');

      fireEvent.click(dynamicIsland);
      expect(dynamicIsland).toHaveAttribute('data-expanded', 'true');

      fireEvent.mouseLeave(dynamicIsland);
      expect(dynamicIsland).toHaveAttribute('data-expanded', 'true');

      fireEvent.click(dynamicIsland);
      expect(dynamicIsland).toHaveAttribute('data-expanded', 'false');
    });
  });

  describe('reload behavior', () => {
    it('forces iframe remount when reloadTrigger increments', () => {
      const { rerender } = render(
        <DeviceFrame device={iphone} url="http://localhost:3000" reloadTrigger={0} />
      );
      const iframe1 = screen.getByTestId('preview-iframe');
      fireEvent.load(iframe1);

      // Increment reload trigger
      rerender(
        <DeviceFrame device={iphone} url="http://localhost:3000" reloadTrigger={1} />
      );

      // Should show loading again (iframe key changed, new iframe mounted)
      expect(screen.getByText('Loading website...')).toBeInTheDocument();
    });
  });

  describe('callbacks', () => {
    it('calls onLoad when iframe loads successfully', () => {
      const onLoad = vi.fn();
      render(<DeviceFrame device={iphone} url="http://localhost:3000" onLoad={onLoad} />);

      fireEvent.load(screen.getByTestId('preview-iframe'));
      expect(onLoad).toHaveBeenCalledOnce();
    });

    it('posts inspect state to the iframe when inspect mode is enabled', () => {
      vi.useFakeTimers();
      const postMessage = vi.fn();

      render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000"
          inspectEnabled
        />
      );

      const iframe = screen.getByTestId('preview-iframe');
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: { postMessage },
      });

      fireEvent.load(iframe);
      act(() => {
        vi.advanceTimersByTime(60);
      });

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'kaleidoscope-inspect',
          type: 'KALEIDOSCOPE_INSPECT_SET_STATE',
          enabled: true,
        }),
        '*'
      );

      vi.useRealTimers();
    });

    it('forwards inspect result messages from the iframe', () => {
      const onInspectSelection = vi.fn();
      render(
        <DeviceFrame
          device={iphone}
          url="http://localhost:3000"
          inspectEnabled
          onInspectSelection={onInspectSelection}
        />
      );

      const iframe = screen.getByTestId('preview-iframe');
      const frameWindow = {};
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: frameWindow,
      });

      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow as MessageEventSource,
        data: {
          source: 'kaleidoscope-inspect',
          type: 'KALEIDOSCOPE_INSPECT_RESULT',
          payload: {
            selector: '#save',
            tagName: 'button',
            text: 'Save',
            elementSource: null,
          },
        },
      }));

      expect(onInspectSelection).toHaveBeenCalledWith(
        expect.objectContaining({ selector: '#save', tagName: 'button' })
      );
    });
  });
});
