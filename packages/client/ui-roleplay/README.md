---
description: "Shared Web and Desktop character-profile navigation, state editing and roleplay history operations."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-roleplay

English | [中文](README.zh.md)

## Summary

Choose a local character card, create independent profiles and open their conversations from the Roleplay entry. Edit AI scene fields, player identity, numeric affinity and trust, and shared memories in the character panel. Inspect memory sources and revisions, invalidate a memory, resolve conflicts or explicitly apply a newer character card. Continue, archive, branch, undo and regenerate through the same interface on Web and Desktop.

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

The Web application bundle mounts this package for both Web and Desktop. Choose Roleplay in the agent-preset picker to open the profile hub. Create a profile from a card and your fictional player identity, then start or reopen its conversations. The session header opens the hub; the right sidebar's character tab provides the current conversation's editor. Roleplay conversations are absent from ordinary work navigation.

Forms save through the authoritative `roleplay` Remote namespace. Scene controls describe the AI character only; player appearance belongs to the separate fictional persona. Relationship values are numeric, without descriptive ranks. Memory entries show validity, source operations and historical revisions. A newer card is applied explicitly and requires reviewing existing memories.

The hub groups conversations by profile and provides archive and restore. Continue advances the current scene after your explicit action. Undo opens a replacement conversation and archives the original; regenerate submits its input once. Choose a user message or character reply in history and branch into an independent profile at that checkpoint. Errors stay beside the relevant form and loading controls prevent repeated submissions.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [client entry](src/client/index.ts) registers the shell overlay, session-header action and right-sidebar tab through the Slots lifecycle. The React-free [RoleplayClient](src/client/model.ts) owns card and profile snapshots, publishes accepted changes, and prevents earlier reads from replacing newer corrections. The renderer binds its stable source to `useRoleplayData`; [RoleplayHub](src/client/RoleplayHub.tsx) and [RoleplayPanel](src/client/RoleplayPanel.tsx) receive snapshots and administrative callbacks. Typed English and Chinese dictionaries own interface copy; existing Modal, Input, Button and sidebar primitives provide the controls. Asynchronous reads ignore obsolete results after unmount or selection change.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Roleplay package](../../roleplay/roleplay/README.md) — cards, configuration and authoritative changes.
- [Roleplay subsystem](../../../docs/subsystems/roleplay.md) — durable ownership and history behavior.
- [Shared UI primitives](../ui-primitives/README.md) — controls and accessibility.

<a id="model-experience"></a>
## Model Experience

### Administrative edits and explicit input

#### What the model sees

The interface submits administrative edits through the `roleplay` Remote namespace without adding fictional player dialogue. Accepted changes enter the next recorded roleplay model request. New conversation, user message, Continue and Regenerate are explicit inputs that can advance the scene. Opening the hub, viewing state, archiving and branching do not request a model reply.

#### Token effect

The interface adds no prompt text or tool results itself. The roleplay runtime includes saved fields and memories in the next request, with token cost determined by text length; viewing or editing a form consumes no model tokens.

#### KV Cache effect

Administrative edits can change character context in the next request. Cache reuse depends on the runtime's request and the model provider; this package does not control caching.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The package requires the Host roleplay controller and shared workspace, locale, renderer, Remote and sidebar services. Historical branching selects a visible user message or character reply. Each open panel shows a snapshot refreshed after its own writes, explicit refresh and conversation activity; another panel's administrative changes may require refresh. Model execution and compensation follow the authoritative service's limits.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
