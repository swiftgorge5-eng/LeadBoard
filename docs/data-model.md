# Phase 1 Data Model

数据库：PostgreSQL。

原则：

1. GitHub 原始事实与排行榜统计分离；
2. GitHub 稳定 ID 优先于名称；
3. 所有写入可幂等重放；
4. Bot 活动可以计入仓库活动，但 Bot 不进入人类贡献者排行榜。

## Tables

### groups

```text
id              BIGSERIAL PK
name            TEXT UNIQUE NOT NULL
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

### repositories

```text
id              BIGSERIAL PK
github_id       BIGINT UNIQUE NOT NULL
node_id         TEXT UNIQUE NOT NULL
owner           TEXT NOT NULL
name            TEXT NOT NULL
full_name       TEXT NOT NULL
default_branch  TEXT NOT NULL
group_id        BIGINT FK -> groups.id
html_url        TEXT NOT NULL
archived        BOOLEAN NOT NULL DEFAULT FALSE
tracked         BOOLEAN NOT NULL DEFAULT TRUE
last_synced_at  TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

仓库重命名时通过 `github_id` 更新 `full_name`，不创建新仓库记录。

### contributors

```text
id              BIGSERIAL PK
github_id       BIGINT UNIQUE
login           TEXT UNIQUE
avatar_url      TEXT
is_bot          BOOLEAN NOT NULL DEFAULT FALSE
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

无法关联 GitHub 用户的 Commit 不强制生成 contributor。

### commits

```text
id              BIGSERIAL PK
repository_id   BIGINT FK -> repositories.id
sha             TEXT NOT NULL
contributor_id  BIGINT NULL FK -> contributors.id
authored_at     TIMESTAMPTZ NOT NULL
additions       INTEGER NOT NULL DEFAULT 0
deletions       INTEGER NOT NULL DEFAULT 0
is_merge        BOOLEAN NOT NULL DEFAULT FALSE
html_url        TEXT
UNIQUE(repository_id, sha)
```

### pull_requests

```text
id              BIGSERIAL PK
repository_id   BIGINT FK
github_id       BIGINT NOT NULL
number          INTEGER NOT NULL
contributor_id  BIGINT NULL FK
state           TEXT NOT NULL
created_at      TIMESTAMPTZ NOT NULL
closed_at       TIMESTAMPTZ
merged_at       TIMESTAMPTZ
html_url        TEXT
UNIQUE(repository_id, github_id)
```

Phase 1 的 PR 指标按 **PR 创建时间** 计入时间范围。

### issues

```text
id              BIGSERIAL PK
repository_id   BIGINT FK
github_id       BIGINT NOT NULL
number          INTEGER NOT NULL
contributor_id  BIGINT NULL FK
state           TEXT NOT NULL
created_at      TIMESTAMPTZ NOT NULL
closed_at       TIMESTAMPTZ
html_url        TEXT
UNIQUE(repository_id, github_id)
```

Pull Request 不重复写入 issues 表。

### sync_runs

```text
id              BIGSERIAL PK
started_at      TIMESTAMPTZ NOT NULL
finished_at     TIMESTAMPTZ
status          TEXT NOT NULL
repositories_ok INTEGER NOT NULL DEFAULT 0
repositories_failed INTEGER NOT NULL DEFAULT 0
error_message   TEXT
```

## 排行榜口径

Phase 1 不使用加权积分。

对一个人和一个时间范围：

```text
commits = 默认分支中 authored_at 落在范围内的 commit 数
prs     = created_at 落在范围内的 PR 数
issues  = created_at 落在范围内的 Issue 数
total   = commits + prs + issues
```

`is_bot=true` 的 contributor 不进入 contributor leaderboard。

## 后续兼容

未来如加入 Review、外部仓库贡献或加权积分，应新增事实表/聚合逻辑，不修改历史 commit / PR / issue 原始事实。
