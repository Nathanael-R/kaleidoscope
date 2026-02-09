import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthWizard from '@/components/auth-wizard';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AuthWizard', () => {
  const defaultProps = {
    onAuthCapture: vi.fn(),
    onProxyUrl: vi.fn(),
    currentUrl: 'http://localhost:3000',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('initial state', () => {
    it('shows "Preview with Auth" button when collapsed', () => {
      render(<AuthWizard {...defaultProps} />);
      expect(screen.getByTestId('auth-wizard-toggle')).toHaveTextContent('Preview with Auth');
    });

    it('shows help text when no proxy session is active', () => {
      render(<AuthWizard {...defaultProps} />);
      expect(screen.getByText(/Preview pages that require login/)).toBeInTheDocument();
    });
  });

  describe('cookie entry', () => {
    it('expands wizard when toggle is clicked', () => {
      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      expect(screen.getByText('How it works:')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., session_token')).toBeInTheDocument();
    });

    it('disables Apply button when no cookies are entered', () => {
      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      expect(screen.getByTestId('auth-apply-button')).toBeDisabled();
    });

    it('enables Apply button when cookie name and value are entered', () => {
      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      fireEvent.change(screen.getByPlaceholderText('e.g., session_token'), {
        target: { value: 'session_id' },
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., abc123...'), {
        target: { value: 'my-secret-token' },
      });

      expect(screen.getByTestId('auth-apply-button')).not.toBeDisabled();
    });

    it('has Simple and Advanced tabs', () => {
      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      expect(screen.getByText('Simple')).toBeInTheDocument();
      expect(screen.getByText('Advanced')).toBeInTheDocument();
    });

    it('Advanced tab allows multiple cookies', () => {
      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      // Switch to advanced tab
      fireEvent.click(screen.getByText('Advanced'));

      // Should have "Add Cookie" button
      const addButton = screen.getByText('Add Cookie');
      expect(addButton).toBeInTheDocument();

      // Add a second cookie
      fireEvent.click(addButton);

      // Should now have 4 inputs (2 cookies × 2 fields each)
      const inputs = screen.getAllByPlaceholderText(/Cookie (name|value)/);
      expect(inputs).toHaveLength(4);
    });
  });

  describe('proxy session creation', () => {
    it('calls onAuthCapture with valid cookies on Apply', async () => {
      // Mock successful proxy creation
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            session: { id: 'sess-123', proxyUrl: '/api/proxy/sess-123', targetUrl: 'http://localhost:3000' },
          }),
        })
        .mockResolvedValueOnce({ ok: true }) // probe
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ authFailed: false }),
        }); // status

      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      fireEvent.change(screen.getByPlaceholderText('e.g., session_token'), {
        target: { value: 'token' },
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., abc123...'), {
        target: { value: 'secret' },
      });

      fireEvent.click(screen.getByTestId('auth-apply-button'));

      await waitFor(() => {
        expect(defaultProps.onAuthCapture).toHaveBeenCalledWith([
          { name: 'token', value: 'secret' },
        ]);
      });
    });

    it('creates proxy session and calls onProxyUrl on success', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            session: { id: 'sess-456', proxyUrl: '/api/proxy/sess-456', targetUrl: 'http://localhost:3000' },
          }),
        })
        .mockResolvedValueOnce({ ok: true }) // probe
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ authFailed: false }),
        });

      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      fireEvent.change(screen.getByPlaceholderText('e.g., session_token'), {
        target: { value: 'token' },
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., abc123...'), {
        target: { value: 'secret' },
      });

      fireEvent.click(screen.getByTestId('auth-apply-button'));

      await waitFor(() => {
        expect(defaultProps.onProxyUrl).toHaveBeenCalledWith(
          expect.stringContaining('/api/proxy/sess-456/'),
          expect.objectContaining({ id: 'sess-456', authFailed: false }),
        );
      });
    });

    it('shows "Proxy Active" after successful session creation', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            session: { id: 'sess-789', proxyUrl: '/api/proxy/sess-789', targetUrl: 'http://localhost:3000' },
          }),
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ authFailed: false }),
        });

      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      fireEvent.change(screen.getByPlaceholderText('e.g., session_token'), {
        target: { value: 'tok' },
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., abc123...'), {
        target: { value: 'val' },
      });

      fireEvent.click(screen.getByTestId('auth-apply-button'));

      await waitFor(() => {
        expect(screen.getByText('Proxy Active')).toBeInTheDocument();
      });
    });

    it('shows auth failure warning when server detects 401/403', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            session: { id: 'sess-fail', proxyUrl: '/api/proxy/sess-fail', targetUrl: 'http://localhost:3000' },
          }),
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ authFailed: true }),
        });

      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      fireEvent.change(screen.getByPlaceholderText('e.g., session_token'), {
        target: { value: 'bad' },
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., abc123...'), {
        target: { value: 'cookie' },
      });

      fireEvent.click(screen.getByTestId('auth-apply-button'));

      await waitFor(() => {
        expect(screen.getByText('Auth Failed - Reconfigure')).toBeInTheDocument();
      });

      // Mock data panel should auto-expand on auth failure
      expect(screen.getByText(/mock API responses/i)).toBeInTheDocument();
    });

    it('shows error when proxy creation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'URL is not allowed' }),
      });

      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      fireEvent.change(screen.getByPlaceholderText('e.g., session_token'), {
        target: { value: 'tok' },
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., abc123...'), {
        target: { value: 'val' },
      });

      fireEvent.click(screen.getByTestId('auth-apply-button'));

      await waitFor(() => {
        expect(screen.getByText('URL is not allowed')).toBeInTheDocument();
      });
    });
  });

  describe('mock data injection', () => {
    // Helper: create a proxy session so the mock panel becomes available
    async function setupProxySession() {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            session: { id: 'mock-sess', proxyUrl: '/api/proxy/mock-sess', targetUrl: 'http://localhost:3000' },
          }),
        })
        .mockResolvedValueOnce({ ok: true }) // probe
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ authFailed: false }),
        }); // status

      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      fireEvent.change(screen.getByPlaceholderText('e.g., session_token'), {
        target: { value: 'tok' },
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., abc123...'), {
        target: { value: 'val' },
      });
      fireEvent.click(screen.getByTestId('auth-apply-button'));

      await waitFor(() => {
        expect(screen.getByText('Proxy Active')).toBeInTheDocument();
      });
    }

    it('shows "Inject Mock Data" toggle after proxy is active', async () => {
      await setupProxySession();

      expect(screen.getByText('Inject Mock Data')).toBeInTheDocument();
    });

    it('expands mock panel when "Inject Mock Data" is clicked', async () => {
      await setupProxySession();

      fireEvent.click(screen.getByText('Inject Mock Data'));

      expect(screen.getByText(/mock API responses/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/\/api\/users/)).toBeInTheDocument();
    });

    it('collapses mock panel toggle text changes to "Hide Mock Data"', async () => {
      await setupProxySession();

      fireEvent.click(screen.getByText('Inject Mock Data'));

      expect(screen.getByText('Hide Mock Data')).toBeInTheDocument();
    });

    it('adds a new mock route when "Add Route" is clicked', async () => {
      await setupProxySession();

      fireEvent.click(screen.getByText('Inject Mock Data'));

      fireEvent.click(screen.getByText('Add Route'));

      // Should now have 2 route pattern inputs
      const inputs = screen.getAllByPlaceholderText(/\/api\/users/);
      expect(inputs).toHaveLength(2);
    });

    it('disables Inject button when no pattern/response entered', async () => {
      await setupProxySession();

      fireEvent.click(screen.getByText('Inject Mock Data'));

      expect(screen.getByText('Inject Mocks')).toBeDisabled();
    });

    it('enables Inject button when pattern and response are filled', async () => {
      await setupProxySession();

      fireEvent.click(screen.getByText('Inject Mock Data'));

      fireEvent.change(screen.getByPlaceholderText(/\/api\/users/), {
        target: { value: '/api/users' },
      });
      fireEvent.change(screen.getByPlaceholderText(/{"users"/), {
        target: { value: '{"users": []}' },
      });

      expect(screen.getByText('Inject Mocks')).not.toBeDisabled();
    });

    it('calls mock API and shows success message on inject', async () => {
      await setupProxySession();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mockCount: 1 }),
      });

      fireEvent.click(screen.getByText('Inject Mock Data'));

      fireEvent.change(screen.getByPlaceholderText(/\/api\/users/), {
        target: { value: '/api/users' },
      });
      fireEvent.change(screen.getByPlaceholderText(/{"users"/), {
        target: { value: '{"users": [{"id":1}]}' },
      });

      fireEvent.click(screen.getByText('Inject Mocks'));

      await waitFor(() => {
        expect(screen.getByText(/1 mock route\(s\) active/)).toBeInTheDocument();
      });

      // Verify the API was called correctly
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toContain('/api/proxy/session/mock-sess/mock');
      expect(lastCall[1].method).toBe('POST');
    });

    it('shows "Clear Mocks" button after successful inject', async () => {
      await setupProxySession();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mockCount: 2 }),
      });

      fireEvent.click(screen.getByText('Inject Mock Data'));

      fireEvent.change(screen.getByPlaceholderText(/\/api\/users/), {
        target: { value: '/api/data' },
      });
      fireEvent.change(screen.getByPlaceholderText(/{"users"/), {
        target: { value: '{}' },
      });

      fireEvent.click(screen.getByText('Inject Mocks'));

      await waitFor(() => {
        expect(screen.getByText('Clear Mocks')).toBeInTheDocument();
      });
    });

    it('clears mocks and resets UI when "Clear Mocks" is clicked', async () => {
      await setupProxySession();
      // Mock inject success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mockCount: 1 }),
      });

      fireEvent.click(screen.getByText('Inject Mock Data'));

      fireEvent.change(screen.getByPlaceholderText(/\/api\/users/), {
        target: { value: '/api/data' },
      });
      fireEvent.change(screen.getByPlaceholderText(/{"users"/), {
        target: { value: '{}' },
      });

      fireEvent.click(screen.getByText('Inject Mocks'));

      await waitFor(() => {
        expect(screen.getByText('Clear Mocks')).toBeInTheDocument();
      });

      // Mock clear DELETE call
      mockFetch.mockResolvedValueOnce({ ok: true });

      fireEvent.click(screen.getByText('Clear Mocks'));

      await waitFor(() => {
        expect(screen.queryByText(/mock route\(s\) active/)).not.toBeInTheDocument();
      });
    });

    it('stores error when mock injection API fails (visible when wizard expanded)', async () => {
      await setupProxySession();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Session expired' }),
      });

      fireEvent.click(screen.getByText('Inject Mock Data'));

      fireEvent.change(screen.getByPlaceholderText(/\/api\/users/), {
        target: { value: '/api/users' },
      });
      fireEvent.change(screen.getByPlaceholderText(/{"users"/), {
        target: { value: '[]' },
      });

      fireEvent.click(screen.getByText('Inject Mocks'));

      // Wait for the error to be stored, then expand wizard to see it
      await waitFor(() => {
        fireEvent.click(screen.getByTestId('auth-wizard-toggle'));
        expect(screen.getByText('Session expired')).toBeInTheDocument();
      });
    });

    it('triggers proxy reload after successful mock inject', async () => {
      await setupProxySession();
      defaultProps.onProxyUrl.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mockCount: 1 }),
      });

      fireEvent.click(screen.getByText('Inject Mock Data'));

      fireEvent.change(screen.getByPlaceholderText(/\/api\/users/), {
        target: { value: '/api/data' },
      });
      fireEvent.change(screen.getByPlaceholderText(/{"users"/), {
        target: { value: '{}' },
      });

      fireEvent.click(screen.getByText('Inject Mocks'));

      await waitFor(() => {
        // onProxyUrl should be called again to trigger iframe reload
        expect(defaultProps.onProxyUrl).toHaveBeenCalledWith(
          expect.stringContaining('/api/proxy/mock-sess/'),
          expect.objectContaining({ id: 'mock-sess' }),
        );
      });
    });
  });

  describe('clear', () => {
    it('resets everything when Clear is clicked', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            session: { id: 's1', proxyUrl: '/api/proxy/s1', targetUrl: 'http://localhost:3000' },
          }),
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ authFailed: false }),
        });

      render(<AuthWizard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));

      fireEvent.change(screen.getByPlaceholderText('e.g., session_token'), {
        target: { value: 'tok' },
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., abc123...'), {
        target: { value: 'val' },
      });
      fireEvent.click(screen.getByTestId('auth-apply-button'));

      await waitFor(() => {
        expect(screen.getByText('Proxy Active')).toBeInTheDocument();
      });

      // Now expand and clear
      fireEvent.click(screen.getByTestId('auth-wizard-toggle'));
      fireEvent.click(screen.getByText('Clear'));

      expect(defaultProps.onProxyUrl).toHaveBeenLastCalledWith(null, null);
      expect(defaultProps.onAuthCapture).toHaveBeenLastCalledWith([]);
    });
  });
});
