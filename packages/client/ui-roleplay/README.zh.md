---
description: "Web 与 Desktop 共用的角色档案导航、状态编辑及角色历史操作。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-roleplay

[English](README.md) | 中文

## 概述

从角色模式入口选择本地角色卡，创建独立档案并打开所属会话。在角色面板编辑 AI 场景字段、玩家身份、数值好感与信任，以及共享记忆。查看记忆来源和修订，作废记忆，解决冲突，或明确应用更新后的角色卡。Web 与 Desktop 使用同一界面继续、归档、分支、撤回及重生成。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Web 应用组合在 Web 和 Desktop 中挂载本包。在代理预设选择器选择角色模式以打开档案中心。根据角色卡与虚构玩家身份创建档案，再开始或重新打开所属会话。会话标题栏打开档案中心；右侧栏的角色标签提供当前会话编辑器。角色会话不出现在普通工作导航中。

表单通过权威 `roleplay` Remote 命名空间保存。场景控件仅描述 AI 角色；玩家外貌属于独立的虚构身份。关系值只显示数字，不提供描述性等级。记忆条目展示有效性、来源操作和历史修订。明确应用更新的角色卡后，需要复核已有记忆。

档案中心按档案分组会话，并提供归档与恢复。继续在用户明确操作后推进当前场景。撤回打开替代会话并归档原会话；重生成只提交一次对应输入。在历史中选择用户消息或角色回复，创建该检查点上的独立档案。错误留在相关表单旁，加载期间控件防止重复提交。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[客户端入口](src/client/index.ts) 通过 Slots 生命周期注册应用覆盖层、会话标题栏动作和右侧栏标签。不依赖 React 的 [RoleplayClient](src/client/model.ts) 拥有角色卡与档案快照，发布已接受的修改，并防止较早的读取覆盖较新的纠正。渲染器将其稳定数据源绑定为 `useRoleplayData`；[RoleplayHub](src/client/RoleplayHub.tsx) 与 [RoleplayPanel](src/client/RoleplayPanel.tsx) 接收快照和管理回调。类型化英文与中文字典拥有界面文案；已有 Modal、Input、Button 与侧栏基元提供控件。异步读取在卸载或切换选择后忽略过时结果。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [角色模式包](../../roleplay/roleplay/README.zh.md) — 角色卡、配置和权威变更。
- [角色模式子系统](../../../docs/subsystems/roleplay.zh.md) — 持久化所有权与历史行为。
- [共用 UI 基元](../ui-primitives/README.zh.md) — 控件和无障碍。

<a id="model-experience"></a>
## 模型体验

### 管理编辑与明确输入

#### 模型看到什么

界面通过 `roleplay` Remote 提交管理编辑，不加入虚构玩家对话。接受的变更进入下一次已记录角色模型请求。新会话、用户消息、继续和重生成是能够推进场景的明确输入。打开档案中心、查看状态、归档和分支不请求模型回复。

#### Token 影响

界面自身不添加提示词或工具结果。保存的字段与记忆由角色运行时纳入下一次请求，文本长度决定其 Token 成本；仅查看或编辑表单不消耗模型 Token。

#### KV Cache 影响

管理编辑可改变下一次请求中的角色上下文。缓存复用取决于角色运行时构造的请求与模型提供方；本包不控制缓存。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 本包需要 Host 角色控制器，以及共用工作区、语言、渲染器、Remote 和侧栏服务。历史分支选择可见的用户消息或角色回复。各打开面板在自己的写入、明确刷新与会话活动后刷新快照；另一个面板的管理变更可能需要刷新。模型执行和补偿遵循权威服务的限制。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景 — 点击展开</summary>

无。

</details>
