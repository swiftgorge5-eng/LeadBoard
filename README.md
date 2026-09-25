# LeadBoard

LeadBoard 是一个面向开源社区的 **GitHub 开源活动统计与贡献排行榜平台**。

项目目标是把一组明确纳入统计范围的开源仓库，转换成透明、可追溯、可重复计算的仓库活动数据与贡献者排行榜。

当前处在 Phase 1 阶段。#2 工程底座已实现（按 PR 流程验收）；其余业务模块欢迎认领 Issue。

## 在自己的电脑上运行 LeadBoard

“本地启动”就是让网站在你自己的电脑上运行，再用浏览器打开它。

**目前能看到建设中的首页和“后端服务已连接”提示。贡献排行榜和 GitHub 数据采集还在开发中，没有榜单数据是正常的。**

### 第一步：准备软件（第一次运行时需要）

- **Node.js 24.x**：运行这个项目所需的软件。安装时保留默认选项，同时安装 npm。npm 是用来下载项目依赖和运行命令的工具，本项目要求版本 11 或以上。
- **VS Code**：用来打开项目文件、修改配置和输入命令。也可以使用你熟悉的编辑器。
- **Docker Desktop（需要数据库时安装）**：帮你运行 PostgreSQL 数据库。**目前只查看首页和服务连接状态，可以先跳过数据库。** 后续开发数据库相关功能时再安装并启动它，需要支持 Docker Compose v2。

安装完 Node.js 后，重新打开 VS Code，点击顶部菜单 **“终端” → “新建终端”**。终端就是输入下面这些命令的窗口。每次复制一条命令，按回车，等它执行完再输入下一条：

```text
node -v
npm -v
```

第一条应显示 `v24.x.x`，第二条应显示 `11.x.x` 或更高版本。

### 第二步：下载并打开项目

如果电脑上已经有 LeadBoard，直接用 VS Code 打开它所在的文件夹。

如果还没有：

1. 在本仓库页面点击绿色 **Code** 按钮，再点击 **Download ZIP**。
2. 解压下载的文件。
3. 在 VS Code 中点击 **“文件” → “打开文件夹”**，选择解压后的项目文件夹（通常叫 `LeadBoard-main`）。
4. 确认左侧能直接看到 `package.json`、`backend`、`frontend` 和 `.env.example`。

如果你已经安装 Git，也可以在准备存放项目的位置打开终端，依次运行：

```text
git clone https://github.com/swiftgorge5-eng/LeadBoard.git
cd LeadBoard
```

**下面的命令都在项目最外层文件夹中运行，也就是有 `package.json` 的那一层。** 用 VS Code 打开这个文件夹后，再选择“终端 → 新建终端”即可。

### 第三步：安装项目需要的依赖

在终端输入：

```text
npm install
```

这一步会从网上下载项目需要的代码包，第一次可能需要几分钟。等命令执行结束、终端重新允许输入后再继续。如果出现报错，先处理报错，不要直接往下执行。

### 第四步：填写配置文件

1. 在 VS Code 左侧找到 `.env.example`，复制一份放在同一个文件夹。
2. 把复制出来的文件重命名为 **`.env`**，注意开头有一个点，末尾没有 `.txt`。
3. 打开 `.env`，把最上面的两行改成下面这样，其他内容先保留原样，然后保存：

```dotenv
GITHUB_TOKEN=local-placeholder
GITHUB_ORG=local-org
```

这两个值只是让你现在能启动页面的临时占位内容，**不是真实的 GitHub 授权信息，也不会采集数据**。当前程序启动时会检查配置是否填写，但还不会连接 GitHub 或数据库。

后续接入真实采集功能时，`GITHUB_TOKEN` 要换成有效的 GitHub 访问令牌，`GITHUB_ORG` 要换成要统计的 GitHub 组织名称。`.env` 只保存在自己电脑上，不要提交到仓库或把真实令牌发给别人。

### 第五步：启动网站

在同一个终端输入：

```text
npm run dev
```

这条命令会一起启动网页和给网页提供数据的后端服务。**保持这个终端打开**；它一直显示运行日志、没有回到输入提示符，是正常现象。之后修改代码并保存，开发服务会自动更新。

打开浏览器，在地址栏输入：

