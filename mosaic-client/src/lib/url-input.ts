export type PreviewTargetMode = 'production' | 'local';

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return false;
  }

  if (parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

function getHostnameCandidate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d+$/.test(trimmed)) {
    return 'localhost';
  }

  if (SCHEME_PATTERN.test(trimmed)) {
    try {
      return new URL(trimmed).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  try {
    const withoutPath = trimmed.split('/')[0];
    const withoutQuery = withoutPath.split('?')[0];
    const ipv6Match = withoutQuery.match(/^\[(.+)\](?::\d+)?$/);

    if (ipv6Match) {
      return ipv6Match[1].toLowerCase();
    }

    const firstColonIndex = withoutQuery.indexOf(':');
    if (firstColonIndex === -1) {
      return withoutQuery.toLowerCase();
    }

    return withoutQuery.slice(0, firstColonIndex).toLowerCase();
  } catch {
    return '';
  }
}

export function looksLikeLocalDevelopmentUrl(value: string): boolean {
  const hostname = getHostnameCandidate(value);
  if (!hostname) {
    return false;
  }

  return (
    LOCAL_HOSTS.has(hostname)
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.test')
    || isPrivateIpv4(hostname)
  );
}

export function detectPreviewTargetMode(value: string): PreviewTargetMode {
  return looksLikeLocalDevelopmentUrl(value) ? 'local' : 'production';
}

export function isLikelyPublicHttpUrl(value: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    LOCAL_HOSTS.has(hostname)
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || isPrivateIpv4(hostname)
  ) {
    return false;
  }

  return true;
}

export function normalizePreviewUrl(
  rawInput: string,
  mode: PreviewTargetMode,
): { normalizedUrl: string | null; error: string | null } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { normalizedUrl: null, error: 'Enter a URL first.' };
  }

  let candidate = trimmed;

  if (!SCHEME_PATTERN.test(trimmed)) {
    if (mode === 'local') {
      candidate = /^\d+$/.test(trimmed)
        ? `http://localhost:${trimmed}`
        : `http://${trimmed}`;
    } else {
      candidate = `https://${trimmed}`;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        normalizedUrl: null,
        error: 'Only http:// and https:// URLs are supported.',
      };
    }

    return { normalizedUrl: candidate, error: null };
  } catch {
    return { normalizedUrl: null, error: 'Enter a valid URL.' };
  }
}