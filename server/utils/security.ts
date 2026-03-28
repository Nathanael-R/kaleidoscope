import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'localhost',
]);

const INSPECTABLE_LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;

  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  return false;
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return false;
}

export async function isAllowedHttpUrl(url: string): Promise<boolean> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return false;
  }

  if (isPrivateIp(hostname)) {
    return false;
  }

  // DNS rebinding mitigation: if hostname resolves to a private IP, reject.
  try {
    const resolved = await lookup(hostname, { all: true });
    if (resolved.some(entry => isPrivateIp(entry.address))) {
      return false;
    }
  } catch {
    // Ignore DNS lookup failures to avoid blocking valid environments with custom DNS.
  }

  return true;
}

export function isInspectableLocalUrl(url: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return INSPECTABLE_LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

const COOKIE_NAME_REGEX = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const MAX_COOKIE_VALUE_LENGTH = 4096;
const MAX_COOKIE_COUNT = 50;
const HEADER_NAME_REGEX = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const MAX_HEADER_VALUE_LENGTH = 8192;
const MAX_HEADER_COUNT = 20;
const BLOCKED_REQUEST_HEADER_NAMES = new Set([
  'accept',
  'accept-encoding',
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'referer',
  'transfer-encoding',
  'upgrade',
]);

export type CookieInput = { name: string; value: string };
export type RequestHeaderInput = { name: string; value: string };

export function validateCookies(cookies: unknown): {
  valid: boolean;
  reason?: string;
  sanitized?: CookieInput[];
} {
  if (!Array.isArray(cookies)) {
    return { valid: false, reason: 'cookies must be an array' };
  }

  if (cookies.length > MAX_COOKIE_COUNT) {
    return { valid: false, reason: `cookies exceed max count (${MAX_COOKIE_COUNT})` };
  }

  const sanitized: CookieInput[] = [];

  for (const cookie of cookies) {
    if (!cookie || typeof cookie !== 'object') {
      return { valid: false, reason: 'each cookie must be an object with name and value' };
    }

    const candidate = cookie as Partial<CookieInput>;
    const name = candidate.name;
    const value = candidate.value;

    if (typeof name !== 'string' || typeof value !== 'string') {
      return { valid: false, reason: 'cookie name and value must be strings' };
    }

    if (!COOKIE_NAME_REGEX.test(name)) {
      return { valid: false, reason: `invalid cookie name: ${name}` };
    }

    if (value.length > MAX_COOKIE_VALUE_LENGTH) {
      return { valid: false, reason: `cookie value too long for ${name}` };
    }

    if (value.includes('\r') || value.includes('\n') || value.includes(';')) {
      return { valid: false, reason: `invalid cookie value characters for ${name}` };
    }

    sanitized.push({ name, value });
  }

  return { valid: true, sanitized };
}

export function validateRequestHeaders(headers: unknown): {
  valid: boolean;
  reason?: string;
  sanitized?: RequestHeaderInput[];
} {
  if (!Array.isArray(headers)) {
    return { valid: false, reason: 'headers must be an array' };
  }

  if (headers.length > MAX_HEADER_COUNT) {
    return { valid: false, reason: `headers exceed max count (${MAX_HEADER_COUNT})` };
  }

  const sanitized: RequestHeaderInput[] = [];

  for (const header of headers) {
    if (!header || typeof header !== 'object') {
      return { valid: false, reason: 'each header must be an object with name and value' };
    }

    const candidate = header as Partial<RequestHeaderInput>;
    const name = candidate.name;
    const value = candidate.value;

    if (typeof name !== 'string' || typeof value !== 'string') {
      return { valid: false, reason: 'header name and value must be strings' };
    }

    const normalizedName = name.trim().toLowerCase();
    if (!HEADER_NAME_REGEX.test(normalizedName)) {
      return { valid: false, reason: `invalid header name: ${name}` };
    }

    if (BLOCKED_REQUEST_HEADER_NAMES.has(normalizedName)) {
      return { valid: false, reason: `header is not allowed: ${name}` };
    }

    if (value.length > MAX_HEADER_VALUE_LENGTH) {
      return { valid: false, reason: `header value too long for ${name}` };
    }

    if (value.includes('\r') || value.includes('\n')) {
      return { valid: false, reason: `invalid header value characters for ${name}` };
    }

    sanitized.push({ name: normalizedName, value });
  }

  return { valid: true, sanitized };
}