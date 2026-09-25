# LeadBoard

LeadBoard 是一个面向高校开源社区的 GitHub 开源活动统计与贡献排行榜项目。

> 当前阶段：**Phase 1 — MVP 数据闭环**

Phase 1 参考成熟高校开源活动仪表板的核心思路，只解决一件事：

**把一组明确纳入统计范围的 GitHub 仓库，稳定地转换成仓库活动数据和贡献者排行榜。**

## Phase 1 目标

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
        │
        ▼
PostgreSQL
        │
        ▼
Aggregation + REST API
        │
        ▼
React Dashboard
```

Phase 1 完成时，LeadBoard 必须能够：

- 同步目标 GitHub Organization 下的仓库；
- 读取 Repository Custom Property `leadboard_group`；
- 只统计被明确纳入范围的公开、非 Fork 仓库；
- 采集默认分支 Commit，以及 PR / Issue 活动；
- 识别人类贡献者与 Bot；
- 按 `7d / 30d / 90d / all` 查询；
- 展示贡献者排行榜、仓库活跃榜和最近同步状态。

## 仓库纳入规则

| 情况 | Phase 1 |
|---|---|
| `leadboard_group=<group-name>` | 纳入并归属对应 group |
| `leadboard_group=untracked` | 不采集、不聚合 |
| 未设置 `leadboard_group` | 不采集 |
| Fork 仓库 | 不参与聚合 |
| 私有仓库 | Phase 1 不处理 |

> LeadBoard 自身可以位于个人账号；被统计的仓库由环境变量 `GITHUB_ORG` 指向目标 Organization。

## 技术栈

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + TypeScript + Express
- **Database:** PostgreSQL
- **GitHub:** GraphQL API + REST API
- **Local / Deploy:** Docker Compose

Phase 1 暂不引入 Redis。先保证数据口径正确、接口稳定，再根据查询压力增加缓存。

## 六个开发板块

| 板块 | 作用 | 输入 | 输出 |
|---|---|---|---|
| Config / Bootstrap | 工程与配置入口 | env | AppConfig |
| Repository Sync | 仓库发现、筛选、分组 | GitHub Org | TrackedRepository[] |
| GitHub Collector | 采集 Commit / PR / Issue | TrackedRepository[] | GitHubActivity[] |
| Ingestion / Storage | 标准化、去重、Bot 处理、落库 | GitHubActivity[] | PostgreSQL records |
| Aggregation / API | 聚合贡献者与仓库指标 | PostgreSQL | REST JSON |
| Frontend Dashboard | 展示排行榜和同步状态 | REST API | Web UI |

详细边界见 [docs/architecture.md](docs/architecture.md)，接口契约见 [docs/api-contract.md](docs/api-contract.md)。

## Phase 1 不做

- 学生身份认证
- GitHub OAuth 登录
- 账号认领
- 管理员人工审核
- 外部任意 GitHub 仓库贡献发现
- 积分权重系统
- 每日开源新闻
- 学院/专业多级榜单
- 社交功能

## 当前进度

- [x] Phase 1 范围确定
- [x] 技术栈确定
- [x] 模块边界确定
- [x] 接口与数据模型初版
- [x] GitHub 协作规范
- [ ] Backend / Frontend 工程初始化
- [ ] PostgreSQL Schema
- [ ] Repository Sync
- [ ] Commit / PR / Issue Collector
- [ ] Ingestion / Normalization
- [ ] Aggregation / REST API
- [ ] Dashboard
- [ ] End-to-end smoke test

## 如何参与

所有开发任务统一通过 GitHub Issue 分发和认领：

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

功能开发不要直接 push 到 `main`。详细规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Phase 1 Definition of Done

给定一个配置好的 GitHub Organization 和 `GITHUB_TOKEN`，运行 LeadBoard 后能够自动发现受监控仓库，采集 GitHub 活动，写入 PostgreSQL，并通过网页查看贡献者排行榜、仓库活跃数据和最近成功同步时间。
