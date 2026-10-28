import { useEffect, useCallback } from "react";

interface KeyboardShortcuts {
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onDownload?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  onParent?: () => void;
  onRefresh?: () => void;
  onSearch?: () => void;
  onToggleSidebar?: () => void;
  onOpenFolder?: () => void;
}

/**
 * Hook to handle global keyboard shortcuts.
 * Binds Cmd+key combinations for the file browser.
 */
export function useKeyboard(shortcuts: KeyboardShortcuts) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Don't intercept when user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Escape in inputs (to blur/deselect)
        if (e.key === "Escape") {
          (target as HTMLInputElement).blur?.();
          shortcuts.onDeselectAll?.();
          e.preventDefault();
        }
        return;
      }

      // Escape — deselect all
      if (e.key === "Escape") {
        e.preventDefault();
        shortcuts.onDeselectAll?.();
        return;
      }

      // Enter — open selected folder
      if (e.key === "Enter") {
        e.preventDefault();
        shortcuts.onOpenFolder?.();
        return;
      }

      if (!isMeta) return;

      switch (e.key.toLowerCase()) {
        case "a":
          // Cmd+A — select all
          e.preventDefault();
          shortcuts.onSelectAll?.();
          break;
        case "d":
          // Cmd+D — download selected
          e.preventDefault();
          shortcuts.onDownload?.();
          break;
        case "[":
          // Cmd+[ — navigate back
          e.preventDefault();
          shortcuts.onBack?.();
          break;
        case "]":
          // Cmd+] — navigate forward
          e.preventDefault();
          shortcuts.onForward?.();
          break;
        case "arrowup":
          // Cmd+↑ — go to parent
          e.preventDefault();
          shortcuts.onParent?.();
          break;
        case "f":
          // Cmd+F — focus search
          e.preventDefault();
          shortcuts.onSearch?.();
          break;
        case "r":
          // Cmd+R — refresh
          e.preventDefault();
          shortcuts.onRefresh?.();
          break;
        case "\\":
          // Cmd+\ — toggle sidebar
          e.preventDefault();
          shortcuts.onToggleSidebar?.();
          break;
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