**http://localhost:5173**

看到 LeadBoard 首页，并且页面显示 **“后端服务已连接”**，说明当前已实现的基础部分启动成功。

也可以打开 http://localhost:3000/health 检查后端。这里显示的是服务状态数据，不是网站页面；它也不代表 GitHub 采集或数据库功能已经完成。

### 怎么停止？下次怎么打开？

- **停止网站**：回到运行 `npm run dev` 的终端，按 `Ctrl + C`。
- **下次启动**：用 VS Code 打开同一个项目文件夹，打开终端，再运行 `npm run dev`。不用重新复制 `.env`。
- **更新代码后**：如果项目新增或更改了依赖，再运行一次 `npm install`。

### 需要数据库时，再做这一步

先打开 Docker Desktop，等它启动完成，再在项目文件夹的终端运行：

```text
docker compose up -d --wait postgres
```

这条命令会下载并启动 PostgreSQL，等数据库准备好后结束。数据库会继续在后台运行。第一次需要联网下载，耗时可能较长。

项目已提供本地开发用的数据库名称、用户名和密码，都是 `leadboard`，与 `.env.example` 中的 `DATABASE_URL` 一致，首次使用不用修改。它只允许从本机连接，端口是 `5432`。这些默认账号信息只用于本地开发，正式部署时需要另行设置。

暂时不用数据库时，在项目文件夹中运行：

```text
docker compose down
```

这会停止数据库并保留数据。**不要随意加 `-v`，它会删除本地数据库数据。**

目前 `db/migrations` 只是预留目录，数据库表和建表步骤由 #3 任务实现；启动数据库不等于已经完成业务数据初始化。

### 启动失败时，先看这里

| 遇到的情况 | 怎么处理 |
|---|---|
| 提示找不到 `node` 或 `npm` | 检查 Node.js 是否安装完成，关闭并重新打开 VS Code，再试版本检查命令。 |
| Windows 提示“无法加载 npm.ps1，因为禁止运行脚本” | 在 VS Code 终端右上角的下拉菜单选择 **Command Prompt（命令提示符）**，新建终端后重新输入命令。 |
| 提示找不到 `package.json` | 当前打开的文件夹不对。重新打开能直接看到 `package.json` 的项目文件夹，再新建终端。 |
| 提示 `GITHUB_TOKEN` 或 `GITHUB_ORG` 配置有问题 | 检查项目最外层的 `.env` 是否存在，两项是否按第四步填写并保存，然后重新启动。 |
| 提示 `EADDRINUSE` 或端口已被占用 | 检查是否已经在另一个终端启动了项目，先用 `Ctrl + C` 停止之前的服务再重试。默认网页端口是 5173，后端端口是 3000。 |
| 首页显示“暂未连接后端” | 查看运行 `npm run dev` 的终端是否有后端报错，确认 `.env` 配置正确；修复后重新启动并刷新网页。 |
| Docker 提示无法连接或数据库启动失败 | 确认 Docker Desktop 已运行；如果提示 5432 被占用，检查电脑上是否已有数据库在运行。只看当前首页时可以先跳过数据库。 |

如果仍然失败，请提供**执行的命令和完整报错**，不要只说“启动不了”。截图或复制日志前，检查是否包含真实令牌、密码。

### 开发者补充：检查代码和预览编译结果

下面这些不是首次打开页面的必做步骤，提交代码前或检查编译结果时再使用。

在项目最外层依次运行：

```text
npm ci
npm run typecheck
npm test
npm run build
```

分别表示：按锁定版本重新安装依赖、检查 TypeScript 类型、运行自动化测试、编译项目。`npm ci` 会重建依赖目录，适合需要干净安装时使用。

编译成功后，可以停止之前的开发服务，再用两个终端分别运行：

```text
npm start
```

上面启动编译后的后端；另一个终端运行：

```text
npm run preview --workspace=@leadboard/frontend
```

上面预览编译后的网页，浏览器打开终端中显示的地址。后端仍然读取项目最外层的 `.env`。

只开发某一部分时，可以使用 `npm run dev:backend` 或 `npm run dev:frontend`；只启动前端时，页面的服务连接检查仍需要后端运行。根目录的开发、类型检查和测试命令会先编译共享接口包。若直接运行子项目命令，需要先执行 `npm run build --workspace=@leadboard/contracts`。

