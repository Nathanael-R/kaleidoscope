import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewStore } from "@/store/preview-store";
import { useState } from "react";

/** Duration (ms) must match the `icon-swap` animation in index.css */
const DARK_MODE_ANIMATION_DURATION = 350;

export default function Header() {
  const { darkMode, toggleDarkMode } = usePreviewStore();
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm transition-transform duration-200 hover:scale-105 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-100">
            <img
              src="/branding/kal-logo.png"
              alt="Kaleidoscope logo"
              className="h-8 w-8 object-contain"
            />
          </div>
          <span className="text-xl font-semibold leading-none text-gray-900 dark:text-white">
            Kaleidoscope
          </span>
        </div>
        <div className="flex items-center space-x-4">
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
