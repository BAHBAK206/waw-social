// Bundles the API into dist/ (server, migrate and seed entry points). Workspace packages are inlined;
// third-party dependencies stay external and are installed in the runtime image with `pnpm deploy`.
import { cpSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !String(pkg.dependencies[d]).startsWith('workspace:'));
const dist = path.join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
await build({
  absWorkingDir: root,
  entryPoints: { server: 'src/index.ts', migrate: 'src/db/migrate-cli.ts', seed: 'src/db/seed.ts' },
  outdir: dist,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // pino-pretty is only loaded in development via a worker transport.
  external: [...external, ...external.map((d) => `${d}/*`), 'pino-pretty'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
cpSync(path.join(root, 'drizzle'), path.join(dist, 'drizzle'), { recursive: true });
cpSync(path.join(root, 'src/db/seed-data'), path.join(dist, 'seed-data'), { recursive: true });
console.info('api bundle ready in dist/');