网页发出的 `/health` 和 `/api` 请求会由 Vite 转发到后端，后端端口读取根目录 `.env` 的 `PORT`（默认 3000）。GitHub 令牌不提供给网页。


> **Phase 1 — 闭环**

Phase 1 需要完成的任务如下：

```text
GitHub Organization
        │
        ▼
Repository Sync
        │ RepositorySyncResult
        ▼
Repository Scope Apply
        │ TrackedRepository[]
        ▼
Commit / PR / Issue Collectors
        │ GitHubActivity[]
        ▼
Ingestion
        │ PostgreSQL Facts
        ▼
Analytics
        │ Shared Response Types
        ▼
REST API
        │ JSON
        ▼
React Dashboard
```

---

## 1. Phase 1 的行为：

给定一个 GitHub Organization 和访问 Token，LeadBoard 应当能够：

1. 自动发现目标 Organization 下的仓库；
2. 读取 Repository Custom Property `leadboard_group`；
3. 只纳入明确允许统计的公开、非 Fork 仓库；
4. 采集默认分支 Commit、Pull Request、Issue；
5. 标准化 GitHub Actor，并识别 Bot；
6. 将 Repository scope 与 GitHub activity 幂等写入 PostgreSQL；
7. 按 `7d / 30d / 90d / all` 聚合仓库和贡献者活动；
8. 通过 REST API 输出稳定的数据结构；
9. 在 React Dashboard 展示 Contributor Leaderboard、Repository Activity 与同步新鲜度。


后续加入评分系统，也会建立在原始事实之上，并入历史数据。

---

## 2. 仓库纳入规则

`leadboard_group` 是 Phase 1 唯一的仓库归属字段。

| 情况 | 是否进入统计 |
|---|---|
| `leadboard_group=<group-name>` | ✅ 纳入并归属对应 group |
| `leadboard_group=untracked` | ❌ 不采集、不聚合 |
| 未设置 `leadboard_group` | ❌ 不采集 |
| Fork 仓库 | ❌ Phase 1 不统计 |
| 私有仓库 | ❌ Phase 1 不处理 |

Repository Sync 必须拿到 **完整快照** 才算成功。

如果 Repository / Custom Property 分页失败，不允许用部分结果更新数据库，否则可能错误地把仍在统计范围内的仓库标成 untracked。

---

## 3. 技术栈

| 层 | 技术 |
|---|---|
| Runtime | Node.js 24 LTS |
| Language | TypeScript |
| Monorepo | npm workspaces |
| Shared Contract | `@leadboard/contracts` + Zod |
| Backend | Express |
| Frontend | React + Vite |
| Database | PostgreSQL |
| DB Driver | `pg` |
| Migration | `node-pg-migrate` |
| GitHub Data | GitHub REST API + GraphQL API |
| Test | Vitest |
| Scheduler | `node-cron` 或同级轻量 cron 库 |
| Local / Deploy | Docker Compose |
| API Style | REST / JSON |

Phase 1 暂不引入 Redis。

---

## 4. Monorepo 规划

```text
LeadBoard/
├── backend/
│   └── src/
│       ├── config/
│       ├── github/
│       ├── repositories/
│       ├── collectors/
│       ├── ingestion/
│       ├── sync/
│       ├── analytics/
│       ├── api/
│       └── db/
├── frontend/
├── packages/
│   └── contracts/
├── db/
│   └── migrations/
├── docs/
│   ├── architecture.md
│   ├── api-contract.md
│   └── data-model.md
├── .github/
├── docker-compose.yml
├── CONTRIBUTING.md
└── README.md
```

---

## 5. 最重要的开发原则：Contract First

多人并行开发时，我们需要共享接口文档。

LeadBoard 的共享接口说明：

```text
docs/api-contract.md
        ↓
packages/contracts
        ↓
Backend / Frontend import
```

所有跨模块共享类型来自：

```text
@leadboard/contracts
```

禁止如下行为：

- Collector 自己定义一份 Activity；
- Ingestion 再定义另一份 Activity；
- Frontend 手抄后端 Response Type；
- API 临时增加文档中不存在的字段；
- 某个 Issue 为了方便改共享字段。

