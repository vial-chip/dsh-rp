---
description: "Independent character profiles, local skill-format character cards, shared memories and conversation scenes for everyday roleplay."
kind: "package-reference"
---

# @deepseek-ai/dsh-roleplay

English | [中文](README.zh.md)

## Summary

Create independent portrayals of a local character card and talk with one primary AI character about everyday shared life. Conversations in one profile share selected memories, affinity and trust while retaining separate scenes. Edit the player persona, AI condition, clothing, memories and numeric relationships directly. Character cards stay at their bound versions until explicitly updated; historical replies and requests retain their original information. Roleplay has its own tools and navigation, without a work directory or access to work tools.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Web and Desktop ship a Roleplay entry in the agent-preset picker. Select a card, create a character profile, fill in your fictional player identity, then start a conversation. Reusing a card for another profile creates independent memories and relationships. A new conversation in an existing profile shares its memory and relationship data and starts a separate scene.

### Character cards

Put cards under the deployment's `cardRoots`; the shipped profile uses the DSH home `characters` directory and includes an example named `lin`. Each directory contains a standard `SKILL.md` with `name`, `description` and a `metadata.roleplay` object. Roleplay discovery excludes project and ordinary user skill roots.

`metadata.roleplay` requires an `opening`, a `scene` with `time`, `place`, `weather`, `event`, `body`, `clothing` and `emotion`, and `metrics` containing `affinity` and `trust`. Every metric declares finite `min`, `max` and `initial` values; the initial value must fall within an increasing range. Optional `resources` lists local relative files whose contents become part of the saved card. Resolved files must remain inside the card directory. The [example card](cards/lin/SKILL.md) is a complete starting point.

Scene and metric names start with an ASCII letter and contain letters, digits, underscores or hyphens; object member names `constructor`, `prototype` and `__proto__` are reserved. Card names must be unique across all configured roots and the bundled examples; duplicate names stop discovery with an error.

### Configuration

The [shipped patch](../../bundle/web-app/presets/roleplay.patch.yml) mounts the data service, Host controller and scoped runtime. Mount the runtime only through an agent preset; create roleplay Sessions through `roleplayController` so ownership exists before the Agent starts.

| Field | Default | Meaning |
|---|---|---|
| `cardRoots` | required | Explicit roleplay skill directories, in addition to the bundled example |
| `maxProfileBytes` | `67108864` | Maximum encoded bytes for one profile including retained revisions |
| `maxSelectedMemories` | `24` | Maximum recent active memories included in each request |
| `maxEvidenceMessages` | `24` | Maximum recent user messages returned as memory evidence |

The runtime requires Agent, tools, system-prompt, session-projection and session-query services. The controller also needs the preset registry, default model, workspace registry and durable Session persistence.

### Editing and history

The shared character panel edits AI scene fields, player identity and absolute relationship values without inserting fictional dialogue. It displays memory sources, revisions, invalidation, card versions and conflicts. Applying the current card version affects future requests in every conversation of that profile and marks active memories for review. Scene fields retain matching values, initialize new fields from the card and remove fields absent from the new version; relationship values are clamped to its ranges. Archiving a conversation retains shared memories.

Continue advances only after an explicit user action. Undo replaces the latest completed reply with a conversation containing its preceding history, selectively compensates its model contributions and archives the original Session. Regenerate then submits its user input once. Later changes from other conversations and user edits survive; dependent edits become visible conflicts. Branching copies the selected checkpoint into an independent profile and preserves only the selected conversation's scene. Neither branching nor restart generates a reply by itself.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The `roleplay` storage domain publishes each profile's state, revision snapshots and conflict records atomically. Model writes require the observed revision; stale writes retain proposals as conflicts. Relationship operations record their effective bounded deltas. Undo rejects invalid retained update paths or missing metric deltas before publishing a revision. User corrections protect the corrected memory, and invalidation retains a tombstone for its evidence message and stable memory key.

Cross-service conversation operations first save their identities in a durable lifecycle intent. Recovery repeats idempotent profile operations, creates or resumes the same Session, flushes its checkpoint and completes archival before removing the intent. Pending operations block model updates and context selection. Startup recovery completes storage work without submitting new dialogue. Forked Sessions clear inherited pending input before publication.

