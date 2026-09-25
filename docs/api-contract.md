# Phase 1 Interface Contract

> **这是 Phase 1 的唯一跨模块接口真相源（source of truth）。**
>
> 所有跨 Issue 的共享类型必须最终落到 `packages/contracts`，Backend 与 Frontend 均从该包导入。任何字段变更必须先修改本文和 contracts package，再修改实现，禁止各模块自行定义“相似但不同”的类型。

## 1. 全局约定

- Node.js：24 LTS
- 包管理：npm workspaces
- 共享契约：`@leadboard/contracts`
- Runtime schema：Zod
- 时间：ISO 8601 UTC string
- 时间窗口统一为半开区间：`[from, to)`
- GitHub numeric ID 在 JS/TS 边界统一序列化为 `string`
- GitHub stable ID 优先于 login / repository name
- HTTP Base Path：`/api/v1`
- 支持时间范围：`7d | 30d | 90d | all`
- `all` 表示 LeadBoard **已经入库的全部历史**，不承诺等于 GitHub 账号/仓库的全部历史
- 所有可重复执行的写入必须幂等

## 2. Shared actor

```ts
export type GitHubActorType =
  | "User"
  | "Bot"
  | "Organization"
  | "Unknown";

export interface GitHubActorRef {
  githubId: string | null;
  login: string | null;
  avatarUrl: string | null;
  type: GitHubActorType;
}
```

规则：

- 无法关联 GitHub 用户的 Commit 允许所有 actor identity 字段为 null，`type="Unknown"`；
- Bot 判断优先使用 GitHub actor type，同时兼容常见 `[bot]` login；
- Actor 信息由 Collector 提供，Ingestion 不应为每条事件重新请求 GitHub 用户 API。

## 3. Config / Bootstrap

### 输入：环境变量

```text
GITHUB_TOKEN
GITHUB_ORG
LEADBOARD_GROUP_PROPERTY=leadboard_group
DATABASE_URL
PORT=3000
INGESTION_CRON_SCHEDULE=0 */6 * * *
INITIAL_SYNC_DAYS=30
SYNC_OVERLAP_MINUTES=10
DATA_STALE_AFTER_HOURS=12
```

### 输出

```ts
export interface AppConfig {
  githubToken: string;
  githubOrg: string;
  groupProperty: string;
  databaseUrl: string;
  port: number;
  ingestionCronSchedule: string;
  initialSyncDays: number;
  syncOverlapMinutes: number;
  dataStaleAfterHours: number;
}
```

要求：缺少必填项时启动失败；日志不得输出 Token。

## 4. Repository Sync

### 输入

```ts
export interface RepositorySyncInput {
  org: string;
  groupProperty: string;
}
```

### 单个受监控仓库

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
}
```

### 输出

```ts
export interface RepositorySyncResult {
  trackedRepositories: TrackedRepository[];
  syncedAt: string;
}
```

规则：

- `leadboard_group=<group>`：纳入；
- `leadboard_group=untracked`：排除；
- property 缺失：排除；
- Fork：排除；
- Private：Phase 1 排除；
- Repository rename 使用 `githubId` 识别为同一仓库；
- Repository / Custom Property 任一分页不完整时，整个 Repository Sync 失败，不得返回半套结果；
- 因为结果是完整快照，Ingestion 可以把数据库中“上一轮 tracked、这一轮已不在结果中”的仓库标记为 `tracked=false`。

## 5. GitHub Client

业务模块不得各自创建 GitHub HTTP Client。

```ts
export interface GitHubClient {
  listOrgRepositories(org: string): Promise<unknown[]>;

  getRepositoryCustomProperties(
    owner: string,
    repo: string
  ): Promise<Record<string, string | null>>;

