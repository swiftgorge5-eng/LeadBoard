# LeadBoard

一个面向开源社区的 GitHub 活动统计与贡献者排行榜。首页优先展示实时贡献排名，可按时间、活动类型和 SIG 筛选，并提供贡献者资料、项目活跃度和活动趋势。

## 统计范围与口径

- 目标 GitHub Organization `hust-open-atom-club` 中 `osd_sig` 属性已分组、公开且非 fork 的仓库。分组随 GitHub 上的属性更新自动同步。
- 受关注仓库：Linux、Kubernetes、React、Vue、Node.js、Python、Rust、Go、TypeScript、Git、LLVM 和 FFmpeg。
- 贡献活动：默认分支 commit，以及 PR/Issue 创建和关闭动作。一个在所选时间段内创建并关闭的 PR/Issue 计两次。排行榜排除机器人账号。
- 贡献者按 GitHub 账号登录名识别。全部时间表示数据库中已采集的历史；首次启动采集最近 90 天以覆盖最长时间筛选，之后每 6 小时增量更新。更早历史不会自动回填。

## 生产配置

复制 `.env.example` 并设置 PostgreSQL `DATABASE_URL`。将 GitHub fine-grained token 存入服务环境变量 `GITHUB_TOKEN`；需要对 `hust-open-atom-club` 中所选公开仓库具备 Metadata、Contents、Pull requests、Issues 的只读权限。仓库 `osd_sig` 属性通过 GitHub 仓库元数据读取。没有 Token 时网站和 API 仍会启动，但榜单显示等待首次同步。

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

默认 HTTP 端口是 `3000`。可通过 `PORT`、`INGESTION_CRON_SCHEDULE`、`INITIAL_SYNC_DAYS`、`SYNC_OVERLAP_MINUTES` 和 `DATA_STALE_AFTER_HOURS` 调整运行参数。生产服务应由 systemd、容器或进程管理器守护。Express 同时托管 `frontend/dist` 和 `/api/v1`。

## API

- `GET /health`
- `GET /api/v1/organization/summary?range=30d`
- `GET /api/v1/organization/repositories?range=30d&group=linux-kernel`
- `GET /api/v1/organization/trends?range=30d`
- `GET /api/v1/groups`
- `GET /api/v1/contributors/leaderboard?range=30d&metric=total&limit=100`
- `GET /api/v1/contributors/:username?range=30d`
- `GET /api/v1/sync/status`

Supported ranges: `7d`、`30d`、`90d`、`all`; metrics: `total`、`commits`、`prs`、`issues`.
