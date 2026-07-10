import { randomUUID } from 'node:crypto';
import type { LayoutCaptureResult, StoredLayoutCapture } from './layout-types.js';

const DEFAULT_MAX_CAPTURE_AGE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_CAPTURE_COUNT = 50;

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const MAX_CAPTURE_AGE_MS = readPositiveIntEnv('KALEIDOSCOPE_LAYOUT_CAPTURE_MAX_AGE_MS', DEFAULT_MAX_CAPTURE_AGE_MS);
const MAX_CAPTURE_COUNT = readPositiveIntEnv('KALEIDOSCOPE_LAYOUT_CAPTURE_MAX_COUNT', DEFAULT_MAX_CAPTURE_COUNT);

class LayoutStoreService {
  private captures = new Map<string, StoredLayoutCapture>();

  save(capture: LayoutCaptureResult): StoredLayoutCapture {
    this.cleanExpired();

    const now = new Date().toISOString();
    const stored: StoredLayoutCapture = {
      ...capture,
      id: `layout_${randomUUID()}`,
      updatedAt: now,
    };

    this.captures.set(stored.id, stored);
    this.trimOldest();
    return stored;
  }

  get(id: string): StoredLayoutCapture | undefined {
    const capture = this.captures.get(id);
    if (!capture) {
      return undefined;
    }

    if (Date.now() - Date.parse(capture.updatedAt) > MAX_CAPTURE_AGE_MS) {
      this.captures.delete(id);
      return undefined;
    }

    capture.updatedAt = new Date().toISOString();
    return capture;
  }

  list(): StoredLayoutCapture[] {
    this.cleanExpired();
    return Array.from(this.captures.values());
  }

  remove(id: string): boolean {
    return this.captures.delete(id);
  }

  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, capture] of this.captures) {
      if (now - Date.parse(capture.updatedAt) > MAX_CAPTURE_AGE_MS) {
        this.captures.delete(id);
        cleaned += 1;
      }
    }

    return cleaned;
  }

  clear(): void {
    this.captures.clear();
  }

  private trimOldest(): void {
    while (this.captures.size > MAX_CAPTURE_COUNT) {
      const first = this.captures.keys().next();
      if (first.done) {
        return;
      }
      this.captures.delete(first.value);
    }
  }
}

export const layoutStoreService = new LayoutStoreService();
