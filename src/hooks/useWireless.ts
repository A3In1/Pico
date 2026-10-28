import { useState, useEffect, useCallback, useRef } from "react";
import type { MdnsService, PairingStatus } from "../types";
import {
  discoverWirelessServices,
  pairDevice as pairDeviceCmd,
  connectDevice as connectDeviceCmd,
  disconnectDevice as disconnectDeviceCmd,
  enableWirelessFromUsb as enableWirelessCmd,
} from "../lib/tauri-commands";

interface UseWirelessReturn {
  // State
  nearbyServices: MdnsService[];
  pairingStatus: PairingStatus | null;
  isDiscovering: boolean;
  error: string | null;
  wirelessPanelOpen: boolean;

  // Actions
  setWirelessPanelOpen: (open: boolean) => void;
  refreshServices: () => Promise<void>;
  pairDevice: (addr: string, code: string) => Promise<void>;
  connectDevice: (addr: string) => Promise<void>;
  disconnectDevice: (addr: string) => Promise<void>;
  enableWirelessFromUsb: (serial: string) => Promise<string>;
  clearError: () => void;
  clearPairingStatus: () => void;
}

export function useWireless(): UseWirelessReturn {
  const [nearbyServices, setNearbyServices] = useState<MdnsService[]>([]);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wirelessPanelOpen, setWirelessPanelOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-discover when wireless panel is open
  useEffect(() => {
    if (wirelessPanelOpen) {
      refreshServices();
      pollRef.current = setInterval(refreshServices, 5000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [wirelessPanelOpen]);

  const refreshServices = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const services = await discoverWirelessServices();
      setNearbyServices(services);
    } catch (e) {
      // mDNS not supported is not an error — just no services
      console.warn("mDNS discovery:", e);
      setNearbyServices([]);
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  const pairDevice = useCallback(async (addr: string, code: string) => {
    setError(null);
    setPairingStatus("pairing");
    try {
      await pairDeviceCmd(addr, code);
      setPairingStatus("paired");
    } catch (e) {
      setError(`${e}`);
      setPairingStatus({ failed: `${e}` });
    }
  }, []);

  const connectDevice = useCallback(async (addr: string) => {
    setError(null);
    setPairingStatus("connecting");
    try {
      await connectDeviceCmd(addr);
      setPairingStatus("connected");
    } catch (e) {
      setError(`${e}`);
      setPairingStatus({ failed: `${e}` });
    }
  }, []);

  const disconnectDevice = useCallback(async (addr: string) => {
    try {
      await disconnectDeviceCmd(addr);
    } catch (e) {
      setError(`${e}`);
    }
  }, []);

  const enableWirelessFromUsb = useCallback(async (serial: string): Promise<string> => {
    setError(null);
    try {
      const addr = await enableWirelessCmd(serial);
      return addr;
    } catch (e) {
      setError(`${e}`);
      throw e;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearPairingStatus = useCallback(() => {
    setPairingStatus(null);
  }, []);

  return {
    nearbyServices,
    pairingStatus,
    isDiscovering,
    error,
    wirelessPanelOpen,
    setWirelessPanelOpen,
    refreshServices,
    pairDevice,
    connectDevice,
    disconnectDevice,
    enableWirelessFromUsb,
    clearError,
    clearPairingStatus,
  };
}
