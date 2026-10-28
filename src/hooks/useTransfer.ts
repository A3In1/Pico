import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { TransferProgress, TransferResult } from "../types";
import { downloadFiles, uploadFiles, previewFile, cancelTransfer, cancelAllTransfers } from "../lib/tauri-commands";

export type ToastType = "success" | "error" | "info";
const active = (t: TransferProgress) => t.status === "pending" || t.status === "inprogress";

export function useTransfer() {
  const [transfers, setTransfers] = useState<Map<string, TransferProgress>>(new Map());
  const transfersRef = useRef(transfers);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [lastResult, setLastResult] = useState<TransferResult | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [commands, setCommands] = useState(0);
  const commandsRef = useRef(0);
  const readyRef = useRef<Promise<unknown>>(Promise.resolve());
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopClosing = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const showToast = useCallback((message: string, type: ToastType = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  const scheduleClose = useCallback(() => {
    stopClosing();
    const items = Array.from(transfersRef.current.values());
    if (commandsRef.current || items.some(t => t.status !== "complete")) return;
    closeTimer.current = setTimeout(() => {
      if (!commandsRef.current && !Array.from(transfersRef.current.values()).some(active)) {
        setIsDrawerOpen(false);
      }
    }, 3000);
  }, [stopClosing]);

  useEffect(() => {
    let disposed = false;
    const registrations = [
      listen<TransferProgress>("transfer-progress", ({ payload }) => {
        if (disposed) return;
        const previous = Array.from(transfersRef.current.values());
        const newNativeBatch = active(payload) && !commandsRef.current && previous.length > 0
          && !previous.some(active) && !previous.some(t => t.context.batch_id === payload.context.batch_id);
        const next = new Map(newNativeBatch ? undefined : transfersRef.current);
        next.set(payload.transfer_id, payload);
        transfersRef.current = next;
        setTransfers(next);
        if (active(payload)) {
          stopClosing();
          setIsDrawerOpen(true);
        }
      }),
      listen<TransferResult>("transfer-complete", ({ payload: result }) => {
        if (disposed) return;
        setLastResult(result);
        const verb = result.direction === "upload" ? "uploaded" : "downloaded";
        showToast(`${result.completed} ${verb}${result.failed ? `, ${result.failed} failed` : ""}${result.cancelled ? `, ${result.cancelled} cancelled` : ""}`,
          result.failed ? "error" : result.cancelled ? "info" : "success");
        scheduleClose();
      }),
    ];
    readyRef.current = Promise.all(registrations);
    // Attach an error handler immediately; startTransfer also awaits readiness.
    void readyRef.current.catch(e => { if (!disposed) showToast(`Transfer listener error: ${e}`, "error"); });
    return () => {
      disposed = true;
      registrations.forEach(p => { void p.then(fn => fn()).catch(() => {}); });
      stopClosing();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [showToast, stopClosing, scheduleClose]);

  const run = useCallback(async (operation: () => Promise<unknown>, append = false) => {
    stopClosing();
    if (!append && !commandsRef.current && !Array.from(transfersRef.current.values()).some(active)) {
      transfersRef.current = new Map();
      setTransfers(transfersRef.current);
    }
    commandsRef.current += 1;
    setCommands(commandsRef.current);
    setIsDrawerOpen(true);
    setLastResult(null);
    try {
      await readyRef.current;
      await operation();
    } catch (e) {
      showToast(`Transfer error: ${e}`, "error");
    } finally {
      commandsRef.current -= 1;
      setCommands(commandsRef.current);
      scheduleClose();
    }
  }, [stopClosing, showToast, scheduleClose]);

  const startDownload = useCallback(async (serial: string, paths: string[], destination: string,
    handling = "keep-both", options?: { append?: boolean }) => {
    if (paths.length) await run(() => downloadFiles(serial, paths, destination, handling), options?.append);
  }, [run]);
  const startUpload = useCallback(async (serial: string, paths: string[], destination: string, handling = "keep-both") => {
    if (paths.length) await run(() => uploadFiles(serial, paths, destination, handling));
  }, [run]);
  const startPreview = useCallback(async (serial: string, path: string) => {
    await run(() => previewFile(serial, path));
  }, [run]);
  const retryOne = useCallback(async (id: string, handling = "keep-both") => {
    const t = transfersRef.current.get(id);
    if (!t) return;
    const { serial, destination, destination_name } = t.context;
    if (t.context.preview) { await run(() => previewFile(serial, t.file_path), true); return; }
    await run(() => t.direction === "upload"
      ? uploadFiles(serial, [t.file_path], destination, handling)
      : downloadFiles(serial, [t.file_path], destination, destination_name ? "replace" : handling, destination_name), true);
  }, [run]);
  const cancelOne = useCallback(async (id: string) => {
    try { await cancelTransfer(id); }
    catch (e) { showToast(`Cancellation error: ${e}`, "error"); }
  }, [showToast]);
  const cancelAll = useCallback(async () => {
    try { await cancelAllTransfers(); }
    catch (e) { showToast(`Cancellation error: ${e}`, "error"); }
  }, [showToast]);
  const closeDrawer = useCallback(() => { stopClosing(); setIsDrawerOpen(false); }, [stopClosing]);
  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  return { transfers, isTransferring: commands > 0 || Array.from(transfers.values()).some(active),
    isDrawerOpen, lastResult, startDownload, startUpload, startPreview, retryOne, cancelOne, cancelAll,
    closeDrawer, toast, dismissToast, notify: showToast };
}
