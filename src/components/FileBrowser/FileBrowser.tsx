import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { startFileDrag } from "../../lib/tauri-commands";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileEntry } from "../../types";
import { getFileIcon } from "../../lib/file-icons";
import { formatBytes } from "../../lib/format";
import { SearchBar } from "./SearchBar";
import { SelectionBar } from "./SelectionBar";
import "./FileBrowser.css";

interface FileBrowserProps {
  files: FileEntry[];
  deviceSerial: string;
  onUpload: (paths: string[], destination: string) => Promise<void>;
  onTransferError: (message: string) => void;
  isLoading: boolean;
  error: string | null;
  currentPath: string;
  breadcrumbs: { label: string; path: string }[];
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigateTo: (path: string) => void;
  onNavigateUp: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onRefresh: () => void;
  // Selection
  selectedPaths: Set<string>;
  onSelectionChange: (paths: Set<string>) => void;
  // Search
  isSearchVisible: boolean;
  onSearchToggle: (visible: boolean) => void;
  // Download
  onDownload: () => void;
  isTransferring?: boolean;
  onPreviewFile?: (path: string) => void;
}

type SortKey = "name" | "type" | "size" | "date";
type SortOrder = "asc" | "desc";

/** Human-readable type label */
function typeLabel(ft: string): string {
  const labels: Record<string, string> = {
    folder: "Folder",
    image: "Image",
    video: "Video",
    audio: "Audio",
    document: "Document",
    archive: "Archive",
    apk: "APK",
    other: "File",
  };
  return labels[ft] || "File";
}

