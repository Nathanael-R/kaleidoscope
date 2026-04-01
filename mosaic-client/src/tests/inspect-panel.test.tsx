import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InspectPanel from '@/components/inspect-panel';
import type { InspectResult } from '@/lib/inspect';

const defaultProps = {
  currentUrl: 'http://localhost:3000',
  viewMode: 'single' as const,
  enabled: false,
  pending: false,
  resolving: false,
  sourceDir: '',
  onSourceDirChange: vi.fn(),
  onToggle: vi.fn(),
  result: null as InspectResult | null,
  error: null as string | null,
};

function createInspectResult(overrides: Partial<InspectResult> = {}): InspectResult {
  return {
    capability: 'supported',
    resolver: 'element-source',
    confidence: 'exact',
    page: {
      title: 'Checkout',
      url: 'http://localhost:3000/checkout',
    },
    device: {
      id: 'iphone-16',
      name: 'iPhone 16',
      type: 'mobile',
      width: 393,
      height: 852,
    },
    selector: '#save',
    tagName: 'button',
    text: 'Save',
    componentName: 'SaveButton',
    source: {
      filePath: 'src/App.tsx',
      lineNumber: 12,
      columnNumber: 4,
      code: 'return <button id="save">Save</button>;',
      context: {
        startLine: 10,
        endLine: 12,
        focusLine: 12,
        snippet: ['  const ready = true;', '  const label = "Save";', '  return <button id="save">Save</button>;'].join('\n'),
      },
      kind: 'exact',
    },
    stack: [],
    diagnostics: [],
    ...overrides,
  };
}

describe('InspectPanel', () => {
  it('shows a local-only warning for public URLs', () => {
    render(<InspectPanel {...defaultProps} currentUrl="https://example.com" />);

    expect(screen.getByText(/limited to loopback targets/i)).toBeInTheDocument();
    expect(screen.getByTestId('inspect-toggle')).toBeDisabled();
  });

  it('shows a single-view warning when comparison mode is active', () => {
    render(<InspectPanel {...defaultProps} viewMode="comparison" />);

    expect(screen.getByText(/only available in single device view/i)).toBeInTheDocument();
  });

  it('explains that project path is only a fallback', () => {
    render(<InspectPanel {...defaultProps} />);

    expect(screen.getByText(/start inspect mode directly from the loaded local url/i)).toBeInTheDocument();
    expect(screen.getByTestId('inspect-source-dir-help')).toHaveTextContent(/leave this empty unless kaleidoscope cannot map/i);
    expect(screen.getByTestId('inspect-toggle')).toBeEnabled();
  });

  it('renders exact result details when a source is resolved', () => {
    render(
      <InspectPanel
        {...defaultProps}
        result={createInspectResult()}
      />
    );

    expect(screen.getByText('SaveButton')).toBeInTheDocument();
    expect(screen.getByText('Exact Source')).toBeInTheDocument();
    expect(screen.getByTestId('inspect-source-path')).toHaveTextContent('src/App.tsx:12:4');
    expect(screen.getByText('Checkout')).toBeInTheDocument();
    expect(screen.getByTestId('inspect-page-url')).toHaveTextContent('http://localhost:3000/checkout');
    expect(screen.getByText(/iPhone 16/i)).toBeInTheDocument();
    expect(screen.getByTestId('inspect-result')).toHaveTextContent(/12 \|\s+return <button id="save">Save<\/button>;/);
  });

  it('copies a structured LLM payload when requested', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(
      <InspectPanel
        {...defaultProps}
        result={createInspectResult()}
      />
    );

    expect(screen.queryByTestId('inspect-issue-input')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('inspect-copy-llm'));

    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByTestId('inspect-issue-input')).toBeInTheDocument();

    await user.type(screen.getByTestId('inspect-issue-input'), 'The save button wraps and clips on iPhone 16.');
    await user.click(screen.getByTestId('inspect-copy-llm'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain('## Reported Problem');
    expect(writeText.mock.calls[0]?.[0]).toContain('The save button wraps and clips on iPhone 16.');
    expect(writeText.mock.calls[0]?.[0]).toContain('- Device: iPhone 16 (393x852, mobile)');
    expect(writeText.mock.calls[0]?.[0]).toContain('- File: src/App.tsx:12:4');
    expect(writeText.mock.calls[0]?.[0]).not.toContain('## Page');

    vi.unstubAllGlobals();
  });

  it('copies a structured JSON payload when requested', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(
      <InspectPanel
        {...defaultProps}
        result={createInspectResult()}
      />
    );

    await user.click(screen.getByTestId('inspect-copy-json'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(writeText.mock.calls[0]?.[0] ?? '{}') as {
      device?: { id?: string };
      element?: { selector?: string };
      source?: { location?: string };
    };

    expect(payload.device?.id).toBe('iphone-16');
    expect(payload.element?.selector).toBe('#save');
    expect(payload.source?.location).toBe('src/App.tsx:12:4');

    vi.unstubAllGlobals();
  });
});