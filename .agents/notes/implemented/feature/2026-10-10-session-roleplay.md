# Agent Note: Single-session roleplay

Status: implemented

English | [中文](2026-10-10-session-roleplay.zh.md)

## Problem

Roleplay needs a stable character, inspectable story state, and control over the user's own actions. Automatically injecting every state edit would grow model input and change request prefixes even when the current dialogue does not need that state.

## Decision

The native roleplay preset owns one session's frozen character card and recorded state. A skill supplies the character definition; its contents freeze on the first interaction so reopening preserves the same identity while later file edits remain available to new sessions. No cross-session relationship memory or shared character profile is maintained.

World, body, clothing, and relationship each have separate read and update tools. Human edits save immediately but enter model context only through the corresponding voluntary read. Narrative text does not write recorded state. Fixed instructions, the frozen card, and unchanged tool definitions preserve request-prefix reuse potential without making a provider cache-hit guarantee.

Undo and regeneration withdraw a completed interaction from effective history and restore its model-written fields, retaining later human replacement values. Audit events remain durable. History removal and restored state are saved before another request starts, and reopening completes an interrupted withdrawal. This rollback covers session roleplay state; it does not reverse unrelated tool side effects.

Current operation details belong to the [roleplay service](../../../../packages/roleplay/roleplay/README.md), [state tools](../../../../packages/roleplay/tool-roleplay/README.md), and [native client](../../../../packages/client/ui-roleplay/README.md). The [subsystem reference](../../../../docs/subsystems/roleplay.md) owns saved types.

## Alternatives considered

**Aggregate state tools.** Separate capabilities permit independent switches and keep each result limited to the requested subject.

**Dynamic system instructions.** Editing the system prompt for every state change couples human panel edits to model input and changes stable prefixes; voluntary reads make that cost explicit.

**Dedicated conversation entry point.** Native creation, the composer, and sidebar bookmarks preserve existing conversation interactions while exposing each state subject on demand.

## Consequences

Recorded panels can differ from narrative or the model's retained understanding. After a human edit, the model can retain an old value until it chooses the corresponding reader. This is the cost of keeping tool use optional and ordinary dialogue free of mandatory state calls.

Keyless loop, JSONL flush/reopen, SDK replay, and real browser tests cover state withdrawal and native controls. Stable-prefix observations do not measure provider-side cache hits, token billing, or latency; those require a credentialed provider run.
