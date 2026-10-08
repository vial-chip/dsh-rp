# Roleplay profiles and conversations

English | [中文](roleplay.zh.md)

The [roleplay package](../../packages/roleplay/roleplay/README.md) owns local character cards, independent portrayals, shared memories and per-conversation scenes. [Public types](../../packages/roleplay/roleplay/src/types.ts) distinguish card identity, profile ownership, message evidence and model operations. The [shared interface](../../packages/client/ui-roleplay/README.md) exposes user edits and history operations on Web and Desktop.

## Ownership and state

`CharacterProfileId`, `CharacterCardVersion`, `RoleplayMemoryId` and `RoleplayOperationId` are branded strings. A `CharacterCard` saves name, description, complete content and resources, opening situation, initial scene and finite metric ranges under its content-addressed version. A profile owns one bound card, a `PlayerPersona` (`name`, `appearance`, `background`), relationship numbers, memories and scenes indexed by Session id. Two profiles using the same card remain independent.

`RoleplayScene` contains AI-only fields and an archival flag. Shared `RoleplayMemory` entries carry a stable key, text, applicability, user-message `evidenceId`, operation attribution and `active`, `invalid` or `review` status. `RoleplaySource` identifies the conversation, reply start sequence, operation id and `model` or `user` actor. `RoleplayConflict` retains source, reason, proposed JSON and resolution status. Relationship indicators have numeric values only; no descriptive rank controls interaction.

`RoleplayState` saves the bound card, player, metrics, memories, scenes and invalidated evidence-key tombstones. `CharacterProfile` publishes its title, current revision, state, complete revision history and conflicts in one atomic storage record. `RoleplayRevision` captures state, conflicts, touched fields, effective relationship deltas and compensation status. Historical reads and branches use those snapshots rather than the current profile state.

## Model requests and corrections

`RoleplayContext` selects current scene, player, bound card, numeric relationships, recent active memories and unresolved conflicts. The scoped runtime records this information in the complete system prompt and suppresses work prompt sections and dynamic runtime contexts. Archived scenes and profiles with pending lifecycle operations cannot supply advancing context.

`RoleplayModelChange` requires `expectedRevision` and accepts optional AI scene updates, metric `deltas` and one evidenced memory. A stale revision retains a conflict and leaves current state intact. A corrected memory cannot be overwritten with different model text. Invalidating a memory removes it from selection and blocks extraction from the same evidence message under the same stable key. The runtime verifies that cited evidence belongs to a user message in the current conversation, including inherited history.

`RoleplayUserChange` accepts absolute in-range relationship values, player and scene edits, memory correction or invalidation, and conflict resolution. These administrative edits do not add player dialogue. The next model request observes accepted changes; earlier logged requests remain reconstructable. Explicit card updates bind the new snapshot and mark active memories for review across the profile's conversations.

## Session history and durable recovery

`RoleplayHistoryPoint` provides the visible user message or assistant reply, its kind and exact event sequence for selecting a branch position. Tool-only assistant messages do not appear in this picker.

The required log-only `roleplay/checkpoint` event records `profileId`, `revision` and `sessionId` before requests, after model updates, after administrative edits or card updates, and at reply completion. The scene identity remains explicit across inherited logs. Builds that do not recognize this event refuse the log; it does not alter the Session envelope format or frozen generations. The [persistence acknowledgement](../persistence-changes/2026-10-07-roleplay-state.md) records compatibility.

`RoleplayLifecyclePlan` is a durable `create`, `archive`, `branch` or `undo` intent with stable operation and conversation identities. Branch intents additionally retain the historical profile, revision, selected event and source scene. Undo intents retain the target reply. Each operation completes idempotent profile mutations, durable Session publication and required workspace archival before deleting its intent. Pending plans prevent competing lifecycle operations and model writes to that profile. Startup replays plans without generating new dialogue.

Branching creates an independent profile from the latest checkpoint at or before the selected event and seeds its conversation from that exact log prefix. The independent profile contains one scene, the historical shared memories and relationship numbers. The source profile and later writes are unaffected. Inherited pending inputs are removed in the child before Agent publication.

Undo applies to the latest completed locally owned reply with no queued input. It compensates that reply's model operations in reverse order: effective metric deltas are subtracted unless a later user assignment supersedes them; later dependent memory or scene edits are retained with conflicts. A replacement conversation receives the preceding log prefix and compensated scene. The original append-only Session is archived. Regenerate explicitly submits the reply's user input once into the replacement. Neither operation edits original log events or removes another conversation's writes.

## Composition and isolation

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [SessionId](core.md)

Source: [`packages/roleplay/roleplay/src/controller.ts`](../../packages/roleplay/roleplay/src/controller.ts)
<!-- END GENERATED cordis-surface -->

The [shipped roleplay patch](../../packages/bundle/web-app/presets/roleplay.patch.yml) registers the fifth native preset, the global data provider and administrative controller. Its runtime contributes only `roleplay_read` and `roleplay_update` in the Agent scope. Roleplay Sessions have no `cwd`, cannot switch into work presets and must be created or forked through the roleplay controller. Normal work Session listings, searches and Session-query tools exclude roleplay content. Character card discovery uses explicit roleplay roots and is not added to the work skill registry.