任何接口变化需要提前拉讨论。

---

## 6. 六个开发板块

| 板块 | 职责 | 输入 | 输出 |
|---|---|---|---|
| Config / Bootstrap | 工程、workspace、typed config、运行入口 | env | `AppConfig` / runnable services |
| Repository Sync | 仓库发现、筛选、分组 | GitHub Organization | `RepositorySyncResult` |
| GitHub Collector | Commit / PR / Issue 采集 | `TrackedRepository + CollectRange` | `GitHubActivity[]` |
| Ingestion / Storage | scope、校验、去重、Bot、落库 | Repository scope + Activity | PostgreSQL facts |
| Analytics / API | 聚合 Contributor / Repo 指标 | PostgreSQL | Shared response types / REST JSON |
| Frontend Dashboard | 展示排行榜和同步状态 | REST API | Web UI |

完整边界见 [docs/architecture.md](docs/architecture.md)。

---

## 7. 核心输入 / 输出接口

完整定义以 [docs/api-contract.md](docs/api-contract.md) 为准。

### 7.1 Repository Sync → Ingestion / Collector

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

export interface RepositorySyncResult {
  trackedRepositories: TrackedRepository[];
  syncedAt: string;
}
```

Repository Sync 返回的是一次完整 scope。

Ingestion 根据完整 scope：

- upsert 当前 tracked repositories；
- 更新 rename/group/default branch；
- 将上一轮 tracked、但本轮完整 scope 中已不存在的 repository 标记为 `tracked=false`。

历史 activity 不删除。

### 7.2 Collector → Ingestion

使用 discriminated union。

```ts
export interface GitHubActorRef {
  githubId: string | null;
  login: string | null;
  avatarUrl: string | null;
  type: "User" | "Bot" | "Organization" | "Unknown";
}

export interface CommitActivity {
  kind: "commit";
  repositoryGithubId: string;
  externalId: string;
  actor: GitHubActorRef;
  occurredAt: string;
  additions: number;
  deletions: number;
  isMerge: boolean;
  rawUrl: string | null;
}

export interface PullRequestActivity {
  kind: "pull_request";
  repositoryGithubId: string;
  externalId: string;
  number: number;
  actor: GitHubActorRef;
  occurredAt: string;
  state: "open" | "closed" | "merged";
  closedAt: string | null;
  mergedAt: string | null;
  rawUrl: string | null;
}

export interface IssueActivity {
  kind: "issue";
  repositoryGithubId: string;
  externalId: string;
  number: number;
  actor: GitHubActorRef;
  occurredAt: string;
  state: "open" | "closed";
  closedAt: string | null;
  rawUrl: string | null;
}

export type GitHubActivity =
  | CommitActivity
  | PullRequestActivity
  | IssueActivity;
```

唯一性：

```text
repositoryGithubId + kind + externalId
```

这保证 Collector 的输出已经包含 PostgreSQL 落库需要的全部字段，#8 Ingestion 不需要再次向 GitHub 补数据。

---

## 8. 时间与同步语义

所有采集时间窗口统一使用：

```text
[from, to)
```

即：

- `from` inclusive
- `to` exclusive
- UTC

默认同步策略：

```text
第一次同步：
最近 INITIAL_SYNC_DAYS
默认 30 天

