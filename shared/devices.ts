export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface SharedDevice {
  id: string;
  name: string;
  width: number;
  height: number;
  type: DeviceType;
  category: string;
  icon: string;
}

export const DEVICES: ReadonlyArray<SharedDevice> = [
  {
    id: 'iphone-14',
    name: 'iPhone 14',
    width: 390,
    height: 844,
    type: 'mobile',
    category: 'Mobile',
    icon: 'mobile-alt',
  },
  {
    id: 'samsung-s21',
    name: 'Samsung Galaxy S21',
    width: 384,
    height: 854,
    type: 'mobile',
    category: 'Mobile',
    icon: 'mobile-alt',
  },
  {
    id: 'pixel-6',
    name: 'Google Pixel 6',
    width: 411,
    height: 914,
    type: 'mobile',
    category: 'Mobile',
    icon: 'mobile-alt',
  },
  {
    id: 'ipad',
    name: 'iPad',
    width: 768,
    height: 1024,
    type: 'tablet',
    category: 'Tablet',
    icon: 'tablet-alt',
  },
  {
    id: 'ipad-pro',
    name: 'iPad Pro',
    width: 1024,
    height: 1366,
    type: 'tablet',
    category: 'Tablet',
    icon: 'tablet-alt',
  },
  {
    id: 'macbook-air',
    name: 'MacBook Air',
    width: 1440,
    height: 900,
    type: 'desktop',
    category: 'Desktop',
    icon: 'laptop',
  },
  {
    id: 'desktop',
    name: 'Desktop HD',
    width: 1920,
    height: 1080,
    type: 'desktop',
    category: 'Desktop',
    icon: 'desktop',
  },
  {
    id: 'desktop-4k',
    name: 'Desktop 4K',
    width: 3840,
    height: 2160,
    type: 'desktop',
    category: 'Desktop',
    icon: 'desktop',
  },
];

export const DEVICE_IDS = DEVICES.map(device => device.id);
