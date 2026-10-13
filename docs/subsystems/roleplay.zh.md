# 角色扮演

[English](roleplay.md) | 中文

[角色扮演服务](../../packages/roleplay/roleplay/README.zh.md)拥有单会话角色卡、状态及互动撤回类型。[状态工具](../../packages/roleplay/tool-roleplay/README.zh.md)和[客户端](../../packages/client/ui-roleplay/README.zh.md)消费同一份已保存投影。

## 保存的数据

世界、身体和服饰保存文字字段；关系保存有限数值。固定角色卡与选择均属于会话。`retractedTurns` 标记已从有效历史撤回的互动；撤销结果只携带恢复到输入框的文字。

### `RoleplayCategory`

```ts type-equiv
/** Independently readable and writable state categories. */
type RoleplayCategory = 'world' | 'body' | 'clothing' | 'relationship'
```

### `RoleplayCardSummary`

```ts type-equiv
/** A discoverable character skill. */
interface RoleplayCardSummary {
  readonly name: string
  readonly description: string
}
```

### `RoleplayCard`

```ts type-equiv
/** Character instructions frozen at the first admitted interaction. */
interface RoleplayCard extends RoleplayCardSummary {
  readonly content: string
}
```

### `RoleplayState`

```ts type-equiv
/** Saved panel data; reading this value never adds model context. */
interface RoleplayState {
  readonly card: RoleplayCard | null
  readonly selection: string | null
  readonly world: Readonly<Record<string, string>>
  readonly body: Readonly<Record<string, string>>
  readonly clothing: Readonly<Record<string, string>>
  readonly relationship: Readonly<Record<string, number>>
  readonly retractedTurns: readonly number[]
}
```

### `RoleplayStateChange`

```ts type-equiv
/** Whole post-change category values and fields changed by this operation. */
interface RoleplayStateChange {
  readonly category: RoleplayCategory
  readonly values: Readonly<Record<string, string | number>>
  readonly fields: readonly string[]
  readonly source: 'human' | 'model'
  readonly turn: number | null
}
```

### `RoleplayUndoResult`

```ts type-equiv
/** Result returned to the composer after undo. */
interface RoleplayUndoResult {
  readonly input: string | null
}
```

## 持久事件

四个必读、仅记日志的事件保存角色选择、固定角色卡、整类状态修改和完整撤回状态。状态修改记录受影响字段、人工或模型来源及所属轮次。回退按字段恢复模型写入并保留后续人工替换值。生成的[持久化目录](../persistence-catalog.zh.md)拥有精确事件定义。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxroleplay--roleplayservice"></a>

### `ctx.roleplay` — `RoleplayService`

Durable roleplay state and idle-only interaction operations.

```ts cordis-catalog
/**
 * Read saved state without opening a model request.
 * @param session - live or detached session.
 * @returns saved state, or null for another mode.
 */
stateOf(session: Session): RoleplayState | null

/**
 * Read the panel for a live session.
 * @param agent - owning live agent.
 * @returns saved panel or null for another mode.
 */
@Remote('get') get(agent: Agent): RoleplayState | null

/**
 * Read the selected character instructions without freezing the card or adding events.
 * @param agent - viewing live roleplay agent.
 * @returns frozen instructions, or the currently available selected card before first send.
 */
@Remote('previewCard') async previewCard(agent: Agent): Promise<RoleplayCard>

/**
 * List the bundled card and skills whose names begin with roleplay-.
 * @param agent - viewing live agent.
 * @returns available character summaries with the bundled card first.
 */
@Remote('listCards') async listCards(agent: Agent): Promise<RoleplayCardSummary[]>

/**
 * Select a character before the first admitted interaction.
 * @param agent - owning live agent.
 * @param name - character skill name.
 */
@Remote('selectCard') async selectCard(agent: Agent, name: string): Promise<void>

/**
 * Read only requested saved fields for a model tool.
 * @param agent - owning live agent.
 * @param category - category to read.
 * @param fields - selected fields; omitted selects all saved fields.
 * @returns detached selected values without host bookkeeping.
 */
read(agent: Agent, category: RoleplayCategory, fields?: readonly string[]): Record<string, string | number>

/**
 * Save model changes; relationship numbers are increments.
 * @param agent - owning live agent.
 * @param category - category to update.
 * @param patch - replacement text or relationship increments.
 */
update(agent: Agent, category: RoleplayCategory, patch: Readonly<Record<string, string | number>>): void

/**
 * Save human replacements without adding messages or waking the agent.
 * @param agent - owning live agent.
 * @param category - category to edit.
 * @param patch - direct replacement values, including relationship numbers.
 */
@Remote('edit') edit(agent: Agent, category: RoleplayCategory, patch: Readonly<Record<string, string | number>>): void

/**
 * Withdraw the latest completed interaction while idle.
 * @param agent - owning live agent.
 * @returns original user input for the composer, when present.
 */
@Remote('undo') async undo(agent: Agent): Promise<RoleplayUndoResult>

/**
 * Withdraw the latest interaction and enqueue the same input again.
 * @param agent - owning live agent.
 * @throws before withdrawal when the interaction has no original input message.
 */
@Remote('regenerate') async regenerate(agent: Agent): Promise<void>
```

Types: [Agent](core.zh.md) · [Session](session.zh.md)

Source: [`packages/roleplay/roleplay/src/index.ts`](../../packages/roleplay/roleplay/src/index.ts)
<!-- END GENERATED cordis-surface -->
