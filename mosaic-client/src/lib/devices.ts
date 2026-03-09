import { DEVICES } from '../../../shared/devices';

export interface Device {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
  category: string;
  icon: string;
}

export const devices: Device[] = DEVICES.map(device => ({ ...device }));

export const getDeviceById = (id: string): Device | undefined => {
  return devices.find(device => device.id === id);
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
