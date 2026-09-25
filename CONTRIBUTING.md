# Contributing to LeadBoard

LeadBoard 使用 **Issue → Branch → Pull Request → Review → Merge** 的协作流程。

## 1. 认领任务

1. 打开一个未被认领的 Issue；
2. 阅读目标、输入、输出、依赖和验收标准；
3. 在 Issue 下评论“认领”；
4. 等待 Maintainer Assign 后开始开发。

不要同时认领多个半天级任务。

## 2. 分支

从最新 `main` 创建分支：

```text
feat/<issue-number>-<short-name>
fix/<issue-number>-<short-name>
docs/<issue-number>-<short-name>
```

示例：

```text
feat/7-repository-sync
```

## 3. 接口优先

跨模块开发必须遵守：

- [docs/api-contract.md](docs/api-contract.md)
- [docs/data-model.md](docs/data-model.md)

如果发现接口需要变化，先在对应 Issue 讨论并更新文档，再修改实现。不要让两个模块各自定义一套字段。

## 4. Pull Request

PR 必须包含：

- 解决的问题；
- 主要改动；
- 如何测试；
- 是否修改接口或数据库；
- `Closes #<issue-number>`。

功能代码不要直接 push 到 `main`。

## 5. 最低验收

提交 PR 前至少保证：

- 能安装依赖；
- lint / typecheck / build 通过；
- 新增逻辑有基本测试；
- 没有提交 Token、密码、`.env`；
- README / docs 与行为一致。

## 6. Commit 建议

推荐 Conventional Commits：

```text
feat: ...
fix: ...
docs: ...
test: ...
refactor: ...
chore: ...
```

## 7. Issue 粒度

Phase 1 的开发 Issue 原则上控制在 **2–5 小时**，每个 Issue 只交付一个明确产物。若任务明显超过半天，应先拆分。


## 8. Shared Contracts

任何跨模块字段变化都必须先修改：

1. `docs/api-contract.md`
2. `packages/contracts`
3. 对应 contract test

然后再修改 Backend / Frontend 实现。

PR Review 时，如果发现某个模块重新定义了 `TrackedRepository`、`GitHubActivity`、API response type 等共享结构，应要求改为从 `@leadboard/contracts` 导入。

## 9. Integration Checks

涉及跨模块的 PR，至少说明它通过了哪一个 Integration Gate：

- Contracts
- Database
- Pipeline
- API Contract
- E2E

不要通过“前端临时适配字段”或“Ingestion 临时补 GitHub 数据”来掩盖接口不一致。
