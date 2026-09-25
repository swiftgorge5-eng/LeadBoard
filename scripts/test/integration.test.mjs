import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { checkIntegration } from '../check-integration.mjs';

function fixture(t, paths = [], scripts = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'leadboard-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(resolve(root, 'package.json'), JSON.stringify({ scripts }));
  for (const path of paths) { mkdirSync(resolve(root, path, '..'), { recursive: true }); writeFileSync(resolve(root, path), ''); }
  return root;
}
test('bootstrap is allowed incrementally but cannot pass final acceptance', t => {
  const root = fixture(t, ['db/migrations/.gitkeep']);
  assert.equal(checkIntegration(root).errors.length, 0);
  assert.ok(checkIntegration(root, true).errors.some(error => error.includes('database')));
});
test('integration scripts cannot silently skip a missing implementation', t => {
  const root = fixture(t, [], { 'test:integration': 'vitest run' });
  assert.ok(checkIntegration(root).errors.some(error => error.includes('ingestion')));
});
test('an implemented module requires its upstream and its command', t => {
  const root = fixture(t, ['backend/src/ingestion/index.ts']);
  const result = checkIntegration(root);
  assert.ok(result.errors.some(error => error.includes('test:integration')));
  assert.ok(result.errors.some(error => error.includes('upstream database')));
});
test('the final E2E task requires every backend stage', t => {
  const root = fixture(t, ['tests/e2e/smoke.test.ts'], { 'test:e2e': 'test', 'test:e2e:live': 'test' });
  assert.equal(checkIntegration(root).strict, true);
  assert.ok(checkIntegration(root).errors.some(error => error.includes('sync')));
});
