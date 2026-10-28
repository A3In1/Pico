import { beforeEach, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { defaults } from "../fixtures/bridge";
vi.mock("@tauri-apps/api/core", async () => ({ invoke: (await import("../fixtures/bridge")).invoke }));
vi.mock("@tauri-apps/api/event", async () => ({ listen: (await import("../fixtures/bridge")).listen }));
vi.mock("@tauri-apps/plugin-dialog", async () => ({ open: (await import("../fixtures/bridge")).open }));
vi.mock("@tauri-apps/api/window", async () => ({ getCurrentWindow: () => (importedWindow) }));
vi.mock("@tauri-apps/api/webview", async () => ({ getCurrentWebview: () => (importedWebview) }));
import { windowAPI as importedWindow, webviewAPI as importedWebview } from "../fixtures/bridge";
// jsdom has no layout: component logic tests render all fixture rows. R uses
// the real virtualiser and actual WebKit layout instead.
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: ({ count }: {
        count: number;
    }) => ({
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 36, size: 36, end: (index + 1) * 36 })),
        getTotalSize: () => count * 36,
    }) }));
beforeEach(() => {
    defaults();
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => null) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
