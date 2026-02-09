/**
 * Live Reload — behavioral tests
 *
 * Tests the full feature: user enables live reload → SSE connects →
 * server-side watcher is started → file changes trigger a reload event →
 * preview iframes remount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LiveReloadToggle from '@/components/live-reload-toggle';

// --- Mocks ---

// Mock the useSocket hook so we can control connection state and trigger reloads
const mockUseSocket = vi.fn();
vi.mock('@/hooks/use-socket', () => ({
  useSocket: (opts: any) => mockUseSocket(opts),
}));

// Mock fetch for the watcher API calls
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSocket.mockReturnValue({ isConnected: false });
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
});

describe('Live Reload', () => {
  describe('when toggled on', () => {
    it('should connect to the event stream for file changes', () => {
      mockUseSocket.mockReturnValue({ isConnected: false });

      render(<LiveReloadToggle />);

      // Before toggle: autoConnect should be false
      const callBeforeToggle = mockUseSocket.mock.calls[mockUseSocket.mock.calls.length - 1][0];
      expect(callBeforeToggle.autoConnect).toBe(false);

      fireEvent.click(screen.getByTestId('live-reload-toggle'));

      // After toggle: autoConnect should be true
      const callAfterToggle = mockUseSocket.mock.calls[mockUseSocket.mock.calls.length - 1][0];
      expect(callAfterToggle.autoConnect).toBe(true);
    });

    it('should show "Connected" status when SSE connection succeeds', () => {
      mockUseSocket.mockReturnValue({ isConnected: true });

      render(<LiveReloadToggle />);
      fireEvent.click(screen.getByTestId('live-reload-toggle'));

      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByText('Watching for file changes...')).toBeInTheDocument();
    });

    it('should show "Connecting..." when SSE is not yet connected', () => {
      mockUseSocket.mockReturnValue({ isConnected: false });

      render(<LiveReloadToggle />);
      fireEvent.click(screen.getByTestId('live-reload-toggle'));

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('should start the server-side file watcher when connected', async () => {
      // Simulate: user clicks toggle → SSE connects → watcher starts
      mockUseSocket.mockReturnValue({ isConnected: true });

      render(<LiveReloadToggle />);
      fireEvent.click(screen.getByTestId('live-reload-toggle'));

      await waitFor(() => {
        const watcherCalls = mockFetch.mock.calls.filter(
          (call) => typeof call[0] === 'string' && call[0].includes('/api/watcher/start')
        );
        expect(watcherCalls.length).toBe(1);
      });

      // Verify it sends the right payload
      const startCall = mockFetch.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/api/watcher/start')
      );
      const body = JSON.parse(startCall![1].body);
      expect(body.id).toBe('live-reload');
      expect(body.paths).toContain('src/**/*');
    });

    it('should call onReload callback when a file change event arrives', () => {
      const onReload = vi.fn();

      // Capture the onReload callback passed to useSocket
      let capturedOnReload: (() => void) | undefined;
      mockUseSocket.mockImplementation((opts: any) => {
        capturedOnReload = opts.onReload;
        return { isConnected: true };
      });

      render(<LiveReloadToggle onReload={onReload} />);
      fireEvent.click(screen.getByTestId('live-reload-toggle'));

      // Simulate a reload event from the server
      act(() => {
        capturedOnReload?.();
      });

      expect(onReload).toHaveBeenCalledTimes(1);
    });

    it('should show "Just now" after receiving a reload event', () => {
      let capturedOnReload: (() => void) | undefined;
      mockUseSocket.mockImplementation((opts: any) => {
        capturedOnReload = opts.onReload;
        return { isConnected: true };
      });

      render(<LiveReloadToggle />);
      fireEvent.click(screen.getByTestId('live-reload-toggle'));

      act(() => {
        capturedOnReload?.();
      });

      expect(screen.getByText('Just now')).toBeInTheDocument();
    });
  });

  describe('when toggled off', () => {
    it('should not connect to the event stream', () => {
      render(<LiveReloadToggle />);

      // The hook should be called with autoConnect=false
      const lastCall = mockUseSocket.mock.calls[mockUseSocket.mock.calls.length - 1][0];
      expect(lastCall.autoConnect).toBe(false);
    });

    it('should show "Auto-refresh previews when files change" help text', () => {
      render(<LiveReloadToggle />);

      expect(screen.getByText('Auto-refresh previews when files change')).toBeInTheDocument();
    });

    it('should show "Live Reload: Off" button text', () => {
      render(<LiveReloadToggle />);

      expect(screen.getByText('Live Reload: Off')).toBeInTheDocument();
    });
  });

  describe('toggle on then off', () => {
    it('should stop the server-side file watcher when disabled', async () => {
      mockUseSocket.mockReturnValue({ isConnected: true });

      const { rerender } = render(<LiveReloadToggle />);

      // Enable
      fireEvent.click(screen.getByTestId('live-reload-toggle'));

      // Wait for watcher start
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/watcher/start'),
          expect.any(Object)
        );
      });

      // Disable
      fireEvent.click(screen.getByTestId('live-reload-toggle'));

      // Should call stop
      await waitFor(() => {
        const stopCalls = mockFetch.mock.calls.filter(
          (call) => typeof call[0] === 'string' && call[0].includes('/api/watcher/stop/live-reload')
        );
        expect(stopCalls.length).toBe(1);
      });

      // Verify DELETE method
      const stopCall = mockFetch.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/api/watcher/stop/live-reload')
      );
      expect(stopCall![1].method).toBe('DELETE');
    });
  });
});
