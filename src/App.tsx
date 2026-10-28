import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";

import { useDevice } from "./hooks/useDevice";
import { useFileBrowser } from "./hooks/useFileBrowser";
import { useKeyboard } from "./hooks/useKeyboard";
import { useTransfer } from "./hooks/useTransfer";
import { useSettings } from "./hooks/useSettings";
import { useWireless } from "./hooks/useWireless";
import { DeviceBar } from "./components/DeviceBar/DeviceBar";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { FileBrowser } from "./components/FileBrowser/FileBrowser";
import { EmptyState } from "./components/EmptyState/EmptyState";
import { TransferDrawer } from "./components/TransferDrawer/TransferDrawer";
import { Toast } from "./components/Toast/Toast";
import { ConflictDialog } from "./components/Settings/ConflictDialog";
import type { ConflictHandling } from "./hooks/useSettings";
import { SettingsModal } from "./components/Settings/SettingsModal";
import { DeviceManagerModal } from "./components/DeviceManager/DeviceManagerModal";
import { WirelessConnect } from "./components/WirelessConnect/WirelessConnect";
import { ExitWarningDialog } from "./components/ExitWarningDialog/ExitWarningDialog";
import { exitApp, getDownloadLocation, checkDownloadConflicts, checkUploadConflicts } from "./lib/tauri-commands";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";

