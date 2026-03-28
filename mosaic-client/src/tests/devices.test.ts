import { describe, it, expect } from 'vitest';
import { devices, getDeviceById, getDevicesByCategory } from '@/lib/devices';

describe('Device Configuration', () => {
  it('has at least 14 devices defined', () => {
    expect(devices.length).toBeGreaterThanOrEqual(14);
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

      if (device.type === 'mobile') {
        expect(device.frame?.shell).toBeTruthy();
      }
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

  it('includes newer iPhone models with Dynamic Island metadata', () => {
    const iphone17 = getDeviceById('iphone-17');

    expect(iphone17).toBeDefined();
    expect(iphone17!.height).toBe(874);
    expect(iphone17!.frame?.topFeature).toBe('dynamic-island');
  });

  it('includes newer Samsung models with camera-hole metadata', () => {
    const galaxy = getDeviceById('samsung-s24-ultra');

    expect(galaxy).toBeDefined();
    expect(galaxy!.width).toBe(412);
    expect(galaxy!.frame?.topFeature).toBe('camera-hole');
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
