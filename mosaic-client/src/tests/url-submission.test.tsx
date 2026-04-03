import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/screenshot-panel', () => ({
  default: ({ currentUrl }: { currentUrl: string }) => (
    <div data-testid="screenshot-panel-current-url">{currentUrl}</div>
  ),
}));

import Sidebar from '@/components/sidebar';
import { devices } from '@/lib/devices';

// Mock fetch to prevent real API calls from child components
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('URL submission', () => {
  const defaultProps = {
    deviceControls: {
      selectedDevice: devices[0],
      onDeviceSelect: vi.fn(),
      pinnedDevices: [] as typeof devices,
      onDevicePin: vi.fn(),
    },
    previewControls: {
      currentUrl: '',
      onUrlChange: vi.fn(),
      onLoadUrl: vi.fn(),
      viewMode: 'single' as const,
      onViewModeToggle: vi.fn(),
    },
    inspectControls: {
      enabled: false,
      pending: false,
      resolving: false,
      result: null,
      error: null,
      sourceDir: '',
      onSourceDirChange: vi.fn(),
      onToggle: vi.fn(),
    },
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('protocol auto-prepend', () => {
    it('defaults to local mode for a blank sidebar', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByTestId('url-mode-local')).toHaveClass('bg-white');
      expect(screen.getByTestId('url-mode-production')).not.toHaveClass('bg-white');
      expect(screen.getByTestId('input-url')).toHaveAttribute('placeholder', 'localhost:3000 or just 3000');
    });

    it('prepends https:// to bare production domains', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByTestId('url-mode-production'));
      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: 'beautifulteachers.com' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledWith('https://beautifulteachers.com');
      expect(defaultProps.previewControls.onUrlChange).toHaveBeenCalledWith('https://beautifulteachers.com');
      expect(defaultProps.previewControls.onLoadUrl).not.toHaveBeenCalledWith('https://www.beautifulteachers.com');
    });

    it('keeps http:// URLs unchanged', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByTestId('url-mode-production'));
      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: 'http://localhost:3000' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('keeps https:// URLs unchanged', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByTestId('url-mode-production'));
      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: 'https://mysite.com/dashboard' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledWith('https://mysite.com/dashboard');
    });

    it('uses http:// for localhost targets in local mode', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByTestId('url-mode-local'));
      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: 'localhost:3000' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledWith('http://localhost:3000');
      expect(defaultProps.previewControls.onUrlChange).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('turns a bare local port into a localhost URL in local mode', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: '3000' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('passes a normalized local URL into the screenshot panel', async () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: '3000' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('screenshot-panel-current-url')).toHaveTextContent('http://localhost:3000');
      });
    });
  });

  describe('submission triggers', () => {
    it('submits URL when Enter is pressed', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      const input = screen.getByTestId('input-url');
      fireEvent.change(input, { target: { value: 'http://localhost:3000' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('submits URL when arrow button is clicked', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: 'http://localhost:3000' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('does not submit empty URL', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(defaultProps.previewControls.onLoadUrl).not.toHaveBeenCalled();
    });

    it('trims whitespace from URL before submitting', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: '  http://localhost:3000  ' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledWith('http://localhost:3000');
    });
  });

  describe('recent URLs', () => {
    it('hides recent URLs section when no recent URLs exist', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });
      expect(screen.queryByTestId('recent-urls-list')).not.toBeInTheDocument();
    });

    it('populates recent URLs after submission', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: 'http://localhost:3000' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      expect(screen.getByTestId('recent-urls-list')).toBeInTheDocument();
      expect(screen.getByText('localhost')).toBeInTheDocument();
    });

    it('loads recent URL when clicked', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      // First submit a URL to add to recents
      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: 'http://localhost:3000' },
      });
      fireEvent.click(screen.getByTestId('button-load-url'));

      // Click the recent URL
      fireEvent.click(screen.getByTestId('recent-url-0'));

      // onLoadUrl should be called twice: once for submit, once for recent click
      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenCalledTimes(2);
      expect(defaultProps.previewControls.onLoadUrl).toHaveBeenLastCalledWith('http://localhost:3000');
    });
  });

  describe('auth section visibility', () => {
    it('keeps auth wizard hidden when no URL is entered', () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });
      expect(screen.queryByTestId('auth-wizard-toggle')).not.toBeInTheDocument();
    });

    it('keeps auth wizard hidden after URL is entered', async () => {
      render(<Sidebar {...defaultProps} />, { wrapper: createWrapper() });

      fireEvent.change(screen.getByTestId('input-url'), {
        target: { value: 'http://localhost:3000' },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('auth-wizard-toggle')).not.toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('collapsed state', () => {
    it('shows only device icons when collapsed', () => {
      render(<Sidebar {...defaultProps} isCollapsed={true} />, { wrapper: createWrapper() });

      expect(screen.queryByTestId('input-url')).not.toBeInTheDocument();
      expect(screen.getByTestId('button-expand-sidebar')).toBeInTheDocument();
    });

    it('shows device buttons in collapsed mode', () => {
      render(<Sidebar {...defaultProps} isCollapsed={true} />, { wrapper: createWrapper() });

      expect(screen.getByTestId(`device-${devices[0].id}-collapsed`)).toBeInTheDocument();
    });
  });
});
