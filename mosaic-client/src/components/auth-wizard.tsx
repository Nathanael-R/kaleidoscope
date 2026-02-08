import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Copy, Check, AlertCircle, Plus, X, Key, Cookie } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AuthCookie {
  name: string;
  value: string;
}

interface AuthWizardProps {
  onAuthCapture: (cookies: AuthCookie[]) => void;
  className?: string;
}

export default function AuthWizard({ onAuthCapture, className }: AuthWizardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [cookies, setCookies] = useState<AuthCookie[]>([{ name: '', value: '' }]);
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>('simple');

  const handleAddCookie = () => {
    setCookies([...cookies, { name: '', value: '' }]);
  };

  const handleRemoveCookie = (index: number) => {
    setCookies(cookies.filter((_, i) => i !== index));
  };

  const handleCookieChange = (index: number, field: 'name' | 'value', value: string) => {
    const newCookies = [...cookies];
    newCookies[index][field] = value;
    setCookies(newCookies);
  };

  const handleApply = () => {
    const validCookies = cookies.filter(c => c.name && c.value);
    if (validCookies.length > 0) {
      onAuthCapture(validCookies);
      setIsExpanded(false);
    }
  };

  const handleClear = () => {
    setCookies([{ name: '', value: '' }]);
    onAuthCapture([]);
  };

  const hasValidCookies = cookies.some(c => c.name && c.value);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Toggle Button */}
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        variant={isExpanded ? 'default' : 'outline'}
        className="w-full"
        data-testid="auth-wizard-toggle"
      >
        <Lock className="w-4 h-4 mr-2" />
        {isExpanded ? 'Close Auth Setup' : 'Preview with Auth'}
      </Button>

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
                    <strong>How to get your session cookie:</strong>
                    <ol className="mt-2 ml-4 space-y-1 list-decimal">
                      <li>Log into your site in a new tab</li>
                      <li>Open DevTools (F12) → Application → Cookies</li>
                      <li>Find your session cookie (usually "session", "token", etc.)</li>
                      <li>Copy the name and value below</li>
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

              <div className="text-xs text-gray-500 dark:text-gray-400">
                💡 Tip: For testing, use the auth demo at localhost:3001
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

          {/* Actions */}
          <div className="flex space-x-2 pt-2">
            <Button
              onClick={handleApply}
              disabled={!hasValidCookies}
              className="flex-1"
              data-testid="auth-apply-button"
            >
              <Check className="w-4 h-4 mr-2" />
              Apply & Preview
            </Button>
            <Button
              onClick={handleClear}
              variant="outline"
              className="flex-1"
            >
              Clear
            </Button>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            <strong>Security:</strong> Cookies are stored in memory only and cleared on reload. Only use on your own sites.
          </div>
        </div>
      )}

      {/* Help Text */}
      {!isExpanded && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Preview pages that require login (dashboards, admin panels)
        </div>
      )}
    </div>
  );
}
