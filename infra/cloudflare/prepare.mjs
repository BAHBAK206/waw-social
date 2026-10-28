// Copies the Cloudflare Pages worker and headers into the built web app (apps/web/dist).
// Run after `pnpm --filter @qubedu/web build`.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', '..', 'apps', 'web', 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('apps/web/dist/index.html is missing: build the web app first (pnpm --filter @qubedu/web build).');
  process.exit(1);
}
for (const f of ['_worker.js', '_headers']) copyFileSync(join(here, f), join(dist, f));
console.info(`Cloudflare Pages files ready in ${dist}`);
