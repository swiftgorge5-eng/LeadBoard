# LeadBoard

LeadBoard 是一个面向高校开源社区的 **GitHub 开源活动统计与贡献排行榜平台**。

项目希望把一组明确纳入统计范围的开源仓库，转换成透明、可追溯的仓库活动数据与贡献者排行榜。当前只做 **Phase 1：MVP 数据闭环**，先把最基础、最可靠的一条链路跑通，再进入身份认证、账号认领、复杂积分等后续阶段。

> 当前阶段：**Phase 1 — MVP 数据闭环**

## 1. Phase 1 要解决什么

给定一个 GitHub Organization 和访问 Token，LeadBoard 应当能够：

1. 自动发现 Organization 下的仓库；
2. 读取 Repository Custom Property `leadboard_group`；
3. 只纳入明确允许统计的公开、非 Fork 仓库；
4. 采集默认分支 Commit、Pull Request、Issue；
5. 标准化 Contributor，并识别 Bot；
6. 将原始事实幂等写入 PostgreSQL；
7. 按时间范围聚合贡献者和仓库活动；
8. 通过 REST API 输出统计结果；
9. 在 React Dashboard 展示 Contributor Leaderboard、Repository Activity 和最近同步状态。

整体数据链路：

```text
GitHub Organization
        │
        ▼
Repository Sync
        │  TrackedRepository[]
        ▼
GitHub Collector
        │  GitHubActivity[]
        ▼
Normalizer / Ingestion
        │  PostgreSQL records
        ▼
Aggregation
        │  Aggregated statistics
        ▼
REST API
        │  JSON
        ▼
React Dashboard
```

## 2. Phase 1 仓库范围

`leadboard_group` 是 Phase 1 唯一的仓库归属字段。

| 情况 | 是否进入统计 |
|---|---|
| `leadboard_group=<group-name>` | ✅ 纳入并归属对应 group |
| `leadboard_group=untracked` | ❌ 不采集、不聚合 |
| 未设置 `leadboard_group` | ❌ 不采集 |
| Fork 仓库 | ❌ Phase 1 不统计 |
| 私有仓库 | ❌ Phase 1 不处理 |

LeadBoard 项目仓库本身可以位于个人账号；真正被统计的目标 Organization 由 `GITHUB_ORG` 配置。

## 3. 技术栈

| 层 | 技术 |
|---|---|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL |
| GitHub Data | GitHub GraphQL API + REST API |
| Local / Deploy | Docker Compose |
| API Style | REST / JSON |

Phase 1 暂不引入 Redis。先保证数据口径、接口和同步链路稳定，再决定是否增加缓存层。

## 4. 六个开发板块

| 板块 | 职责 | 输入 | 输出 |
|---|---|---|---|
| Config / Bootstrap | 工程、配置、运行入口 | env | `AppConfig` / runnable services |
| Repository Sync | 仓库发现、筛选、分组 | GitHub Organization | `TrackedRepository[]` |
| GitHub Collector | Commit / PR / Issue 采集 | `TrackedRepository[]` | `GitHubActivity[]` |
| Ingestion / Storage | 校验、去重、Bot 处理、落库 | `GitHubActivity[]` | PostgreSQL fact records |
| Aggregation / API | 聚合 Contributor / Repo 指标 | PostgreSQL | REST JSON |
| Frontend Dashboard | 展示排行榜和同步状态 | REST API | Web UI |

模块边界见 [docs/architecture.md](docs/architecture.md)。

## 5. 核心输入 / 输出接口

跨模块开发必须以 [docs/api-contract.md](docs/api-contract.md) 为准。当前最关键的两个共享类型是：

### Repository Sync → Collector

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

### Collector → Ingestion

```ts
export type ActivityKind = "commit" | "pull_request" | "issue";

export interface GitHubActivity {
  kind: ActivityKind;
  externalId: string;
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

统一约定：

- 时间统一为 ISO 8601 UTC；
- GitHub 稳定 ID 优先于名称；
- `externalId + kind + repositoryGithubId` 用于幂等去重；
- Collector 只负责产生事实，不负责排名；
- 排名和聚合不覆盖原始事实；
- Bot 活动可进入仓库活动量，但 Bot 不进入人类 Contributor Leaderboard。

数据库结构见 [docs/data-model.md](docs/data-model.md)。

## 6. Phase 1 REST API

计划提供：

```text
GET /health

GET /api/v1/organization/summary
GET /api/v1/organization/repositories
GET /api/v1/groups

GET /api/v1/contributors/leaderboard
GET /api/v1/contributors/:username

