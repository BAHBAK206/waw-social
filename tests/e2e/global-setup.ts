// Waits until the stack answers: the web server proxying to the API, and the realtime hub (chat and live classes need it).
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const realtimeHealth = process.env.E2E_REALTIME_HEALTH ?? 'http://localhost:8788/health';

async function waitFor(url: string, what: string, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${what} is not reachable at ${url} (${last}). Start the stack with \`pnpm dev\` or \`docker compose up\` first.`);
}

export default async function globalSetup() {
  await waitFor(`${baseURL}/api/v1/config`, 'The API (through the web server)');
  await waitFor(realtimeHealth, 'The realtime hub');
}
