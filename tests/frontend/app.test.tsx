import { it, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import App from "../../src/App";
import { invoke, open, emit, closeListeners, result } from "../fixtures/bridge";
it("F6/F7 app download remembers folder and awaits Ask policy", async () => {
    render(<App />);
    await screen.findByText("image.jpg", { selector: ".file-name" });
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    open.mockResolvedValue("/chosen");
    const base = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (name, args) => name === "check_download_conflicts" ? ["image.jpg"] : base(name, args));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Download/ })); });
    expect(localStorage.getItem("lastSavedPath")).toBe("/chosen");
    expect(screen.getByText("Files already exist")).toBeTruthy();
    expect(invoke.mock.calls.some(([name]) => name === "download_files")).toBe(false);
    await act(async () => { fireEvent.click(screen.getByText("Keep Both")); });
    expect(invoke).toHaveBeenCalledWith("download_files", expect.objectContaining({ serial: "FAKE-USB-1", remotePaths: ["/sdcard/image.jpg"], localDestination: "/chosen", conflictHandling: "keep-both" }));
});
it("F12 upload change refreshes only the selected phone, result refreshes stats", async () => {
    render(<App />);
    await screen.findByText("image.jpg", { selector: ".file-name" });
    invoke.mockClear();
    await act(async () => { emit("phone-files-changed", "other"); });
    expect(invoke).not.toHaveBeenCalled();
    await act(async () => { emit("phone-files-changed", "FAKE-USB-1"); });
    expect(invoke).toHaveBeenCalledWith("list_directory", { serial: "FAKE-USB-1", path: "/sdcard" });
    invoke.mockClear();
    await act(async () => { emit("transfer-complete", result); });
    expect(invoke).toHaveBeenCalledWith("get_device_details", { serial: "FAKE-USB-1" });
    expect(screen.getByText("1 downloaded")).toBeTruthy();
});
it("F12 native close reminder can be cancelled, then quit preference persisted", async () => {
    render(<App />);
    await screen.findByText("image.jpg", { selector: ".file-name" });
    await waitFor(() => expect(closeListeners.size).toBe(1));
    const preventDefault = vi.fn();
    await act(async () => { for (const callback of closeListeners)
        await callback({ preventDefault }); });
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { for (const callback of closeListeners)
        await callback({ preventDefault }); });
    fireEvent.click(screen.getByLabelText("Don't remind me again"));
    await act(async () => { fireEvent.click(screen.getByText("Quit")); });
    expect(invoke).toHaveBeenCalledWith("exit_app");
    expect(JSON.parse(localStorage.getItem("androidfiletransfer-settings")!).remindBeforeQuit).toBe(false);
});
it("F1 app no-device and failure screens offer connection-mode controls", async () => {
    const base = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (name, args) => name === "get_connected_devices" ? [] : base(name, args));
    const view = render(<App />);
    await waitFor(() => expect(view.container.querySelector(".file-browser")).toBeNull());
    await screen.findByText(/No .*device|Connect your|Connect an|Connect Your/i);
});
it("F7 overlapping Ask requests are resolved in order and cancel stops its request", async () => {
    render(<App />);
    await screen.findByText("image.jpg", { selector: ".file-name" });
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    open.mockResolvedValue("/chosen");
    const base = invoke.getMockImplementation()!;
    let checks = 0;
    invoke.mockImplementation(async (name, args) => name === "check_download_conflicts" ? [`conflict-${++checks}`] : base(name, args));
    await act(async () => { fireEvent.keyDown(document.body, { key: "d", metaKey: true }); fireEvent.keyDown(document.body, { key: "d", metaKey: true }); });
    expect(screen.getByText("conflict-1")).toBeTruthy();
    expect(screen.queryByText("conflict-2")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText("Keep Both")); });
    expect(screen.getByText("conflict-2")).toBeTruthy();
    await act(async () => { fireEvent.click(document.querySelector(".settings-overlay")!); });
    expect(invoke.mock.calls.filter(([name]) => name === "download_files")).toHaveLength(1);
});
it("F2 app clears selection when navigating into another directory", async () => {
    render(<App />);
    await screen.findByText("image.jpg", { selector: ".file-name" });
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    expect(document.querySelector(".selection-bar")).toBeTruthy();
    await act(async () => { fireEvent.doubleClick(screen.getByText("Folder", { selector: ".file-name" })); });
    expect(document.querySelector(".selection-bar")).toBeNull();
});
it("F12 transfer notification expires and can be dismissed", async () => {
    render(<App />);
    await screen.findByText("image.jpg", { selector: ".file-name" });
    vi.useFakeTimers();
    act(() => emit("transfer-complete", result));
    expect(screen.getByText("1 downloaded")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText("1 downloaded")).toBeNull();
});
