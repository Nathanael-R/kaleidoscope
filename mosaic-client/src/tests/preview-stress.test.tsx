import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PreviewArea from '@/components/preview-area';
import { devices } from '@/lib/devices';

const stressDevices = [
  'iphone-14',
  'iphone-15',
  'iphone-16',
  'iphone-17',
  'samsung-s21',
  'samsung-s24',
  'samsung-s24-ultra',
  'samsung-s25-ultra',
].map((id) => {
  const device = devices.find((candidate) => candidate.id === id);
  if (!device) {
    throw new Error(`Missing stress-test device: ${id}`);
  }
  return device;
});

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Preview stress test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ screenshots: [] }),
    });
  });

  it('renders 8 iframes in comparison mode without collapsing the canvas state', () => {
    render(
      <PreviewArea
        selectedDevice={stressDevices[0]}
        currentUrl="http://localhost:3000"
        pinnedDevices={stressDevices}
        viewMode="comparison"
      />,
    );

    expect(screen.getByTestId('text-device-name')).toHaveTextContent('Comparing 8 Devices');
    expect(screen.getByText('Comparing 8 devices')).toBeInTheDocument();
    expect(screen.getAllByTestId('preview-iframe')).toHaveLength(8);
  });

  it('re-triggers loading across all 8 frames on refresh', () => {
    render(
      <PreviewArea
        selectedDevice={stressDevices[0]}
        currentUrl="http://localhost:3000"
        pinnedDevices={stressDevices}
        viewMode="comparison"
      />,
    );

    for (const iframe of screen.getAllByTestId('preview-iframe')) {
      fireEvent.load(iframe);
    }

    expect(screen.queryByText('Loading website...')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('button-refresh'));

    expect(screen.getAllByText('Loading website...')).toHaveLength(8);
  });

  it('sends all 8 pinned device ids to the screenshot API', async () => {
    render(
      <PreviewArea
        selectedDevice={stressDevices[0]}
        currentUrl="http://localhost:3000"
        pinnedDevices={stressDevices}
        viewMode="comparison"
      />,
    );

    fireEvent.click(screen.getByTestId('button-screenshot'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [requestUrl, requestInit] = mockFetch.mock.calls[0];
    expect(requestUrl).toBe('http://localhost:5000/api/screenshots');

    const headers = new Headers(requestInit.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Kaleidoscope-Client')).toBe('mosaic-client');

    const body = JSON.parse(requestInit.body);
    expect(body.url).toBe('http://localhost:3000');
    expect(body.devices).toEqual(stressDevices.map((device) => device.id));
  });
});
