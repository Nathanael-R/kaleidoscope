import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from '@/pages/home';
import { devices } from '@/lib/devices';

// Mock fetch to prevent real API calls from child components
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>
  );
}

describe('Keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Ensure sidebar stays expanded (not mobile width)
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('selects next device on ArrowRight', () => {
    renderHome();

    // Initially first device is selected
    expect(screen.getByTestId(`device-${devices[0].id}`)).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(screen.getByTestId(`device-${devices[1].id}`)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId(`device-${devices[0].id}`)).toHaveAttribute('aria-selected', 'false');
  });

  it('selects next device on ArrowDown', () => {
    renderHome();

    fireEvent.keyDown(document, { key: 'ArrowDown' });

    expect(screen.getByTestId(`device-${devices[1].id}`)).toHaveAttribute('aria-selected', 'true');
  });

  it('selects previous device on ArrowLeft', () => {
    renderHome();

    // Move forward first
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByTestId(`device-${devices[1].id}`)).toHaveAttribute('aria-selected', 'true');

    // Move back
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByTestId(`device-${devices[0].id}`)).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps from last device to first on ArrowRight', () => {
    renderHome();

    // Navigate to last device
    for (let i = 0; i < devices.length - 1; i++) {
      fireEvent.keyDown(document, { key: 'ArrowRight' });
    }

    const lastDevice = devices[devices.length - 1];
    expect(screen.getByTestId(`device-${lastDevice.id}`)).toHaveAttribute('aria-selected', 'true');

    // One more should wrap to first
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByTestId(`device-${devices[0].id}`)).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps from first device to last on ArrowLeft', () => {
    renderHome();

    // First device is selected, press ArrowLeft
    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    const lastDevice = devices[devices.length - 1];
    expect(screen.getByTestId(`device-${lastDevice.id}`)).toHaveAttribute('aria-selected', 'true');
  });

  it('pins current device on Space', () => {
    renderHome();

    fireEvent.keyDown(document, { key: ' ' });

    // Should show pinned count
    expect(screen.getByText(/1 pinned device/)).toBeInTheDocument();
  });

  it('unpins device on second Space press', () => {
    renderHome();

    // Pin
    fireEvent.keyDown(document, { key: ' ' });
    expect(screen.getByText(/1 pinned device/)).toBeInTheDocument();

    // Unpin
    fireEvent.keyDown(document, { key: ' ' });
    expect(screen.queryByText(/pinned device/)).not.toBeInTheDocument();
  });

  it('toggles comparison mode on C key', () => {
    renderHome();

    fireEvent.keyDown(document, { key: 'c' });

    expect(screen.getByTestId('toggle-comparison-mode')).toHaveTextContent('On');
  });

  it('toggles comparison mode back off on second C press', () => {
    renderHome();

    fireEvent.keyDown(document, { key: 'c' });
    expect(screen.getByTestId('toggle-comparison-mode')).toHaveTextContent('On');

    fireEvent.keyDown(document, { key: 'c' });
    expect(screen.getByTestId('toggle-comparison-mode')).toHaveTextContent('Off');
  });

  it('does not handle keys when typing in URL input', () => {
    renderHome();

    const urlInput = screen.getByTestId('input-url');

    // Focus the input and type 'c'
    fireEvent.keyDown(urlInput, { key: 'c' });

    // Comparison mode should still be off
    expect(screen.getByTestId('toggle-comparison-mode')).toHaveTextContent('Off');
  });

  it('does not handle Ctrl+C as comparison toggle', () => {
    renderHome();

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true });

    // Should not toggle comparison mode (Ctrl+C is copy)
    expect(screen.getByTestId('toggle-comparison-mode')).toHaveTextContent('Off');
  });
});
