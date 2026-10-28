import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const commands=[
  ["test type checks",process.execPath,["node_modules/typescript/bin/tsc","--project","tsconfig.tests.json"]],
  ['backend','cargo',['test','--offline','--manifest-path','src-tauri/Cargo.toml']],
  ['frontend',process.execPath,['node_modules/vitest/vitest.mjs','run']],
  ['UI rendering',process.execPath,['tests/ui-rendering/run.mjs']],
];
const suites=[];
for (const [name,command,args] of commands) {
  console.log(`\nRunning ${name}`);
  const child=spawnSync(command,args,{stdio:'inherit'});
  if (child.error) console.error(child.error.message);
  suites.push({name,exitCode:child.status ?? 1});
}
mkdirSync('tests/reports',{recursive:true});
writeFileSync('tests/reports/run.json',JSON.stringify({generatedAt:new Date().toISOString(),suites},null,2));
console.log('\nSuite exit codes:',suites.map(s => `${s.name}=${s.exitCode}`).join(', '));
process.exitCode=suites.some(s => s.exitCode!==0) ? 1 : 0;