| Source | Responsibility |
|---|---|
| [types.ts](src/types.ts) / [spec.ts](src/spec.ts) | Public types and durable JSON validation |
| [store.ts](src/store.ts) | Atomic state changes, snapshots, conflicts and compensation |
| [cards.ts](src/cards.ts) | Isolated discovery, local resources and content-addressed versions |
| [runtime.ts](src/runtime.ts) | Scoped tools, evidence checks and logged character context |
| [controller.ts](src/controller.ts) | Administrative Remote methods and conversation recovery |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Roleplay subsystem](../../../docs/subsystems/roleplay.md) — ownership, durable types and lifecycle behavior.
- [Shared character interface](../../client/ui-roleplay/README.md) — profile navigation and user editing.
- [Agent presets](../../preset/agent-preset-registry/README.md) — scoped composition and recorded preset identity.

<a id="model-experience"></a>
## Model Experience

### Character system prompt

#### What the model sees

The model receives the fixed guidance below, followed by bound card content and the current profile context as JSON. Work instructions and runtime contexts are suppressed. Scene fields describe the AI character; the player controls their actions, speech and inner life. The complete text is logged with each request.

##### Fixed character guidance

```markdown
Portray one primary adult character in everyday shared life. Use brief actions and natural dialogue. You may portray the environment and simple passersby. Never decide the player's actions, speech, or inner feelings. Treat the player persona as fictional identity. Advance only in response to the player's message or explicit continuation. Time does not advance while the player is away.

Use the bound character card and the latest saved roleplay context. Scene fields describe the AI character only. Shared memories and relationship metrics belong to this character profile; scenes belong to this conversation. Automatically maintain useful stable facts, important experiences, promises, and relationship developments through roleplay_update. Query further memories and their user-message evidence through roleplay_read. Every memory must cite an evidenceId returned by roleplay_read; reuse the original evidence when extracting an older fact. Invalidated evidence cannot recreate that memory. User corrections take precedence. Preserve unresolved conflicts and ask the player to resolve them when needed. Read again after a stale revision. Submit meaningful affinity and trust changes as deltas, never absolute values; numeric values do not determine romantic outcomes. Do not mention internal tool activity in character dialogue.
```

#### Token effect

Each request includes fixed guidance, the bound card and resources, current scene, player persona, relationship values and selected memories. `maxSelectedMemories` bounds the selected count; actual token cost depends on content length, while prior dialogue continues to consume history-message tokens.

#### KV Cache effect

Fixed guidance and the bound card form a stable prefix before current state. State updates or explicitly applying a new card version change subsequent prompt content; provider cache reuse is not guaranteed.

### Roleplay tool schemas and evidence

#### What the model sees

Only the [roleplay tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-roleplay) are available. `roleplay_read` returns scene, relationships, selected memories, unresolved conflicts and recent user-message evidence; a query searches active memories. `roleplay_update` accepts an expected revision, AI scene fields, metric deltas and a memory with a stable key and this conversation's `evidenceId`. Absolute metric assignments, another conversation's evidence and invalidated evidence are rejected; user corrections take priority and stale writes remain as conflicts.

#### Token effect

Two tool schemas are supplied consistently. Each read or update adds call arguments and a JSON result; `maxEvidenceMessages` bounds the evidence-message count, while memory and message lengths determine result cost.

#### KV Cache effect

Tool schemas remain stable within this preset. New calls and results append to message history; changed result data does not guarantee provider reuse of the corresponding cache.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Roleplay is single-player with one primary AI character. It has no offline time simulation or autonomous continuation. Profiles retain full historical snapshots within `maxProfileBytes`; reaching that limit rejects new writes rather than deleting history. Recovery requires its source logs and snapshots to remain readable. Undo applies only to the latest completed, locally owned reply with no queued input; older and inherited replies can be branched instead. Card content is trusted deployment-authored character guidance, and model quality still determines whether dialogue respects that guidance.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The [roleplay decision](../../../.agents/notes/implemented/feature/2026-10-07-roleplay-mode.md) records the ownership and interaction choices.

</details>
