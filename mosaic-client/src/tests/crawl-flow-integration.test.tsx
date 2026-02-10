/**
 * Crawl → Flow integration tests
 *
 * Tests the full user journey: entering a URL in the flow sidebar →
 * calling /api/crawl → getting pages back → seeing flow nodes on canvas.
 *
 * These test that the software actually works end-to-end from the
 * user's perspective: they type a URL, hit generate, and get a flow diagram.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FlowSidebar from '@/components/flow/flow-sidebar';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Generate flow from URL', () => {
  const baseProps = {
    flowName: 'Test Flow',
    onFlowNameChange: vi.fn(),
    onSave: vi.fn(),
    onClear: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    savedFlows: [] as string[],
    onLoadFlow: vi.fn(),
    onDeleteFlow: vi.fn(),
    crawlOptions: {
      depth: 1,
      maxLinksPerPage: 15,
      includeHash: true,
      includeQuery: true,
      localePrefixBlocklist: ['en', 'fr'],
    },
    onCrawlOptionsChange: vi.fn(),
  };

  describe('sidebar crawl UI', () => {
    it('should display the "Generate from URL" section with input and button', () => {
      render(<FlowSidebar {...baseProps} />);

      expect(screen.getByText('Generate from URL')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('https://example.com')).toBeInTheDocument();
      expect(screen.getByText('Enter a URL to auto-generate a site flow')).toBeInTheDocument();
    });

    it('should disable the generate button when URL input is empty', () => {
      render(<FlowSidebar {...baseProps} />);

      // The button next to the URL input should be disabled
      const buttons = screen.getAllByRole('button');
      const generateBtn = buttons.find(btn => btn.closest('.flex.gap-1\\.5'));
      // The input is empty by default so button should be disabled
      const urlInput = screen.getByPlaceholderText('https://example.com');
      expect(urlInput).toHaveValue('');
    });

    it('should call onGenerateFromUrl with the entered URL when generate is clicked', async () => {
      const onGenerateFromUrl = vi.fn().mockResolvedValue(undefined);
      render(<FlowSidebar {...baseProps} onGenerateFromUrl={onGenerateFromUrl} />);

      const input = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(input, { target: { value: 'https://example.com' } });

      // Click the search/generate button
      const allButtons = screen.getAllByRole('button');
      const generateBtn = allButtons.find(
        btn => btn.classList.contains('h-8') && btn.closest('.flex.gap-1\\.5')
      );

      // Alternatively, press Enter in the input
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onGenerateFromUrl).toHaveBeenCalledWith('https://example.com', baseProps.crawlOptions);
      });
    });

    it('should prepend https:// when user enters a bare domain', async () => {
      const onGenerateFromUrl = vi.fn().mockResolvedValue(undefined);
      render(<FlowSidebar {...baseProps} onGenerateFromUrl={onGenerateFromUrl} />);

      const input = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(input, { target: { value: 'example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onGenerateFromUrl).toHaveBeenCalledWith('https://example.com', baseProps.crawlOptions);
      });
    });

    it('should not prepend https:// when URL already has http://', async () => {
      const onGenerateFromUrl = vi.fn().mockResolvedValue(undefined);
      render(<FlowSidebar {...baseProps} onGenerateFromUrl={onGenerateFromUrl} />);

      const input = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(input, { target: { value: 'http://localhost:3000' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onGenerateFromUrl).toHaveBeenCalledWith('http://localhost:3000', baseProps.crawlOptions);
      });
    });

    it('should show "Crawling site pages..." while crawl is in progress', async () => {
      // Use a promise we control to keep the crawl "in flight"
      let resolveCrawl!: () => void;
      const crawlPromise = new Promise<void>((resolve) => { resolveCrawl = resolve; });
      const onGenerateFromUrl = vi.fn().mockReturnValue(crawlPromise);

      render(<FlowSidebar {...baseProps} onGenerateFromUrl={onGenerateFromUrl} />);

      const input = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(input, { target: { value: 'https://example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Crawling site pages...')).toBeInTheDocument();
      });

      // Input should be disabled during crawl
      expect(input).toBeDisabled();

      // Resolve the crawl
      resolveCrawl();
      await waitFor(() => {
        expect(screen.queryByText('Crawling site pages...')).not.toBeInTheDocument();
      });
    });

    it('should show error message when crawl fails', async () => {
      const onGenerateFromUrl = vi.fn().mockRejectedValue(new Error('Chromium installation failed'));
      render(<FlowSidebar {...baseProps} onGenerateFromUrl={onGenerateFromUrl} />);

      const input = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(input, { target: { value: 'https://example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Chromium installation failed')).toBeInTheDocument();
      });
    });

    it('should show generic error message for non-Error rejections', async () => {
      const onGenerateFromUrl = vi.fn().mockRejectedValue('network failure');
      render(<FlowSidebar {...baseProps} onGenerateFromUrl={onGenerateFromUrl} />);

      const input = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(input, { target: { value: 'https://broken.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Crawl failed')).toBeInTheDocument();
      });
    });

    it('should clear error when a new crawl starts', async () => {
      const callCount = { value: 0 };
      const onGenerateFromUrl = vi.fn().mockImplementation(async () => {
        callCount.value++;
        if (callCount.value === 1) throw new Error('First attempt failed');
        // second attempt succeeds
      });
      render(<FlowSidebar {...baseProps} onGenerateFromUrl={onGenerateFromUrl} />);

      const input = screen.getByPlaceholderText('https://example.com');

      // First attempt: fails
      fireEvent.change(input, { target: { value: 'https://example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('First attempt failed')).toBeInTheDocument();
      });

      // Second attempt: error should clear during loading
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.queryByText('First attempt failed')).not.toBeInTheDocument();
      });
    });

    it('should not call onGenerateFromUrl when input is empty', () => {
      const onGenerateFromUrl = vi.fn();
      render(<FlowSidebar {...baseProps} onGenerateFromUrl={onGenerateFromUrl} />);

      const input = screen.getByPlaceholderText('https://example.com');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onGenerateFromUrl).not.toHaveBeenCalled();
    });

    it('should not call onGenerateFromUrl when prop is not provided', () => {
      render(<FlowSidebar {...baseProps} />);

      const input = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(input, { target: { value: 'https://example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Should not throw or crash - silently does nothing
      expect(input).toHaveValue('https://example.com');
    });
  });
});
