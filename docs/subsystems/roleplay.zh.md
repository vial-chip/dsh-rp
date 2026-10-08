# 角色档案与会话

[English](roleplay.md) | 中文

[角色模式包](../../packages/roleplay/roleplay/README.zh.md) 负责本地角色卡、独立人物档案、共享记忆和各会话场景。[公共类型](../../packages/roleplay/roleplay/src/types.ts) 区分角色卡身份、档案所有权、消息证据与模型操作。[共用界面](../../packages/client/ui-roleplay/README.zh.md) 在 Web 与 Desktop 上提供用户编辑和历史操作。

## 所有权与状态

`CharacterProfileId`、`CharacterCardVersion`、`RoleplayMemoryId`、`RoleplayOperationId` 是品牌化字符串。`CharacterCard` 按内容寻址版本保存名称、描述、完整正文与资源、开场情境、初始场景及有限指标区间。档案拥有一张绑定角色卡、一个 `PlayerPersona`（`name`、`appearance`、`background`）、关系数值、记忆及按 Session id 索引的场景。使用同一角色卡的两个档案相互独立。

`RoleplayScene` 包含仅描述 AI 的字段和归档标记。共享 `RoleplayMemory` 条目带有稳定键、文本、适用范围、用户消息 `evidenceId`、操作归属，以及 `active`、`invalid`、`review` 状态。`RoleplaySource` 标识会话、回复起始序号、操作 id 和 `model` 或 `user` 行为者。`RoleplayConflict` 保留来源、原因、提议 JSON 与解决状态。关系指标只显示数值，不使用描述性等级控制互动。

`RoleplayState` 保存绑定角色卡、玩家、指标、记忆、场景及作废的证据键删除标记。`CharacterProfile` 在单个原子存储记录中发布标题、当前修订、状态、完整修订历史及冲突。`RoleplayRevision` 捕获状态、冲突、涉及字段、实际关系增减量和补偿状态。历史读取与分支使用这些快照，不读取当前档案状态。

## 模型请求与纠正

`RoleplayContext` 选取当前场景、玩家、绑定角色卡、数值关系、近期有效记忆和未解决冲突。带作用域运行时将其记录到完整系统提示词，抑制工作提示词段落与动态运行时上下文。归档场景和存在待完成生命周期操作的档案不能提供用于推进的上下文。

`RoleplayModelChange` 必须提供 `expectedRevision`，可选 AI 场景更新、指标 `deltas` 和一条有证据的记忆。过时修订保留冲突，当前状态保持不变。模型不能用不同文本覆盖已纠正记忆。作废移除后续记忆选取，并阻止以相同稳定键从同一证据消息提取。运行时验证所引用证据是当前会话中的用户消息，包括继承历史。

`RoleplayUserChange` 接受区间内的关系绝对值、玩家和场景编辑、记忆纠正或作废及冲突解决。这些管理编辑不会加入玩家对话。下一次模型请求观察已接受变更；先前记录的请求仍可重建。明确更新角色卡后绑定新快照，并在该档案的全部会话中将有效记忆标为待复核。

## Session 历史与持久化恢复

`RoleplayHistoryPoint` 提供可见用户消息或助手回复、其类别及准确事件序号，用于选择分支位置。仅含工具调用的助手消息不出现在此选择器中。

必需的、仅日志事件 `roleplay/checkpoint` 在请求前、模型更新后与回复结束时记录 `profileId`、`revision`、`sessionId`。继承日志仍明确保留场景身份。不认识该事件的构建会拒绝日志；该事件不改变 Session 信封格式或冻结代际。[持久化确认](../persistence-changes/2026-10-07-roleplay-state.zh.md) 记录兼容性。

`RoleplayLifecyclePlan` 是带有稳定操作和会话身份的持久化 `create`、`archive`、`branch` 或 `undo` 意图。分支意图还保留历史档案、修订、选定事件与来源场景。撤回意图保留目标回复。每项操作完成幂等档案变更、持久化 Session 发布和必要工作区归档后，才删除意图。待完成意图阻止该档案的竞争生命周期操作和模型写入。启动重放意图，不生成新对话。

分支从选定事件之前或该事件上的最新检查点创建独立档案，并按精确日志前缀创建会话。独立档案包含一个场景、历史共享记忆与关系数值。来源档案与后续写入不受影响。子 Agent 发布前移除继承的待处理输入。

撤回适用于没有排队输入的、最近一次由本会话产生的已完成回复。按逆序补偿该回复的模型操作：除非后来用户赋值取代，实际指标增减量被扣除；依赖后续编辑的记忆和场景保留，并记录冲突。替代会话获得先前日志前缀和补偿后的场景。原始追加式 Session 被归档。重生成明确向替代会话提交一次该回复的用户输入。两项操作都不修改原始日志事件，也不移除其他会话的写入。

