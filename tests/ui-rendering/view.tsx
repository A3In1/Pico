import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TransferDrawer } from "../../src/components/TransferDrawer/TransferDrawer";
import type { TransferProgress } from "../../src/types";
import { ProgressBar } from "../../src/components/TransferDrawer/ProgressBar";
import { FileBrowser } from "../../src/components/FileBrowser/FileBrowser";
import { SettingsModal } from "../../src/components/Settings/SettingsModal";
import { WirelessConnect } from "../../src/components/WirelessConnect/WirelessConnect";
import "../../src/index.css";
import "../../src/components/TransferDrawer/TransferDrawer.css";
const noop = () => { };
function View() {
    const [selected, setSelected] = useState(new Set<string>());
    const scene = new URLSearchParams(location.search).get("scene") ?? "progress";
    const files = Array.from({ length: 1000 }, (_, i) => ({ name: `Fixture-${String(i).padStart(4, "0")}`, path: `/sdcard/Fixture-${String(i).padStart(4, "0")}`, is_directory: i === 0, size: i, modified: "2024-03-01 10:30", file_type: i === 0 ? "folder" : "document" }));
    if (scene === "settings")
        return <SettingsModal isOpen onClose={noop} downloadLocation="/a/very/long/fixture/path" onDownloadLocationChange={noop} theme="dark" onThemeChange={noop} conflictHandling="ask" onConflictHandlingChange={noop} remindBeforeQuit onRemindBeforeQuitChange={noop}/>;
    if (scene === "wireless")
        return <WirelessConnect nearbyServices={[]} pairingStatus={null} isDiscovering={false} error={null} onPairDevice={async () => { }} onConnectDevice={async () => { }} onRefreshServices={async () => { }} onClearError={noop}/>;
    if (scene === "directory")
        return <div style={{ height: "100vh", display: "flex" }}><FileBrowser deviceSerial="fixture" onUpload={async () => { }} onTransferError={noop} files={files} isLoading={false} error={null} currentPath="/sdcard" breadcrumbs={[{ label: "sdcard", path: "/sdcard" }]} canGoBack={false} canGoForward={false} onNavigateTo={noop} onNavigateUp={noop} onNavigateBack={noop} onNavigateForward={noop} onRefresh={noop} selectedPaths={selected} onSelectionChange={setSelected} isSearchVisible onSearchToggle={noop} onDownload={noop} onPreviewFile={noop} isTransferring={false}/></div>;
    const transfer: TransferProgress = { context: { preview: false, batch_id: "fixture", serial: "fixture", destination: "/fixture", destination_name: null }, direction: "download", transfer_id: "fixture", file_name: "Long-file-name-".repeat(20) + ".jpg", file_path: "/fixture/long.jpg", bytes_transferred: 500000, total_bytes: 1000000, percentage: 50, progress_known: true, total_known: true, bytes_estimated: false, speed_bytes_per_sec: 10000, eta_seconds: 50, status: "inprogress", error: null };
    return <div style={{ padding: 20 }}>{[0, 50, 100].map(p => <div key={p} style={{ width: 300, marginBottom: 10 }}><ProgressBar percentage={p} known active label={`Width ${p}`}/></div>)}
    <div style={{ width: 300 }}><ProgressBar percentage={0} known={false} active label="Unknown"/><ProgressBar percentage={0} known={false} active={false} label="Stopped"/></div>
    <TransferDrawer transfers={new Map([[transfer.transfer_id, transfer]])} isOpen onClose={noop} onCancelOne={noop} onCancelAll={noop}/>
  </div>;
}
createRoot(document.getElementById("root")!).render(<View />);
