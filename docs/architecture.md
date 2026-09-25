# Phase 1 Architecture

## 目标

Phase 1 只建立一个可验证的 MVP 数据闭环：

```text
GitHub Organization
        │
        ▼
Repository Sync
        │
        ▼
GitHub Collectors
        │
        ▼
Normalizer / Ingestion
        │
        ▼
PostgreSQL
        │
        ▼
Aggregation / REST API
        │
        ▼
React Dashboard
```

## 模块边界

### A. Config / Bootstrap

职责：

- 加载环境变量；
- 启动 Backend / Frontend / PostgreSQL；
- 暴露健康检查；
- 提供共享配置。

主要输入：

```text
GITHUB_TOKEN
GITHUB_ORG
DATABASE_URL
INGESTION_CRON_SCHEDULE
PORT
```

主要输出：`AppConfig`。

### B. Repository Sync

职责：

- 分页获取 `GITHUB_ORG` 下仓库；
- 读取 Repository Custom Properties；
- 使用 `leadboard_group` 决定是否纳入；
- 排除 Fork、私有、未跟踪仓库；
- 使用 GitHub repository ID 保持重命名前后身份稳定。

输出：`TrackedRepository[]`。

### C. GitHub Collector

职责：

- Commit：默认分支历史；
- Pull Request：创建、关闭、合并时间与作者；
- Issue：创建、关闭时间与作者；
- 完整处理分页、限流、重试。

输出：`GitHubActivity[]`。

### D. Ingestion / Storage

职责：

- 校验 Collector 输出；
- 去重；
- 识别 Bot；
- contributor 归并；
- upsert PostgreSQL；
- 记录同步任务状态。

### E. Aggregation / API

职责：

- 支持 `7d / 30d / 90d / all`；
- 按 repository / group / contributor 聚合；
- 输出贡献者排行榜、仓库榜、组织摘要；
- 返回最近成功同步时间。

Phase 1 不引入加权积分。`metric=total` 为基础活动数：

```text
total = commits + prs + issues
```

后续评分系统独立演进，不覆盖原始数据。

### F. Frontend Dashboard

Phase 1 页面至少包含：

- Contributor Leaderboard；
- Repository Activity；
- Group 筛选；
- 时间范围切换；
- Data freshness / last sync。

## 仓库范围

`leadboard_group` 是 Phase 1 唯一的仓库归属字段。

- 有合法 group：tracked；
- `untracked`：排除；
- 缺失：排除。

建议由目标 Organization 将该 Custom Property 定义为单选字段。

## 同步策略

默认计划：每 6 小时一次，可由 `INGESTION_CRON_SCHEDULE` 修改。

首次启动不自动执行大规模历史回填。历史回填使用单独命令，并要求显式时间范围。

## 错误原则

仓库范围同步必须“全有或全无”：如果 Custom Property 分页不完整或结构异常，不将半套仓库范围写入数据库。

单仓库活动采集失败时，记录该仓库失败信息，并保留上一轮成功数据。

## Phase 1 明确排除

身份认证、账号认领、人工审核、外部任意仓库发现、权重积分、新闻、学院多级榜、Redis 缓存。
