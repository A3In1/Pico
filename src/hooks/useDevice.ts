import { useState, useEffect, useRef, useCallback } from "react";
import type { DeviceDetails, DeviceInfo } from "../types";
import { getConnectedDevices, getDeviceDetails } from "../lib/tauri-commands";

interface UseDeviceReturn {
  device: DeviceDetails | null;
  devices: DeviceInfo[];
  setActiveSerial: (serial: string) => void;
  isConnected: boolean;
  isDetecting: boolean;
  error: string | null;
  refreshDevice: () => void;
}

export function useDevice(): UseDeviceReturn {
  const [device, setDevice] = useState<DeviceDetails | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [activeSerial, setActiveSerial] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isDetecting, setIsDetecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedSerial = useRef(activeSerial);
  selectedSerial.current = activeSerial;
  const detailRequest = useRef(0);

  const loadDetails = useCallback(async (serial: string, refresh = false) => {
    const request = ++detailRequest.current;
    const isCurrent = () => request === detailRequest.current && selectedSerial.current === serial;
    setIsDetecting(true);
    try {
      const details = await getDeviceDetails(serial);
      if (!isCurrent()) return;
      setDevice(details);
      setIsConnected(true);
      setError(null);
    } catch (e) {
      if (isCurrent()) setError(`Failed to ${refresh ? "refresh" : "get"} device details: ${e}`);
    } finally {
      if (isCurrent()) setIsDetecting(false);
    }
  }, []);

  // Selection changes and unmount invalidate both initial and manual requests.
  useEffect(() => {
    if (activeSerial) {
      loadDetails(activeSerial);
    } else {
      setDevice(null);
      setIsConnected(false);
    }
    return () => { detailRequest.current++; };
  }, [activeSerial, loadDetails]);

  const refreshDevice = useCallback(() => {
    if (activeSerial) loadDetails(activeSerial, true);
  }, [activeSerial, loadDetails]);

  const pollDevices = useCallback(async (isCurrent: () => boolean) => {
    try {
      const fetchedDevices = await getConnectedDevices();
      if (!isCurrent()) return;
      setDevices(fetchedDevices);

      const readyDevices = fetchedDevices.filter((d) => d.status === "device");
      
      if (readyDevices.length > 0) {
        // If no active serial or active serial is disconnected, pick first
        setActiveSerial((prev) => {
          if (!prev || !readyDevices.find((d) => d.serial === prev)) {
            return readyDevices[0].serial;
          }
          return prev;
        });
      } else {
        const unauthorized = fetchedDevices.find((d) => d.status === "unauthorized");
        if (unauthorized) {
          setError("Device requires authorization — tap 'Allow' on your phone's USB debugging prompt");
        } else {
          setError(null);
        }
        setActiveSerial(null);
        setIsDetecting(false);
      }
    } catch (e) {
      if (!isCurrent()) return;
      setError(`${e}`);
      setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try { await pollDevices(() => !disposed); }
      finally { polling = false; }
    };
    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => {
      disposed = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollDevices]);

  return { device, devices, setActiveSerial, isConnected, isDetecting, error, refreshDevice };
}
