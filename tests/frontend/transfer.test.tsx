import { it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTransfer } from "../../src/hooks/useTransfer";
import { invoke, listen, emit, listeners, progress, result } from "../fixtures/bridge";
it("F8 waits for both event registrations before starting IPC", async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    listen.mockImplementation(async () => { await ready; return vi.fn<() => void>(); });
    const hook = renderHook(useTransfer);
    let run!: Promise<void>;
    act(() => { run = hook.result.current.startDownload("old-phone", ["/a"], "/mac"); });
    expect(invoke).not.toHaveBeenCalled();
    await act(async () => { release(); await run; });
    expect(invoke).toHaveBeenCalledWith("download_files", expect.objectContaining({ serial: "old-phone", localDestination: "/mac" }));
});
it("F8 listener readiness failure produces an error instead of sending IPC", async () => {
    listen.mockRejectedValue(new Error("registration failed"));
    const hook = renderHook(useTransfer);
    await act(async () => { await hook.result.current.startPreview("phone", "/a"); });
    expect(invoke).not.toHaveBeenCalled();
    expect(hook.result.current.toast?.message).toContain("registration failed");
});
it("F8 retries retain original device, destination and receiver-selected name", async () => {
    const hook = renderHook(useTransfer);
    await waitFor(() => expect(listeners.size).toBe(2));
    act(() => emit("transfer-progress", progress({ status: "failed", context: { ...progress().context, serial: "original", destination: "/finder", destination_name: "renamed.jpg" } })));
    await act(async () => { await hook.result.current.retryOne("job-1"); });
    expect(invoke).toHaveBeenCalledWith("download_files", expect.objectContaining({ serial: "original", localDestination: "/finder", destinationName: "renamed.jpg", conflictHandling: "replace" }));
});
it("F10 preview retry uses preview IPC, not an ordinary download", async () => {
    const hook = renderHook(useTransfer);
    await waitFor(() => expect(listeners.size).toBe(2));
    act(() => emit("transfer-progress", progress({ status: "failed", context: { ...progress().context, preview: true } })));
    await act(async () => { await hook.result.current.retryOne("job-1"); });
    expect(invoke).toHaveBeenCalledWith("preview_file", { serial: "FAKE-USB-1", remotePath: "/sdcard/image.jpg" });
});
it("F8 cancellation actions use distinct IPC and surface failures", async () => {
    const hook = renderHook(useTransfer);
    invoke.mockRejectedValue(new Error("cannot cancel"));
    await act(async () => { await hook.result.current.cancelOne("one"); await hook.result.current.cancelAll(); });
    expect(invoke).toHaveBeenCalledWith("cancel_transfer", { transferId: "one" });
    expect(invoke).toHaveBeenCalledWith("cancel_all_transfers");
    expect(hook.result.current.toast?.message).toContain("cannot cancel");
});
it("F8 concurrent commands keep the busy indicator until both settle", async () => {
    const resolvers: Array<() => void> = [];
    invoke.mockImplementation(() => new Promise<void>(resolve => resolvers.push(resolve)));
    const hook = renderHook(useTransfer);
    let a!: Promise<void>, b!: Promise<void>;
    await act(async () => { a = hook.result.current.startUpload("p", ["/a"], "/d"); b = hook.result.current.startPreview("p", "/b"); });
    expect(resolvers).toHaveLength(2);
    expect(hook.result.current.isTransferring).toBe(true);
    await act(async () => { resolvers[0](); await a; });
    expect(hook.result.current.isTransferring).toBe(true);
    await act(async () => { resolvers[1](); await b; });
    expect(hook.result.current.isTransferring).toBe(false);
});
it("F14 late event registration is unregistered after unmount", async () => {
    const resolvers: Array<(v: () => void) => void> = [];
    listen.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const hook = renderHook(useTransfer);
    hook.unmount();
    const cleanup = vi.fn();
    await act(async () => { resolvers.forEach(resolve => resolve(cleanup)); });
    expect(cleanup).toHaveBeenCalledTimes(2);
});
it("F8 completed drawer auto-closes while failed transfers remain visible", async () => {
    vi.useFakeTimers();
    const hook = renderHook(useTransfer);
    await act(async () => { });
    act(() => { emit("transfer-progress", progress()); emit("transfer-progress", progress({ status: "complete", percentage: 100 })); emit("transfer-complete", result); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(hook.result.current.isDrawerOpen).toBe(false);
    act(() => { emit("transfer-progress", progress({ transfer_id: "bad", status: "inprogress" })); emit("transfer-progress", progress({ transfer_id: "bad", status: "failed" })); emit("transfer-complete", { ...result, failed: 1 }); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(hook.result.current.isDrawerOpen).toBe(true);
});
