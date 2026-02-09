import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Check, AlertCircle, Plus, X, Key, Cookie, Loader2, Shield, Database, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface AuthCookie {
  name: string;
  value: string;
}

export interface ProxySession {
  id: string;
  proxyUrl: string;
  targetUrl: string;
  authFailed: boolean;
}

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
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>('simple');
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxySession, setProxySession] = useState<ProxySession | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [mockRoutes, setMockRoutes] = useState<Array<{ pattern: string; response: string }>>([
    { pattern: '', response: '' }
  ]);
  const [mockExpanded, setMockExpanded] = useState(false);
  const [mockLoading, setMockLoading] = useState(false);
  const [mockSuccess, setMockSuccess] = useState<string | null>(null);

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

  const handleApply = async () => {
    const validCookies = cookies.filter(c => c.name && c.value);
    if (validCookies.length === 0) return;

    // Always pass cookies to parent (for same-origin scenarios)
    onAuthCapture(validCookies);

    // If we have a URL and proxy callback, create a proxy session
    let failed = false;
    if (currentUrl && onProxyUrl) {
      setProxyLoading(true);
      setProxyError(null);

      try {
        const res = await fetch(`${API_URL}/api/proxy/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: currentUrl, cookies: validCookies }),
        });

        if (!res.ok) {
          const err = await res.json() as { error: string };
          throw new Error(err.error);
        }

        const data = await res.json() as {
          session: { id: string; proxyUrl: string; targetUrl: string };
        };

        // Probe the proxy to detect auth failures
        await fetch(`${API_URL}${data.session.proxyUrl}/`, { redirect: 'manual' });

        // Check status
        const statusRes = await fetch(`${API_URL}/api/proxy/session/${data.session.id}/status`);
        const status = statusRes.ok
          ? await statusRes.json() as { authFailed: boolean }
          : { authFailed: false };

        const session: ProxySession = {
          id: data.session.id,
          proxyUrl: `${API_URL}${data.session.proxyUrl}`,
          targetUrl: data.session.targetUrl,
          authFailed: status.authFailed,
        };

        setProxySession(session);
        onProxyUrl(`${API_URL}${data.session.proxyUrl}/`, session);

        if (status.authFailed) {
          setProxyError('Auth may have failed - the site returned 401/403 or redirected to login. The proxy is still active but pages may not render correctly.');
          setMockExpanded(true); // Auto-show mock data panel on auth failure
        }
      } catch (error) {
        setProxyError(error instanceof Error ? error.message : 'Failed to create proxy session');
        failed = true;
      } finally {
        setProxyLoading(false);
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

    setMockLoading(true);
    setMockSuccess(null);

    try {
      const mocks = validMocks.map(m => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(m.response);
        } catch {
          parsed = m.response; // treat as string if not valid JSON
        }
        return { pattern: m.pattern, response: parsed };
      });

      const res = await fetch(`${API_URL}/api/proxy/session/${proxySession.id}/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mocks }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }

      const data = await res.json() as { mockCount: number };
      setMockSuccess(`${data.mockCount} mock route(s) active. Preview will use mock data for matching API calls.`);
      // Trigger reload so iframe picks up mock data
      onProxyUrl?.(`${proxySession.proxyUrl}/`, proxySession);
    } catch (error) {
      setProxyError(error instanceof Error ? error.message : 'Failed to inject mock data');
    } finally {
      setMockLoading(false);
    }
  };

  const handleClearMocks = async () => {
    if (!proxySession) return;
    try {
      await fetch(`${API_URL}/api/proxy/session/${proxySession.id}/mock`, { method: 'DELETE' });
      setMockSuccess(null);
      setMockRoutes([{ pattern: '', response: '' }]);
    } catch {
      // ignore
    }
  };

  const handleClear = () => {
    setCookies([{ name: '', value: '' }]);
    setProxySession(null);
    setProxyError(null);
    setMockRoutes([{ pattern: '', response: '' }]);
    setMockExpanded(false);
    setMockSuccess(null);
    onAuthCapture([]);
    onProxyUrl?.(null, null);
  };

  const hasValidCookies = cookies.some(c => c.name && c.value);

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
          'p-2 rounded-md text-xs',
          proxySession.authFailed
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
            : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
        )}>
          {proxySession.authFailed
            ? 'Proxy active but auth may have failed. You can inject mock API data below.'
            : 'Previewing through server-side proxy with auth cookies injected.'
          }
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
                    className="w-full font-mono text-xs p-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 resize-y min-h-[60px]"
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
                  disabled={mockLoading || !mockRoutes.some(m => m.pattern && m.response)}
                  className="flex-1 h-7 text-xs"
                >
                  {mockLoading ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Database className="w-3 h-3 mr-1" />
                  )}
                  {mockLoading ? 'Injecting...' : 'Inject Mocks'}
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

          {/* Simple Tab */}
          {activeTab === 'simple' && (
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-sm">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-blue-700 dark:text-blue-300">
                    <strong>How it works:</strong>
                    <ol className="mt-2 ml-4 space-y-1 list-decimal">
                      <li>Log into your site in a new tab</li>
                      <li>Open DevTools (F12) → Application → Cookies</li>
                      <li>Copy your session cookie name and value</li>
                      <li>A server-side proxy will inject the cookies for you</li>
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
                Add multiple cookies for complex authentication
              </div>

              {cookies.map((cookie, index) => (
                <div key={index} className="flex space-x-2 items-start">
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
              disabled={!hasValidCookies || proxyLoading}
              className="flex-1"
              data-testid="auth-apply-button"
            >
              {proxyLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {proxyLoading ? 'Creating Proxy...' : 'Apply & Preview'}
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
            <strong>Server-side proxy:</strong> Cookies are injected by the Kaleidoscope server, not the browser. This works even with cross-origin sites and X-Frame-Options restrictions.
          </div>
        </div>
      )}

      {/* Help Text */}
      {!isExpanded && !proxySession && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Preview pages that require login (dashboards, admin panels)
        </div>
      )}
    </div>
  );
}
