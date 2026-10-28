import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
    testDir: ".", testMatch: "*.spec.ts", fullyParallel: false, workers: 1, retries: 0,
    use: { browserName: "webkit", baseURL: "http://127.0.0.1:1421", viewport: { width: 900, height: 650 } },
    webServer: { cwd: fileURLToPath(new URL("../../", import.meta.url)), command: "node node_modules/vite/bin/vite.js --config tests/ui-rendering/vite.config.ts", url: "http://127.0.0.1:1421/tests/ui-rendering/index.html", reuseExistingServer: false, timeout: 30000 },
    reporter: [["list"], ["json", { outputFile: fileURLToPath(new URL("../reports/ui-rendering.json", import.meta.url)) }]],
    outputDir: fileURLToPath(new URL("../reports/ui-artifacts", import.meta.url)),
});
