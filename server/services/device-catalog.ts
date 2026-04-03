import { devices, type BrowserContextOptions } from 'playwright-core';
import { DEVICES, type DeviceFrameDefinition } from '../../shared/devices.js';

const PLAYWRIGHT_DESCRIPTOR_BY_DEVICE_ID: Record<string, string> = {
  'iphone-14': 'iPhone 14',
  'iphone-15': 'iPhone 15',
  'iphone-16': 'iPhone 15',
  'iphone-17': 'iPhone 15 Pro Max',
  'samsung-s21': 'Galaxy S24',
  'samsung-s24': 'Galaxy S24',
  'samsung-s24-ultra': 'Galaxy S24',
  'samsung-s25-ultra': 'Galaxy S24',
  'pixel-6': 'Pixel 7',
  ipad: 'iPad (gen 7)',
  'ipad-pro': 'iPad Pro 11',
  'macbook-air': 'Desktop Chrome HiDPI',
  desktop: 'Desktop Chrome',
  'desktop-4k': 'Desktop Chrome HiDPI',
};

export interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
  icon: string;
  frame?: DeviceFrameDefinition;
}

export const DEVICE_MAP: Record<string, DeviceConfig> = Object.fromEntries(
  DEVICES.map((device) => [
    device.id,
    {
      id: device.id,
      name: device.name,
      width: device.width,
      height: device.height,
      type: device.type,
      icon: device.icon,
      frame: device.frame,
    },
  ]),
);

export const DEVICE_IDS = Object.keys(DEVICE_MAP);

export function hasDeviceConfig(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEVICE_MAP, id);
}

export function getDeviceConfigs(): DeviceConfig[] {
  return Object.values(DEVICE_MAP);
}

export function getPlaywrightDescriptorName(deviceId: string): string | null {
  return PLAYWRIGHT_DESCRIPTOR_BY_DEVICE_ID[deviceId] ?? null;
}

export function getDeviceContextOptions(device: DeviceConfig): BrowserContextOptions {
  const descriptorName = getPlaywrightDescriptorName(device.id);
  const viewport = { width: device.width, height: device.height };

  if (!descriptorName) {
    return {
      viewport,
      screen: viewport,
    };
  }

  const descriptor = devices[descriptorName];
  if (!descriptor) {
    return {
      viewport,
      screen: viewport,
    };
  }

  const { defaultBrowserType: _defaultBrowserType, ...descriptorOptions } = descriptor;

  // Preserve Kaleidoscope's product-facing viewport sizes while adding touch,
  // DPR, mobile UA, and other Playwright device emulation defaults.
  return {
    ...descriptorOptions,
    viewport,
    screen: viewport,
  };
}
