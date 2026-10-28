import { it, expect, vi } from "vitest";
import { act, renderHook, render, fireEvent, screen } from "@testing-library/react";
import { useSettings } from "../../src/hooks/useSettings";
import { useKeyboard } from "../../src/hooks/useKeyboard";
import { SettingsModal } from "../../src/components/Settings/SettingsModal";
import { ConflictDialog } from "../../src/components/Settings/ConflictDialog";
import { formatBytes, formatStorage, getStorageFraction } from "../../src/lib/format";
import { open } from "../fixtures/bridge";
it("F6 persists settings and applies system preference changes", () => {
    const add = vi.fn(), remove = vi.fn();
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true, addEventListener: add, removeEventListener: remove } as any);
    const hook = renderHook(useSettings);
    act(() => { hook.result.current.setTheme("system"); hook.result.current.setDownloadLocation("/my/downloads"); hook.result.current.setConflictHandling("skip"); hook.result.current.setRemindBeforeQuit(false); });
    expect(document.documentElement.dataset.theme).toBe("dark");
    const handler = add.mock.calls[0][1];
    act(() => handler({ matches: false }));
    expect(document.documentElement.dataset.theme).toBe("light");
    const saved = JSON.parse(localStorage.getItem("androidfiletransfer-settings")!);
    expect(saved).toMatchObject({ theme: "system", downloadLocation: "/my/downloads", conflictHandling: "skip", remindBeforeQuit: false });
    hook.unmount();
    expect(remove).toHaveBeenCalledWith("change", handler);
});
it("F6 corrupt or denied localStorage does not crash settings", () => {
    localStorage.setItem("androidfiletransfer-settings", "{");
    const hook = renderHook(useSettings);
    expect(hook.result.current.settings.theme).toBe("dark");
    hook.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => renderHook(useSettings)).not.toThrow();
});
it("F6 folder picker accepts selected destination and cancellation leaves choice unchanged", async () => {
    const change = vi.fn();
    render(<SettingsModal isOpen onClose={vi.fn()} downloadLocation="/old" onDownloadLocationChange={change} theme="dark" onThemeChange={vi.fn()} conflictHandling="ask" onConflictHandlingChange={vi.fn()} remindBeforeQuit onRemindBeforeQuitChange={vi.fn()}/>);
    const button = screen.getByText("Change");
    await act(async () => { fireEvent.click(button); });
    expect(change).not.toHaveBeenCalled();
    open.mockResolvedValue("/new");
    await act(async () => { fireEvent.click(button); });
    expect(change).toHaveBeenCalledWith("/new");
});
it.each([["Keep Both", "keep-both"], ["Skip", "skip"], ["Replace", "replace"]])("F7 conflict action %s routes only its policy", (label, policy) => {
    const choose = vi.fn();
    render(<ConflictDialog isOpen fileNames={["a", "b", "c", "d", "e", "f"]} onChoose={choose} onCancel={vi.fn()}/>);
    expect(screen.getByText("+1 more")).toBeTruthy();
    fireEvent.click(screen.getByText(label));
    expect(choose).toHaveBeenCalledWith(policy);
});
it("F5 keyboard actions are suppressed while typing and released on unmount", () => {
    const callbacks = { onSelectAll: vi.fn(), onDownload: vi.fn(), onBack: vi.fn(), onForward: vi.fn(), onParent: vi.fn(), onSearch: vi.fn(), onRefresh: vi.fn(), onToggleSidebar: vi.fn(), onDeselectAll: vi.fn() };
    const hook = renderHook(() => useKeyboard(callbacks));
    for (const key of ["a", "d", "[", "]", "ArrowUp", "f", "r", "\\"])
        fireEvent.keyDown(document.body, { key, metaKey: true });
    for (const key of Object.keys(callbacks).filter(k => k !== "onDeselectAll"))
        expect(callbacks[key as keyof typeof callbacks]).toHaveBeenCalledOnce();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "a", metaKey: true });
    expect(callbacks.onSelectAll).toHaveBeenCalledOnce();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(callbacks.onDeselectAll).toHaveBeenCalledOnce();
    input.remove();
    hook.unmount();
    fireEvent.keyDown(document.body, { key: "a", metaKey: true });
    expect(callbacks.onSelectAll).toHaveBeenCalledOnce();
});
it.each([[0, "0 B"], [1024, "1 KB"], [1024 ** 2, "1.0 MB"], [1024 ** 4, "1.0 TB"]])("F13 formats %s bytes", (bytes, label) => { expect(formatBytes(bytes)).toBe(label); });
it("F13 storage unknown and capacity overflow display are bounded", () => {
    expect(formatStorage(1, 0)).toBe("Unknown");
    expect(getStorageFraction(1, 0)).toBe(0);
    expect(getStorageFraction(200, 100)).toBe(1);
});
