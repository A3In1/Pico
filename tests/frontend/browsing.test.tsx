import { it, expect, vi } from "vitest";
import { act, renderHook, render, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useFileBrowser } from "../../src/hooks/useFileBrowser";
import { FileBrowser } from "../../src/components/FileBrowser/FileBrowser";
import { invoke, emit, entry, dropListeners, listeners } from "../fixtures/bridge";
function listing(files = [entry("Folder", true), entry("z.jpg", false, 30), entry("a.jpg", false, 10)]) {
    const navigate = vi.fn(), preview = vi.fn(), upload = vi.fn(async () => { }), error = vi.fn();
    function View() {
        const [selected, setSelected] = useState(new Set<string>());
        return <FileBrowser deviceSerial="FAKE-USB-1" onUpload={upload} onTransferError={error} files={files} isLoading={false} error={null} currentPath="/sdcard" breadcrumbs={[{ label: "sdcard", path: "/sdcard" }]} canGoBack={false} canGoForward={false} onNavigateTo={navigate} onNavigateUp={vi.fn()} onNavigateBack={vi.fn()} onNavigateForward={vi.fn()} onRefresh={vi.fn()} selectedPaths={selected} onSelectionChange={setSelected} isSearchVisible onSearchToggle={vi.fn()} onDownload={vi.fn()} onPreviewFile={preview} isTransferring={false}/>;
    }
    return { view: render(<View />), navigate, preview, upload, error };
}
it("F2 navigation tracks history, discards forward history and handles parent/root", async () => {
    const hook = renderHook(() => useFileBrowser("FAKE-USB-1"));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => { hook.result.current.navigateTo("/sdcard/A"); });
    await act(async () => { hook.result.current.navigateTo("/sdcard/B"); });
    await act(async () => { hook.result.current.navigateBack(); });
    expect(hook.result.current.currentPath).toBe("/sdcard/A");
    expect(hook.result.current.canGoForward).toBe(true);
    await act(async () => { hook.result.current.navigateTo("/sdcard/C"); });
    expect(hook.result.current.canGoForward).toBe(false);
    await act(async () => { hook.result.current.navigateUp(); });
    expect(hook.result.current.currentPath).toBe("/sdcard");
    invoke.mockClear();
    act(() => hook.result.current.navigateUp());
    expect(invoke).not.toHaveBeenCalled();
});
it("F2 inaccessible listing exposes error and clears old entries", async () => {
    const hook = renderHook(() => useFileBrowser("FAKE-USB-1"));
    await waitFor(() => expect(hook.result.current.files.length).toBe(2));
    invoke.mockRejectedValue(new Error("Permission denied"));
    await act(async () => { hook.result.current.refresh(); });
    expect(hook.result.current.files).toHaveLength(0);
    expect(hook.result.current.error).toContain("Permission denied");
});
it("F4 sorting uses actual columns and search matches case-insensitively", () => {
    const { view } = listing();
    const names = () => Array.from(view.container.querySelectorAll(".file-name")).map(el => el.textContent);
    expect(names()).toEqual(["Folder", "a.jpg", "z.jpg"]);
    fireEvent.click(screen.getByText("Size"));
    expect(names()).toEqual(["Folder", "a.jpg", "z.jpg"]);
    fireEvent.click(view.container.querySelector(".file-header .file-size-col")!);
    expect(names()).toEqual(["z.jpg", "Folder", "a.jpg"]);
    fireEvent.click(screen.getByText("Type"));
    expect(names()[0]).toBe("Folder");
    fireEvent.click(screen.getByText("Modified"));
    expect(names()).toHaveLength(3);
    fireEvent.change(screen.getByPlaceholderText("Filter files by name..."), { target: { value: "Z.JPG" } });
    expect(names()).toEqual(["z.jpg"]);
    fireEvent.change(screen.getByPlaceholderText("Filter files by name..."), { target: { value: "missing" } });
    expect(screen.getByText(/No files matching/)).toBeTruthy();
    fireEvent.click(screen.getByText("Clear search"));
    expect(names()).toHaveLength(3);
});
it("F4 checkbox range selection and filtered select-all use visible paths", () => {
    const { view } = listing();
    const boxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];
    fireEvent.click(boxes()[1]);
    expect(boxes()[0].indeterminate).toBe(true);
    fireEvent.click(boxes()[3], { shiftKey: true });
    expect(boxes().every(b => b.checked)).toBe(true);
    fireEvent.click(screen.getByText("Clear"));
    expect(boxes().every(b => !b.checked)).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Filter files by name..."), { target: { value: "a.jpg" } });
    fireEvent.click(boxes()[0]);
    expect(view.container.querySelectorAll(".is-selected")).toHaveLength(1);
});
it("F10 double-click distinguishes folder navigation and native preview", () => {
    const { navigate, preview } = listing();
    fireEvent.doubleClick(screen.getByText("Folder", { selector: ".file-name" }));
    fireEvent.doubleClick(screen.getByText("a.jpg"));
    expect(navigate).toHaveBeenCalledWith("/sdcard/Folder");
    expect(preview).toHaveBeenCalledWith("/sdcard/a.jpg");
});
it("F9 native incoming drop uses folder dataset and unsubscribes on unmount", async () => {
    const { view, upload } = listing();
    await waitFor(() => expect(dropListeners.size).toBe(1));
    const hit = view.container.querySelector("[data-drop-path]")!;
    vi.mocked(document.elementFromPoint).mockReturnValue(hit);
    await act(async () => { dropListeners.forEach(callback => callback({ payload: { type: "drop", paths: ["/mac/file"], position: { x: 20, y: 20 } } })); });
    expect(upload).toHaveBeenCalledWith(["/mac/file"], "/sdcard/Folder");
    view.unmount();
    await act(async () => { });
    expect(dropListeners.size).toBe(0);
    expect(listeners.get("native-drag-ended")?.size).toBe(0);
});
// Regressions assert the behaviour of the production hooks.
it("F3 regression: folder-size events from another parent must be ignored", async () => {
    const hook = renderHook(() => useFileBrowser("FAKE-USB-1"));
    await waitFor(() => expect(hook.result.current.files.length).toBe(2));
    const before = hook.result.current.files.find(f => f.name === "Folder")?.size;
    act(() => emit("folder-size-update", { serial: "FAKE-USB-1", parent_path: "/somewhere-else", name: "Folder", size: 999 }));
    expect(hook.result.current.files.find(f => f.name === "Folder")?.size).toBe(before);
});
it("F2 regression: older directory response must not overwrite newer navigation", async () => {
    const hook = renderHook(() => useFileBrowser("FAKE-USB-1"));
    await waitFor(() => expect(hook.result.current.files.length).toBe(2));
    let old!: (v: any) => void, newer!: (v: any) => void;
    invoke.mockImplementation(name => name === "list_directory" ? new Promise(resolve => { if (!old)
        old = resolve;
    else
        newer = resolve; }) : Promise.resolve([]));
    act(() => hook.result.current.navigateTo("/sdcard/old"));
    act(() => hook.result.current.navigateTo("/sdcard/new"));
    await act(async () => { newer([entry("new")]); });
    await act(async () => { old([entry("old")]); });
    expect(hook.result.current.currentPath).toBe("/sdcard/new");
});
it("F3 regression: folder-size cache must be separated by device serial", async () => {
    const base = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (name, args: any) => name === "list_directory" ? [entry("CacheProbe", true, 0)] : base(name, args));
    const hook = renderHook(({ serial }) => useFileBrowser(serial), { initialProps: { serial: "FAKE-USB-1" } });
    await waitFor(() => expect(hook.result.current.files[0]?.name).toBe("CacheProbe"));
    act(() => emit("folder-size-update", { serial: "FAKE-USB-1", parent_path: "/sdcard", name: "CacheProbe", size: 12345 }));
    expect(hook.result.current.files[0].size).toBe(12345);
    hook.rerender({ serial: "second-phone" });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_directory", { serial: "second-phone", path: "/sdcard" }));
    await act(async () => { });
    expect(hook.result.current.files[0].size).toBe(0);
});
it("F14 regression: delayed folder-size listener must be released after unmount", async () => {
    const { listen } = await import("../fixtures/bridge");
    let resolve!: (cleanup: () => void) => void;
    listen.mockImplementation(() => new Promise(r => { resolve = r; }));
    const hook = renderHook(() => useFileBrowser(null));
    const cleanup = vi.fn();
    hook.unmount();
    await act(async () => { resolve(cleanup); });
    expect(cleanup).toHaveBeenCalledOnce();
});
it("F9 outbound gesture threshold sends selected sources only once", async () => {
    // PointerEvent coordinates are unavailable in jsdom by default.
    class Pointer extends MouseEvent {
        constructor(type: string, options: any) { super(type, options); }
    }
    vi.stubGlobal("PointerEvent", Pointer);
    const { view } = listing();
    await waitFor(() => expect(dropListeners.size).toBe(1));
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    const row = screen.getByText("a.jpg").closest(".file-row")!;
    fireEvent.pointerDown(row, { button: 0, buttons: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(view.container.querySelector(".file-browser")!, { buttons: 1, clientX: 3, clientY: 0 });
    expect(invoke.mock.calls.some(([name]) => name === "start_file_drag")).toBe(false);
    await act(async () => { fireEvent.pointerMove(view.container.querySelector(".file-browser")!, { buttons: 1, clientX: 10, clientY: 0 }); });
    expect(invoke).toHaveBeenCalledWith("start_file_drag", { serial: "FAKE-USB-1", entries: [entry("a.jpg", false, 10)] });
    await act(async () => { fireEvent.pointerMove(view.container.querySelector(".file-browser")!, { buttons: 1, clientX: 20, clientY: 0 }); });
    expect(invoke.mock.calls.filter(([name]) => name === "start_file_drag")).toHaveLength(1);
    vi.unstubAllGlobals();
});

it("F2 stale listing failure cannot clear files or finish a newer request", async () => {
    const hook = renderHook(() => useFileBrowser("stale-error-phone"));
    await waitFor(() => expect(hook.result.current.files.length).toBe(2));
    let rejectOld!: (error: Error) => void, resolveNew!: (files: any) => void;
    invoke.mockImplementation((name, args: any) => name === "list_directory"
        ? new Promise((resolve, reject) => { if (args.path.endsWith("old")) rejectOld = reject; else resolveNew = resolve; })
        : Promise.resolve([]));
    act(() => hook.result.current.navigateTo("/sdcard/old"));
    act(() => hook.result.current.navigateTo("/sdcard/new"));
    await act(async () => { rejectOld(new Error("stale permission error")); });
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.isLoading).toBe(true);
    expect(hook.result.current.files).toHaveLength(2);
    await act(async () => { resolveNew([entry("new")]); });
    expect(hook.result.current.currentPath).toBe("/sdcard/new");
    expect(hook.result.current.isLoading).toBe(false);
});

it("F3 only matching phone and parent can update displayed folder size", async () => {
    const hook = renderHook(() => useFileBrowser("event-routing-phone"));
    await waitFor(() => expect(hook.result.current.files.length).toBe(2));
    act(() => emit("folder-size-update", { serial: "event-routing-phone", parent_path: "/sdcard", name: "Folder", size: 456 }));
    expect(hook.result.current.files.find(f => f.name === "Folder")?.size).toBe(456);
    act(() => emit("folder-size-update", { serial: "other-phone", parent_path: "/sdcard", name: "Folder", size: 789 }));
    expect(hook.result.current.files.find(f => f.name === "Folder")?.size).toBe(456);
});

it("F3 explicit refresh discards old cached sizes and recalculates", async () => {
    const base = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (name, args: any) => name === "list_directory" ? [entry("RefreshProbe", true, 0)] : base(name, args));
    const hook = renderHook(() => useFileBrowser("refresh-cache-phone"));
    await waitFor(() => expect(hook.result.current.files[0]?.name).toBe("RefreshProbe"));
    act(() => emit("folder-size-update", { serial: "refresh-cache-phone", parent_path: "/sdcard", name: "RefreshProbe", size: 123 }));
    expect(hook.result.current.files[0].size).toBe(123);
    invoke.mockClear();
    await act(async () => { hook.result.current.refresh(); });
    expect(hook.result.current.files[0].size).toBe(0);
    expect(invoke).toHaveBeenCalledWith("get_folder_sizes", { serial: "refresh-cache-phone", path: "/sdcard" });
});

it("F2 device switch clears navigation and ignores old quick-access response", async () => {
    const base = invoke.getMockImplementation()!;
    let resolveOld!: (paths: any) => void;
    invoke.mockImplementation((name, args: any) => name === "get_quick_access_paths" && args.serial === "quick-old"
        ? new Promise(resolve => { resolveOld = resolve; }) : base(name, args));
    const hook = renderHook(({ serial }) => useFileBrowser(serial), { initialProps: { serial: "quick-old" } });
    await waitFor(() => expect(hook.result.current.files.length).toBe(2));
    await act(async () => { hook.result.current.navigateTo("/sdcard/old-phone-only"); });
    hook.rerender({ serial: "quick-new" });
    await waitFor(() => expect(hook.result.current.currentPath).toBe("/sdcard"));
    const current = hook.result.current.quickAccessPaths;
    await act(async () => { resolveOld([["Old", "/old"]]); });
    expect(hook.result.current.quickAccessPaths).toEqual(current);
    expect(hook.result.current.canGoBack).toBe(false);
});
