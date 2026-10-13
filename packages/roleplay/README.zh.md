---
description: "为会话选择角色扮演、独立状态工具和浏览器面板。"
kind: "package-group"
---

# roleplay/ — 角色扮演

[English](README.md) | 中文

## 概述

选择角色，在多轮互动及重新打开的会话中延续故事。独立于对话读取或编辑已记录的世界、身体、服饰和关系状态。服务保存角色设定和互动撤回记录，工具提供按需状态访问，客户端提供角色选择与面板。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

每个包负责角色扮演体验的一部分。

| 包 | 职责 |
|---|---|
| [`roleplay`](roleplay/README.zh.md) | 固定角色指令、保存状态、撤销与重生成 |
| [`tool-roleplay`](tool-roleplay/README.zh.md) | 八个可独立启停的状态读写工具 |

<a id="related-documentation"></a>
## 相关文档

- [角色扮演子系统](../../docs/subsystems/roleplay.zh.md) — 保存类型与状态语义。
- [角色扮演客户端](../client/ui-roleplay/README.zh.md) — 角色选择、状态书签与互动操作。
- [Web 应用](../bundle/web-app/README.zh.md) — 随发行版交付的角色扮演模式。

<a id="dev-note"></a>
## 开发备注

无。
