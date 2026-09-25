import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modules = [
  ['database', 'db/migrations', ['db:migrate', 'db:verify'], []],
  ['github', 'backend/src/github', [], []],
  ['repositories', 'backend/src/repositories', [], ['github']],
  ['collectors', 'backend/src/collectors', [], ['github', 'repositories']],
  ['ingestion', 'backend/src/ingestion', ['test:integration'], ['database', 'repositories', 'collectors']],
  ['sync', 'backend/src/sync', ['sync:once'], ['ingestion']],
  ['analytics', 'backend/src/analytics', ['test:pipeline'], ['database', 'ingestion']],
  ['api', 'backend/src/api', [], ['sync', 'analytics']],
  ['e2e', 'tests/e2e', ['test:e2e', 'test:e2e:live'], ['api']],
];
const hasCode = path => existsSync(path) && readdirSync(path, { recursive: true }).some(name => /\.(?:[cm]?[jt]sx?|sql)$/.test(name));

export function checkIntegration(root, complete = false) {
  const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts ?? {};
  const present = new Set(modules.filter(([, path]) => hasCode(resolve(root, path))).map(([name]) => name));
  // Once final E2E is introduced it must not silently skip missing business modules.
  const strict = complete || present.has('e2e');
  const errors = [];
  for (const [name, path, commands, dependencies] of modules) {
    if (!present.has(name)) {
      if (strict || commands.some(command => scripts[command])) errors.push(`${name}: missing implementation in ${path}`);
      continue;
    }
    for (const command of commands) if (!scripts[command]?.trim()) errors.push(`${name}: missing npm script ${command}`);
    for (const dependency of dependencies) if (!present.has(dependency)) errors.push(`${name}: missing upstream ${dependency}`);
  }
  return { errors, pending: modules.filter(([name]) => !present.has(name)).map(([name]) => name), strict };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkIntegration(process.cwd(), process.argv.includes('--complete'));
  for (const error of result.errors) console.error(error);
  if (result.pending.length) console.info(`Not implemented yet: ${result.pending.join(', ')}`);
  if (result.errors.length) process.exitCode = 1;
  else console.info(result.strict ? 'Phase 1 entry points present; run database, pipeline and E2E tests next.' : 'Current integration prerequisites OK; this is NOT full Phase 1 acceptance.');
}
