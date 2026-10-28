import { useState } from "react";
import type { DeviceDetails, DeviceInfo } from "../../types";
import { formatStorage, getStorageFraction } from "../../lib/format";
import "./DeviceBar.css";

interface DeviceBarProps {
  device: DeviceDetails;
  devices?: DeviceInfo[];
  onDeviceSelect?: (serial: string) => void;
  onSettingsClick?: () => void;
  onGoWireless?: (serial: string) => Promise<void>;
  onDisconnectWireless?: (addr: string) => Promise<void>;
  onManageDevices?: () => void;
}

export function DeviceBar({ device, onSettingsClick, onGoWireless, onDisconnectWireless, onManageDevices }: DeviceBarProps) {
  const fraction = getStorageFraction(device.storage_used, device.storage_total);
  const percentage = Math.round(fraction * 100);
  const isWifi = device.connection_type === "wifi";
  const [switchingToWireless, setSwitchingToWireless] = useState(false);

  const handleGoWireless = async () => {
    if (!onGoWireless || switchingToWireless) return;
    setSwitchingToWireless(true);
    try {
      await onGoWireless(device.serial);
    } catch {
      // error handled upstream
    } finally {
      setSwitchingToWireless(false);
    }
  };

  return (
    <div className="device-bar">
      <div className="device-bar-left">
        <div className="device-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>
        <div className="device-info">
          <div 
            className="device-name"
            onClick={onManageDevices}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: onManageDevices ? "pointer" : "default" }}
            title="Manage Devices"
          >
            {device.name}
            {onManageDevices && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </div>
          <div className="device-meta">
            {device.manufacturer} · Android {device.android_version}
          </div>
        </div>
      </div>

      <div className="device-bar-center">
        {isWifi ? (
          <div className="connection-badge wifi">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <span>Wi-Fi</span>
            {device.serial.includes(':') && (
              <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>
                {device.serial}
              </span>
            )}
          </div>
        ) : (
          <div className="connection-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 2v11h3v9l7-12h-4l4-8z" />
            </svg>
            <span>USB</span>
          </div>
        )}

        {/* "Go wireless" button for USB devices */}
        {!isWifi && onGoWireless && (
          <button
            className="go-wireless-btn"
            onClick={handleGoWireless}
            disabled={switchingToWireless}
            title="Switch to Wi-Fi connection"
            style={{ marginLeft: 8 }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            {switchingToWireless ? "Switching…" : "Go wireless"}
          </button>
        )}

        {/* Disconnect button for Wi-Fi devices */}
        {isWifi && onDisconnectWireless && (
          <button
            className="go-wireless-btn"
            onClick={() => onDisconnectWireless(device.serial)}
            title="Disconnect wireless"
            style={{ marginLeft: 8 }}
          >
            Disconnect
          </button>
        )}
      </div>

      <div className="device-bar-right">
        {device.storage_total > 0 && (
          <div className="storage-info">
            <div className="storage-bar-container">
              <div
                className={`storage-bar-fill ${percentage > 90 ? "critical" : percentage > 75 ? "warning" : ""}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="storage-text">
              {formatStorage(device.storage_used, device.storage_total)}
            </div>
          </div>
        )}

        {/* Settings gear button */}
        {onSettingsClick && (
          <button
            className="settings-gear-btn"
            onClick={onSettingsClick}
            title="Settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