## 组合与隔离

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxroleplay--roleplay"></a>

### `ctx.roleplay` — `Roleplay`

Character profiles persist independently of workspaces and session logs.

Source: [`packages/roleplay/roleplay/src/index.ts`](../../packages/roleplay/roleplay/src/index.ts)

<a id="ctxroleplaycontroller--roleplaycontroller"></a>

### `ctx.roleplayController` — `RoleplayController`

Roleplay-only administrative Remote namespace.

```ts cordis-catalog
/**
 * Discover roleplay cards only.
 * @returns Current local card snapshots.
 */
@Remote('cards') cards(): Promise<CharacterCard[]>

/**
 * List independent portrayals and their conversations.
 * @returns Detached durable records.
 */
@Remote('profiles') profiles(): CharacterProfile[]

/**
 * Read all saved state, memory sources, conflicts and revisions.
 * @param id Profile identity.
 * @returns Detached record.
 */
@Remote('read') read(id: CharacterProfileId): CharacterProfile

/** List visible historical messages for selecting a branch.
 * @param id Profile identity.
 * @param sessionId Owned conversation.
 * @returns Message previews with exact log positions.
 */
@Remote('history') async history(id: CharacterProfileId, sessionId: SessionId): Promise<RoleplayHistoryPoint[]>

/**
 * Create an independent portrayal bound to the current file version.
 * @param cardName Local skill name.
 * @param player Player's fictional identity.
 * @param title Profile title.
 * @returns Durable profile.
 */
@Remote('createProfile') async createProfile(cardName: string, player: PlayerPersona, title: string): Promise<CharacterProfile>

/**
 * Start an independent scene in an existing portrayal.
 * @param id Profile identity.
 * @param opening Optional player-authored situation.
 * @returns Published conversation identity.
 */
@Remote('createConversation') async createConversation(id: CharacterProfileId, opening?: string): Promise<SessionId>

/**
 * Apply administrative values without adding fictional dialogue.
 * @param id Profile identity.
 * @param sessionId Owned conversation.
 * @param change User corrections.
 * @returns Durable profile.
 */
@Remote('edit') async edit(id: CharacterProfileId, sessionId: SessionId, change: RoleplayUserChange): Promise<CharacterProfile>

/**
 * Explicitly update this portrayal's bound card version.
 * @param id Profile identity.
 * @param sessionId Owned conversation.
 * @returns Profile with active memories awaiting review.
 */
@Remote('applyCard') async applyCard(id: CharacterProfileId, sessionId: SessionId): Promise<CharacterProfile>

/**
 * Advance only after an explicit user continuation.
 * @param id Profile identity.
 * @param sessionId Owned conversation.
 * @returns Accepted conversation identity.
 */
@Remote('continue') async continueConversation(id: CharacterProfileId, sessionId: SessionId): Promise<SessionId>

/**
 * Archive without deleting shared memories.
 * @param id Profile identity.
 * @param sessionId Conversation identity.
 * @param archived Desired marker.
 * @returns Committed profile.
 */
@Remote('archive') async archive(id: CharacterProfileId, sessionId: SessionId, archived: boolean): Promise<CharacterProfile>

/**
 * Branch an exact log node into an independent portrayal.
 * @param id Source profile.
 * @param sessionId Source conversation.
 * @param atSeq Selected event.
 * @returns New portrayal and conversation.
 */
@Remote('branch') async branch(id: CharacterProfileId, sessionId: SessionId, atSeq: number): Promise<{ profileId: CharacterProfileId sessionId: SessionId }>

/**
 * Replace the latest completed reply after selective data compensation. The original append-only Session remains archived.
 * @param id Profile identity.
 * @param sessionId Source conversation.
 * @param regenerate Whether to replay its user input.
 * @returns Replacement conversation in the same portrayal.
 */
@Remote('undo') async undo(id: CharacterProfileId, sessionId: SessionId, regenerate: boolean): Promise<SessionId>
```

Types: [SessionId](core.zh.md)

Source: [`packages/roleplay/roleplay/src/controller.ts`](../../packages/roleplay/roleplay/src/controller.ts)
<!-- END GENERATED cordis-surface -->

[内置角色补丁](../../packages/bundle/web-app/presets/roleplay.patch.yml) 注册第五种原生预设、全局数据提供者及管理控制器。运行时仅在 Agent 作用域贡献 `roleplay_read` 与 `roleplay_update`。角色 Session 没有 `cwd`，不能切换成工作预设，必须通过角色控制器创建或分支。普通工作 Session 列表、搜索与 Session 查询工具排除角色内容。角色卡发现使用明确的角色目录，不加入工作技能注册表。
