/**
 * Tunnel feature — behavioral tests
 *
 * Tests the complete flow: user clicks Enable Tunnel → API creates tunnel →
 * public URL displayed → user copies URL → user closes tunnel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TunnelButton from '@/components/tunnel-button';

// Mock the useTunnel hook so we can control tunnel state
const mockUseTunnel = vi.fn();
vi.mock('@/hooks/use-tunnel', () => ({
  useTunnel: (port: number) => mockUseTunnel(port),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTunnel.mockReturnValue({
    isActive: false,
    tunnelUrl: null,
    isLoading: false,
    isCreating: false,
    isClosing: false,
    createError: null,
    createTunnel: vi.fn(),
    closeTunnel: vi.fn(),
  });
});

describe('Tunnel feature', () => {
  describe('inactive state', () => {
    it('should show "Enable Tunnel" button when no tunnel is active', () => {
      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByTestId('tunnel-toggle-button')).toHaveTextContent('Enable Tunnel');
    });

    it('should show help text explaining what tunnel does', () => {
      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByText('Create a public URL to share your localhost:3000')).toBeInTheDocument();
    });

    it('should not show URL display or copy buttons', () => {
      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.queryByText('Public URL:')).not.toBeInTheDocument();
    });
  });

  describe('creating a tunnel', () => {
    it('should call createTunnel with the correct port when clicked', async () => {
      const createTunnel = vi.fn().mockResolvedValue({});
      mockUseTunnel.mockReturnValue({
        isActive: false,
        tunnelUrl: null,
        isLoading: false,
        isCreating: false,
        isClosing: false,
        createError: null,
        createTunnel,
        closeTunnel: vi.fn(),
      });

      renderWithQuery(<TunnelButton port={3000} />);

      fireEvent.click(screen.getByTestId('tunnel-toggle-button'));

      expect(createTunnel).toHaveBeenCalledWith({ port: 3000 });
    });

    it('should show "Creating Tunnel..." while tunnel is being created', () => {
      mockUseTunnel.mockReturnValue({
        isActive: false,
        tunnelUrl: null,
        isLoading: false,
        isCreating: true,
        isClosing: false,
        createError: null,
        createTunnel: vi.fn(),
        closeTunnel: vi.fn(),
      });

      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByText('Creating Tunnel...')).toBeInTheDocument();
      expect(screen.getByTestId('tunnel-toggle-button')).toBeDisabled();
    });
  });

  describe('active tunnel', () => {
    beforeEach(() => {
      mockUseTunnel.mockReturnValue({
        isActive: true,
        tunnelUrl: 'https://my-app.loca.lt',
        isLoading: false,
        isCreating: false,
        isClosing: false,
        createError: null,
        createTunnel: vi.fn(),
        closeTunnel: vi.fn(),
      });
    });

    it('should show "Tunnel Active" when tunnel is running', () => {
      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByTestId('tunnel-toggle-button')).toHaveTextContent('Tunnel Active');
    });

    it('should display the public tunnel URL', () => {
      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByText('https://my-app.loca.lt')).toBeInTheDocument();
      expect(screen.getByText('Public URL:')).toBeInTheDocument();
    });

    it('should show share instructions', () => {
      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByText('Share this URL to preview your localhost on any device')).toBeInTheDocument();
    });

    it('should copy URL to clipboard when copy button is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

      renderWithQuery(<TunnelButton port={3000} />);

      fireEvent.click(screen.getByTitle('Copy URL'));

      expect(writeText).toHaveBeenCalledWith('https://my-app.loca.lt');

      vi.unstubAllGlobals();
    });

    it('should open URL in new tab when open button is clicked', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      renderWithQuery(<TunnelButton port={3000} />);

      fireEvent.click(screen.getByTitle('Open in new tab'));

      expect(openSpy).toHaveBeenCalledWith('https://my-app.loca.lt', '_blank');
      openSpy.mockRestore();
    });
  });

  describe('closing a tunnel', () => {
    it('should call closeTunnel when active tunnel button is clicked', () => {
      const closeTunnel = vi.fn().mockResolvedValue(undefined);
      mockUseTunnel.mockReturnValue({
        isActive: true,
        tunnelUrl: 'https://my-app.loca.lt',
        isLoading: false,
        isCreating: false,
        isClosing: false,
        createError: null,
        createTunnel: vi.fn(),
        closeTunnel,
      });

      renderWithQuery(<TunnelButton port={3000} />);

      fireEvent.click(screen.getByTestId('tunnel-toggle-button'));

      expect(closeTunnel).toHaveBeenCalledWith(3000);
    });

    it('should show "Closing..." while tunnel is shutting down', () => {
      mockUseTunnel.mockReturnValue({
        isActive: true,
        tunnelUrl: 'https://my-app.loca.lt',
        isLoading: false,
        isCreating: false,
        isClosing: true,
        createError: null,
        createTunnel: vi.fn(),
        closeTunnel: vi.fn(),
      });

      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByText('Closing...')).toBeInTheDocument();
      expect(screen.getByTestId('tunnel-toggle-button')).toBeDisabled();
    });
  });

  describe('error handling', () => {
    it('should display error message when tunnel creation fails', () => {
      mockUseTunnel.mockReturnValue({
        isActive: false,
        tunnelUrl: null,
        isLoading: false,
        isCreating: false,
        isClosing: false,
        createError: new Error('localtunnel connection refused'),
        createTunnel: vi.fn(),
        closeTunnel: vi.fn(),
      });

      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByText('localtunnel connection refused')).toBeInTheDocument();
    });

    it('should show generic error for non-Error objects', () => {
      mockUseTunnel.mockReturnValue({
        isActive: false,
        tunnelUrl: null,
        isLoading: false,
        isCreating: false,
        isClosing: false,
        createError: 'unknown error',
        createTunnel: vi.fn(),
        closeTunnel: vi.fn(),
      });

      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.getByText('Failed to create tunnel')).toBeInTheDocument();
    });

    it('should not show help text when there is an error', () => {
      mockUseTunnel.mockReturnValue({
        isActive: false,
        tunnelUrl: null,
        isLoading: false,
        isCreating: false,
        isClosing: false,
        createError: new Error('Network error'),
        createTunnel: vi.fn(),
        closeTunnel: vi.fn(),
      });

      renderWithQuery(<TunnelButton port={3000} />);

      expect(screen.queryByText(/Create a public URL/)).not.toBeInTheDocument();
    });
  });

  describe('port handling', () => {
    it('should pass the correct port to useTunnel', () => {
      renderWithQuery(<TunnelButton port={8080} />);

      expect(mockUseTunnel).toHaveBeenCalledWith(8080);
    });

    it('should show the port in help text', () => {
      renderWithQuery(<TunnelButton port={8080} />);

      expect(screen.getByText('Create a public URL to share your localhost:8080')).toBeInTheDocument();
    });
  });
});
