import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Check, AlertCircle, Plus, X, Key, Cookie, Loader2, Shield, Database, Trash2, RefreshCw } from 'lucide-react';
import { useAuthProxy, type AuthCookie, type AuthHeader, type ProxySession } from '@/hooks/use-auth-proxy';
import { isLikelyPublicHttpUrl } from '@/lib/url-input';
import { cn } from '@/lib/utils';

const AUTH_FAILURE_MESSAGE = 'Kaleidoscope could not confirm those cookies. The target still looks unauthenticated or redirected to login.';
const AUTH_PROXY_SCOPE_MESSAGE = 'Auth proxy currently supports public HTTP/HTTPS URLs only. For local/private dev targets, preview directly or use a public tunnel URL.';

interface AuthWizardProps {
  /** Called with cookies (legacy direct injection) */
  onAuthCapture: (cookies: AuthCookie[]) => void;
  /** Called with a proxy URL that has cookies baked in server-side */
  onProxyUrl?: (proxyUrl: string | null, session: ProxySession | null) => void;
  /** The current URL being previewed - needed to create the proxy session */
  currentUrl?: string;
  className?: string;
}

export default function AuthWizard({ onAuthCapture, onProxyUrl, currentUrl, className }: AuthWizardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [cookies, setCookies] = useState<AuthCookie[]>([{ name: '', value: '' }]);
  const [headers, setHeaders] = useState<AuthHeader[]>([{ name: '', value: '' }]);
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>('simple');
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [mockRoutes, setMockRoutes] = useState<Array<{ pattern: string; response: string }>>([
    { pattern: '', response: '' }
  ]);
  const [mockExpanded, setMockExpanded] = useState(false);
  const [mockSuccess, setMockSuccess] = useState<string | null>(null);
  const proxySupported = currentUrl ? isLikelyPublicHttpUrl(currentUrl) : false;

  const {
    proxySession,
    createProxySession,
    refreshProxyStatus,
    injectMocks,
    clearMocks,
    clearProxySession,
    isCreatingProxy,
    isCheckingStatus,
    isInjectingMocks,
  } = useAuthProxy();

  const handleRefreshProxyStatus = async () => {
    if (!proxySession) {
      return null;
    }

    try {
      const status = await refreshProxyStatus();
      if (!status) {
        return null;
      }

      if (status.authFailed) {
        setProxyError(AUTH_FAILURE_MESSAGE);
        setMockExpanded(true);
      } else if (proxyError === AUTH_FAILURE_MESSAGE) {
        setProxyError(null);
      }

      return status;
    } catch (error) {
      setProxyError(error instanceof Error ? error.message : 'Failed to check proxy status');
      return null;
    }
  };

  const handleAddCookie = () => {
    setCookies([...cookies, { name: '', value: '' }]);
  };

  const handleRemoveCookie = (index: number) => {
    setCookies(prev => prev.filter((_, i) => i !== index));
  };

  const handleCookieChange = (index: number, field: 'name' | 'value', value: string) => {
    const newCookies = [...cookies];
    newCookies[index][field] = value;
    setCookies(newCookies);
  };

  const handleAddHeader = () => {
    setHeaders([...headers, { name: '', value: '' }]);
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders(prev => prev.filter((_, i) => i !== index));
  };

  const handleHeaderChange = (index: number, field: 'name' | 'value', value: string) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
  };

  const handleApply = async () => {
    const validCookies = cookies.filter(c => c.name && c.value);
    const validHeaders = headers.filter(h => h.name && h.value);
    if (validCookies.length === 0 && validHeaders.length === 0) return;

    if (onProxyUrl && !proxySupported) {
      setProxyError(AUTH_PROXY_SCOPE_MESSAGE);
      return;
    }

    if (!onProxyUrl) {
      onAuthCapture(validCookies);
      setIsExpanded(false);
      return;
    }

    let failed = false;
    if (currentUrl) {
      setProxyError(null);

      try {
        const session = await createProxySession({
          url: currentUrl,
          cookies: validCookies,
          headers: validHeaders,
        });

        onAuthCapture(validCookies);
        onProxyUrl(`${session.proxyUrl}/`, session);

        if (session.authFailed) {
          setProxyError(AUTH_FAILURE_MESSAGE);
          setMockExpanded(true);
        }
      } catch (error) {
        setProxyError(error instanceof Error ? error.message : 'Failed to create proxy session');
        failed = true;
      }
    }

    if (!failed) {
      setIsExpanded(false);
    }
  };

  const handleMockChange = (index: number, field: 'pattern' | 'response', value: string) => {
    setMockRoutes(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const handleAddMock = () => {
    setMockRoutes(prev => [...prev, { pattern: '', response: '' }]);
  };

  const handleRemoveMock = (index: number) => {
    setMockRoutes(prev => prev.filter((_, i) => i !== index));
  };

  const handleInjectMocks = async () => {
    if (!proxySession) return;
    const validMocks = mockRoutes.filter(m => m.pattern && m.response);
    if (validMocks.length === 0) return;

    setMockSuccess(null);

    try {
      const data = await injectMocks(validMocks);
      setMockSuccess(`${data.mockCount} mock route(s) active. Preview will use mock data for matching API calls.`);
      onProxyUrl?.(`${proxySession.proxyUrl}/`, proxySession);
    } catch (error) {
      setProxyError(error instanceof Error ? error.message : 'Failed to inject mock data');
    }
  };

  const handleClearMocks = async () => {
    if (!proxySession) return;
    try {
      await clearMocks();
      setMockSuccess(null);
      setMockRoutes([{ pattern: '', response: '' }]);
    } catch {
      // ignore
    }
  };

  const handleClear = () => {
    setCookies([{ name: '', value: '' }]);
    setHeaders([{ name: '', value: '' }]);
    clearProxySession();
    setProxyError(null);
    setMockRoutes([{ pattern: '', response: '' }]);
    setMockExpanded(false);
    setMockSuccess(null);
    onAuthCapture([]);
    onProxyUrl?.(null, null);
  };

  const hasValidCookies = cookies.some(c => c.name && c.value);
  const hasValidHeaders = headers.some(h => h.name && h.value);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Toggle Button */}
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        variant={isExpanded ? 'default' : proxySession ? 'secondary' : 'outline'}
        className="w-full"
        data-testid="auth-wizard-toggle"
      >
        {proxySession ? (
          <Shield className="w-4 h-4 mr-2 text-green-600" />
        ) : (
          <Lock className="w-4 h-4 mr-2" />
        )}
        {proxySession
          ? proxySession.authFailed
            ? 'Auth Failed - Reconfigure'
            : 'Proxy Active'
          : isExpanded
            ? 'Close Auth Setup'
            : 'Preview with Auth'}
      </Button>

      {/* Active proxy status */}
      {!isExpanded && proxySession && (
        <div className={cn(
          'rounded-md p-2 text-xs',
          proxySession.authFailed
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
            : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
        )}>
          <div className="flex items-start justify-between gap-2">
            <div>
              {proxySession.authFailed
                ? 'Proxy active but the target still looks unauthenticated. You can inject mock API data below.'
                : 'Previewing through a server-side cookie proxy.'
              }
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRefreshProxyStatus}
              disabled={isCheckingStatus}
              className="h-6 px-2 text-[11px]"
              data-testid="auth-recheck-button"
            >
              {isCheckingStatus ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Re-check
            </Button>
          </div>
        </div>
      )}

      {/* Mock Data Panel - shown when proxy session exists */}
      {!isExpanded && proxySession && (
        <div className="space-y-2">
          <button
            onClick={() => setMockExpanded(!mockExpanded)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors w-full"
          >
            <Database className="w-3 h-3" />
            {mockExpanded ? 'Hide Mock Data' : 'Inject Mock Data'}
            {mockSuccess && !mockExpanded && (
              <span className="ml-auto text-green-600 dark:text-green-400">Active</span>
            )}
          </button>

          {mockExpanded && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                When auth fails, mock API responses so your frontend renders with dummy data.
                No changes to your codebase - mocks are served by the proxy at runtime.
              </div>

              {mockRoutes.map((mock, index) => (
                <div key={index} className="space-y-1.5 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-1.5">
                    <Input
                      placeholder="/api/users or /api/posts/:id"
                      value={mock.pattern}
                      onChange={(e) => handleMockChange(index, 'pattern', e.target.value)}
                      className="font-mono text-xs h-7"
                    />
                    {mockRoutes.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMock(index)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <textarea
                    placeholder='{"users": [{"id": 1, "name": "Jane"}]}'
                    value={mock.response}
                    onChange={(e) => handleMockChange(index, 'response', e.target.value)}
                    className="w-full min-h-15 resize-y rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900"
                    rows={2}
                  />
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={handleAddMock}
                className="w-full h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Route
              </Button>

              {mockSuccess && (
                <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded-md text-xs text-green-700 dark:text-green-300">
                  <Check className="w-3 h-3 inline mr-1" />
                  {mockSuccess}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleInjectMocks}
                  disabled={isInjectingMocks || !mockRoutes.some(m => m.pattern && m.response)}
                  className="flex-1 h-7 text-xs"
                >
                  {isInjectingMocks ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Database className="w-3 h-3 mr-1" />
                  )}
                  {isInjectingMocks ? 'Injecting...' : 'Inject Mocks'}
                </Button>
                {mockSuccess && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClearMocks}
                    className="h-7 text-xs"
                  >
                    Clear Mocks
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expanded Wizard */}
      {isExpanded && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-4 border border-gray-200 dark:border-gray-700">
          {/* Tabs */}
          <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('simple')}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors',
                activeTab === 'simple'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              )}
            >
              <Cookie className="w-3 h-3 inline mr-1" />
              Simple
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors',
                activeTab === 'advanced'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              )}
            >
              <Key className="w-3 h-3 inline mr-1" />
              Advanced
            </button>
          </div>

          {!proxySupported && currentUrl && (
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" data-testid="auth-proxy-scope-warning">
              {AUTH_PROXY_SCOPE_MESSAGE}
            </div>
          )}

          {/* Simple Tab */}
          {activeTab === 'simple' && (
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-sm">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="text-blue-700 dark:text-blue-300">
                    <strong>How it works:</strong>
                    <ol className="mt-2 ml-4 space-y-1 list-decimal">
                      <li>Log into your site in a new tab</li>
                      <li>Open DevTools (F12) → Application → Cookies</li>
                      <li>Copy your session cookie name and value</li>
                      <li>A server-side proxy will inject the cookies for public targets</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Cookie Name</Label>
                <Input
                  placeholder="e.g., session_token"
                  value={cookies[0]?.name || ''}
                  onChange={(e) => handleCookieChange(0, 'name', e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Cookie Value</Label>
                <Input
                  placeholder="e.g., abc123..."
                  value={cookies[0]?.value || ''}
                  onChange={(e) => handleCookieChange(0, 'value', e.target.value)}
                  className="font-mono text-sm"
                  type="password"
                />
              </div>
            </div>
          )}

          {/* Advanced Tab */}
          {activeTab === 'advanced' && (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Add multiple cookies or request headers for complex authentication
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Cookies
                </div>
                {cookies.map((cookie, index) => (
                  <div key={`cookie-${index}`} className="flex space-x-2 items-start">
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Cookie name"
                        value={cookie.name}
                        onChange={(e) => handleCookieChange(index, 'name', e.target.value)}
                        className="font-mono text-xs"
                      />
                      <Input
                        placeholder="Cookie value"
                        value={cookie.value}
                        onChange={(e) => handleCookieChange(index, 'value', e.target.value)}
                        className="font-mono text-xs"
                        type="password"
                      />
                    </div>
                    {cookies.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveCookie(index)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddCookie}
                  className="w-full"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Cookie
                </Button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Request Headers
                </div>
                {headers.map((header, index) => (
                  <div key={`header-${index}`} className="flex space-x-2 items-start">
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Request header name"
                        value={header.name}
                        onChange={(e) => handleHeaderChange(index, 'name', e.target.value)}
                        className="font-mono text-xs"
                      />
                      <Input
                        placeholder="Request header value"
                        value={header.value}
                        onChange={(e) => handleHeaderChange(index, 'value', e.target.value)}
                        className="font-mono text-xs"
                        type="password"
                      />
                    </div>
                    {headers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveHeader(index)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddHeader}
                  className="w-full"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Header
                </Button>
              </div>
            </div>
          )}

          {/* Error display */}
          {proxyError && (
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-3 h-3 inline mr-1" />
              {proxyError}
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-2 pt-2">
            <Button
              onClick={handleApply}
              disabled={(!(hasValidCookies || hasValidHeaders)) || isCreatingProxy || (!!onProxyUrl && !proxySupported)}
              className="flex-1"
              data-testid="auth-apply-button"
            >
              {isCreatingProxy ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {isCreatingProxy ? 'Creating Proxy...' : 'Apply & Preview'}
            </Button>
            <Button
              onClick={handleClear}
              variant="outline"
              className="flex-1"
            >
              Clear
            </Button>
          </div>

          {/* Info */}
          <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-xs text-gray-600 dark:text-gray-400">
            <Shield className="w-3 h-3 inline mr-1" />
            <strong>Server-side auth proxy:</strong> Supports cookies and injected request headers for public targets. Full browser-managed SSO or local/private targets may still require a tunnel or mock data.
          </div>
        </div>
      )}

      {/* Help Text */}
      {!isExpanded && !proxySession && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {proxySupported
            ? 'Preview pages that require login on public sites by injecting session cookies through the proxy.'
            : 'Auth proxy is intended for public URLs. Local/private targets should be previewed directly or via a public tunnel URL.'}
        </div>
      )}
    </div>
  );
}
