import { DEVICES } from '../../shared/devices.js';

export interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
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