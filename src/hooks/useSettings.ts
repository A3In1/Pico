import { useState, useEffect, useCallback } from "react";

export type Theme = "system" | "dark" | "light";
export type ConflictHandling = "ask" | "replace" | "skip" | "keep-both";

interface Settings {
  downloadLocation: string;
  theme: Theme;
  conflictHandling: ConflictHandling;
  remindBeforeQuit: boolean;
}

const STORAGE_KEY = "androidfiletransfer-settings";

const DEFAULT_SETTINGS: Settings = {
  downloadLocation: "~/Downloads",
  theme: "dark",
  conflictHandling: "ask",
  remindBeforeQuit: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore write errors
  }
}

/**
 * Resolves a theme setting to the actual applied theme.
 * "system" checks the OS preference.
 */
function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

interface UseSettingsReturn {
  settings: Settings;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  setDownloadLocation: (path: string) => void;
  setConflictHandling: (handling: ConflictHandling) => void;
  setRemindBeforeQuit: (remind: boolean) => void;
}

/**
 * Hook to manage app settings with localStorage persistence.
 * Applies the theme to the document element.
 */
export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() =>
    resolveTheme(settings.theme)
  );

  // Apply theme to <html> element and listen for system theme changes
  useEffect(() => {
    const applied = resolveTheme(settings.theme);
    setResolvedTheme(applied);
    document.documentElement.setAttribute("data-theme", applied);

    // If "system", listen for OS theme changes
    if (settings.theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        const newTheme = e.matches ? "dark" : "light";
        setResolvedTheme(newTheme);
        document.documentElement.setAttribute("data-theme", newTheme);
      };
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [settings.theme]);

  // Persist on change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setTheme = useCallback((theme: Theme) => {
    setSettings((prev) => ({ ...prev, theme }));
  }, []);

  const setDownloadLocation = useCallback((path: string) => {
    setSettings((prev) => ({ ...prev, downloadLocation: path }));
  }, []);

  const setConflictHandling = useCallback((handling: ConflictHandling) => {
    setSettings((prev) => ({ ...prev, conflictHandling: handling }));
  }, []);

  const setRemindBeforeQuit = useCallback((remind: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, remindBeforeQuit: remind };
      saveSettings(next);
      return next;
    });
  }, []);

  return {
    settings,
    resolvedTheme,
    setTheme,
    setDownloadLocation,
    setConflictHandling,
    setRemindBeforeQuit,
  };
}