  requestRest<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    params?: Record<string, unknown>
  ): Promise<T>;

  paginateRest<T>(
    path: string,
    params?: Record<string, unknown>
  ): Promise<T[]>;

  queryGraphQL<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T>;
}
```

边界：

- GitHub Client 负责鉴权、REST pagination、Rate Limit、Retry 和统一错误；
- GraphQL connection 的 cursor 循环由具体 Collector 负责，因为不同 query 的 connection 结构不同；
- Client 提供单次 `queryGraphQL` primitive；
- 错误可包含 endpoint/status/context，不得包含 Token。

## 6. Collector → Ingestion

使用 **discriminated union**，保证数据模型需要的字段不会丢失。

### Base

```ts
export interface ActivityBase {
  repositoryGithubId: string;
  actor: GitHubActorRef;
  rawUrl: string | null;
}
```

### Commit

```ts
export interface CommitActivity extends ActivityBase {
  kind: "commit";
  externalId: string;      // sha
  occurredAt: string;      // authored_at
  additions: number;
  deletions: number;
  isMerge: boolean;
}
```

### Pull Request

```ts
export interface PullRequestActivity extends ActivityBase {
  kind: "pull_request";
  externalId: string;      // GitHub PR database ID
  number: number;          // repository-local PR number
  occurredAt: string;      // created_at
  state: "open" | "closed" | "merged";
  closedAt: string | null;
  mergedAt: string | null;
}
```

### Issue

```ts
export interface IssueActivity extends ActivityBase {
  kind: "issue";
  externalId: string;      // GitHub Issue database ID
  number: number;
  occurredAt: string;      // created_at
  state: "open" | "closed";
  closedAt: string | null;
}
```

### Union

```ts
export type GitHubActivity =
  | CommitActivity
  | PullRequestActivity
  | IssueActivity;
```

唯一性：

```text
repositoryGithubId + kind + externalId
```

Collector 函数：

```ts
export interface CollectRange {
  from: string; // inclusive
  to: string;   // exclusive
}

collectCommits(
  repo: TrackedRepository,
  range: CollectRange
): Promise<CommitActivity[]>;

collectPullRequests(
  repo: TrackedRepository,
  range: CollectRange
): Promise<PullRequestActivity[]>;

collectIssues(
  repo: TrackedRepository,
  range: CollectRange
): Promise<IssueActivity[]>;
```

额外规则：

- Commit 只采默认分支；
- PR / Issue 排行口径按 `created_at`；
- Issue API 中的 PR 必须过滤；
- Merge commit 保留 `isMerge`，Phase 1 排名不使用代码行；
- Collector 只产生事实，不做排名。

## 7. Ingestion

Repository scope 与 activity 写入分开，避免仓库退出统计范围后无法更新状态。

```ts
export interface RepositoryScopeApplyResult {
  tracked: number;
  untracked: number;
  upserted: number;
}

export interface IngestionResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

applyRepositoryScope(
  scope: RepositorySyncResult
): Promise<RepositoryScopeApplyResult>;

ingestActivities(
  activities: GitHubActivity[]
): Promise<IngestionResult>;
```

要求：

- `applyRepositoryScope` 在完整 Repository Sync 成功后执行；
- 当前快照不存在的历史 tracked repository 标记为 `tracked=false`；
- group / repository / contributor 使用 stable ID upsert；
- Contributor 有 `githubId` 时按 githubId 归并，缺失时才退化为 login；
- 同一 activity 重放不会产生重复记录；
- 无 actor 的 Commit 仍写入仓库事实；
- Bot activity 保留，但 contributor 标记 `is_bot=true`。

## 8. Sync Orchestrator

```ts
export type SyncRunStatus =
  | "success"
  | "partial"
  | "failed";

export type SyncTrigger =
  | "scheduled"
  | "manual";

export interface RunSyncInput {
  from?: string;
  to?: string;
  trigger: SyncTrigger;
}

export interface SyncRunResult {
  status: SyncRunStatus;
  trigger: SyncTrigger;
  rangeFrom: string;
  rangeTo: string;
  repositoriesOk: number;
  repositoriesFailed: number;
  startedAt: string;
  finishedAt: string;
}
```

窗口策略：

- 所有区间使用 `[from,to)`；
- 显式传 `from/to` 时严格使用；
- 未显式传时，`to=now`；
- 有最近成功 run：`from = lastSuccessfulRangeTo - SYNC_OVERLAP_MINUTES`；
- 从未成功同步：`from = to - INITIAL_SYNC_DAYS`；
- overlap 依靠幂等 upsert 去重；
- 一次 run 对应一条 `sync_runs`；
- 同一时刻禁止两个 sync run 并发。

Sync query service：

```ts
export interface SyncStatus {
  lastSuccessfulRunAt: string | null;
  lastRunStatus: SyncRunStatus | null;
  nextScheduledRunAt: string | null;
  dataStatus: "fresh" | "stale" | "missing";
}

