import { describe, it, expect } from 'vitest';
import { devices, getDeviceById, getDevicesByCategory } from '@/lib/devices';

describe('Device Configuration', () => {
  it('has at least 8 devices defined', () => {
    expect(devices.length).toBeGreaterThanOrEqual(8);
  });

  it('every device has required fields', () => {
    for (const device of devices) {
      expect(device.id).toBeTruthy();
      expect(device.name).toBeTruthy();
      expect(device.width).toBeGreaterThan(0);
      expect(device.height).toBeGreaterThan(0);
      expect(['mobile', 'tablet', 'desktop']).toContain(device.type);
      expect(device.category).toBeTruthy();
      expect(device.icon).toBeTruthy();
    }
  });

  it('has all three device types', () => {
    const types = new Set(devices.map(d => d.type));
    expect(types.has('mobile')).toBe(true);
    expect(types.has('tablet')).toBe(true);
    expect(types.has('desktop')).toBe(true);
  });

  it('getDeviceById returns correct device', () => {
    const iphone = getDeviceById('iphone-14');
    expect(iphone).toBeDefined();
    expect(iphone!.name).toBe('iPhone 14');
    expect(iphone!.width).toBe(390);
  });

  it('getDeviceById returns undefined for unknown id', () => {
    expect(getDeviceById('nonexistent')).toBeUndefined();
  });

  it('getDevicesByCategory groups devices correctly', () => {
    const categories = getDevicesByCategory();
    expect(categories['Mobile']).toBeDefined();
    expect(categories['Tablet']).toBeDefined();
    expect(categories['Desktop']).toBeDefined();
    expect(categories['Mobile'].length).toBeGreaterThanOrEqual(2);
  });

  it('device IDs are unique', () => {
    const ids = devices.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
