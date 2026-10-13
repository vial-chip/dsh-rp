---
description: "Choose roleplay character cards, edit saved state, and undo or regenerate interactions in the native conversation UI."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-roleplay

English | [中文](README.zh.md)

## Summary

Choose a character beside the native composer and inspect its frozen instructions in the right Sidebar. Separate tabs show the saved world, body, clothing, and numeric relationship state. Edit individual fields without requesting a model response. Undo restores the latest interaction's text to the composer; regeneration repeats its original input.

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

The roleplay controls share the existing conversation composer and right Sidebar. The composer controls appear only when the Session exposes roleplay state. Character choices use their description when available and remember the last selected skill name in browser preferences. The character tab previews selected instructions before the first interaction without fixing their content. Card content becomes fixed when the first interaction is admitted; later file edits do not replace that Session's instructions.

### Configuration

The Host entry exposes the browser plugin. Mount `@deepseek-ai/dsh-client-ui-roleplay` alongside the native conversation, right Sidebar, locale, remote services, and the Host Roleplay service. This package has no configuration fields.

### Saved state and interaction actions

Opening a state tab reads the Session projection. An edit writes only the selected category and fields; relationship edits assign absolute numeric values. A failed edit preserves the saved values and the editor's draft. Human edits reach the model only when it independently reads the corresponding state through a tool.

Undo and regeneration are available while the Session is idle. Undo returns text to the native composer and waits for the user to send it. Undoing a continuation leaves the composer unchanged. Regeneration resubmits the original message, including its attachments, through the Host service. The Host owns history retraction and state restoration, including preservation of later human edits.

### Application tool switches

The character tab's Tools section exposes eight independent native plugin switches. Each switch writes the application profile patch through Plugin Manager and applies to all roleplay Sessions; ordinary modes do not expose these tools. A deployment without live configuration reload reports that a restart is required. Opening these settings performs no model request.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser entry contributes one composer dock, five native right-sidebar tab types, and a shell-owned outcome toast. Presentation components receive plain callbacks and framework-bound projection hooks. Remote operations stay in the browser entry; durable card and state values arrive through the Roleplay projection. Loading and query failures remain beside the card selector; transient mutation outcomes use the shell overlay.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Roleplay](../../roleplay/roleplay/README.md) owns cards, saved state, history retraction, and model tools.
- [Conversation](../ui-conversation/README.md) owns the native composer and draft lifecycle.
- [Right Sidebar](../ui-sidebar-right/README.md) owns tab layout and navigation.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser UI registers no model-facing tools or messages; Roleplay owns the model-visible behavior.

#### KV Cache effect

None. Opening tabs and saving human edits add no model input.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Undo restores text only. The native composer has no restoration operation for durable attachment references; regeneration retains the original message attachments on the Host.
- Saved panel values can differ from the narrative until the model reads the corresponding state. Narrative text does not update these panels.
- All roleplay-owned interface copy remains Chinese, including when the application locale is English.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
