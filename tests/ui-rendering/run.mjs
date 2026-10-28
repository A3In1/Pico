import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { webkit } from '@playwright/test';
const reports=process.env.AFT_REPORT_DIR || 'tests/reports';
mkdirSync(reports,{recursive:true});
if (!existsSync(webkit.executablePath())) {
  const cases=['R1 progress geometry','R2 virtualisation','R3 drop geometry','R4 layout/focus'].map(name => ({name,status:'skipped',reason:'Playwright WebKit engine not installed; run npx playwright install webkit'}));
  cases.forEach(c => console.log(`SKIP ${c.name}: ${c.reason}`));
  writeFileSync(`${reports}/ui-rendering.json`,JSON.stringify({cases},null,2));
  if (process.env.AFT_STRICT_PREREQUISITES==='1') process.exitCode=1;
} else {
  const child=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','tests/ui-rendering/playwright.config.ts'],{stdio:'inherit'});
  process.exitCode=child.status ?? 1;
}
