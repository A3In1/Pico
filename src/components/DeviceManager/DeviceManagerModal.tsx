import { type DeviceInfo, type DeviceDetails } from "../../types";
import { WirelessConnect } from "../WirelessConnect/WirelessConnect";
import type { MdnsService, PairingStatus } from "../../types";
import { formatStorage } from "../../lib/format";
import "./DeviceManagerModal.css";

interface DeviceManagerModalProps {
  devices: DeviceInfo[];
  activeSerial: string | null;
  activeDeviceDetails: DeviceDetails | null;
  onSelectDevice: (serial: string) => void;
  onDisconnectWireless: (addr: string) => Promise<void>;
  onClose: () => void;
  // WirelessConnect Props
  nearbyServices: MdnsService[];
  pairingStatus: PairingStatus | null;
  isDiscovering: boolean;
  wirelessError: string | null;
  onPairDevice: (addr: string, code: string) => Promise<void>;
  onConnectDevice: (addr: string) => Promise<void>;
  onRefreshServices: () => Promise<void>;
  onClearWirelessError: () => void;
}

export function DeviceManagerModal({
  devices: allDevices,
  activeSerial,
  activeDeviceDetails,
  onSelectDevice,
  onDisconnectWireless,
  onClose,
  // WirelessConnect Props
  nearbyServices,
  pairingStatus,
  isDiscovering,
  wirelessError,
  onPairDevice,
  onConnectDevice,
  onRefreshServices,
  onClearWirelessError,
}: DeviceManagerModalProps) {
  // Deduplicate devices by model to prevent showing the same physical device twice (USB + WiFi)
  const uniqueDevices = allDevices.reduce((acc, dev) => {
    const key = dev.model || dev.serial;
    if (!acc.some(d => (d.model || d.serial) === key)) {
      acc.push(dev);
    }
    return acc;
  }, [] as DeviceInfo[]);

  const inactiveDevices = uniqueDevices.filter(d => d.serial !== activeSerial && (d.model || d.serial) !== activeDeviceDetails?.name);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal device-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header" style={{ paddingBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)" }}>Device Manager</h2>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Manage USB and Wireless connections</div>
          </div>
          <button className="settings-close-btn" onClick={onClose} style={{ alignSelf: 'flex-start' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-content" style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: "0 24px 24px", overflowY: "auto" }}>
          
          {/* Active Device Card */}
          {activeDeviceDetails && (
            <div className={`active-device-card ${activeDeviceDetails.connection_type}`}>
              <div className="active-card-header">
                <div className="active-card-title">
                  <div className="active-icon-circle">
                    {activeDeviceDetails.connection_type === 'wifi' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                        <line x1="12" y1="20" x2="12.01" y2="20" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Connected</span>
                      <span className="connection-badge">{activeDeviceDetails.connection_type === 'wifi' ? 'WiFi' : 'USB'}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                      {activeDeviceDetails.name}
                    </div>
                  </div>
                </div>
                {activeDeviceDetails.connection_type === 'wifi' && (
                  <button 
                    className="disconnect-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnectWireless(activeDeviceDetails.serial);
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>

              <div className="active-card-details">
                {activeDeviceDetails.connection_type === 'wifi' && (
                  <div className="detail-row">
                    <span className="detail-label">IP Address</span>
                    <span className="detail-value">{activeDeviceDetails.serial}</span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-label">Device</span>
                  <span className="detail-value">{activeDeviceDetails.name}</span>
                </div>
                {activeDeviceDetails.storage_total > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Internal Storage</span>
                    <span className="detail-value">{formatStorage(activeDeviceDetails.storage_used, activeDeviceDetails.storage_total)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Other Connected Devices */}
          {inactiveDevices.length > 0 && (
            <div>
              <h3 className="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                Other available devices
              </h3>
              <div className="inactive-list">
                {inactiveDevices.map((device) => {
                  const isWireless = device.connection_type === "wifi";
                  return (
                    <div key={device.serial} className="inactive-item">
                      <div className="inactive-info">
                        <div className={`inactive-icon ${isWireless ? 'wifi' : 'usb'}`}>
                          {isWireless ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                          )}
                        </div>
                        <div>
                          <div className="inactive-name">{device.model || device.serial}</div>
                          <div className="inactive-meta">{isWireless ? device.serial : "USB Device"}</div>
                        </div>
                      </div>
                      <button className="switch-btn" onClick={() => onSelectDevice(device.serial)}>
                        Switch
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="divider" />

          {/* Connect Wireless Device */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <h3 className="section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
              Other devices on network
            </h3>
            <div style={{ flex: 1, minHeight: 350, background: "var(--bg-inset)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
              <WirelessConnect
                connectedDevices={allDevices}
                nearbyServices={nearbyServices}
                pairingStatus={pairingStatus}
                isDiscovering={isDiscovering}
                error={wirelessError}
                onPairDevice={onPairDevice}
                onConnectDevice={onConnectDevice}
                onRefreshServices={onRefreshServices}
                onClearError={onClearWirelessError}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
