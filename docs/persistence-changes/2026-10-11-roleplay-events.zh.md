---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-11-roleplay-events

[English](2026-10-11-roleplay-events.md) | 中文

## 概述

新增角色选择、固定角色卡、保存状态与撤回四种必读、仅记日志的角色扮演事件，以及用于空历史替换的 roleplay-withdrawal 消息来源。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-11-roleplay-events
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "a1c63b9741545bada2636fb8f329e6a650df23347e96127047c2c86282cbde52"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "9568178365a53165ff0f6e5bfd26336143c6297cb8f020388441a284a9c649ee"
    decision: same-version
  - root: "event:roleplay/card"
    previous: null
    after: "771178f06eea7b32c5de3b1759177a1af17e38a04024219bfeb83a37a5faae06"
    decision: same-version
  - root: "event:roleplay/card-selection"
    previous: null
    after: "e60946fe455199117d7f675cca19c58efa918a4e2bdf6946113049b655da484d"
    decision: same-version
  - root: "event:roleplay/retract"
    previous: null
    after: "417f046451a9ed9f307f134607bd12d7765f8c4ab0313993d740bf950a077789"
    decision: same-version
  - root: "event:roleplay/state"
    previous: null
    after: "6ebc4296b1d26a7b123c03b11e964a9bd7d08b2b60b472df103a1d56a8ab303c"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "ac1cae35cfd6059cd5d7df2197321c3512f831594f054d4372b36417ea04b2e1"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "62f7d3110a6e9b913be5909594349bb6df0003fa1cb69f201d6f53932f9be441"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有会话仍然有效，也不要求存在角色扮演状态。四种新事件为必读事件，因为重新打开时必须重建固定角色、已保存面板及撤回的互动。新消息来源标识空用户消息替换，用于从有效历史中移除已撤回互动的节点。不包含这些声明的读取方拒绝不认识的必读事件或来源。已有事件载荷与 Session 头部均不改变。

<a id="verification"></a>
## 验证

node node_modules/vitest/vitest.mjs run packages/roleplay/roleplay/tests/fold.spec.ts packages/roleplay/roleplay/tests/recovery-integrity.spec.ts packages/roleplay/roleplay/tests/durable-withdrawal.spec.ts：6 个测试通过，覆盖真实 AgentLoop 撤销与重生成、JSONL 刷新、读取与重开、字段回退及恢复幂等性。DeepSeek 空用户消息序列化：3 个定点测试通过。

<a id="dev-note"></a>
## 开发备注

无。
