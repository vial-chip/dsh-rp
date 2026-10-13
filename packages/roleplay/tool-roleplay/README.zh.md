---
description: "组合八个可独立启停的中文角色扮演状态工具，并检查其精简的模型结果。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-roleplay

[English](README.md) | 中文

## 概述

模型可读取和更新当前角色扮演会话的世界、身体、服饰及关系状态。每个读取工具和更新工具都可独立启停。读取只返回所选字段；更新只返回简短中文确认。关系更新使用数值增减量。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在应用级插件列表中，将所需子路径与 `@deepseek-ai/dsh-roleplay`、`@deepseek-ai/dsh-tools` 及 agent 注册表共同挂载。入口仅向角色扮演会话注册工具，普通模式不增加工具 schema。包根导出各入口命名空间，不激活工具。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-tool-roleplay/world-read'
- name: '@deepseek-ai/dsh-tool-roleplay/world-update'
```

其余子路径将 `world` 替换为 `body`、`clothing` 或 `relationship`。每个入口均提供中文显示元数据，没有配置字段。在角色卡书签的“工具”区域独立启停各项；开关通过原生插件管理保存应用级配置并重载对应插件。八个入口默认全部开启。

### 状态操作

工具名称遵循 `roleplay_<category>_read` 和 `roleplay_<category>_update`。读取接受可选的 `fields: string[]`；省略时返回本类全部已记录状态，空数组返回 `{}`，未记录的字段不返回。文本状态更新接受 `changes: [{ field, value }]`，值为字符串。关系更新接受 `changes: [{ field, delta }]`，使用有限数值增减量，未记录指标从零开始。空更新列表和重复字段名均失败且不写入。每个更新只返回 `已更新世界。`、`已更新身体。`、`已更新服饰。` 或 `已更新关系。`。

所有调用都需要所属的代理会话。角色扮演服务负责字段验证、可配置的状态大小限制、持久写入和回退。更新某类状态时保留其他字段。这些工具不添加提示词指令，也不在人工编辑后请求模型回复。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部说明 — 点击展开</summary>

每个子路径导出具名 Cordis 函数插件。共享注册辅助函数定义类型化参数和纯函数通用卡片展示。工具注册归属所在插件，因此销毁一个入口只移除其对应工具。调用卡片显示中文类别标签和传入参数；完成卡片使用持久化结果内容，不读取当前状态。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [角色扮演服务](../roleplay/README.zh.md) — 状态归属与持久化。
- [工具编写](../../../docs/cookbook/adding-a-tool.zh.md) — 参数、执行和展示。
- [测试策略](../../../docs/testing.zh.md) — 组合测试与录制会话证据。

-----

<a id="model-experience"></a>
## Model Experience

### 工具定义和结果

#### What the model sees

启用的工具提供中文描述和参数说明。读取结果以精简 JSON 返回所选类别字段；更新结果只包含上述中文确认。工具参数与结果不包含会话标识、操作标识或修订检查。生成的[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-roleplay)负责完整参数定义。

#### Token effect

启用的工具定义贡献固定请求 token。读取仅将所选已记录状态追加到工具结果。更新只追加简短确认，不回显存量状态。普通对话在模型未调用工具时不会通过这些工具引入状态。

#### KV Cache effect

状态变化保持工具定义和顺序稳定。调用将结果追加到历史。明确修改插件配置可能改变工具定义前缀。供应商缓存可用性和淘汰策略不属于本包保证。

## Known Limitations and Deferred Work

这些工具仅提供当前会话的四类状态。

- 模型不可删除字段或直接设定关系绝对值；人工编辑由角色扮演服务及其客户端负责。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
