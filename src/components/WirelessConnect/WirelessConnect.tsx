import { useState } from "react";
import type { MdnsService, PairingStatus, DeviceInfo } from "../../types";
import "./WirelessConnect.css";

interface WirelessConnectProps {
  connectedDevices?: DeviceInfo[];
  nearbyServices: MdnsService[];
  pairingStatus: PairingStatus | null;
  isDiscovering: boolean;
  error: string | null;
  onPairDevice: (addr: string, code: string) => Promise<void>;
  onConnectDevice: (addr: string) => Promise<void>;
  onRefreshServices: () => Promise<void>;
  onClearError: () => void;
}

export function WirelessConnect({
  connectedDevices = [],
  nearbyServices,
  pairingStatus,
  isDiscovering,
  error,
  onPairDevice,
  onConnectDevice,
  onRefreshServices,
  onClearError,
}: WirelessConnectProps) {
  // Manual Connect State
  const [ip, setIp] = useState("");
  const [connectPort, setConnectPort] = useState("5555");
  const [pairPort, setPairPort] = useState("");
  const [code, setCode] = useState("");
  const [needsPairing, setNeedsPairing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');

  // Inline Pairing State (for discovered pairing services)
  const [inlinePairIpPort, setInlinePairIpPort] = useState<string | null>(null);
  const [inlineCode, setInlineCode] = useState("");

  const handleManualSubmit = async () => {
    if (!ip) return;
    
    onClearError();
    setIsProcessing(true);

    try {
      if (needsPairing && pairPort && code) {
        await onPairDevice(`${ip}:${pairPort}`, code);
        // After successful pairing, auto connect using the connect port
        await onConnectDevice(`${ip}:${connectPort}`);
      } else {
        await onConnectDevice(`${ip}:${connectPort}`);
      }
    } catch (e) {
      // Error handled by parent
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInlinePair = async (ipPort: string) => {
    if (!inlineCode) return;
    onClearError();
    setIsProcessing(true);
    try {
      await onPairDevice(ipPort, inlineCode);
      setInlinePairIpPort(null);
      setInlineCode("");
      // After successful pairing, we can't automatically connect because the connect port is different
      // but the phone will now start broadcasting the connect port. The user can just refresh.
      setTimeout(() => onRefreshServices(), 2000);
    } catch (e) {
      // Error handled by parent
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="wireless-connect" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      
      {/* Segmented Control */}
      <div style={{ display: "flex", justifyContent: "center", padding: "16px 16px 0" }}>
        <div className="segmented-control">
          <button
            className={`segment-btn ${activeTab === 'auto' ? 'active' : ''}`}
            onClick={() => setActiveTab('auto')}
          >
            Auto-Discovery
          </button>
          <button
            className={`segment-btn ${activeTab === 'manual' ? 'active' : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            Manual
          </button>
        </div>
      </div>

      <div className="wireless-tab-content" style={{ padding: 16, flex: 1, overflowY: "auto" }}>
        
        {activeTab === 'auto' && (
          <>
            <div className="nearby-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Scanning your local network for Android devices...</div>
              <button
                className={`wireless-btn-icon ${isDiscovering ? "spinning" : ""}`}
                onClick={onRefreshServices}
                title="Refresh"
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>

            {nearbyServices.length === 0 ? (
              <div className="nearby-empty" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13, background: "var(--bg-inset)", borderRadius: 8 }}>
                {isDiscovering ? (
                  <span>Scanning for devices…</span>
                ) : (
                  <span>
                    No devices found.<br/><br/>
                    Make sure <strong>Wireless debugging</strong> is ON and your phone is on the same Wi-Fi network.
                  </span>
                )}
              </div>
            ) : (
              <div className="nearby-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {nearbyServices.filter(svc => {
                  if (svc.service_type === "pairing") {
                    return !nearbyServices.some(s => s.service_type === "connect" && s.ip === svc.ip);
                  }
                  return true;
                }).map((svc) => {
                  const ipPort = `${svc.ip}:${svc.port}`;
                  const isPairingSvc = svc.service_type === "pairing";
                  const isAlreadyConnected = connectedDevices.some(d => d.serial === ipPort || d.serial.startsWith(`${svc.ip}:`));

                  return (
                    <div key={ipPort} style={{ background: "var(--bg-inset)", padding: 12, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{svc.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{ipPort} • {isAlreadyConnected ? "Connected" : (isPairingSvc ? "Ready to Pair" : "Ready to Connect")}</div>
                        </div>
                        {isAlreadyConnected ? (
                          <div style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "#22c55e", background: "rgba(34, 197, 94, 0.1)", borderRadius: 6 }}>
                            Connected
                          </div>
                        ) : isPairingSvc ? (
                          <button
                            className="wireless-btn wireless-btn-primary wireless-btn-small"
                            onClick={() => setInlinePairIpPort(inlinePairIpPort === ipPort ? null : ipPort)}
                            disabled={isProcessing}
                          >
                            Pair
                          </button>
                        ) : (
                          <button
                            className="wireless-btn wireless-btn-primary wireless-btn-small"
                            onClick={() => onConnectDevice(ipPort)}
                            disabled={isProcessing}
                          >
                            Connect
                          </button>
                        )}
                      </div>

                      {/* Inline Pairing Code Input */}
                      {isPairingSvc && inlinePairIpPort === ipPort && (
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <input
                            type="text"
                            placeholder="6-digit PIN"
                            value={inlineCode}
                            onChange={(e) => setInlineCode(e.target.value)}
                            maxLength={6}
                            style={{ flex: 1, padding: "6px 10px", fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                          />
                          <button
                            className="wireless-btn wireless-btn-primary wireless-btn-small"
                            onClick={() => handleInlinePair(ipPort)}
                            disabled={!inlineCode || isProcessing}
                          >
                            Submit
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Manual Connect Tab */}
        {activeTab === 'manual' && (
          <div style={{ background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.4 }}>
              If Auto-Discovery doesn't find your phone (for example, on a corporate network or VPN), enter the details from your phone's Wireless debugging screen here.
            </p>

            <div className="pairing-form" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="form-field">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>IP Address</label>
                <input
                  type="text"
                  placeholder="192.168.1.5"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={needsPairing}
                  onChange={(e) => setNeedsPairing(e.target.checked)}
                />
                Device is not paired yet
              </label>

              {needsPairing && (
                <div style={{ display: "flex", gap: 12, background: "rgba(0,0,0,0.05)", padding: 12, borderRadius: 8 }}>
                  <div className="form-field" style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>Pairing Port</label>
                    <input
                      type="text"
                      placeholder="37000"
                      value={pairPort}
                      onChange={(e) => setPairPort(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                    />
                  </div>
                  <div className="form-field" style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>Pairing Code</label>
                    <input
                      type="text"
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      maxLength={6}
                      style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                    />
                  </div>
                </div>
              )}

              <div className="form-field">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>Connect Port {needsPairing && "(Usually different from pairing port)"}</label>
                <input
                  type="text"
                  placeholder="41234"
                  value={connectPort}
                  onChange={(e) => setConnectPort(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>

              <button
                className="wireless-btn wireless-btn-primary"
                onClick={handleManualSubmit}
                disabled={isProcessing || !ip || (needsPairing && (!pairPort || !code))}
                style={{ marginTop: 8 }}
              >
                {isProcessing ? "Processing…" : (needsPairing ? "Pair & Connect" : "Connect")}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="wireless-error" style={{ marginTop: 16, padding: 12, background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", borderRadius: 8, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{error}</span>
            <button onClick={onClearError} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 4 }}>×</button>
          </div>
        )}

        {pairingStatus === "connected" && (
          <div className="wireless-message success" style={{ marginTop: 16 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Device connected!
          </div>
        )}
      </div>
    </div>
  );
}
