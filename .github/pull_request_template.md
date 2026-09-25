## 关联 Issue

Closes #

## 本 PR 实现的接口

<!-- 必须与关联 Issue 顶部“本 Issue 必须实现的接口”一致。列出函数 / 类型 / HTTP Endpoint / 页面。 -->

-

## 本 PR 使用的接口

<!-- 列出实际消费的上游接口，以及来自哪个 Issue / @leadboard/contracts。 -->

-

## 改动内容

-

## 接口 / 数据库变化

- [ ] 无共享接口变化
- [ ] 修改了 shared contract，已同步更新 docs/api-contract.md + @leadboard/contracts + tests
- [ ] 修改了数据库，已同步更新 migration + docs/data-model.md + db:verify
- [ ] 不适用，并已在下方说明

说明：

## 验收证据

<!-- 写实际执行结果，不要只写“已测试”。示例：npm test PASS (42 tests) -->

```text
npm ci
npm run typecheck
npm test
npm run build
```

Issue 专项验收证据：

-

## 验证

- [ ] CI 中适用的自动 Gate 已通过
- [ ] 新增/修改逻辑有测试覆盖
- [ ] 已验证 Issue 中的边界条件
- [ ] 没有提交 Token、密码、真实 .env
- [ ] 日志 / 错误不会泄露 GitHub Token
- [ ] 如果是 UI 改动，已提供截图/录屏或说明不适用

## Integration Gate

本 PR 涉及：

- [ ] Contracts
- [ ] Database
- [ ] Integration
- [ ] Pipeline
- [ ] API Contract
- [ ] Frontend
- [ ] E2E
- [ ] 仅文档 / 无运行时影响

## 风险与回滚

<!-- 数据迁移、接口兼容、外部 API、并发等风险。无则写“无”。 -->

-

## Reviewer Checklist

- [ ] 实现接口与 Issue 顶部一致
- [ ] 使用接口与 Issue 顶部一致
- [ ] 没有越层访问或重复业务口径
- [ ] Contract / DB 变化已同步文档与测试
- [ ] Acceptance Criteria 已满足
- [ ] Review threads 已处理
