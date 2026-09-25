import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const yaml = readFileSync(new URL('../../.github/workflows/pr-policy.yml', import.meta.url), 'utf8');
const script = yaml.split('          script: |\n')[1].split('\n').map(line => line.replace(/^            /, '')).join('\n');
const run = new (Object.getPrototypeOf(async function () {}).constructor)('context', 'core', 'github', script);
const headings = ['关联 Issue', '本 PR 实现的接口', '本 PR 使用的接口', '改动内容', '接口 / 数据库变化', '验收证据', '验证', 'Reviewer Checklist'];
async function validate(issueBody, overrides = {}) {
  const failures = [];
  const body = headings.map(h => `## ${h}\nCloses #1\n- [x] implemented and tested`).join('\n');
  const context = { actor: 'contributor', repo: { owner: 'owner', repo: 'LeadBoard' }, payload: { pull_request: { base: { ref: 'main' }, user: { login: 'contributor' }, body } } };
  const issue = { state: 'open', assignees: [{ login: 'contributor' }], body: issueBody, ...overrides };
  await run(context, { setFailed: message => failures.push(message), info() {} }, { rest: { issues: { get: async () => ({ data: issue }) } } });
  return failures;
}
const current = '开发语言\nTypeScript\n本 Issue 使用的接口\n无\n本 Issue 要实现的接口\n无\n最终产物\n文档';
test('current task template headings no longer block valid PRs', async () => assert.deepEqual(await validate(current), []));
test('legacy task headings remain compatible', async () => assert.deepEqual(await validate('认领前必读：接口与开发语言\n本 Issue 必须实现\n本 Issue 必须使用'), []));
test('comment-only contract headers cannot pass', async () => assert.equal((await validate(`<!-- ${current} -->`)).length, 1));
test('unassigned authors and closed Issues remain rejected', async () => {
  assert.equal((await validate(current, { assignees: [] })).length, 1);
  assert.equal((await validate(current, { state: 'closed' })).length, 1);
});
