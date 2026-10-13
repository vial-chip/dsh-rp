---
description: "Save a session's character card and roleplay state, and withdraw completed interactions while retaining human edits."
kind: "package-reference"
---

# @deepseek-ai/dsh-roleplay

English | [中文](README.zh.md)

## Summary

Keep one character's identity and recorded state across a roleplay session. Character cards freeze on the first interaction, so later skill-file edits affect new sessions. Human state edits save immediately and reach the model only through a requested read. Undo and regeneration withdraw the latest completed interaction and restore its state changes while retaining human edits.

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

The Web composition mounts this service and offers the `roleplay` preset. Custom compositions mount it alongside the agent registry, sessions, session projections, session-query, skills, and system-prompt services. Session-query supplies complete interaction history for withdrawal, including events outside the resident tail.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `maxFields` | `64` | Maximum saved fields per category |
| `maxFieldLength` | `80` | Maximum characters per field name |
| `maxTextLength` | `2000` | Maximum characters per text value |

Limits must be positive safe integers. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-roleplay) owns the full configuration reference.

### Cards and state

The bundled card is `daily-companion`. Available skills with names beginning `roleplay-` provide additional cards. Selection is allowed before the card freezes; unavailable cards fail explicitly. Each session saves its own frozen card and four state categories. World, body, and clothing values are text; relationship values are finite numbers. Model updates apply relationship deltas, while human edits assign values directly.

`previewCard` reads the complete selected card for preview before sending, without freezing it or appending events; after freezing it returns the saved copy.

Panel reads and human edits do not send messages, trigger inference, or change the prompt. The model receives edited state only when it calls the relevant reader. Narrative text does not update recorded state.

### Undo and regeneration

These operations require an idle live roleplay session and a latest completed interaction. Undo restores the user input's text to the composer; an interaction without user input returns `null`. Regeneration resubmits the original trigger message’s content and source with a fresh message identity and no consumed browser request id, retaining nonhuman sources so a later undo still restores no text. An empty interaction without an original message rejects regeneration before withdrawal. Both operations withdraw the interaction's effective history and restore fields changed by its model tools, retaining human replacement values recorded since that interaction began. Other side effects are outside this rollback. The withdrawal is saved before another request can start and is completed on reopening if interrupted.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The service records card selection, frozen card contents, state changes, and withdrawals in the Session log. A pure projection rebuilds panels and distinguishes human replacements from model writes. A withdrawal records the restored panel and writes an empty user-message replacement with source `roleplay-withdrawal` over the interaction's effective message range; replay retains audit records while subsequent requests omit withdrawn content. Remote methods share these operations with the client.

- [`src/index.ts`](src/index.ts) — service, prompt assembly, and remote operations.
- [`src/fold.ts`](src/fold.ts) — replay and field restoration.
- [`src/types.ts`](src/types.ts) — saved types and event declarations.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Roleplay subsystem](../../../docs/subsystems/roleplay.md) — type ownership and persistence.
- [State tools](../tool-roleplay/README.md) — selective reads and compact confirmations.
- [Client](../../client/ui-roleplay/README.md) — native controls and panels.

-----

<a id="model-experience"></a>
## Model Experience

### Character instructions

#### What the model sees

The roleplay prompt replaces other assembled sections and contexts with these instructions followed by `角色卡：` and the frozen card content. Dynamic state enters through tool results. Withdrawn interaction messages are absent from subsequent effective history.

##### Stable roleplay instructions

```markdown
你正在与用户进行单人沉浸式角色扮演。你扮演角色卡指定的主要角色，与用户自然地共同生活和互动。
始终遵循角色的身份、背景、性格和表达方式，以自然台词、简短动作和必要的环境描写回应。可以描写临时路人，避免抢走主要角色的互动。
用户独自掌握自己的台词、行动、决定和内心体验。不要替用户说话、决定、行动，也不要断言用户的感受或想法。
故事只随用户输入或明确的继续操作推进。回应当前互动，给用户留下选择和接话的空间，不自行跳过重要时刻。
使用中文表达，保持角色连贯、细节适量，避免重复角色设定、长篇总结和脱离角色的说明。
```

#### Token effect

Instructions and card content contribute fixed input per request. Human edits add no model input. State readers and writers own their result costs.

#### KV Cache effect

Ordinary state changes leave the instruction and card prefix unchanged. Withdrawals change effective history. Provider cache hits depend on the provider and request sequence.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

Recorded state is independent of narration and model recollection.

- Human edits can differ from the model's current knowledge until it chooses to read them.
- Withdrawal restores only this session's roleplay state; unrelated tool effects remain.
- Undo restores text to the composer; regeneration retains the original message content, including non-text parts.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
