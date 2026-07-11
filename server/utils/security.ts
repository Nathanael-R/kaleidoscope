import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export interface ProxyTargetValidationOptions {
  allowLoopback?: boolean;
}

export interface ProxyTargetValidationResult {
  allowed: boolean;
  reason: string;
}

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

export async function validateProxyTargetUrl(
  url: string,
  options: ProxyTargetValidationOptions = {},
): Promise<ProxyTargetValidationResult> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'URL is invalid.' };
  }

  if (url.length > 2048) {
    return { allowed: false, reason: 'URL is too long.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      allowed: false,
      reason: `URL "${url}" is blocked because only http:// and https:// URLs are allowed.`,
    };
  }

  if (parsed.username || parsed.password) {
    return { allowed: false, reason: 'URLs with embedded credentials are not allowed.' };
  }

  if (options.allowLoopback && isInspectableLocalUrl(url)) {
    return { allowed: true, reason: 'Allowed loopback URL.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostname)) {
    return {
      allowed: false,
      reason: `URL host "${hostname}" is blocked by proxy policy.`,
    };
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return {
      allowed: false,
      reason: `URL host "${hostname}" is blocked because local/internal hostnames are not proxied by default.`,
    };
  }

  if (isPrivateIp(hostname)) {
    return {
      allowed: false,
      reason: `URL host "${hostname}" is private and cannot be proxied.`,
    };
  }

  try {
    const resolved = await lookup(hostname, { all: true });
    if (resolved.some((entry) => isPrivateIp(entry.address))) {
      return {
        allowed: false,
        reason: `URL host "${hostname}" resolves to a private IP and cannot be proxied.`,
      };
    }
  } catch {
    return {
      allowed: false,
      reason: `URL host "${hostname}" could not be resolved by DNS.`,
    };
  }

  return { allowed: true, reason: 'Allowed public URL.' };
}

export async function isAllowedHttpUrl(url: string): Promise<boolean>;

export async function isAllowedHttpUrl(
  url: string,
  options: ProxyTargetValidationOptions,
): Promise<boolean>;

export async function isAllowedHttpUrl(
  url: string,
  options: ProxyTargetValidationOptions = {},
): Promise<boolean> {
  return (await validateProxyTargetUrl(url, options)).allowed;
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
