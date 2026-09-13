import { PNG } from 'pngjs';

const MAX_PIXELS = 25_000_000;
const MAX_PREVIEW_EDGE = 1600;

export function createInlinePreview(file: Buffer, maxBytes: number): Buffer {
  if (file.byteLength <= maxBytes) return file;
  if (file.length < 24 || !file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Preview source is not a PNG.');
  }
  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  if (width * height > MAX_PIXELS || width === 0 || height === 0) {
    throw new Error('Image exceeds the preview pixel limit; use the original file.');
  }
  const source = PNG.sync.read(file);
  let scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(width, height));
  for (;;) {
    const resized = new PNG({ width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) });
    for (let y = 0; y < resized.height; y += 1) {
      const sourceY = Math.min(height - 1, Math.floor(y * height / resized.height));
      for (let x = 0; x < resized.width; x += 1) {
        const sourceX = Math.min(width - 1, Math.floor(x * width / resized.width));
        const offset = (sourceY * width + sourceX) * 4;
        source.data.copy(resized.data, (y * resized.width + x) * 4, offset, offset + 4);
      }
    }
    const preview = PNG.sync.write(resized);
    if (preview.byteLength <= maxBytes) return preview;
    if (resized.width === 1 && resized.height === 1) throw new Error('Preview byte budget is too small.');
    scale *= 0.7;
  }
}
