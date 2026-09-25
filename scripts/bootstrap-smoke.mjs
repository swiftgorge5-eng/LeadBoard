import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const children = [];
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function launch(args, cwd, env) {
  // No credentials are needed or printed by this smoke test.
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'ignore' });
  child.launchError = null;
  child.once('error', error => { child.launchError = error; });
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.launchError || child.exitCode !== null) throw new Error('Smoke-test server failed to start');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(500) }); if (response.ok) return response; } catch {}
    await delay(100);
  }
  throw new Error('Smoke-test server did not become ready');
}
try {
  const backendPort = await freePort();
  let frontendPort = await freePort();
  while (frontendPort === backendPort) frontendPort = await freePort();
  const env = { ...process.env, PORT: String(backendPort), GITHUB_TOKEN: 'bootstrap-smoke-only', GITHUB_ORG: 'fixture', DATABASE_URL: 'postgresql://localhost/fixture', LEADBOARD_GROUP_PROPERTY: 'leadboard_group', INGESTION_CRON_SCHEDULE: '0 */6 * * *', INITIAL_SYNC_DAYS: '30', SYNC_OVERLAP_MINUTES: '10', DATA_STALE_AFTER_HOURS: '12' };
  const backend = launch(['dist/server.js'], resolve(root, 'backend'), env);
  const health = await ready(`http://127.0.0.1:${backendPort}/health`, backend);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const frontend = launch([resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], resolve(root, 'frontend'), env);
  const url = `http://127.0.0.1:${frontendPort}`;
  const page = await ready(url, frontend);
  const html = await page.text();
  assert.match(html, /<div id="root"><\/div>/);
  const asset = html.match(/src="([^\"]+\.js)"/);
  assert.ok(asset, 'Built JavaScript must be linked from HTML');
  assert.equal((await fetch(new URL(asset[1], url))).status, 200);
  assert.deepEqual(await (await fetch(`${url}/health`)).json(), { status: 'ok' });
  const missing = await fetch(`${url}/api/v1/not-a-real-endpoint`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  console.info('PASS: compiled backend, built frontend assets, /health proxy, /api proxy');
} finally {
  await Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null || child.launchError) { resolve(); return; }
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  })));
}
