# Canonical Phase 1 Test Fixture

> 这是跨模块 Integration / Pipeline / E2E 测试的统一语义数据集。  
> 各模块可以使用自己的 Mock 格式，但最终必须能表示本文同一组事实，避免每个 Issue 用不同口径“各自测试通过”。

## 1. 固定时钟

测试参考时间：

```text
REFERENCE_NOW = 2026-09-25T12:00:00.000Z
```

涉及 `7d / 30d / 90d` 的测试必须冻结时钟或注入 Clock，不允许直接依赖 CI 运行当天的真实时间。

时间范围仍使用半开区间：

```text
[from, to)
```

## 2. Repository Scope

### repo-a

```json
{
  "githubId": "1001",
  "nodeId": "R_repo_a",
  "owner": "leadboard-fixture",
  "name": "repo-a",
  "fullName": "leadboard-fixture/repo-a",
  "defaultBranch": "main",
  "group": "systems",
  "htmlUrl": "https://github.com/leadboard-fixture/repo-a",
  "archived": false
}
```

### repo-b

```json
{
  "githubId": "1002",
  "nodeId": "R_repo_b",
  "owner": "leadboard-fixture",
  "name": "repo-b",
  "fullName": "leadboard-fixture/repo-b",
  "defaultBranch": "main",
  "group": "ai",
  "htmlUrl": "https://github.com/leadboard-fixture/repo-b",
  "archived": false
}
```

### repo-old

数据库中额外预置：

```text
github_id = 1003
full_name = leadboard-fixture/repo-old
tracked = false
```

它有历史 Activity，但 **不得进入当前 Organization / Repository / Contributor 统计**。

## 3. Actors

### alice

```json
{
  "githubId": "2001",
  "login": "alice",
  "avatarUrl": "https://example.test/alice.png",
  "type": "User"
}
```

### bob

```json
{
  "githubId": "2002",
  "login": "bob",
  "avatarUrl": "https://example.test/bob.png",
  "type": "User"
}
```

### dependency-bot

```json
{
  "githubId": "2003",
  "login": "dependency-bot[bot]",
  "avatarUrl": "https://example.test/bot.png",
  "type": "Bot"
}
```

### unknown

```json
{
  "githubId": null,
  "login": null,
  "avatarUrl": null,
  "type": "Unknown"
}
```

## 4. Tracked Repository Activities

### Commits

| # | Repo | Actor | authored_at | merge |
|---|---|---|---|---|
| C1 | repo-a | alice | 2026-09-24T10:00:00Z | false |
| C2 | repo-a | alice | 2026-09-23T10:00:00Z | true |
| C3 | repo-a | bob | 2026-09-10T10:00:00Z | false |
| C4 | repo-a | dependency-bot[bot] | 2026-09-24T11:00:00Z | false |
| C5 | repo-a | unknown | 2026-09-22T10:00:00Z | false |
| C6 | repo-b | bob | 2026-09-21T10:00:00Z | false |
| C7 | repo-b | bob | 2026-08-30T10:00:00Z | false |

每条 Commit 使用不同 SHA；additions/deletions 使用任意确定的非负整数并做精确落库断言。

### Pull Requests

| # | Repo | Actor | created_at | state |
|---|---|---|---|---|
| P1 | repo-a | alice | 2026-09-20T10:00:00Z | merged |
| P2 | repo-b | alice | 2026-09-05T10:00:00Z | open |

P1 必须同时保存 `number`、`closedAt`、`mergedAt`。

### Issues

| # | Repo | Actor | created_at | state |
|---|---|---|---|---|
| I1 | repo-a | bob | 2026-09-24T09:00:00Z | open |
| I2 | repo-b | dependency-bot[bot] | 2026-09-02T09:00:00Z | closed |

## 5. Untracked Historical Activity

给 `repo-old (1003)` 预置：

- Charlie Commit × 3，时间在 2026-09-24；
- Charlie PR × 1，时间在 2026-09-24。

这些事实允许保留在数据库，但任何当前 Dashboard / Analytics 查询都必须排除，因为 repository `tracked=false`。

## 6. 预期结果：30d / 90d / all

在 `REFERENCE_NOW` 下，tracked repo 的上述所有事件都位于最近 30 天。

Organization：

```text
repositories = 2
contributors = 2          # alice, bob
commits      = 7
prs          = 2
issues       = 2
total        = 11
```

Repository：

```text
repo-a:
  commits = 5
  prs = 1
  issues = 1
  contributors = 2
  total = 7

repo-b:
  commits = 2
  prs = 1
  issues = 1
  contributors = 2
  total = 4
```

Contributor Leaderboard：

```text
alice:
  commits = 2
  prs = 2
  issues = 0
  total = 4

bob:
  commits = 3
  prs = 0
  issues = 1
  total = 4
```

`metric=total` 同分时：

```text
1. alice
2. bob
```

因为规则是：

```text
metric DESC, login ASC
```

Bot 和 unknown：

- C4 Bot Commit：计入 Organization / repo-a，但不进入 Contributor；
- I2 Bot Issue：计入 Organization / repo-b，但不进入 Contributor；
- C5 unknown Commit：计入 Organization / repo-a，但不进入 Contributor。

因此 **Contributor total 的总和可以小于 Organization total，这是正确行为。**

## 7. 预期结果：7d

`7d` 从：

```text
2026-09-18T12:00:00Z
```

到：

```text
2026-09-25T12:00:00Z
```

预期：

```text
commits = 5
prs = 1
issues = 1
total = 7
contributors = 2
repositories = 2
```

Contributor：

```text
alice:
  commits = 2
  prs = 1
  issues = 0
  total = 3

bob:
  commits = 1
  prs = 0
  issues = 1
  total = 2
```

Bot / unknown Activity 仍计入 Organization / Repository。

## 8. Idempotency Test

相同的 `RepositorySyncResult` 和全部 Activity 连续执行两次：

```text
applyRepositoryScope(scope)
ingestActivities(activities)

applyRepositoryScope(scope)
ingestActivities(activities)
```

第二次执行后：

- repositories 数量不增加；
- contributors 不重复；
- commits / PR / issues 事实行数不增加；
- Analytics 数字完全不变。

## 9. Rename Test

第二轮把 repo-a 改名：

```text
leadboard-fixture/repo-a
→ leadboard-fixture/repo-a-renamed
```

保持：

```text
githubId = 1001
```

预期：

- repositories 仍只有同一条 github_id=1001；
- full_name 更新；
- 历史 Activity 仍关联同一 repository。

## 10. Untrack Test

第三轮完整 Repository scope 只返回 repo-a。

预期：

```text
repo-a tracked=true
repo-b tracked=false
```

repo-b 历史 Activity 不删除。

再次运行 Analytics：

- 当前 Organization repositories=1；
- repo-b 及其 Activity 不再进入当前统计。

## 11. Boundary Fixture

Collector 单元测试另外必须构造：

```text
from = 2026-09-18T12:00:00Z
to   = 2026-09-25T12:00:00Z
```

并放置：

- event exactly at `from` → 必须包含；
- event exactly at `to` → 必须排除。

不要依赖数据库 BETWEEN，因为 BETWEEN 两端都包含，不符合 `[from,to)` 约定。
