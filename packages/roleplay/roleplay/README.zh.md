---
description: "面向日常角色扮演的独立角色档案、本地技能格式角色卡、共享记忆与会话场景。"
kind: "package-reference"
---

# @deepseek-ai/dsh-roleplay

[English](README.md) | 中文

## 概述

为本地角色卡创建独立的人物档案，与一个主要 AI 角色进行日常共同生活对话。同一档案的会话共享选取的记忆、好感和信任，同时保留各自场景。直接编辑玩家身份、AI 身体状况、服饰、记忆和数值关系。角色卡保持绑定版本，直到明确更新；历史回复与请求保留原有信息。角色模式使用自己的工具和导航，不绑定工作目录，也不能使用工作工具。

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

Web 与 Desktop 的代理预设选择器内置角色模式入口。选择角色卡，创建角色档案，填写虚构的玩家身份，然后开始会话。用同一张卡创建另一档案，会得到独立的记忆和关系。在现有档案中创建新会话，会共享记忆与关系数据，并开始独立场景。

### 角色卡

将角色卡放入部署配置的 `cardRoots`；内置配置使用 DSH 主目录下的 `characters`，并提供名为 `lin` 的示例。每个目录包含标准 `SKILL.md`，带有 `name`、`description` 和 `metadata.roleplay` 对象。角色发现不包含项目与普通用户技能目录。

`metadata.roleplay` 必须包含 `opening`，带有 `time`、`place`、`weather`、`event`、`body`、`clothing`、`emotion` 的 `scene`，以及包含 `affinity`、`trust` 的 `metrics`。每项指标声明有限的 `min`、`max`、`initial`；初始值必须位于递增区间内。可选的 `resources` 列出本地相对文件，其内容纳入保存的角色卡。解析后的文件必须位于角色卡目录内。[示例角色卡](cards/lin/SKILL.md) 可直接作为完整起点。

场景和关系指标名以 ASCII 字母开头，只包含字母、数字、下划线或连字符；对象成员名 `constructor`、`prototype`、`__proto__` 为保留名称。所有配置目录和内置示例中的角色卡名称必须唯一；重名会使发现过程报错。

### 配置

[内置补丁](../../bundle/web-app/presets/roleplay.patch.yml) 挂载数据服务、Host 控制器和带作用域的运行时。运行时只能通过代理预设挂载；通过 `roleplayController` 创建角色 Session，确保 Agent 启动前已有所属档案。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `cardRoots` | 必填 | 除内置示例外，明确指定的角色技能目录 |
| `maxProfileBytes` | `67108864` | 单个档案及保留修订的最大编码字节数 |
| `maxSelectedMemories` | `24` | 每次请求包含的近期有效记忆数量上限 |
| `maxEvidenceMessages` | `24` | 作为记忆证据返回的近期用户消息数量上限 |

运行时需要 Agent、工具、系统提示词、Session 投影和 Session 查询服务。控制器还需要预设注册表、默认模型、工作区注册表及持久化 Session 存储。

### 编辑与历史

共用角色面板可以编辑 AI 场景字段、玩家身份和关系绝对值，无需插入虚构对话。面板展示记忆来源、修订、作废、角色卡版本和冲突。应用当前角色卡版本会影响该档案每个会话的未来请求，并将有效记忆标为待复核。场景字段保留同名值，新增字段使用角色卡初值，删除新版没有的字段；关系值限制在新版范围内。归档会话会保留共享记忆。

继续只在用户明确操作后推进。撤回将最近一次已完成回复替换为包含其先前历史的会话，选择性补偿模型贡献，并归档原 Session。重生成随后只提交一次对应用户输入。其他会话的后续变更和用户编辑保留；依赖这些变更的编辑会成为可见冲突。分支将选定检查点复制到独立档案，仅保留所选会话的场景。分支与重启都不会自行生成回复。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

`roleplay` 存储域原子发布每个档案的状态、修订快照和冲突记录。模型写入必须提供观察到的修订；过时写入将提议保留为冲突。关系操作记录实际生效的限幅增减量。撤销遇到非法的历史更新路径或缺失的关系增减量时，会在发布修订前拒绝执行。用户纠正保护被修改的记忆；作废保留对应证据消息与稳定记忆键的删除标记。

跨服务会话操作先将身份保存为持久化生命周期意图。恢复重复执行幂等档案操作，创建或恢复同一个 Session，刷新其检查点，并完成归档后再移除意图。待完成操作阻止模型更新和上下文选取。启动恢复只完成存储工作，不提交新对话。分支 Session 在发布前清除继承的待处理输入。

