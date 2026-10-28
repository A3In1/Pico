import { test, expect } from "@playwright/test";
test("R1 bars have actual 0/50/100 percent widths and reduced-motion CSS", async ({ page }) => {
    await page.goto("/tests/ui-rendering/index.html");
    for (const percentage of [0, 50, 100]) {
        const ratio = await page.getByRole("progressbar", { name: `Width ${percentage}`, exact: true }).evaluate(el => {
            const fill = el.querySelector(".transfer-progress-fill")!;
            return fill.getBoundingClientRect().width / el.getBoundingClientRect().width;
        });
        expect(ratio).toBeCloseTo(percentage / 100, 2);
    }
    const animation = () => page.getByRole("progressbar", { name: "Unknown", exact: true }).locator(".transfer-progress-fill").evaluate(el => getComputedStyle(el).animationName);
    await page.setViewportSize({ width: 500, height: 650 });
    const drawer = await page.locator(".transfer-drawer").boundingBox();
    expect(drawer!.width).toBeLessThanOrEqual(500);
    expect(drawer!.height).toBeLessThanOrEqual(260);
    const overflow = await page.locator(".transfer-item-info").evaluate(el => el.getBoundingClientRect().right > window.innerWidth);
    expect(overflow).toBe(false);
    expect(await animation()).not.toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await animation()).toBe("none");
});
test("R2 real virtualiser reaches far rows without rendering the whole directory", async ({ page }) => {
    await page.goto("/tests/ui-rendering/index.html?scene=directory");
    await expect(page.locator(".file-name").first()).toHaveText("Fixture-0000");
    expect(await page.locator(".file-name").count()).toBeLessThan(1000);
    await page.locator(".file-list-container").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator(".file-name").last()).toHaveText("Fixture-0999");
});
test("R3 real folder bounds receive logical drop position highlighting", async ({ page }) => {
    await page.goto("/tests/ui-rendering/index.html?scene=directory");
    const folder = page.locator("[data-drop-path]").first();
    await expect(folder).toBeVisible();
    const bounds = (await folder.boundingBox())!;
    await page.evaluate(({ x, y }) => (window as any).dropFixture({ type: "over", position: { x, y } }), { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    await expect(folder).toHaveClass(/is-drop-folder/);
});
test("R4 settings and wireless controls stay reachable in a narrow window", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 650 });
    await page.goto("/tests/ui-rendering/index.html?scene=settings");
    await expect(page.getByText("Settings", { exact: true })).toBeVisible();
    await page.getByText("Change", { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText("Change", { exact: true })).toBeVisible();
    await page.goto("/tests/ui-rendering/index.html?scene=directory");
    await expect(page.getByPlaceholder("Filter files by name...")).toBeFocused();
    await page.goto("/tests/ui-rendering/index.html?scene=wireless");
    await page.getByText("Manual", { exact: true }).click();
    await page.getByPlaceholder("192.168.1.5").scrollIntoViewIfNeeded();
    await expect(page.getByPlaceholder("192.168.1.5")).toBeVisible();
});
