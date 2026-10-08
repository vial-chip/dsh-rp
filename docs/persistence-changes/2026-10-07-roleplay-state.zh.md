---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-07-roleplay-state

[English](2026-10-07-roleplay-state.md) | 中文

## 概述

为 Session 日志加入必需的角色档案检查点，并加入独立的角色档案及恢复意图存储。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-07-roleplay-state
baseline: false
changes:
  - root: "event:roleplay/checkpoint"
    previous: null
    after: "026d7018d6f929ad8d650c80ed10c755f938abdd0ca6fa94502cb902aa15e575"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有日志与存储域仍然有效。新增的角色检查点标识不可变的档案修订与会话场景；不认识该事件的构建会拒绝这些日志。已发布的 Session 格式代际保持不变。新增角色存储域从版本零开始，将角色卡定义、用户纠正、记忆证据及选择性补偿历史与工作数据分开保存。

<a id="verification"></a>
## 验证

定向角色与界面覆盖率检查：74 项测试通过，选定源码逐文件的语句、分支、函数与行覆盖率均为 100%。工作区约束：109 项测试通过。包含 Host 与 Client TypeScript 聚合检查的完整构建及仓库 Lint 通过。随附 Web 角色 Session 快照重放与语料验证通过。TypeScript 和 Python SDK 预期输出测试保留必需检查点事件。真实 DeepSeek GUI 流程验证带证据的记忆、管理纠正、刷新持久性，以及独立场景中的共享记忆。

<a id="dev-note"></a>
## 开发备注

无。
