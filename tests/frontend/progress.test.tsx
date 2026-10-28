import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProgressBar } from "../../src/components/TransferDrawer/ProgressBar";
import { TransferDrawer } from "../../src/components/TransferDrawer/TransferDrawer";
import { progress } from "../fixtures/bridge";
import type { TransferProgress } from "../../src/types";
describe("F8 progress accessibility, presentation and action routing", () => {
    it.each([[-10, 0], [50, 50], [150, 100]])("bounds ARIA value %s to %s", (input, value) => {
        render(<ProgressBar percentage={input} known active label="transfer"/>);
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(String(value));
    });
    it.each([NaN, Infinity])("nonfinite or unknown progress has no false numeric ARIA", input => {
        render(<ProgressBar percentage={input} known active label="transfer"/>);
        expect(screen.getByRole("progressbar").hasAttribute("aria-valuenow")).toBe(false);
    });
    it("unknown stopped item is announced as stopped", () => {
        render(<ProgressBar percentage={0} known={false} active={false} label="transfer"/>);
        expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("Stopped");
    });
    it("includes queued items in item-based overall progress and routes cancel/retry", () => {
        const cancel = vi.fn(), all = vi.fn(), retry = vi.fn();
        const items = [progress(), progress({ transfer_id: "queued", status: "pending", percentage: 0, progress_known: false }),
            progress({ transfer_id: "failed", status: "failed", percentage: 0, error: "Permission denied" })];
        render(<TransferDrawer transfers={new Map(items.map(t => [t.transfer_id, t as TransferProgress]))} isOpen onClose={vi.fn()} onCancelOne={cancel} onCancelAll={all} onRetry={retry}/>);
        expect(screen.getByRole("progressbar", { name: "Overall transfer progress by item" }).getAttribute("aria-valuenow")).toBe(String(50 / 3));
        expect(screen.getByText(/17% overall \(by item\)/)).toBeTruthy();
        expect(screen.getByText("Permission denied")).toBeTruthy();
        expect(screen.getAllByTitle("Cancel")).toHaveLength(1);
        fireEvent.click(screen.getByTitle("Cancel"));
        fireEvent.click(screen.getByText("Cancel All"));
        fireEvent.click(screen.getByTitle("Retry"));
        expect(cancel).toHaveBeenCalledWith("job-1");
        expect(all).toHaveBeenCalledOnce();
        expect(retry).toHaveBeenCalledWith("failed");
    });
    it("marks estimated upload bytes and preview labels", () => {
        const item = progress({ direction: "upload", bytes_estimated: true, context: { ...progress().context, preview: true } }) as TransferProgress;
        render(<TransferDrawer transfers={new Map([[item.transfer_id, item]])} isOpen onClose={vi.fn()} onCancelOne={vi.fn()} onCancelAll={vi.fn()}/>);
        expect(screen.getByText(/Preview: image.jpg/)).toBeTruthy();
        expect(screen.getByText(/≈50 B \/ 100 B/)).toBeTruthy();
    });
});
