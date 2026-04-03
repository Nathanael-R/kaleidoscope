import { DEVICES, type DeviceFrameDefinition } from '../../../shared/devices';

export interface Device {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
  category: string;
  icon: string;
  frame?: DeviceFrameDefinition;
}

export const devices: Device[] = DEVICES.map(device => ({ ...device }));

const DEVICE_ICON_GLYPHS: Record<string, string> = {
  'mobile-alt': '📱',
  'tablet-alt': '📟',
  laptop: '💻',
  desktop: '🖥️',
};

export const getDeviceById = (id: string): Device | undefined => {
  return devices.find(device => device.id === id);
};

export const getDeviceIconGlyph = (iconName: string): string => {
  return DEVICE_ICON_GLYPHS[iconName] || '📱';
};

export const getDevicesByCategory = () => {
  const categories: Record<string, Device[]> = {};
  
  devices.forEach(device => {
    if (!categories[device.category]) {
      categories[device.category] = [];
    }
    categories[device.category].push(device);
  });
  
  return categories;
};
