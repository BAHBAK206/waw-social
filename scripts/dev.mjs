#!/usr/bin/env node
// One command for local development:  pnpm dev
//   postgres + redis (local, no Docker) → API (:8787) → realtime hub (:8788) → AI service (:8790, if Python deps exist) → web (:5173)
// Flags:  --no-ai   skip the Python AI service      --no-services   assume Postgres/Redis are already running
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const colors = { api: 36, realtime: 35, ai: 33, web: 32 };
const children = [];

function run(name, cmd, cmdArgs, opts = {}) {
  const child = spawn(cmd, cmdArgs, { cwd: opts.cwd ?? root, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${colors[name] ?? 37}m[${name}]\x1b[0m`;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) out.write(`${tag} ${l}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${tag} exited with code ${code}`);
      if (opts.required) shutdown(1);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (!args.has('--no-services')) {
  const r = spawnSync('bash', ['scripts/local-services.sh', 'start'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) console.warn('Could not start local Postgres/Redis — set DATABASE_URL/REDIS_URL to existing instances.');
}

run('api', 'pnpm', ['--filter', '@qubedu/api', 'dev'], {
  required: true,
  env: {
    REALTIME_INTERNAL_URL: 'http://localhost:8788',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    RATE_LIMIT_DISABLED: process.env.RATE_LIMIT_DISABLED ?? 'true',
  },
});

const goBin = path.join(root, '.local', 'realtime');
const build = spawnSync('go', ['build', '-o', goBin, './cmd/realtime'], { cwd: path.join(root, 'services/realtime'), stdio: 'inherit' });
if (build.status === 0)
  run('realtime', goBin, [], { env: { REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379', API_INTERNAL_URL: 'http://localhost:8787' } });
else console.warn('Go toolchain not available — live classes and instant messages need the realtime hub (services/realtime).');

if (!args.has('--no-ai')) {
  const py = [path.join(root, 'services/ai/.venv/bin/python'), 'python3'].find((p) => p === 'python3' || existsSync(p));
  const ok = spawnSync(py, ['-c', 'import fastapi, uvicorn, sympy'], { stdio: 'ignore' }).status === 0;
  if (ok) run('ai', py, ['-m', 'uvicorn', 'qubedu_ai.main:app', '--port', '8790', '--reload'], { cwd: path.join(root, 'services/ai') });
  else console.warn('Python AI dependencies missing — run: pip install -r services/ai/requirements.txt (or pass --no-ai).');
}

run('web', 'pnpm', ['--filter', '@qubedu/web', 'dev'], { required: true });

console.log('\nQubedu is starting →  web http://localhost:5173   api http://localhost:8787   realtime ws://localhost:8788\n');