后续同步：
上一次成功 range_to
向前 overlap SYNC_OVERLAP_MINUTES
默认 10 分钟
```

因为数据库写入幂等，所以 overlap 不会重复计数，可以降低边界漏数据风险。

`range=all` 的含义是：

> LeadBoard 数据库中已经采集到的全部历史。

它不承诺等于 GitHub 仓库从创建至今的完整历史。

---

## 9. 数据统计口径

### Organization / Repository

包含：

- Bot activity；
- 无法归属 GitHub contributor 的 Commit。

### Contributor Leaderboard

只包含：

- 可以识别 contributor；
- `is_bot=false`。

### 时间字段

```text
Commit → authored_at
PR     → created_at
Issue  → created_at
```

### total

```text
total = commits + prs + issues
```

---

## 10. Phase 1 REST API

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

统一支持：

```text
range = 7d | 30d | 90d | all
metric = total | commits | prs | issues
group = group name
```

完整 Request / Response 类型见 [docs/api-contract.md](docs/api-contract.md)。

---

## 11. 当前正式开发任务

每个 Issue 原则上控制在 **2–5 小时**，并明确输入、输出、依赖和验收标准。
鼓励AI，更鼓励大家自己熟悉一遍流程。未来无论加入什么团队， 通过GitHub协作的能力是必要的。

| Issue | 模块 | 任务 | 依赖 |
|---|---|---|---|
| [#2](https://github.com/swiftgorge5-eng/LeadBoard/issues/2) | Bootstrap | Monorepo、Backend、Frontend、contracts、Docker | 无 |
| [#3](https://github.com/swiftgorge5-eng/LeadBoard/issues/3) | Database | PostgreSQL Schema + Migration | #2 |
| [#4](https://github.com/swiftgorge5-eng/LeadBoard/issues/4) | GitHub | GitHub API Client | #2 |
| [#5](https://github.com/swiftgorge5-eng/LeadBoard/issues/5) | Repository | Repository Sync + `leadboard_group` | #4 |
| [#6](https://github.com/swiftgorge5-eng/LeadBoard/issues/6) | Collector | Default Branch Commit Collector | #4, #5 |
| [#7](https://github.com/swiftgorge5-eng/LeadBoard/issues/7) | Collector | Pull Request + Issue Collector | #4, #5 |
| [#8](https://github.com/swiftgorge5-eng/LeadBoard/issues/8) | Ingestion | Repository Scope + Activity Upsert | #3, #5, #6, #7 |
| [#13](https://github.com/swiftgorge5-eng/LeadBoard/issues/13) | Sync | Sync Orchestrator + sync_runs + Scheduler | #5, #6, #7, #8 |
| [#14](https://github.com/swiftgorge5-eng/LeadBoard/issues/14) | Analytics | Aggregation + Contributor Leaderboard | #3, #8 |
| [#15](https://github.com/swiftgorge5-eng/LeadBoard/issues/15) | API | Organization / Repository / Contributor / Sync API | #13, #14 |
| [#16](https://github.com/swiftgorge5-eng/LeadBoard/issues/16) | Frontend | API Client + Dashboard Skeleton | #2，可与 #15 并行 |
| [#17](https://github.com/swiftgorge5-eng/LeadBoard/issues/17) | Frontend | Contributor Leaderboard + Detail | #16 |
| [#18](https://github.com/swiftgorge5-eng/LeadBoard/issues/18) | E2E | Repository Activity + Freshness + Smoke Test | #13, #15, #17 |

任务依赖：

```text
#2 Bootstrap
├── #3 Database
├── #4 GitHub Client
│   └── #5 Repository Sync
│       ├── #6 Commit Collector
│       └── #7 PR / Issue Collector
│
#3 + #5 + #6 + #7 ─────► #8 Ingestion
#5 + #6 + #7 + #8 ─────► #13 Sync
#3 + #8 ────────────────► #14 Analytics
#13 + #14 ──────────────► #15 REST API

#2 ─────────────────────► #16 Frontend Skeleton
#16 ────────────────────► #17 Leaderboard
#13 + #15 + #17 ────────► #18 E2E
```

#1 是 GitHub 写权限测试。

#9–#12 是连接器重试时产生的重复 Issue，均已关闭，不属于正式任务。

---

## 12. 并行开发顺序

### Wave 1

```text
#2 Bootstrap
```

#2 完成后，workspace 和 shared contracts 存在。

### Wave 2

可并行：

```text
#3 Database
#4 GitHub Client
#16 Frontend Skeleton
```

### Wave 3

```text
#5 Repository Sync
```

### Wave 4

可并行：

```text
#6 Commit Collector
#7 PR / Issue Collector
```

### Wave 5

可并行推进：

```text
#8 Ingestion
#14 Analytics（等 #8 可用）
#17 Frontend Leaderboard（可先基于 mock）
```

随后：

```text
#13 Sync
→ #15 REST API
→ #18 E2E
```

---

## 13. Integration Gates

为了确保所有 Issue 做完以后能够真正拼在一起，Phase 1 设置五个集成门槛。

### Gate 1 — Contracts

Backend / Frontend / Pipeline 必须全部从同一个：

```text
@leadboard/contracts
```

成功编译。

### Gate 2 — Database

从空 PostgreSQL：

```text
migration
→ ingest fixture
→ 重放 fixture
```

不能产生重复行。

### Gate 3 — Pipeline

固定 fixture：

```text
RepositorySyncResult
+ GitHubActivity[]
        ↓