export function FileBrowser({
  deviceSerial,
  onUpload,
  onTransferError,
  currentPath,
  files,
  isLoading,
  error,
  breadcrumbs,
  canGoBack,
  canGoForward,
  onNavigateTo,
  onNavigateUp,
  onNavigateBack,
  onNavigateForward,
  onRefresh,
  selectedPaths,
  onSelectionChange,
  isSearchVisible,
  onSearchToggle,
  onDownload,
  onPreviewFile,
}: FileBrowserProps) {
  // ── Sorting ──
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // ── Search/Filter ──
  const [searchQuery, setSearchQuery] = useState("");

  // ── Selection tracking ──
  const lastClickedIndexRef = useRef<number | null>(null);

  // Reset search when path changes
  const prevPathRef = useRef(breadcrumbs.map((b) => b.path).join("/"));
  const currentPathKey = breadcrumbs.map((b) => b.path).join("/");
  if (currentPathKey !== prevPathRef.current) {
    prevPathRef.current = currentPathKey;
    lastClickedIndexRef.current = null;
    if (searchQuery) {
      setSearchQuery("");
    }
  }

  // ── Sort files ──
  const sortedFiles = useMemo(() => {
    const sorted = [...files];
    sorted.sort((a, b) => {
      // Directories always first only when sorting by name or type
      if ((sortKey === "name" || sortKey === "type") && a.is_directory !== b.is_directory) {
        return a.is_directory ? -1 : 1;
      }

      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          break;
        case "type":
          cmp = a.file_type.localeCompare(b.file_type);
          if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          break;
        case "size":
          cmp = a.size - b.size;
          break;
        case "date":
          // Handle potential missing dates by pushing them to the end
          const dateA = a.modified || "";
          const dateB = b.modified || "";
          cmp = dateA.localeCompare(dateB);
          break;
      }

      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [files, sortKey, sortOrder]);

  // ── Virtualizer ──
  const parentRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const outbound = useRef(false);
  const gesture = useRef<{ x: number; y: number; entries: FileEntry[]; serial: string } | null>(null);
  const latest = useRef({ onUpload, onTransferError, currentPath });
  latest.current = { onUpload, onTransferError, currentPath };

  useEffect(() => {
    let disposed = false;
    const dropped = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (disposed || outbound.current) return;
      if (payload.type === "leave") { setDropTarget(null); return; }
      // Wry 0.57's AppKit implementation emits NSView points directly;
      // other platforms emit physical pixels. Account for Retina only there.
      const scale = navigator.platform.includes("Mac") ? 1 : window.devicePixelRatio;
      const x = payload.position.x / scale;
      const y = payload.position.y / scale;
      const hit = document.elementFromPoint(x, y);
      const list = parentRef.current;
      if (!list || !hit || !list.contains(hit)) { setDropTarget(null); return; }
      const folder = hit.closest<HTMLElement>("[data-drop-path]");
      const destination = folder?.dataset.dropPath || latest.current.currentPath;
      if (payload.type === "drop") {
        setDropTarget(null);
        if (payload.paths.length) void latest.current.onUpload(payload.paths, destination)
          .catch(e => latest.current.onTransferError(`Upload error: ${e}`));
      } else {
        setDropTarget(destination);
      }
    });
    const ended = listen("native-drag-ended", () => { outbound.current = false; gesture.current = null; });
    const release = () => { gesture.current = null; };
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", release);
    return () => {
      disposed = true;
      void dropped.then(fn => fn()).catch(() => {});
      void ended.then(fn => fn()).catch(() => {});
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  const beginGesture = (file: FileEntry, e: React.PointerEvent) => {
    if (e.button !== 0 || outbound.current || (e.target as HTMLElement).closest("input, label, button")) return;
    const entries = selectedPaths.has(file.path) ? files.filter(f => selectedPaths.has(f.path)) : [file];
    gesture.current = { x: e.clientX, y: e.clientY, entries, serial: deviceSerial };
  };
  const moveGesture = (e: React.PointerEvent) => {
    const drag = gesture.current;
    if (!drag || outbound.current) return;
    if (!(e.buttons & 1)) { gesture.current = null; return; }
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    gesture.current = null;
    outbound.current = true;
    setDropTarget(null);
    void startFileDrag(drag.serial, drag.entries).catch(e => {
      outbound.current = false;
      latest.current.onTransferError(`Could not start drag: ${e}`);
    });
  };


  // ── Filter files by search ──
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return sortedFiles;
    const q = searchQuery.toLowerCase().trim();
    return sortedFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [sortedFiles, searchQuery]);

  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // height of .file-row
    overscan: 10,
  });

  // ── Sort toggle handler ──
  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortOrder("asc");
      }
    },
    [sortKey]
  );

  // ── Sort indicator ──
  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return (
      <span className="sort-indicator">
        {sortOrder === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  // ── Checkbox toggle with Shift+Click range support ──
  const handleCheckboxClick = useCallback(
    (file: FileEntry, index: number, event: React.MouseEvent) => {
      event.stopPropagation();

      const next = new Set(selectedPaths);

      if (event.shiftKey && lastClickedIndexRef.current !== null) {
        // Range select
        const start = Math.min(lastClickedIndexRef.current, index);
        const end = Math.max(lastClickedIndexRef.current, index);
        for (let i = start; i <= end; i++) {
          if (filteredFiles[i]) next.add(filteredFiles[i].path);
        }
      } else {
        // Toggle single
        if (next.has(file.path)) {
          next.delete(file.path);
        } else {
          next.add(file.path);
        }
      }

      lastClickedIndexRef.current = index;
      onSelectionChange(next);
    },
    [selectedPaths, onSelectionChange, filteredFiles]
  );

  // ── Row click (Cmd+Click to toggle) ──
  const handleRowClick = useCallback(
    (file: FileEntry, index: number, event: React.MouseEvent) => {
      if (event.metaKey || event.ctrlKey) {
        handleCheckboxClick(file, index, event);
      }
    },
    [handleCheckboxClick]
  );

  // ── Select All checkbox ──
  const allSelected =
    filteredFiles.length > 0 &&
    filteredFiles.every((f) => selectedPaths.has(f.path));
  const someSelected =
    !allSelected && filteredFiles.some((f) => selectedPaths.has(f.path));

  const handleSelectAllToggle = useCallback(() => {
    if (allSelected) {
      // Deselect all
      onSelectionChange(new Set());
    } else {
      // Select all visible files
      const allPaths = new Set(filteredFiles.map((f) => f.path));
      onSelectionChange(allPaths);
    }
  }, [allSelected, filteredFiles, onSelectionChange]);

  // ── Compute selected size ──
  const selectedSize = useMemo(() => {
    let total = 0;
    for (const f of files) {
      if (selectedPaths.has(f.path) && !f.is_directory) {
        total += f.size;
      }
    }
    return total;
  }, [files, selectedPaths]);



  return (
    <div className="file-browser" onPointerMove={moveGesture} onPointerCancel={() => { gesture.current = null; }}>
      {/* Toolbar: navigation + breadcrumb + search toggle + refresh */}
      <div className="browser-toolbar">
        <div className="nav-buttons">
          <button
            className="nav-btn"
            onClick={onNavigateBack}
            disabled={!canGoBack}
            title="Back (⌘[)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            className="nav-btn"
            onClick={onNavigateForward}
            disabled={!canGoForward}
            title="Forward (⌘])"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            className="nav-btn"
            onClick={onNavigateUp}
            title="Up (⌘↑)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>

        <div className="breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="breadcrumb-segment">
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              <button
                className={`breadcrumb-btn ${i === breadcrumbs.length - 1 ? "current" : ""}`}
                onClick={() => onNavigateTo(crumb.path)}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        <button
          className={`nav-btn search-toggle-btn ${isSearchVisible ? "active" : ""}`}
          onClick={() => onSearchToggle(!isSearchVisible)}
          title="Search (⌘F)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        <button
          className="nav-btn refresh-btn"
          onClick={onRefresh}
          title="Refresh (⌘R)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {/* Search Bar */}
      <SearchBar
        query={searchQuery}
        onChange={setSearchQuery}
        onClose={() => onSearchToggle(false)}
        isVisible={isSearchVisible}
        resultCount={filteredFiles.length}
        totalCount={files.length}
      />

      {/* File list */}
      <div className={`file-list-container ${dropTarget ? "is-drop-target" : ""}`} ref={parentRef}>
        {dropTarget && <div className="drop-hint" role="status">Drop to upload to {dropTarget}</div>}
        {isLoading && (
          <div className="file-list-loading">
            <div className="loading-spinner" />
            <span>Loading files...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="file-list-error">
            <span className="error-icon">⚠️</span>
            <span>
              {error.toLowerCase().includes("permission denied")
                ? "Permission denied — this path is not accessible over USB debugging."
                : error}
            </span>
          </div>
        )}

        {!isLoading && !error && filteredFiles.length === 0 && searchQuery && (
          <div className="file-list-empty">
            <span className="empty-icon">🔍</span>
            <span>No files matching "{searchQuery}"</span>
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
            >
              Clear search
            </button>
          </div>
        )}

        {!isLoading && !error && files.length === 0 && !searchQuery && (
          <div className="file-list-empty">
            <span className="empty-icon">📂</span>
            <span>This folder is empty</span>
          </div>
        )}

        {!isLoading && !error && filteredFiles.length > 0 && (
          <div className="file-list-wrapper" style={{ position: "relative" }}>
            {/* Header */}
            <div className="file-row file-header">
              <div className="file-col file-checkbox-col">
                <label className="checkbox-wrapper" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="file-checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={handleSelectAllToggle}
                  />
                  <span className="checkbox-visual">
                    {allSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {someSelected && !allSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                  </span>
                </label>
              </div>
              <div className="file-col file-icon-col" />
              <div
                className={`file-col file-name-col sortable ${sortKey === "name" ? "sorted" : ""}`}
                onClick={() => handleSort("name")}
              >
                Name {sortIndicator("name")}
              </div>
              <div
                className={`file-col file-type-col sortable ${sortKey === "type" ? "sorted" : ""}`}
                onClick={() => handleSort("type")}
              >
                Type {sortIndicator("type")}
              </div>
              <div
                className={`file-col file-size-col sortable ${sortKey === "size" ? "sorted" : ""}`}
                onClick={() => handleSort("size")}
              >
                Size {sortIndicator("size")}
              </div>
              <div
                className={`file-col file-date-col sortable ${sortKey === "date" ? "sorted" : ""}`}
                onClick={() => handleSort("date")}
              >
                Modified {sortIndicator("date")}
              </div>
            </div>

            {/* Rows */}
            <div className="file-list" style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const index = virtualItem.index;
                const file = filteredFiles[index];
                const selected = selectedPaths.has(file.path);
                return (
                  <div
                    key={virtualItem.key}
                    className={`file-row ${file.is_directory ? "is-dir" : ""} ${selected ? "is-selected" : ""} ${dropTarget === file.path ? "is-drop-folder" : ""}`}
                    data-drop-path={file.is_directory ? file.path : undefined}
                    onPointerDown={(e) => beginGesture(file, e)}
                    onDragStart={(e) => e.preventDefault()}
                    title="Drag to Finder to download"
                    onClick={(e) => handleRowClick(file, index, e)}
                    onDoubleClick={() => {
                      if (file.is_directory) {
                        onNavigateTo(file.path);
                      } else if (onPreviewFile) {
                        onPreviewFile(file.path);
                      }
                    }}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <div className="file-col file-checkbox-col">
                      <label
                        className="checkbox-wrapper"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="file-checkbox"
                          checked={selected}
                          onChange={() => {}}
                          onClick={(e) => handleCheckboxClick(file, index, e as unknown as React.MouseEvent)}
                        />
                        <span className={`checkbox-visual ${selected ? "checked" : ""}`}>
                          {selected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                      </label>
                    </div>
                    <div className="file-col file-icon-col">
                      <span className="file-type-icon">{getFileIcon(file.file_type)}</span>
                    </div>
                    <div className="file-col file-name-col">
                      <span className="file-name">{file.name}</span>
                    </div>
                    <div className="file-col file-type-col">
                      <span className="file-type-label">{typeLabel(file.file_type)}</span>
                    </div>
                    <div className="file-col file-size-col">
                      <span className="file-size">
                        {file.is_directory && file.size === 0 ? "—" : formatBytes(file.size)}
                      </span>
                    </div>
                    <div className="file-col file-date-col">
                      <span className="file-date">{file.modified || "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selection bar */}
      <SelectionBar
        selectedCount={selectedPaths.size}
        selectedSize={selectedSize}
        onDeselectAll={() => onSelectionChange(new Set())}
        onDownload={onDownload}
      />

      {/* Status bar — only show when nothing is selected */}
      {selectedPaths.size === 0 && (
        <div className="browser-status-bar">
          <span title="Drop Mac files here to upload; drag phone items to Finder to download">
            {filteredFiles.length} items
            {searchQuery && ` (filtered from ${files.length})`}
            {!searchQuery && filteredFiles.filter(f => f.is_directory).length > 0 && (
              <> · {filteredFiles.filter(f => f.is_directory).length} folders</>
            )}
            {!searchQuery && filteredFiles.filter(f => !f.is_directory).length > 0 && (
              <> · {filteredFiles.filter(f => !f.is_directory).length} files</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
