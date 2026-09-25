# Phase 1 Data Model

数据库：PostgreSQL。

> 数据库保存 **GitHub 原始事实**，统计结果由 Analytics 查询得到。Phase 1 不把排行榜分数写回事实表。

## 1. 原则

1. GitHub stable ID 优先于可变名称；
2. 所有 activity 写入必须可幂等重放；
3. Repository scope 是“当前快照”，历史 activity 是“事实记录”；
4. Repository 退出统计范围后不删除历史数据，只将 `tracked=false`；
5. Bot activity 可以计入仓库活动，但 Bot 不进入人类 Contributor Leaderboard；
6. 无法关联 GitHub 用户的 Commit 仍然属于仓库活动；
7. 所有时间字段使用 `TIMESTAMPTZ`。

## 2. groups

```text
id              BIGSERIAL PK
name            TEXT UNIQUE NOT NULL
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

## 3. repositories

```text
id              BIGSERIAL PK
github_id       BIGINT UNIQUE NOT NULL
node_id         TEXT UNIQUE NOT NULL
owner           TEXT NOT NULL
name            TEXT NOT NULL
full_name       TEXT NOT NULL
default_branch  TEXT NOT NULL
group_id        BIGINT NULL FK -> groups.id
html_url        TEXT NOT NULL
archived        BOOLEAN NOT NULL DEFAULT FALSE
tracked         BOOLEAN NOT NULL DEFAULT TRUE
last_synced_at  TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

规则：

- rename 通过 `github_id` 更新 owner/name/full_name；
- 当前完整 scope 中不存在的历史 tracked repository 标记 `tracked=false`；
- untracked repository 历史事实保留；
- 当前查询默认只聚合 `tracked=true` 的仓库。

建议索引：

```text
INDEX repositories_tracked_idx (tracked)
INDEX repositories_group_id_idx (group_id)
```

## 4. contributors

