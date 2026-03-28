import { Smartphone, HelpCircle, Settings, Moon, Sun, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { usePreviewStore } from "@/store/preview-store";
import { useState } from "react";

/** Duration (ms) must match the `icon-swap` animation in index.css */
const DARK_MODE_ANIMATION_DURATION = 350;

export default function Header() {
  const { darkMode, toggleDarkMode } = usePreviewStore();
  const [location] = useLocation();
  const [darkModeAnimating, setDarkModeAnimating] = useState(false);

  const handleDarkModeToggle = () => {
    setDarkModeAnimating(true);
    toggleDarkMode();
    setTimeout(() => setDarkModeAnimating(false), DARK_MODE_ANIMATION_DURATION);
  };

  return (
    <header
      role="banner"
      className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50"
    >
      <div className="flex items-center justify-between h-16 px-5">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center transition-transform duration-200 hover:scale-110 hover:shadow-md cursor-pointer">
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
                className="text-sm h-8 transition-all duration-150 active:scale-95"
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
                className="text-sm h-8 transition-all duration-150 active:scale-95"
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
            className="hidden md:flex text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-transform duration-150 hover:scale-110 active:scale-95"
            data-testid="button-help"
            aria-label="Help"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:flex text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-transform duration-150 hover:scale-110 active:scale-95"
            data-testid="button-settings"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-transform duration-150 hover:scale-110 active:scale-90"
            aria-label="Toggle dark mode"
            onClick={handleDarkModeToggle}
            data-testid="button-darkmode"
          >
            {darkMode ? (
              <Sun className={`w-5 h-5 ${darkModeAnimating ? "animate-icon-swap" : ""}`} />
            ) : (
              <Moon className={`w-5 h-5 ${darkModeAnimating ? "animate-icon-swap" : ""}`} />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
