/**
 * Screenshot capture — behavioral tests
 *
 * Tests: user selects devices → clicks capture → API is called with correct
 * URL (including proxy URL when auth is active) → results are displayed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScreenshotPanel from '@/components/screenshot-panel';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const showDirectoryPickerMock = vi.fn();
const directoryPermissionMock = vi.fn();
const directoryHandleMock = {
  queryPermission: vi.fn(),
  requestPermission: directoryPermissionMock,
  getFileHandle: vi.fn().mockResolvedValue({
    createWritable: vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  }),
};

Object.defineProperty(window, 'showDirectoryPicker', {
  configurable: true,
  writable: true,
  value: showDirectoryPickerMock,
});

beforeEach(() => {
  vi.clearAllMocks();
  showDirectoryPickerMock.mockReset();
  directoryHandleMock.queryPermission.mockImplementation(function () {
    if (this !== directoryHandleMock) {
      throw new TypeError('Illegal invocation');
    }

    return Promise.resolve('prompt' satisfies PermissionState);
  });
  directoryPermissionMock.mockImplementation(function () {
    if (this !== directoryHandleMock) {
      throw new TypeError('Illegal invocation');
    }

    return Promise.resolve('granted' satisfies PermissionState);
  });
  directoryHandleMock.getFileHandle.mockResolvedValue({
    createWritable: vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  });
  showDirectoryPickerMock.mockImplementation(() => Promise.resolve(directoryHandleMock));
});

describe('Screenshot capture', () => {
  describe('device selection', () => {
    it('should default to 3 devices selected (iPhone 14, iPad, Desktop HD)', () => {
      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      // Default selections should be highlighted
      const iphone = screen.getByText('iPhone 14');
      const ipad = screen.getByText('iPad');
      const desktop = screen.getByText('Desktop HD');

      expect(iphone.closest('button')).toHaveClass('bg-blue-50');
      expect(ipad.closest('button')).toHaveClass('bg-blue-50');
      expect(desktop.closest('button')).toHaveClass('bg-blue-50');
    });

    it('should toggle device selection on click', () => {
      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      const pixel = screen.getByText('Google Pixel 6');
      fireEvent.click(pixel);

      // Google Pixel 6 should now be selected
      expect(pixel.closest('button')).toHaveClass('bg-blue-50');
    });

    it('should select all devices when "All" is clicked', () => {
      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      fireEvent.click(screen.getByText('All'));

      // All 8 device buttons should be selected
      const allDeviceButtons = screen.getAllByText(/iPhone 14|Samsung Galaxy S21|Google Pixel 6|iPad$|iPad Pro|MacBook Air|Desktop HD|Desktop 4K/);
      allDeviceButtons.forEach(btn => {
        expect(btn.closest('button')).toHaveClass('bg-blue-50');
      });
    });

    it('should clear all devices when "None" is clicked', () => {
      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      fireEvent.click(screen.getByText('None'));

      // All device buttons should be deselected
      const iphone = screen.getByText('iPhone 14');
      expect(iphone.closest('button')).not.toHaveClass('bg-blue-50');
    });

    it('should disable capture button when no devices selected', () => {
      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      fireEvent.click(screen.getByText('None'));

      const captureBtn = screen.getByRole('button', { name: /Capture 0 Screenshots/ });
      expect(captureBtn).toBeDisabled();
    });
  });

  describe('capturing with regular URL', () => {
    it('should open the directory picker before requesting screenshots', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ screenshots: [] }),
      });

      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      fireEvent.click(screen.getByRole('button', { name: /Capture 3 Screenshots/ }));

      await waitFor(() => {
        expect(showDirectoryPickerMock).toHaveBeenCalledTimes(1);
        expect(directoryPermissionMock).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      expect(showDirectoryPickerMock.mock.invocationCallOrder[0]).toBeLessThan(mockFetch.mock.invocationCallOrder[0]);
      expect(directoryPermissionMock.mock.invocationCallOrder[0]).toBeLessThan(mockFetch.mock.invocationCallOrder[0]);
    });

    it('should stop before requesting screenshots when directory permission is denied', async () => {
      directoryPermissionMock.mockResolvedValueOnce('denied');

      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      fireEvent.click(screen.getByRole('button', { name: /Capture 3 Screenshots/ }));

      await waitFor(() => {
        expect(screen.getByText('Permission to save screenshots was denied.')).toBeInTheDocument();
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should allow retrying after the picker is cancelled', async () => {
      showDirectoryPickerMock.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ screenshots: [] }),
      });

      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      const captureButton = screen.getByRole('button', { name: /Capture 3 Screenshots/ });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(showDirectoryPickerMock).toHaveBeenCalledTimes(1);
      });
      expect(mockFetch).not.toHaveBeenCalled();

      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(showDirectoryPickerMock).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    it('should send the current URL to the screenshot API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          screenshots: [
            { device: 'iPhone 14', path: '/screenshots/iphone.png', width: 390, height: 844 },
          ],
        }),
      });

      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      // Click capture with default devices selected
      fireEvent.click(screen.getByRole('button', { name: /Capture 3 Screenshots/ }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/screenshots'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"url":"http://localhost:3000"'),
          })
        );
      });
    });

    it('should display results after successful capture', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          screenshots: [
            { device: 'iPhone 14', path: '/screenshots/iphone.png', width: 390, height: 844 },
            { device: 'iPad', path: '/screenshots/ipad.png', width: 768, height: 1024 },
          ],
        }),
      });

      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      fireEvent.click(screen.getByRole('button', { name: /Capture 3 Screenshots/ }));

      await waitFor(() => {
        expect(screen.getByText('2 screenshots captured')).toBeInTheDocument();
      });
    });

    it('should show error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Browser not available' }),
      });

      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      fireEvent.click(screen.getByRole('button', { name: /Capture 3 Screenshots/ }));

      await waitFor(() => {
        expect(screen.getByText('Browser not available')).toBeInTheDocument();
      });
    });
  });

  describe('capturing with proxy URL (auth-protected sites)', () => {
    it('should send the proxy URL instead of current URL when proxy is active', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          screenshots: [{ device: 'iPhone 14', path: '/screenshots/iphone.png', width: 390, height: 844 }],
        }),
      });

      render(
        <ScreenshotPanel
          currentUrl="http://localhost:3000/dashboard"
          proxyUrl="http://localhost:5000/api/proxy/sess123/"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Capture 3 Screenshots/ }));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.url).toBe('http://localhost:5000/api/proxy/sess123/');
      });
    });

    it('should fall back to current URL when no proxy is set', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ screenshots: [] }),
      });

      render(
        <ScreenshotPanel
          currentUrl="http://localhost:3000/dashboard"
          proxyUrl={null}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Capture 3 Screenshots/ }));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.url).toBe('http://localhost:3000/dashboard');
      });
    });
  });

  describe('no URL entered', () => {
    it('should show help text when no URL is provided', () => {
      render(<ScreenshotPanel currentUrl="" />);

      expect(screen.getByText('Enter a URL first to enable screenshots.')).toBeInTheDocument();
    });

    it('should disable capture button when no URL', () => {
      render(<ScreenshotPanel currentUrl="" />);

      const captureBtn = screen.getByRole('button', { name: /Capture/ });
      expect(captureBtn).toBeDisabled();
    });
  });

  describe('full page option', () => {
    it('should send fullPage flag when checkbox is checked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ screenshots: [] }),
      });

      render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

      // Check the full page checkbox
      const checkbox = screen.getByLabelText('Full page capture');
      fireEvent.click(checkbox);

      fireEvent.click(screen.getByRole('button', { name: /Capture 3 Screenshots/ }));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.fullPage).toBe(true);
      });
    });
  });
});
