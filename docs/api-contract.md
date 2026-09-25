# Phase 1 API Contract

> 本文是前后端和数据模块之间的共享契约。字段变化必须先更新这里。

## 通用

Base path：

```text
/api/v1
```

时间范围：

```text
7d | 30d | 90d | all
```

默认：`30d`。

日期时间统一使用 ISO 8601 UTC 字符串。

## Domain Interfaces

### TrackedRepository

```ts
export interface TrackedRepository {
  githubId: string;       // GitHub repository numeric ID, serialized as string
  nodeId: string;
  owner: string;
  name: string;
  fullName: string;       // owner/name
  defaultBranch: string;
  group: string;          // leadboard_group
  htmlUrl: string;
  archived: boolean;
  syncedAt: string;
}
```

Repository Sync 只输出已经通过 Phase 1 筛选规则的仓库。

### GitHubActivity

```ts
export type ActivityKind = "commit" | "pull_request" | "issue";

export interface GitHubActivity {
  kind: ActivityKind;
  externalId: string;       // sha / PR id / Issue id
  repositoryGithubId: string;
  actorLogin: string | null;
  actorGithubId: string | null;
  occurredAt: string;
  state?: "open" | "closed" | "merged";
  additions?: number;
  deletions?: number;
  rawUrl?: string;
}
```

要求：

- `externalId + kind + repositoryGithubId` 可用于幂等去重；
- 无法关联 GitHub 账号的 Commit 允许 `actorLogin=null`；
- Collector 不负责排名。

## HTTP API

### Health

```http
GET /health
```

响应：

```json
{ "status": "ok" }
```

### Organization summary

```http
GET /api/v1/organization/summary?range=30d
```

```json
{
  "range": "30d",
  "repositories": 12,
  "contributors": 48,
  "commits": 523,
  "prs": 76,
  "issues": 34,
  "lastUpdatedAt": "2026-09-25T04:00:00.000Z",
  "dataStatus": "fresh"
}
```

`dataStatus`: `fresh | stale | missing`。

### Repositories

```http
GET /api/v1/organization/repositories?range=30d
```

返回：

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

### Groups

```http
GET /api/v1/groups
```

```json
{
  "items": [
    { "id": 1, "name": "AI" }
  ]
}
```

### Contributor leaderboard

```http
GET /api/v1/contributors/leaderboard?range=30d&metric=total&limit=50&group=AI
```

`metric`：

```text
total | commits | prs | issues
```

`group` 可选。

返回：

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

### Contributor detail

```http
GET /api/v1/contributors/:username?range=30d
```

返回贡献者汇总，以及其参与的 tracked repositories。

### Sync status

```http
GET /api/v1/sync/status
```

```json
{
  "lastSuccessfulRunAt": "2026-09-25T04:00:00.000Z",
  "lastRunStatus": "success",
  "nextScheduledRunAt": "2026-09-25T10:00:00.000Z"
}
```

## 错误格式

所有 API 错误统一：

```json
{
  "error": {
    "code": "INVALID_RANGE",
    "message": "range must be 7d, 30d, 90d or all"
  }
}
```

HTTP status 必须与错误语义一致。
