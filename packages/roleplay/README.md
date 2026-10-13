---
description: "Choose character roleplay, independent state tools, and browser panels for a session."
kind: "package-group"
---

# roleplay/ — character roleplay

English | [中文](README.zh.md)

## Summary

Choose a character and carry a story across turns and reopened sessions. Read or edit recorded world, body, clothing, and relationship state independently of dialogue. The service saves character settings and interaction withdrawals, the tools provide selective state access, and the client supplies character selection and panels.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Each package owns one part of the roleplay experience.

| Package | Role |
|---|---|
| [`roleplay`](roleplay/README.md) | Frozen character instructions, saved state, undo, and regeneration |
| [`tool-roleplay`](tool-roleplay/README.md) | Eight independently enabled state readers and writers |

<a id="related-documentation"></a>
## Related documentation

- [Roleplay subsystem](../../docs/subsystems/roleplay.md) — saved types and state semantics.
- [Roleplay client](../client/ui-roleplay/README.md) — character selection, state bookmarks, and interaction actions.
- [Web application](../bundle/web-app/README.md) — the shipped roleplay mode.

<a id="dev-note"></a>
## Dev Note

None.
