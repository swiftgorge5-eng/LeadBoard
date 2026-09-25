# Phase 1 API Contract

> 本文是 Phase 1 的跨模块共享契约。**不同 Issue 可以并行开发，但不得各自发明字段。** 如果接口需要变化，先更新本文并在相关 Issue 说明。

## 1. 通用约定

Base path：

```text
/api/v1
```

时间范围：

```text
7d | 30d | 90d | all
```

默认：`30d`。

统一约定：

- 时间：ISO 8601 UTC string；
- GitHub numeric ID：在 TypeScript 边界统一序列化为 `string`，避免 JS number 精度风险；
- URL：使用 GitHub canonical HTML URL；
- 内部模块只传标准化 domain object，不直接透传 GitHub 原始 JSON；
- 所有可重放写入必须幂等；
- Collector 不计算排名；
- Analytics 不修改原始事实；
- Bot 活动可计入仓库活动量，但 Bot 不进入人类 Contributor Leaderboard。

---

# 2. Config / Bootstrap Contract

## 输入

环境变量：

```text
GITHUB_TOKEN
GITHUB_ORG
LEADBOARD_GROUP_PROPERTY=leadboard_group
DATABASE_URL
PORT=3000
INGESTION_CRON_SCHEDULE=0 */6 * * *
```

## 输出

```ts
export interface AppConfig {
  githubToken: string;
  githubOrg: string;
  groupProperty: string;
  databaseUrl: string;
  port: number;
  ingestionCronSchedule: string;
}
```

要求：

- 缺少必填项时服务启动失败；
- 日志不得输出 `githubToken`；
- Config 解析只做一次，后续模块接收 typed config。

---

# 3. Repository Sync Contract

## 输入

```ts
export interface RepositorySyncInput {
  org: string;
  groupProperty: string;
}
```

以及统一 GitHub Client。

## 输出

```ts
export interface TrackedRepository {
  githubId: string;
  nodeId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  group: string;
  htmlUrl: string;
  archived: boolean;
  syncedAt: string;
}
```

规则：

- `leadboard_group=<group>`：保留；
- `leadboard_group=untracked`：剔除；
- property 缺失：剔除；
- Fork：剔除；
- Private：Phase 1 剔除；
- rename 后以 `githubId` 判断为同一仓库；
- Custom Property / repository pagination 不完整时，同步整体失败，不能返回“半套成功结果”。

---

# 4. GitHub Client Contract

业务 Collector 不直接操作 fetch/axios。

建议统一接口：

```ts
export interface GitHubClient {
  listOrgRepositories(org: string): Promise<GitHubRepositoryRef[]>;

  getRepositoryCustomProperties(
    owner: string,
    repo: string
  ): Promise<Record<string, string | null>>;

  queryGraphQL<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T>;

  requestRest<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    params?: Record<string, unknown>
  ): Promise<T>;
}
```

要求：

- REST/GraphQL 分页由 Client 层封装；
- 统一处理 Rate Limit；
- 对可重试 5xx / throttling 做有限重试；
- 错误对象保留 endpoint/status/context，但不得包含 Token。

---

# 5. Collector Contract

## Activity 类型

```ts
export type ActivityKind =
  | "commit"
  | "pull_request"
  | "issue";

export interface GitHubActivity {
  kind: ActivityKind;

  // sha / PR GitHub ID / Issue GitHub ID
  externalId: string;

  repositoryGithubId: string;

  actorLogin: string | null;
  actorGithubId: string | null;

  // 此 activity 用于统计的主时间
  occurredAt: string;

  state?: "open" | "closed" | "merged";

  additions?: number;
  deletions?: number;

  rawUrl?: string;
}
```

唯一性：

```text
repositoryGithubId + kind + externalId
```

必须能够用于幂等去重。

## Commit Collector

输入：

```ts
export interface CollectRange {
  from: string;
  to: string;
}

collectCommits(
  repo: TrackedRepository,
  range: CollectRange
): Promise<GitHubActivity[]>
```

输出要求：

- `kind="commit"`
- `externalId=sha`
- `occurredAt=authored_at`
- 默认分支历史
- 无法关联 GitHub 用户时 actor 允许为 null

## PR Collector

```ts
collectPullRequests(
  repo: TrackedRepository,
  range: CollectRange
): Promise<GitHubActivity[]>
```

Phase 1 排行口径：

- `occurredAt = created_at`
- `state = open | closed | merged`

## Issue Collector

```ts
collectIssues(
  repo: TrackedRepository,
  range: CollectRange
): Promise<GitHubActivity[]>
```

要求：GitHub Issue API 返回的 PR 必须被过滤，不能同时记作 Issue。

---

# 6. Ingestion Contract

## 输入

```ts
export interface IngestionInput {
  repositories: TrackedRepository[];
  activities: GitHubActivity[];
}
```

## 输出

```ts
export interface IngestionResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}
```

行为要求：

- upsert group / repository / contributor；
- 识别 Bot；
- Commit / PR / Issue 幂等写入；
- repository rename 通过 `github_id` 更新；
- 无 actor 的 Commit 仍保留为仓库事实；
- 单条坏数据不得静默污染数据库。

数据库字段以 [data-model.md](data-model.md) 为准。

---

# 7. Sync Orchestrator Contract

## 输入

