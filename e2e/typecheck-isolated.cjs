// Next gera RouteContext antes do TypeScript. Apenas copia efêmera, sem .env.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
if (process.env.TMPDIR !== '/scratch') throw Error('Use o runner isolado.');
const destination = '/scratch/typecheck';
fs.cpSync('/app', destination, { recursive: true, filter: source => !source.startsWith('/app/node_modules') && !source.startsWith('/app/.next') });
fs.symlinkSync('/app/node_modules', destination + '/node_modules');
for (const args of [
  ['/app/node_modules/next/dist/bin/next', 'typegen', destination],
  ['/app/node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false', '-p', destination + '/tsconfig.json'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: destination, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
