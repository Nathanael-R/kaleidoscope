import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScreenshotPanel from '@/components/screenshot-panel';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ScreenshotPanel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders with device selection options', () => {
    render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

    expect(screen.getByText('iPhone 14')).toBeDefined();
    expect(screen.getByText('iPad')).toBeDefined();
    expect(screen.getByText('Desktop HD')).toBeDefined();
  });

  it('shows disabled state when no URL provided', () => {
    render(<ScreenshotPanel currentUrl="" />);

    expect(screen.getByText('Enter a URL first to enable screenshots.')).toBeDefined();
  });

  it('has 3 default selected devices', () => {
    render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

    const captureButton = screen.getByRole('button', { name: /capture 3 screenshots/i });
    expect(captureButton).toBeDefined();
  });

  it('toggles device selection when clicked', () => {
    render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

    // Click to deselect iPhone 14 (one of the defaults)
    fireEvent.click(screen.getByText('iPhone 14'));

    const captureButton = screen.getByRole('button', { name: /capture 2 screenshots/i });
    expect(captureButton).toBeDefined();
  });

  it('selects all devices when "All" is clicked', () => {
    render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByText('All'));

    const captureButton = screen.getByRole('button', { name: /capture 8 screenshots/i });
    expect(captureButton).toBeDefined();
  });

  it('clears all devices when "None" is clicked', () => {
    render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByText('None'));

    const captureButton = screen.getByRole('button', { name: /capture 0 screenshots/i });
    expect(captureButton).toBeDisabled();
  });

  it('calls screenshot API when capture is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        screenshots: [
          { device: 'iPhone 14', path: '/screenshots/iphone-14-123.png', width: 390, height: 844 },
          { device: 'iPad', path: '/screenshots/ipad-123.png', width: 768, height: 1024 },
          { device: 'Desktop HD', path: '/screenshots/desktop-123.png', width: 1920, height: 1080 },
        ],
      }),
    });

    render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByRole('button', { name: /capture 3 screenshots/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/screenshots',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('3 screenshots captured')).toBeDefined();
    });
  });

  it('shows error when screenshot API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Chromium not found' }),
    });

    render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByRole('button', { name: /capture 3 screenshots/i }));

    await waitFor(() => {
      expect(screen.getByText('Chromium not found')).toBeDefined();
    });
  });

  it('toggles full page capture option', () => {
    render(<ScreenshotPanel currentUrl="http://localhost:3000" />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
