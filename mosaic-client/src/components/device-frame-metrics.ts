import type { Device } from "@/lib/devices";

export function getDeviceFrameMetrics(device: Device, isLandscape = false) {
  const deviceWidth = isLandscape ? device.height : device.width;
  const deviceHeight = isLandscape ? device.width : device.height;
  const frameWidth = deviceWidth + (device.type === 'mobile' ? 48 : device.type === 'tablet' ? 60 : 80);
  const frameHeight = deviceHeight + (device.type === 'mobile' ? 96 : device.type === 'tablet' ? 80 : 60);

  return {
    deviceWidth,
    deviceHeight,
    frameWidth,
    frameHeight,
  };
}