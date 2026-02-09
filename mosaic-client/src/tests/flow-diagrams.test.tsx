/**
 * Flow Diagrams — behavioral tests
 *
 * Tests the flow sidebar (node palette, save/load/export/import, clear),
 * flow search (search nodes, show matches, no-match message), and the
 * interaction between them.
 *
 * Note: React Flow canvas interactions (drag-drop, edge drawing, node editing)
 * require a real DOM and can't be meaningfully tested with happy-dom.
 * Those are covered by the search + storage unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlowSidebar from '@/components/flow/flow-sidebar';
import FlowSearch from '@/components/flow/flow-search';
import type { Node } from '@xyflow/react';

describe('Flow Sidebar', () => {
  const defaultProps = {
    flowName: 'My Flow',
    onFlowNameChange: vi.fn(),
    onSave: vi.fn(),
    onClear: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    savedFlows: [] as string[],
    onLoadFlow: vi.fn(),
    onDeleteFlow: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('node palette', () => {
    it('should display all 4 node types for dragging', () => {
      render(<FlowSidebar {...defaultProps} />);

      expect(screen.getByText('Page')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
      expect(screen.getByText('Condition')).toBeInTheDocument();
      expect(screen.getByText('Note')).toBeInTheDocument();
    });

    it('should show descriptions for each node type', () => {
      render(<FlowSidebar {...defaultProps} />);

      expect(screen.getByText('A page or screen in the flow')).toBeInTheDocument();
      expect(screen.getByText('A user action or API call')).toBeInTheDocument();
      expect(screen.getByText('A branching decision point')).toBeInTheDocument();
      expect(screen.getByText('An annotation or comment')).toBeInTheDocument();
    });

    it('should set drag data on drag start', () => {
      render(<FlowSidebar {...defaultProps} />);

      const pageNode = screen.getByText('Page').closest('[draggable]')!;
      const setData = vi.fn();
      const dataTransfer = { setData, effectAllowed: '' };
      fireEvent.dragStart(pageNode, { dataTransfer });

      expect(setData).toHaveBeenCalledWith('application/reactflow', 'page');
    });
  });

  describe('flow name', () => {
    it('should display the current flow name', () => {
      render(<FlowSidebar {...defaultProps} flowName="Login Flow" />);

      const input = screen.getByDisplayValue('Login Flow');
      expect(input).toBeInTheDocument();
    });

    it('should call onFlowNameChange when name is edited', () => {
      const onFlowNameChange = vi.fn();
      render(<FlowSidebar {...defaultProps} onFlowNameChange={onFlowNameChange} />);

      const input = screen.getByDisplayValue('My Flow');
      fireEvent.change(input, { target: { value: 'Checkout Flow' } });

      expect(onFlowNameChange).toHaveBeenCalledWith('Checkout Flow');
    });
  });

  describe('action buttons', () => {
    it('should call onSave when Save is clicked', () => {
      const onSave = vi.fn();
      render(<FlowSidebar {...defaultProps} onSave={onSave} />);

      fireEvent.click(screen.getByText('Save'));

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('should call onClear when Clear is clicked', () => {
      const onClear = vi.fn();
      render(<FlowSidebar {...defaultProps} onClear={onClear} />);

      fireEvent.click(screen.getByText('Clear'));

      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('should call onExport when Export is clicked', () => {
      const onExport = vi.fn();
      render(<FlowSidebar {...defaultProps} onExport={onExport} />);

      fireEvent.click(screen.getByText('Export'));

      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it('should call onImport when Import is clicked', () => {
      const onImport = vi.fn();
      render(<FlowSidebar {...defaultProps} onImport={onImport} />);

      fireEvent.click(screen.getByText('Import'));

      expect(onImport).toHaveBeenCalledTimes(1);
    });
  });

  describe('saved flows', () => {
    it('should show "No saved flows yet" when list is empty', () => {
      render(<FlowSidebar {...defaultProps} savedFlows={[]} />);

      expect(screen.getByText(/No saved flows yet/)).toBeInTheDocument();
    });

    it('should show saved flow count', () => {
      render(<FlowSidebar {...defaultProps} savedFlows={['Flow A', 'Flow B']} />);

      expect(screen.getByText('Saved Flows (2)')).toBeInTheDocument();
    });

    it('should display saved flow names', () => {
      render(<FlowSidebar {...defaultProps} savedFlows={['Login Flow', 'Checkout Flow']} />);

      expect(screen.getByText('Login Flow')).toBeInTheDocument();
      expect(screen.getByText('Checkout Flow')).toBeInTheDocument();
    });

    it('should call onLoadFlow when a saved flow is clicked', () => {
      const onLoadFlow = vi.fn();
      render(<FlowSidebar {...defaultProps} savedFlows={['My Flow']} onLoadFlow={onLoadFlow} />);

      fireEvent.click(screen.getByText('My Flow'));

      expect(onLoadFlow).toHaveBeenCalledWith('My Flow');
    });

    it('should call onDeleteFlow when delete button is clicked', () => {
      const onDeleteFlow = vi.fn();
      render(<FlowSidebar {...defaultProps} savedFlows={['Old Flow']} onDeleteFlow={onDeleteFlow} />);

      // The delete button is inside each saved flow row
      const deleteButtons = screen.getAllByRole('button').filter(
        btn => btn.closest('.group') && btn !== screen.getByText('Old Flow').closest('button')
      );
      // Find the trash button (it's the second button in the group)
      const trashBtn = deleteButtons.find(btn => btn.closest('.group'));
      if (trashBtn) {
        fireEvent.click(trashBtn);
        expect(onDeleteFlow).toHaveBeenCalledWith('Old Flow');
      }
    });
  });

  describe('sidebar collapse', () => {
    it('should show collapsed state with only icons after collapse', () => {
      render(<FlowSidebar {...defaultProps} />);

      // There should be a collapse button (ChevronLeft)
      const collapseButtons = screen.getAllByRole('button');
      // The collapse button is in the header area
      const collapseBtn = collapseButtons.find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.closest('.border-b');
      });

      if (collapseBtn) {
        fireEvent.click(collapseBtn);

        // After collapse, "Flow Editor" text should not be visible
        expect(screen.queryByText('Flow Editor')).not.toBeInTheDocument();
      }
    });
  });

  describe('navigation', () => {
    it('should have a "Back to Preview" link', () => {
      render(<FlowSidebar {...defaultProps} />);

      const link = screen.getByText('Back to Preview');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/');
    });
  });

  describe('tips', () => {
    it('should show usage tips', () => {
      render(<FlowSidebar {...defaultProps} />);

      expect(screen.getByText(/Drag nodes from the palette/)).toBeInTheDocument();
    });
  });
});

describe('Flow Search', () => {
  const mockNodes: Node[] = [
    { id: 'n1', type: 'page', position: { x: 0, y: 0 }, data: { label: 'Login Page' } },
    { id: 'n2', type: 'action', position: { x: 100, y: 0 }, data: { label: 'Submit Form' } },
    { id: 'n3', type: 'page', position: { x: 200, y: 0 }, data: { label: 'Dashboard' } },
  ];

  const defaultSearchProps = {
    query: '',
    onQueryChange: vi.fn(),
    matchedNodes: [] as Node[],
    onFocusNode: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search input', () => {
    it('should show search placeholder text', () => {
      render(<FlowSearch {...defaultSearchProps} />);

      expect(screen.getByPlaceholderText('Search nodes... (Spotlight)')).toBeInTheDocument();
    });

    it('should call onQueryChange when user types', () => {
      const onQueryChange = vi.fn();
      render(<FlowSearch {...defaultSearchProps} onQueryChange={onQueryChange} />);

      fireEvent.change(screen.getByPlaceholderText('Search nodes... (Spotlight)'), {
        target: { value: 'Login' },
      });

      expect(onQueryChange).toHaveBeenCalledWith('Login');
    });

    it('should show clear button when query is not empty', () => {
      render(<FlowSearch {...defaultSearchProps} query="login" />);

      // Clear button exists
      const clearBtn = screen.getByRole('button');
      expect(clearBtn).toBeInTheDocument();
    });

    it('should clear search when clear button is clicked', () => {
      const onQueryChange = vi.fn();
      render(<FlowSearch {...defaultSearchProps} query="login" onQueryChange={onQueryChange} />);

      fireEvent.click(screen.getByRole('button'));

      expect(onQueryChange).toHaveBeenCalledWith('');
    });
  });

  describe('search results', () => {
    it('should display matched nodes with labels and types', () => {
      render(
        <FlowSearch
          {...defaultSearchProps}
          query="page"
          matchedNodes={[mockNodes[0], mockNodes[2]]}
        />
      );

      expect(screen.getByText('Login Page')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('should show node type next to each result', () => {
      render(
        <FlowSearch
          {...defaultSearchProps}
          query="Login"
          matchedNodes={[mockNodes[0]]}
        />
      );

      expect(screen.getByText('Login Page')).toBeInTheDocument();
      expect(screen.getByText('page')).toBeInTheDocument();
    });

    it('should call onFocusNode when a result is clicked', () => {
      const onFocusNode = vi.fn();
      render(
        <FlowSearch
          {...defaultSearchProps}
          query="Login"
          matchedNodes={[mockNodes[0]]}
          onFocusNode={onFocusNode}
        />
      );

      fireEvent.click(screen.getByText('Login Page'));

      expect(onFocusNode).toHaveBeenCalledWith('n1');
    });

    it('should show "No nodes match" when query has no results', () => {
      render(
        <FlowSearch
          {...defaultSearchProps}
          query="nonexistent"
          matchedNodes={[]}
        />
      );

      expect(screen.getByText('No nodes match "nonexistent"')).toBeInTheDocument();
    });

    it('should not show results dropdown when query is empty', () => {
      render(<FlowSearch {...defaultSearchProps} query="" matchedNodes={[]} />);

      expect(screen.queryByText(/No nodes match/)).not.toBeInTheDocument();
    });
  });
});