getSyncStatus(): Promise<SyncStatus>;
```

`dataStatus`：

- 从未成功：`missing`
- 距最近成功 > `DATA_STALE_AFTER_HOURS`：`stale`
- 否则：`fresh`

## 9. Analytics

```ts
export type TimeRange = "7d" | "30d" | "90d" | "all";
export type LeaderboardMetric = "total" | "commits" | "prs" | "issues";

export interface GroupSummary {
  name: string;
}

export interface OrganizationSummary {
  range: TimeRange;
  repositories: number;
  contributors: number;
  commits: number;
  prs: number;
  issues: number;
  total: number;
  lastUpdatedAt: string | null;
  dataStatus: "fresh" | "stale" | "missing";
}

export interface RepositoryStat {
  githubId: string;
  fullName: string;
  group: string;
  commits: number;
  prs: number;
  issues: number;
  contributors: number;
  total: number;
}

export interface ContributorRank {
  rank: number;
  login: string;
  avatarUrl: string | null;
  commits: number;
  prs: number;
  issues: number;
  total: number;
}

export interface ContributorRepositoryStat {
  githubId: string;
  fullName: string;
  group: string;
  commits: number;
  prs: number;
  issues: number;
  total: number;
}

export interface ContributorDetail {
  login: string;
  avatarUrl: string | null;
  range: TimeRange;
  commits: number;
  prs: number;
  issues: number;
  total: number;
  repositories: ContributorRepositoryStat[];
}
```

Service：

```ts
getGroups(): Promise<GroupSummary[]>;

getOrganizationSummary(
  range: TimeRange
): Promise<OrganizationSummary>;

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

口径：

```text
commits = authored_at in range 的 tracked default-branch commit
prs     = created_at in range 的 tracked PR
issues  = created_at in range 的 tracked Issue
total   = commits + prs + issues
```

- Organization / Repository activity 包含 Bot activity 和无法归属 contributor 的 Commit；
- Contributor 数量和 Contributor Leaderboard 只统计可识别的非 Bot contributor；
- Phase 1 不使用加权积分；
- 同分排序：`metric DESC, login ASC`。

## 10. REST API

### Health

`GET /health`

```json
{ "status": "ok" }
```

### Organization Summary

`GET /api/v1/organization/summary?range=30d`

返回 `OrganizationSummary`。

### Repository Stats

`GET /api/v1/organization/repositories?range=30d&group=AI`

```ts
export interface RepositoryStatsResponse {
  items: RepositoryStat[];
}
```

### Groups

`GET /api/v1/groups`

```ts
export interface GroupsResponse {
  items: GroupSummary[];
}
```

`group` query 参数使用 group **name**，不是数据库 ID。

### Contributor Leaderboard

`GET /api/v1/contributors/leaderboard?range=30d&metric=total&limit=50&group=AI`

```ts
export interface ContributorLeaderboardResponse {
  range: TimeRange;
  metric: LeaderboardMetric;
  items: ContributorRank[];
}
```

### Contributor Detail

`GET /api/v1/contributors/:username?range=30d`

返回 `ContributorDetail`；不存在返回 404。

### Sync Status

`GET /api/v1/sync/status`

返回 `SyncStatus`。

## 11. 错误格式

```ts
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
```

示例 code：

```text
INVALID_RANGE
INVALID_METRIC
INVALID_LIMIT
CONTRIBUTOR_NOT_FOUND
DATABASE_UNAVAILABLE
GITHUB_RATE_LIMITED
SYNC_ALREADY_RUNNING
INTERNAL_ERROR
```

## 12. 接口变更规则

任何跨模块接口变更必须按此顺序：

1. 在相关 Issue 说明变更原因；
2. 更新本文；
3. 更新 `packages/contracts` schema/type；
4. 更新/增加 contract test；
5. 再修改 Backend / Frontend 实现。

未经以上步骤，不接受“本模块先自定义一个字段”的 PR。