PostgreSQL
        ↓
Analytics
```

得到确定结果。

### Gate 4 — API Contract

Backend contract tests 必须验证 API 与共享类型一致。

Frontend mock 与真实 API 必须使用同一 schema/type。

### Gate 5 — E2E

真实测试 Organization：

```text
GitHub
→ Repository Sync
→ Collector
→ PostgreSQL
→ Analytics
→ REST API
→ Dashboard
```

完整跑通。

---

## 14. Freshness

默认：

```text
INGESTION_CRON_SCHEDULE=0 */6 * * *
DATA_STALE_AFTER_HOURS=12
```

状态：

```text
从未成功同步
→ missing

距离最近成功同步 > 12h
→ stale

否则
→ fresh
```

---

## 15. CI 与验收

所有 PR 都必须经过自动化与人工两层验收。

统一验收规范：

- [docs/acceptance.md](docs/acceptance.md)
- [docs/test-fixtures.md](docs/test-fixtures.md) — 跨模块统一测试数据与预期结果
- [docs/repository-rules.md](docs/repository-rules.md)

仓库当前包含：

```text
.github/workflows/ci.yml
→ Secret / Build / Contract / DB / Integration / Pipeline / E2E Gates

.github/workflows/pr-policy.yml
→ 检查 PR 是否关联合格 Issue，以及接口/验收信息是否填写完整

.github/workflows/e2e-live.yml
→ Maintainer 手动执行真实 GitHub E2E

.github/CODEOWNERS
→ 关键文件维护者 Review
```

最终 Merge 条件：

```text
PR Policy PASS
+
CI Acceptance Gate PASS
+
Issue Acceptance Criteria 完成
+
Maintainer Review 通过
+
Review threads resolved
```

当对应模块尚未实现时，CI 中相关 Job 会显示 skipped；一旦该模块目录出现，对应验收会自动启用。

---

## 16. 当前进度

- [x] Phase 1 范围确定
- [x] 技术栈确定
- [x] Monorepo 规划确定
- [x] 模块边界确定
- [x] 核心输入 / 输出接口完成第二轮对齐
- [x] Repository scope 生命周期定义
- [x] Activity discriminated union 定义
- [x] PostgreSQL 数据模型对齐
- [x] 增量同步窗口语义定义
- [x] REST API Contract 定义
- [x] GitHub Issue / PR 协作规范
- [x] 第一批 Phase 1 Issues
- [x] #2 Bootstrap（工程实现；合并以 PR 验收和 Review 为准）
- [ ] #3 Database
- [ ] #4 GitHub Client
- [ ] #5 Repository Sync
- [ ] #6 Commit Collector
- [ ] #7 PR / Issue Collector
- [ ] #8 Ingestion
- [ ] #13 Sync
- [ ] #14 Analytics
- [ ] #15 API
- [ ] #16 Frontend Skeleton
- [ ] #17 Contributor Leaderboard
- [ ] #18 E2E

---

## 17. Phase 1 不做

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
- Redis
- 完整历史回填系统

---

## 18. 如何参与

统一流程：

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

功能代码不要直接 push 到 `main`。

详细协作规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 19. Phase 1 Definition of Done

给定：

```text
GITHUB_TOKEN
GITHUB_ORG
DATABASE_URL
```

能够从干净环境完成：

```text
npm install
        ↓
docker compose up
        ↓
database migration
        ↓
manual / scheduled sync
        ↓
PostgreSQL facts
        ↓
Analytics
        ↓
REST API
        ↓
Dashboard
```

并满足：

- Repository scope 正确；
- Commit / PR / Issue 不重复；
- Bot 口径正确；
- Repository rename / untrack 正确；
- Contributor Leaderboard 与 DB 事实一致；
- 第二次 overlap sync 不重复计数；
- Dashboard 展示 Contributor、Repository Activity 和 Freshness；
- 所有跨模块类型来自 `@leadboard/contracts`。