function App() {
  const { device, devices, setActiveSerial, isConnected, isDetecting, error: deviceError, refreshDevice } = useDevice();

  // ── Settings ──
  const {
    settings,
    setTheme,
    setDownloadLocation,
    setConflictHandling,
    setRemindBeforeQuit,
  } = useSettings();

  // ── Wireless ──
  const wireless = useWireless();

  // ── Connection mode toggle (USB vs Wireless) ──
  const [connectionMode, setConnectionMode] = useState<"usb" | "wireless">("usb");

  // Open wireless panel when switching to wireless mode
  useEffect(() => {
    wireless.setWirelessPanelOpen(connectionMode === "wireless");
  }, [connectionMode]);

  // When a device connects via wireless, switch back to normal view
  useEffect(() => {
    if (isConnected && connectionMode === "wireless") {
      // A device just connected — close the wireless panel
      setConnectionMode("usb");
      wireless.setWirelessPanelOpen(false);
    }
  }, [isConnected, connectionMode, wireless.setWirelessPanelOpen]);

  // ── Resolve download location: prefer user setting, fall back to Rust default ──
  const [resolvedDownloadPath, setResolvedDownloadPath] = useState(
    settings.downloadLocation
  );

  useEffect(() => {
    if (settings.downloadLocation === "~/Downloads") {
      // Fetch the real default path from Rust (resolves ~ to absolute path)
      getDownloadLocation()
        .then(setResolvedDownloadPath)
        .catch(() => setResolvedDownloadPath(settings.downloadLocation));
    } else {
      setResolvedDownloadPath(settings.downloadLocation);
    }
  }, [settings.downloadLocation]);

  const {
    currentPath,
    files,
    isLoading,
    error: browseError,
    quickAccessPaths,
    navigateTo,
    navigateUp,
    navigateBack,
    navigateForward,
    refresh,
    canGoBack,
    canGoForward,
    breadcrumbs,
  } = useFileBrowser(isConnected && device ? device.serial : null);

  // ── Selection state (lifted here for keyboard shortcut access) ──
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // ── Search visibility ──
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  // ── Sidebar visibility ──
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeviceManagerOpen, setIsDeviceManagerOpen] = useState(false);
  const [isQuitDialogOpen, setIsQuitDialogOpen] = useState(false);

  // ── Transfer management ──
  const {
    transfers,
    isTransferring,
    isDrawerOpen,
    lastResult,
    startDownload,
    startUpload,
    startPreview,
    cancelOne,
    retryOne,
    cancelAll,
    closeDrawer,
    toast,
    dismissToast,
    notify,
  } = useTransfer();

  type Choice = Exclude<ConflictHandling, "ask">;
  type ConflictRequest = { names: string[]; resolve: (choice: Choice | null) => void };
  const conflictQueue = useRef<ConflictRequest[]>([]);
  const [conflictRequest, setConflictRequest] = useState<ConflictRequest | null>(null);
  const chooseConflict = useCallback((choice: Choice | null) => {
    const request = conflictQueue.current.shift();
    request?.resolve(choice);
    setConflictRequest(conflictQueue.current[0] || null);
  }, []);
  useEffect(() => () => {
    conflictQueue.current.splice(0).forEach(request => request.resolve(null));
  }, []);
  const resolveConflicts = useCallback(async (check: () => Promise<string[]>): Promise<Choice | null> => {
    if (settings.conflictHandling !== "ask") return settings.conflictHandling;
    const names = await check();
    if (!names.length) return "keep-both";
    return new Promise(resolve => {
      const request = { names, resolve };
      conflictQueue.current.push(request);
      if (conflictQueue.current.length === 1) setConflictRequest(request);
    });
  }, [settings.conflictHandling]);

  const handleUpload = useCallback(async (paths: string[], destination: string) => {
    if (!device || !isConnected) { notify("Connect a phone before uploading", "error"); return; }
    const serial = device.serial;
    const handling = await resolveConflicts(() => checkUploadConflicts(serial, paths, destination));
    if (handling) await startUpload(serial, paths, destination, handling);
  }, [device, isConnected, resolveConflicts, startUpload, notify]);

  // ── Global Error Handling ──
  useEffect(() => {
    if (browseError) {
      notify(browseError, "error");
    }
  }, [browseError, notify]);

  useEffect(() => {
    if (deviceError) {
      notify(`Connection error: ${deviceError}`, "error");
    }
  }, [deviceError, notify]);

  useEffect(() => {
    if (wireless.error) {
      notify(`Wireless error: ${wireless.error}`, "error");
      wireless.clearError();
    }
  }, [wireless.error, wireless, notify]);

  // Refresh device stats on transfer complete
  useEffect(() => {
    if (lastResult) {
      refreshDevice();
    }
  }, [lastResult, refreshDevice]);

  useEffect(() => {
    const unlisten = listen<string>("phone-files-changed", ({ payload: serial }) => {
      if (serial === device?.serial) refresh();
    });
    return () => { void unlisten.then(fn => fn()).catch(() => {}); };
  }, [device?.serial, refresh]);

  // ── App Close Confirmation ──
  const hasUsedDebuggingRef = React.useRef(false);
  const isExitRequestedRef = React.useRef(false);
  useEffect(() => {
    if (
      connectionMode === "wireless" ||
      devices.some(
        (connectedDevice) =>
          connectedDevice.status === "device" || connectedDevice.status === "unauthorized"
      )
    ) {
      hasUsedDebuggingRef.current = true;
    }
  }, [connectionMode, devices]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (isExitRequestedRef.current) {
        return;
      }

      event.preventDefault();

      if (!hasUsedDebuggingRef.current || !settings.remindBeforeQuit) {
        isExitRequestedRef.current = true;
        await exitApp();
        return;
      }

      setIsQuitDialogOpen(true);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [settings.remindBeforeQuit]);

  const handleQuit = useCallback(async (dontRemindAgain: boolean) => {
    if (dontRemindAgain) {
      setRemindBeforeQuit(false);
    }
    setIsQuitDialogOpen(false);
    isExitRequestedRef.current = true;
    await exitApp();
  }, [setRemindBeforeQuit]);

  // Clear selection when navigating to a new directory
  const handleNavigateTo = useCallback(
    (path: string) => {
      setSelectedPaths(new Set());
      navigateTo(path);
    },
    [navigateTo]
  );

  const handleNavigateUp = useCallback(() => {
    setSelectedPaths(new Set());
    navigateUp();
  }, [navigateUp]);

  const handleNavigateBack = useCallback(() => {
    setSelectedPaths(new Set());
    navigateBack();
  }, [navigateBack]);

  const handleNavigateForward = useCallback(() => {
    setSelectedPaths(new Set());
    navigateForward();
  }, [navigateForward]);

  // ── Preview handler ──
  const handlePreviewFile = useCallback(async (path: string) => {
    if (!device) return;
    try {
      notify("Downloading file for preview...", "info");
      await startPreview(device.serial, path);
    } catch (e) {
      notify(`Preview failed: ${e}`, "error");
    }
  }, [device, notify, startPreview]);

  // ── Download handler — wired to Tauri backend ──
  const handleDownload = useCallback(async () => {
    if (selectedPaths.size === 0 || !device) {
      return;
    }
    const remotePaths = files
      .filter((f) => selectedPaths.has(f.path))
      .map((f) => f.path);

    if (remotePaths.length === 0) return;

    try {
      const lastSavedPath = localStorage.getItem("lastSavedPath") || resolvedDownloadPath;
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: lastSavedPath,
        title: "Select Download Location",
      });

      if (selected && typeof selected === "string") {
        localStorage.setItem("lastSavedPath", selected);
        const handling = await resolveConflicts(() => checkDownloadConflicts(remotePaths, selected));
        if (handling) await startDownload(device.serial, remotePaths, selected, handling);
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
    }
  }, [files, selectedPaths, device, startDownload, resolveConflicts, resolvedDownloadPath]);

  // ── Download location change handler ──
  const handleDownloadLocationChange = useCallback(
    (path: string) => {
      setDownloadLocation(path);
    },
    [setDownloadLocation]
  );

  // ── "Go Wireless" handler ──
  const handleGoWireless = useCallback(async (serial: string) => {
    try {
      await wireless.enableWirelessFromUsb(serial);
    } catch (e) {
      console.error("Go wireless failed:", e);
    }
  }, [wireless]);

  // ── Disconnect wireless handler ──
  const handleDisconnectWireless = useCallback(async (addr: string) => {
    try {
      await wireless.disconnectDevice(addr);
    } catch (e) {
      console.error("Disconnect failed:", e);
    }
  }, [wireless]);

  // ── Keyboard shortcuts ──
  const keyboardShortcuts = useMemo(
    () => ({
      onSelectAll: () => {
        if (isConnected && files.length > 0) {
          setSelectedPaths(new Set(files.map((f) => f.path)));
        }
      },
      onDeselectAll: () => {
        setSelectedPaths(new Set());
        setIsSettingsOpen(false);
      },
      onDownload: handleDownload,
      onBack: handleNavigateBack,
      onForward: handleNavigateForward,
      onParent: handleNavigateUp,
      onRefresh: refresh,
      onSearch: () => {
        if (isConnected) {
          setIsSearchVisible((prev) => !prev);
        }
      },
      onToggleSidebar: () => {
        setIsSidebarVisible((prev) => !prev);
      },
    }),
    [
      isConnected,
      files,
      handleDownload,
      handleNavigateBack,
      handleNavigateForward,
      handleNavigateUp,
      refresh,
    ]
  );

  useKeyboard(keyboardShortcuts);

  return (
    <div className="app-container">
      {/* Device bar — only shown when connected */}
      {isConnected && device && (
        <DeviceBar
          device={device}
          devices={devices}
          onDeviceSelect={setActiveSerial}
          onSettingsClick={() => setIsSettingsOpen(true)}
          onGoWireless={handleGoWireless}
          onDisconnectWireless={handleDisconnectWireless}
          onManageDevices={() => setIsDeviceManagerOpen(true)}
        />
      )}

      {/* Main content area */}
      <div className="app-main">
        {/* Empty states when not connected */}
        {!isConnected && connectionMode === "usb" && (
          <div className="app-content">
            {isDetecting && (
              <EmptyState
                type="detecting"
                connectionMode={connectionMode}
                onConnectionModeChange={setConnectionMode}
              />
            )}
            {!isDetecting && !deviceError && (
              <EmptyState
                type="no-device"
                connectionMode={connectionMode}
                onConnectionModeChange={setConnectionMode}
              />
            )}
            {!isDetecting && deviceError && deviceError.includes("authorization") && (
              <EmptyState
                type="unauthorized"
                connectionMode={connectionMode}
                onConnectionModeChange={setConnectionMode}
              />
            )}
            {!isDetecting && deviceError && !deviceError.includes("authorization") && (
              <EmptyState
                type="error"
                message={deviceError}
                connectionMode={connectionMode}
                onConnectionModeChange={setConnectionMode}
              />
            )}
          </div>
        )}

        {/* Wireless connect panel */}
        {!isConnected && connectionMode === "wireless" && (
          <div className="app-content">
            <div style={{ padding: "16px 16px 0", display: "flex", justifyContent: "center" }}>
              <div className="connection-toggle">
                <button
                  className="connection-toggle-btn"
                  onClick={() => setConnectionMode("usb")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 2v11h3v9l7-12h-4l4-8z" />
                  </svg>
                  USB
                </button>
                <button
                  className="connection-toggle-btn active"
                  onClick={() => setConnectionMode("wireless")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <line x1="12" y1="20" x2="12.01" y2="20" />
                  </svg>
                  Wireless
                </button>
              </div>
            </div>
            <WirelessConnect
              connectedDevices={devices}
              nearbyServices={wireless.nearbyServices}
              pairingStatus={wireless.pairingStatus}
              isDiscovering={wireless.isDiscovering}
              error={wireless.error}
              onPairDevice={wireless.pairDevice}
              onConnectDevice={wireless.connectDevice}
              onRefreshServices={wireless.refreshServices}
              onClearError={wireless.clearError}
            />
          </div>
        )}

        {/* File browser when connected */}
        {isConnected && device && (
          <>
            {isSidebarVisible && (
              <Sidebar
                quickAccessPaths={quickAccessPaths}
                currentPath={currentPath}
                onNavigate={handleNavigateTo}
              />
            )}
            <FileBrowser
              key={device.serial}
              deviceSerial={device.serial}
              onUpload={handleUpload}
              onTransferError={(message) => notify(message, "error")}
              files={files}
              isLoading={isLoading}
              error={browseError}
              currentPath={currentPath}
              breadcrumbs={breadcrumbs}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onNavigateTo={handleNavigateTo}
              onNavigateUp={handleNavigateUp}
              onNavigateBack={handleNavigateBack}
              onNavigateForward={handleNavigateForward}
              onRefresh={refresh}
              selectedPaths={selectedPaths}
              onSelectionChange={setSelectedPaths}
              isSearchVisible={isSearchVisible}
              onSearchToggle={setIsSearchVisible}
              onDownload={handleDownload}
              onPreviewFile={handlePreviewFile}
              isTransferring={isTransferring}
            />
          </>
        )}
      </div>

      {/* Transfer drawer — slides up from bottom */}
      <TransferDrawer
        transfers={transfers}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onCancelOne={cancelOne}
        onCancelAll={cancelAll}
        onRetry={(transferId) => retryOne(transferId)}
      />

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={dismissToast}
        />
      )}

      <ConflictDialog
        isOpen={conflictRequest !== null}
        fileNames={conflictRequest?.names || []}
        onChoose={chooseConflict}
        onCancel={() => chooseConflict(null)}
      />

      {/* Settings modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        downloadLocation={settings.downloadLocation}
        onDownloadLocationChange={handleDownloadLocationChange}
        theme={settings.theme}
        onThemeChange={setTheme}
        conflictHandling={settings.conflictHandling}
        onConflictHandlingChange={setConflictHandling}
        remindBeforeQuit={settings.remindBeforeQuit}
        onRemindBeforeQuitChange={setRemindBeforeQuit}
      />

      <ExitWarningDialog
        isOpen={isQuitDialogOpen}
        onCancel={() => setIsQuitDialogOpen(false)}
        onQuit={handleQuit}
      />

      {/* Device Manager modal */}
      {isDeviceManagerOpen && (
        <DeviceManagerModal
          devices={devices}
          activeSerial={device?.serial || null}
          activeDeviceDetails={device || null}
          onSelectDevice={(serial) => {
            setActiveSerial(serial);
            setIsDeviceManagerOpen(false);
          }}
          onDisconnectWireless={handleDisconnectWireless}
          onClose={() => setIsDeviceManagerOpen(false)}
          
          nearbyServices={wireless.nearbyServices}
          pairingStatus={wireless.pairingStatus}
          isDiscovering={wireless.isDiscovering}
          wirelessError={wireless.error}
          onPairDevice={wireless.pairDevice}
          onConnectDevice={wireless.connectDevice}
          onRefreshServices={wireless.refreshServices}
          onClearWirelessError={wireless.clearError}
        />
      )}
    </div>
  );
}

export default App;