| 来源 | 职责 |
|---|---|
| [types.ts](src/types.ts) / [spec.ts](src/spec.ts) | 公共类型与持久化 JSON 校验 |
| [store.ts](src/store.ts) | 原子状态变更、快照、冲突和补偿 |
| [cards.ts](src/cards.ts) | 独立发现、本地资源与内容寻址版本 |
| [runtime.ts](src/runtime.ts) | 带作用域的工具、证据校验及已记录角色上下文 |
| [controller.ts](src/controller.ts) | 管理 Remote 方法与会话恢复 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [角色模式子系统](../../../docs/subsystems/roleplay.zh.md) — 所有权、持久化类型和生命周期行为。
- [共用角色界面](../../client/ui-roleplay/README.zh.md) — 档案导航与用户编辑。
- [代理预设](../../preset/agent-preset-registry/README.zh.md) — 带作用域的组合和已记录预设身份。

<a id="model-experience"></a>
## 模型体验

### 角色系统提示词

#### 模型看到什么

模型收到以下固定指导，随后是绑定角色卡内容与当前档案上下文的 JSON。工作指令与运行时上下文被抑制。场景字段描述 AI 角色；玩家控制自己的行动、言语与内心。完整文本在每次请求时记录。

##### 固定角色指导

```markdown
Portray one primary adult character in everyday shared life. Use brief actions and natural dialogue. You may portray the environment and simple passersby. Never decide the player's actions, speech, or inner feelings. Treat the player persona as fictional identity. Advance only in response to the player's message or explicit continuation. Time does not advance while the player is away.

Use the bound character card and the latest saved roleplay context. Scene fields describe the AI character only. Shared memories and relationship metrics belong to this character profile; scenes belong to this conversation. Automatically maintain useful stable facts, important experiences, promises, and relationship developments through roleplay_update. Query further memories and their user-message evidence through roleplay_read. Every memory must cite an evidenceId returned by roleplay_read; reuse the original evidence when extracting an older fact. Invalidated evidence cannot recreate that memory. User corrections take precedence. Preserve unresolved conflicts and ask the player to resolve them when needed. Read again after a stale revision. Submit meaningful affinity and trust changes as deltas, never absolute values; numeric values do not determine romantic outcomes. Do not mention internal tool activity in character dialogue.
```

#### Token 影响

每次请求包括固定指导、绑定角色卡及资源、当前场景、玩家资料、关系值和选取的记忆。`maxSelectedMemories` 限制选取数量，实际 Token 成本取决于内容长度；先前对话继续占用历史消息 Token。

#### KV Cache 影响

固定指导与绑定角色卡在当前状态之前形成稳定前缀。状态更新或明确应用新卡版本会改变提示词后续内容；不保证提供方缓存复用。

### 角色工具与证据

#### 模型看到什么

仅提供 [角色工具定义](../../../docs/tool-catalog.zh.md#deepseek-aidsh-roleplay)。`roleplay_read` 返回场景、关系、选取的记忆、未解决冲突和近期用户消息证据，查询可搜索有效记忆。`roleplay_update` 接受预期修订、AI 场景字段、指标增减量及带稳定键和本会话 `evidenceId` 的记忆。绝对指标赋值、其他会话证据及已失效证据被拒绝；用户纠正优先，过时写入保留为冲突。

#### Token 影响

两份工具定义固定提供。每次读取或更新增加调用参数与 JSON 结果；`maxEvidenceMessages` 限制证据消息数量，记忆与消息长度决定结果成本。

#### KV Cache 影响

工具定义在该预设内保持稳定。新的工具调用和结果追加到消息历史中；结果数据改变后不保证提供方复用相应缓存。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 角色模式为单玩家、单主要 AI 角色，不模拟离线时间，也不自主继续。档案在 `maxProfileBytes` 内保留完整历史快照；达到上限后拒绝新写入，而不是删除历史。恢复要求来源日志与快照仍可读取。撤回仅适用于没有排队输入的、最近一次由本会话产生的已完成回复；更早或继承的回复可以创建分支。角色卡内容是部署作者提供的可信角色指导，实际对话是否遵守指导仍取决于模型质量。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景 — 点击展开</summary>

[角色模式决策](../../../.agents/notes/implemented/feature/2026-10-07-roleplay-mode.zh.md) 记录所有权与交互选择。

</details>
