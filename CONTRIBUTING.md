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