```text
id              BIGSERIAL PK
github_id       BIGINT UNIQUE
login           TEXT
avatar_url      TEXT
actor_type      TEXT NOT NULL DEFAULT 'Unknown'
is_bot          BOOLEAN NOT NULL DEFAULT FALSE
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

约束建议：

- `github_id` 非空时作为第一身份键；
- `login` 允许 GitHub rename 后更新；
- 对 `github_id IS NULL` 的 fallback actor，可按规范化 login 查找；
- 不强制把 actor unknown 的 Commit 建 contributor。

可选部分唯一索引由 migration 实现时根据 PostgreSQL 语义确定，避免两个 NULL 规则导致错误归并。

## 5. commits

```text
id              BIGSERIAL PK
repository_id   BIGINT NOT NULL FK -> repositories.id
sha             TEXT NOT NULL
contributor_id  BIGINT NULL FK -> contributors.id
authored_at     TIMESTAMPTZ NOT NULL
additions       INTEGER NOT NULL DEFAULT 0
deletions       INTEGER NOT NULL DEFAULT 0
is_merge        BOOLEAN NOT NULL DEFAULT FALSE
html_url        TEXT
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE(repository_id, sha)
```

说明：

- 只保存被 Collector 采集到的默认分支 Commit；
- Phase 1 排行只计 Commit 数，不使用 additions/deletions；
- merge commit 保留真实 `is_merge` 标识；
- additions/deletions 保存 API 返回事实，不用于 Phase 1 total。

建议索引：

```text
INDEX commits_authored_at_idx (authored_at)
INDEX commits_repository_time_idx (repository_id, authored_at)
INDEX commits_contributor_time_idx (contributor_id, authored_at)
```

## 6. pull_requests

```text
id              BIGSERIAL PK
repository_id   BIGINT NOT NULL FK -> repositories.id
github_id       BIGINT NOT NULL
number          INTEGER NOT NULL
contributor_id  BIGINT NULL FK -> contributors.id
state           TEXT NOT NULL
created_at      TIMESTAMPTZ NOT NULL
closed_at       TIMESTAMPTZ
merged_at       TIMESTAMPTZ
html_url        TEXT
ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE(repository_id, github_id)
```

Phase 1 排行按照 **PR created_at** 计入范围。

建议索引：

```text
INDEX prs_created_at_idx (created_at)
INDEX prs_repository_time_idx (repository_id, created_at)
INDEX prs_contributor_time_idx (contributor_id, created_at)
```

## 7. issues

```text
id              BIGSERIAL PK
repository_id   BIGINT NOT NULL FK -> repositories.id
github_id       BIGINT NOT NULL
number          INTEGER NOT NULL
contributor_id  BIGINT NULL FK -> contributors.id
state           TEXT NOT NULL
created_at      TIMESTAMPTZ NOT NULL
closed_at       TIMESTAMPTZ
html_url        TEXT
ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE(repository_id, github_id)
```

规则：

- PR 不得同时写入 issues；
- Phase 1 排行按照 **Issue created_at** 计入范围。

建议索引：

```text
INDEX issues_created_at_idx (created_at)
INDEX issues_repository_time_idx (repository_id, created_at)
INDEX issues_contributor_time_idx (contributor_id, created_at)
```

## 8. sync_runs

```text
id                      BIGSERIAL PK
trigger                  TEXT NOT NULL
range_from               TIMESTAMPTZ NOT NULL
range_to                 TIMESTAMPTZ NOT NULL
started_at               TIMESTAMPTZ NOT NULL
finished_at              TIMESTAMPTZ
status                   TEXT NOT NULL
repositories_ok          INTEGER NOT NULL DEFAULT 0
repositories_failed      INTEGER NOT NULL DEFAULT 0
error_message            TEXT
created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
```

建议 status：

```text
running | success | partial | failed
```

建议 trigger：

```text
scheduled | manual
```

用途：

- 计算最近成功同步；
- 生成下一次增量同步起点；
- 提供 API freshness；
- 记录 partial / failed run。

建议索引：

```text
INDEX sync_runs_status_finished_idx (status, finished_at DESC)
```

## 9. Repository scope 更新事务

一次 Repository Sync 成功后：

1. upsert 本轮 `trackedRepositories`；
2. 为新 group upsert groups；
3. 更新 tracked repo 的 `tracked=true`、group、rename 后名称、`last_synced_at`；
4. 将数据库中上一轮 tracked、但本轮完整快照不包含的 repository 设置为 `tracked=false`；
5. 整体在事务中完成。

Repository Sync 本身若不完整/失败，**不得执行第 4 步**。

## 10. Contributor upsert

```text
actor.githubId != null:
    先按 github_id 查找 / upsert
    login 和 avatar 可以更新

actor.githubId == null && actor.login != null:
    可按规范化 login fallback 查找

actor.login == null:
    不生成 contributor
```

`is_bot`：

- `actor.type == Bot` → true；
- 或 login 匹配常见 `[bot]` → true。

## 11. Phase 1 排行口径

对给定时间范围：

```text
commits = tracked repo 中 authored_at 落在范围内的 commit 数
prs     = tracked repo 中 created_at 落在范围内的 PR 数
issues  = tracked repo 中 created_at 落在范围内的 Issue 数
total   = commits + prs + issues
```

时间窗口为 `[from,to)`。

### Organization / Repository 统计

包含：

- Bot activity；
- 无法归属 contributor 的 Commit。

### Contributor 统计

只包含：

- actor 可识别；
- contributor `is_bot=false`。

## 12. all 的含义

`range=all` = 数据库中已采集的全部事实。

它不表示系统一定回填了仓库在 GitHub 上从创建至今的全部历史。

## 13. 后续兼容

未来加入 Review、外部仓库贡献、加权积分时：

- 新增 fact table / aggregation layer；
- 不修改已有 Commit / PR / Issue 的历史语义；
- 分数由独立 scoring layer 产生，不覆盖原始事实。
