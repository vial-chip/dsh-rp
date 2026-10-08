---
description: "Package map for character cards, independent roleplay profiles, shared memories and separate conversation scenes."
kind: "package-group"
---

# roleplay/ — character conversations

English | [中文](README.zh.md)

## Summary

Create a fictional player identity and converse with a primary AI character in everyday shared life. Character profiles share selected memories and numeric relationships across conversations while keeping scene state separate. Local character cards bind to immutable versions, and user edits take priority over model updates. Work tools, instructions and ordinary task navigation remain separate.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Responsibility | Context services |
|---|---|---|
| [roleplay/](roleplay/README.md) | Character discovery, durable profiles, scoped tools and conversation operations | `roleplay`, `roleplayController` |

<a id="related-documentation"></a>
## Related documentation

- [Roleplay subsystem](../../docs/subsystems/roleplay.md) — ownership, durable types and history operations.
- [Roleplay interface](../client/ui-roleplay/README.md) — shared Web and Desktop entry and editing.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
