import { Smartphone, HelpCircle, Settings, Moon, Sun, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { usePreviewStore } from "@/store/preview-store";

export default function Header() {
  const { darkMode, toggleDarkMode } = usePreviewStore();
  const [location] = useLocation();

  return (
    <header
      role="banner"
      className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50"
    >
      <div className="flex items-center justify-between h-16 px-5">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Smartphone className="text-white w-4 h-4" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Kaleidoscope
          </h1>
          <nav className="flex items-center space-x-1 ml-6" aria-label="Main navigation">
            <Link href="/">
              <Button
                variant={location === "/" ? "secondary" : "ghost"}
                size="sm"
                className="text-sm h-8"
                aria-current={location === "/" ? "page" : undefined}
              >
                <Smartphone className="w-4 h-4 mr-1.5" />
                <span className="hidden md:inline">Preview</span>
              </Button>
            </Link>
            <Link href="/flows">
              <Button
                variant={location === "/flows" ? "secondary" : "ghost"}
                size="sm"
                className="text-sm h-8"
                aria-current={location === "/flows" ? "page" : undefined}
              >
                <GitBranch className="w-4 h-4 mr-1.5" />
                <span className="hidden md:inline">Flows</span>
              </Button>
            </Link>
          </nav>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:flex text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            data-testid="button-help"
            aria-label="Help"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:flex text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            data-testid="button-settings"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            aria-label="Toggle dark mode"
            onClick={toggleDarkMode}
            data-testid="button-darkmode"
          >
            {darkMode ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
