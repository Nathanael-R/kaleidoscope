import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders exact result details when a source is resolved', () => {
    render(
      <InspectPanel
        {...defaultProps}
        result={{
          capability: 'supported',
          resolver: 'element-source',
          confidence: 'exact',
          selector: '#save',
          tagName: 'button',
          text: 'Save',
          componentName: 'SaveButton',
          source: {
            filePath: 'src/App.tsx',
            lineNumber: 12,
            columnNumber: 4,
            code: 'return <button id="save">Save</button>;',
            kind: 'exact',
          },
          stack: [],
          diagnostics: [],
        }}
      />
    );

    expect(screen.getByText('SaveButton')).toBeInTheDocument();
    expect(screen.getByText('Exact Source')).toBeInTheDocument();
    expect(screen.getByTestId('inspect-source-path')).toHaveTextContent('src/App.tsx:12:4');
    expect(screen.getByText('return <button id="save">Save</button>;')).toBeInTheDocument();
  });
});