```ts
export interface RunSyncInput {
  from?: string;
  to?: string;
}
```

## 输出

```ts
export type SyncRunStatus =
  | "success"
  | "partial"
  | "failed";

export interface SyncRunResult {
  status: SyncRunStatus;
  repositoriesOk: number;
  repositoriesFailed: number;
  startedAt: string;
  finishedAt: string;
}
```

要求：

- 一次 run 对应一条 `sync_runs`；
- 单仓库失败允许总体为 `partial`；
- 同一 sync job 不允许并发重入；
- cron 默认每 6 小时一次；
- 手动 backfill 与周期同步逻辑共用同一底层 pipeline。

---

# 8. Analytics Service Contract

## 输入

```ts
export type TimeRange =
  | "7d"
  | "30d"
  | "90d"
  | "all";

export type LeaderboardMetric =
  | "total"
  | "commits"
  | "prs"
  | "issues";
```

核心 service：

```ts
getOrganizationSummary(range: TimeRange): Promise<OrganizationSummary>;

getRepositoryStats(
  range: TimeRange,
  group?: string
): Promise<RepositoryStat[]>;

getContributorLeaderboard(input: {
  range: TimeRange;
  metric: LeaderboardMetric;
  group?: string;
  limit: number;
}): Promise<ContributorRank[]>;

getContributorDetail(
  username: string,
  range: TimeRange
): Promise<ContributorDetail | null>;
```

## 基础口径

```text
commits = authored_at in range 的 tracked default-branch commit
prs     = created_at in range 的 tracked PR
issues  = created_at in range 的 tracked Issue
total   = commits + prs + issues
```

Phase 1 **不使用加权积分**。

---

# 9. HTTP API

## Health

```http
GET /health
```

响应：

```json
{
  "status": "ok"
}
```

---

## Organization Summary

```http
GET /api/v1/organization/summary?range=30d
```

响应：

```json
{
  "range": "30d",
  "repositories": 12,
  "contributors": 48,
  "commits": 523,
  "prs": 76,
  "issues": 34,
  "total": 633,
  "lastUpdatedAt": "2026-09-25T04:00:00.000Z",
  "dataStatus": "fresh"
}
```

`dataStatus`：

```text
fresh | stale | missing
```

---

## Repository Stats

```http
GET /api/v1/organization/repositories?range=30d&group=AI
```

响应：

```json
{
  "items": [
    {
      "githubId": "123",
      "fullName": "example/repo",
      "group": "AI",
      "commits": 40,
      "prs": 8,
      "issues": 3,
      "contributors": 7,
      "total": 51
    }
  ]
}
```

`group` 可选。

---

## Groups

```http
GET /api/v1/groups
```

响应：

```json
{
  "items": [
    {
      "id": 1,
      "name": "AI"
    }
  ]
}
```

---

## Contributor Leaderboard

```http
GET /api/v1/contributors/leaderboard?range=30d&metric=total&limit=50&group=AI
```

参数：

```text
range  = 7d | 30d | 90d | all
metric = total | commits | prs | issues
limit  = positive integer, default 50
group  = optional
```

响应：

```json
{
  "range": "30d",
  "metric": "total",
  "items": [
    {
      "rank": 1,
      "login": "octocat",
      "avatarUrl": "https://...",
      "commits": 30,
      "prs": 5,
      "issues": 2,
      "total": 37
    }
  ]
}
```

同分排序必须稳定。Phase 1 建议：

```text
metric DESC, login ASC
```

---

## Contributor Detail

```http
GET /api/v1/contributors/:username?range=30d
```

响应：

```json
{
  "login": "octocat",
  "avatarUrl": "https://...",
  "range": "30d",
  "commits": 30,
  "prs": 5,
  "issues": 2,
  "total": 37,
  "repositories": [
    {
      "githubId": "123",
      "fullName": "example/repo",
      "group": "AI",
      "commits": 10,
      "prs": 2,
      "issues": 1,
      "total": 13
    }
  ]
}
```

用户不存在时返回 404。

---

## Sync Status

```http
GET /api/v1/sync/status
```

响应：

```json
{
  "lastSuccessfulRunAt": "2026-09-25T04:00:00.000Z",
  "lastRunStatus": "success",
  "nextScheduledRunAt": "2026-09-25T10:00:00.000Z"
}
```

若从未成功同步：

```json
{
  "lastSuccessfulRunAt": null,
  "lastRunStatus": null,
  "nextScheduledRunAt": "2026-09-25T10:00:00.000Z"
}
```

---

# 10. 错误格式

所有 HTTP API 错误统一：

```json
{
  "error": {
    "code": "INVALID_RANGE",
    "message": "range must be 7d, 30d, 90d or all"
  }
}
```

示例错误码：

```text
INVALID_RANGE
INVALID_METRIC
INVALID_LIMIT
CONTRIBUTOR_NOT_FOUND
DATABASE_UNAVAILABLE
GITHUB_RATE_LIMITED
INTERNAL_ERROR
```

HTTP status 必须与错误语义一致。

---

# 11. 接口变更规则

如果某个 Issue 发现接口需要变化：

1. 先在对应 Issue 说明原因；
2. 更新本文件；
3. 标记所有受影响 Issue；
4. 再修改实现。

不要在某个模块内部偷偷新增或改名共享字段。
