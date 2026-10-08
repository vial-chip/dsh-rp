---
description: "角色卡、独立角色档案、共享记忆与分离会话场景的包导航。"
kind: "package-group"
---

# roleplay/ — 角色会话

[English](README.md) | 中文

## 概述

创建虚构的玩家身份，与主要 AI 角色进行日常共同生活对话。角色档案跨会话共享选取的记忆和数值关系，同时分别保存场景状态。本地角色卡绑定不可变版本，用户编辑优先于模型更新。工作工具、工作指令与普通任务导航保持分离。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发说明](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | Context 服务 |
|---|---|---|
| [roleplay/](roleplay/README.zh.md) | 角色发现、持久化档案、带作用域工具和会话操作 | `roleplay`、`roleplayController` |

<a id="related-documentation"></a>
## 相关文档

- [角色模式子系统](../../docs/subsystems/roleplay.zh.md) — 所有权、持久化类型与历史操作。
- [角色界面](../client/ui-roleplay/README.zh.md) — Web 与 Desktop 共用入口和编辑。

<a id="dev-note"></a>
## 开发说明

<details>
<summary>维护者工作背景 — 点击展开</summary>

无。

</details>
