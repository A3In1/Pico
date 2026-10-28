import { useState, useCallback, useEffect, useRef } from "react";
import type { FileEntry, FolderSizeUpdate } from "../types";
import { listDirectory, getQuickAccessPaths, getFolderSizes } from "../lib/tauri-commands";

import { listen, UnlistenFn } from "@tauri-apps/api/event";

// Global cache for folder sizes
// Key: device serial and absolute path, encoded without delimiter collisions
const folderSizeCache = new Map<string, number>();
// Set of parent directories whose children have been fully calculated
const calculatedPathsCache = new Set<string>();
const cacheKey = (serial: string, path: string) => JSON.stringify([serial, path]);

interface UseFileBrowserReturn {
  currentPath: string;
  files: FileEntry[];
  isLoading: boolean;
  error: string | null;
  quickAccessPaths: [string, string][];
  navigateTo: (path: string) => void;
  navigateUp: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  refresh: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  breadcrumbs: { label: string; path: string }[];
}

export function useFileBrowser(serial: string | null): UseFileBrowserReturn {
  const [currentPath, setCurrentPath] = useState("/sdcard");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(["/sdcard"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [quickAccessPaths, setQuickAccessPaths] = useState<[string, string][]>([]);

  const listingRequest = useRef(0);
  const activeSerial = useRef(serial);
  activeSerial.current = serial;
  const displayedDirectory = useRef<{ serial: string; path: string } | null>(null);

  // Fetch directory listing
  const fetchDirectory = useCallback(
    async (path: string, forceRefresh = false) => {
      if (!serial) return;
      const request = ++listingRequest.current;
      const isCurrent = () => request === listingRequest.current && activeSerial.current === serial;
      setIsLoading(true);
      setError(null);

      try {
        const entries = await listDirectory(serial, path);
        if (!isCurrent()) return;
        
        // Populate sizes from cache instantly
        const entriesWithSizes = entries.map(entry => {
          if (entry.is_directory) {
            const fullPath = path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
            const key = cacheKey(serial, fullPath);
            if (forceRefresh) folderSizeCache.delete(key);
            if (folderSizeCache.has(key)) {
              return { ...entry, size: folderSizeCache.get(key)! };
            }
          }
          return entry;
        });

        displayedDirectory.current = { serial, path };
        setFiles(entriesWithSizes);
        setCurrentPath(path);

        const parentKey = cacheKey(serial, path);
        if (forceRefresh) {
          calculatedPathsCache.delete(parentKey);
        }

        // Start background folder size calculation if not cached
        if (!calculatedPathsCache.has(parentKey)) {
          calculatedPathsCache.add(parentKey);
          getFolderSizes(serial, path).catch(() => { calculatedPathsCache.delete(parentKey); });
        }

      } catch (e) {
        if (!isCurrent()) return;
        setError(`${e}`);
        setFiles([]);
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    },
    [serial]
  );

  // Setup listener for live folder size updates
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setupListener = async () => {
      const release = await listen<FolderSizeUpdate>(
        "folder-size-update",
        (event) => {
          const { serial: eventSerial, parent_path, name, size } = event.payload;
          if (disposed || eventSerial !== activeSerial.current) return;
          
          // Update global cache
          const fullPath = parent_path === "/" ? `/${name}` : `${parent_path}/${name}`;
          folderSizeCache.set(cacheKey(eventSerial, fullPath), size);

          const displayed = displayedDirectory.current;
          if (displayed?.serial !== eventSerial || displayed.path !== parent_path) return;

          setFiles((prevFiles) => {
            const index = prevFiles.findIndex((f) => f.name === name);
            if (index !== -1 && prevFiles[index].is_directory) {
              const newFiles = [...prevFiles];
              newFiles[index] = { ...newFiles[index], size };
              return newFiles;
            }
            return prevFiles;
          });
        }
      );
      if (disposed) release();
      else unlisten = release;
    };

    setupListener().catch((e) => {
      if (!disposed) console.error("Failed to listen for folder sizes:", e);
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);


  // Navigate to a path (adds to history)
  const navigateTo = useCallback(
    (path: string) => {
      // Trim history forward if we're not at the end
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(path);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      fetchDirectory(path);
    },
    [history, historyIndex, fetchDirectory]
  );

  // Navigate up one level
  const navigateUp = useCallback(() => {
    if (currentPath === "/sdcard" || currentPath === "/") return;
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    navigateTo(parent);
  }, [currentPath, navigateTo]);

  // Navigate back in history
  const navigateBack = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    fetchDirectory(history[newIndex]);
  }, [historyIndex, history, fetchDirectory]);

  // Navigate forward in history
  const navigateForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    fetchDirectory(history[newIndex]);
  }, [historyIndex, history, fetchDirectory]);

  // Refresh current directory
  const refresh = useCallback(() => {
    fetchDirectory(currentPath, true);
  }, [currentPath, fetchDirectory]);

  // Build breadcrumb segments
  const breadcrumbs = currentPath
    .split("/")
    .filter(Boolean)
    .map((segment, index, arr) => ({
      label: segment,
      path: "/" + arr.slice(0, index + 1).join("/"),
    }));

  // Fetch quick access paths on connect
  useEffect(() => {
    let disposed = false;
    setQuickAccessPaths([]);
    if (serial) {
      getQuickAccessPaths(serial).then((paths) => {
        if (!disposed && activeSerial.current === serial) setQuickAccessPaths(paths);
      }).catch(() => {});
    }
    return () => { disposed = true; };
  }, [serial]);

  // Load initial directory on connect
  useEffect(() => {
    displayedDirectory.current = null;
    setFiles([]);
    setCurrentPath("/sdcard");
    setHistory(["/sdcard"]);
    setHistoryIndex(0);
    setError(null);
    setIsLoading(false);
    if (serial) {
      fetchDirectory("/sdcard");
    }
    return () => { listingRequest.current++; };
  }, [serial, fetchDirectory]);

  return {
    currentPath,
    files,
    isLoading,
    error,
    quickAccessPaths,
    navigateTo,
    navigateUp,
    navigateBack,
    navigateForward,
    refresh,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex < history.length - 1,
    breadcrumbs,
  };
}