GET /api/v1/sync/status
```

统一支持的时间范围：

```text
7d | 30d | 90d | all
```

完整请求 / 响应格式见 [docs/api-contract.md](docs/api-contract.md)。

## 7. 当前任务

Phase 1 当前正式开发任务如下。原则上每个 Issue 控制在 **2–5 小时**，并明确输入、输出、依赖和验收标准。

| Issue | 模块 | 任务 | 依赖 |
|---|---|---|---|
| [#2](https://github.com/swiftgorge5-eng/LeadBoard/issues/2) | Bootstrap | 初始化 Monorepo、Backend、Frontend 与 Docker | 无 |
| [#3](https://github.com/swiftgorge5-eng/LeadBoard/issues/3) | Database | PostgreSQL Schema 与 Migration | #2 |
| [#4](https://github.com/swiftgorge5-eng/LeadBoard/issues/4) | GitHub | GitHub API Client：鉴权、分页、限流与重试 | #2 |
| [#5](https://github.com/swiftgorge5-eng/LeadBoard/issues/5) | Repository | Repository Sync + `leadboard_group` 筛选 | #4 |
| [#6](https://github.com/swiftgorge5-eng/LeadBoard/issues/6) | Collector | 默认分支 Commit Collector | #4, #5 |
| [#7](https://github.com/swiftgorge5-eng/LeadBoard/issues/7) | Collector | Pull Request + Issue Collector | #4, #5 |
| [#8](https://github.com/swiftgorge5-eng/LeadBoard/issues/8) | Ingestion | Normalizer、Bot 识别、幂等 Upsert | #3, #5, #6, #7 |
| [#13](https://github.com/swiftgorge5-eng/LeadBoard/issues/13) | Sync | 同步编排器、`sync_runs` 与定时任务 | #5, #6, #7, #8 |
| [#14](https://github.com/swiftgorge5-eng/LeadBoard/issues/14) | Analytics | 时间范围聚合与 Contributor Leaderboard | #3, #8 |
| [#15](https://github.com/swiftgorge5-eng/LeadBoard/issues/15) | API | Organization / Repository / Contributor / Sync API | #13, #14 |
| [#16](https://github.com/swiftgorge5-eng/LeadBoard/issues/16) | Frontend | API Client、路由与 Dashboard 骨架 | #2，可与 #15 并行 |
| [#17](https://github.com/swiftgorge5-eng/LeadBoard/issues/17) | Frontend | Contributor Leaderboard + Detail | #16 |
| [#18](https://github.com/swiftgorge5-eng/LeadBoard/issues/18) | E2E | Repository Activity、Freshness 与端到端 Smoke Test | #13, #15, #17 |

任务依赖：

```text
#2 Bootstrap
├── #3 Database
├── #4 GitHub Client
│   └── #5 Repository Sync
│       ├── #6 Commit Collector
│       └── #7 PR / Issue Collector
│           └── #8 Ingestion
│               └── #13 Sync
│
#3 + #8 ────────────────► #14 Analytics
#13 + #14 ──────────────► #15 REST API

#2 ─────────────────────► #16 Frontend Skeleton
#16 ────────────────────► #17 Leaderboard
#13 + #15 + #17 ────────► #18 E2E
```

其中 #1 是 GitHub 写权限测试；#9–#12 是连接器重试过程中产生的重复 Issue，均已关闭，不属于正式任务。

## 8. 当前进度

- [x] Phase 1 范围确定
- [x] 技术栈确定
- [x] 模块边界确定
- [x] 核心输入 / 输出接口初版
- [x] PostgreSQL 数据模型初版
- [x] REST API Contract 初版
- [x] GitHub Issue / PR 协作规范
- [x] 第一批 Phase 1 Issues
- [ ] Backend / Frontend 工程初始化
- [ ] PostgreSQL Schema
- [ ] Repository Sync
- [ ] Commit / PR / Issue Collector
- [ ] Ingestion / Normalization
- [ ] Sync Orchestration
- [ ] Analytics / REST API
- [ ] Dashboard
- [ ] End-to-end smoke test

## 9. Phase 1 不做

Phase 1 明确不包含：

- 学生身份认证
- GitHub OAuth 登录
- 用户账号认领
- 管理员人工审核
- 自动发现任意外部 GitHub 仓库贡献
- 加权积分体系
- 每日开源新闻
- 学院 / 专业多级榜单
- 社交功能

这些能力在 Phase 1 数据链路稳定后再讨论。

## 10. 如何参与

所有任务使用：

```text
Issue
  ↓
评论“认领”
  ↓
Maintainer Assign
  ↓
创建功能分支
  ↓
Pull Request
  ↓
Review
  ↓
Merge
```

分支命名：

```text
feat/<issue-number>-<short-name>
fix/<issue-number>-<short-name>
docs/<issue-number>-<short-name>
```

PR 中使用：

```text
Closes #<issue-number>
```

不要直接向 `main` 提交功能代码。详细规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 11. Phase 1 Definition of Done

给定：

```text
GITHUB_TOKEN
GITHUB_ORG
DATABASE_URL
```

运行 LeadBoard 后，系统能够自动发现受监控仓库、采集 GitHub 活动、幂等写入 PostgreSQL、生成聚合统计，并在网页中展示 Contributor Leaderboard、Repository Activity 与最近成功同步时间。
