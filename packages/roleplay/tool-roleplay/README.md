---
description: "Compose eight independently enabled Chinese roleplay state tools and inspect their compact model results."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-roleplay

English | [中文](README.zh.md)

## Summary

Models can read and update world, body, clothing, and relationship state for their current roleplay session. Each reader and writer can be enabled independently. Readers return selected fields; writers return a short Chinese confirmation. Relationship writers apply numeric deltas.

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

Mount desired subpaths in the application plugin list beside `@deepseek-ai/dsh-roleplay`, `@deepseek-ai/dsh-tools`, and the agent registry. Entries register tools only for roleplay sessions; ordinary modes receive no additional tool schemas. The package root exports entry namespaces and does not activate tools.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-tool-roleplay/world-read'
- name: '@deepseek-ai/dsh-tool-roleplay/world-update'
```

The remaining subpaths replace `world` with `body`, `clothing`, or `relationship`. Every entry has Chinese display metadata and no configuration fields. Toggle each entry in the character-card bookmark’s Tools section; switches save application-level configuration and reload the corresponding plugin through native plugin management. All eight entries are enabled by default.

### State operations

Tool names follow `roleplay_<category>_read` and `roleplay_<category>_update`. Readers accept optional `fields: string[]`; omission returns the category's complete recorded state, an empty array returns `{}`, and unrecorded fields are omitted. Text-state writers accept `changes: [{ field, value }]` with string values. Relationship writers accept `changes: [{ field, delta }]` with finite numeric deltas and start missing metrics at zero. Empty change lists and repeated field names fail without writing. Each writer returns only `已更新世界。`, `已更新身体。`, `已更新服饰。`, or `已更新关系。`.

All calls require an owning agent session. The roleplay service owns field validation, configurable state bounds, durable writes, and rollback. Updating a category preserves its other fields. These tools do not add prompt instructions or request a model response after a human edit.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each subpath exports a named Cordis function plugin. Shared registration helpers define typed schemas and pure generic card presenters. Tool registration belongs to its plugin fiber, so disposing one entry removes only its tool. Call cards show Chinese category labels and supplied arguments; completed cards use persisted result content and do not read current state.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Roleplay service](../roleplay/README.md) — state ownership and persistence.
- [Tool authoring](../../../docs/cookbook/adding-a-tool.md) — schemas, execution, and presentation.
- [Testing policy](../../../docs/testing.md) — composition and recorded-session evidence.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas and results

#### What the model sees

The enabled tools expose Chinese descriptions and parameter explanations. Read results contain only the requested category fields as compact JSON; write results contain only the Chinese confirmation named above. Session ids, operation ids, and revision checks are absent from tool arguments and results. The generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-roleplay) owns the exact schemas.

#### Token effect

Enabled schemas contribute fixed request tokens. Reads append only selected recorded state to tool results. Writes append a short confirmation without echoing existing state. Ordinary dialogue adds no state through these tools unless the model calls them.

#### KV Cache effect

State changes preserve tool definitions and order. Calls append results to history. Explicit plugin configuration changes can change the schema prefix. Provider cache availability and eviction remain outside this package's guarantees.

## Known Limitations and Deferred Work

These tools expose only the current session's four state categories.

- Field deletion and absolute relationship assignment are unavailable to the model; human editing belongs to the roleplay service and its client.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
