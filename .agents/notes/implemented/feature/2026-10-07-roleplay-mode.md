# Agent Note: Roleplay mode with shared character memory

Status: implemented

English | [中文](2026-10-07-roleplay-mode.zh.md)

## Problem

Everyday companionship needs stable characterization and selected memories that survive starting another conversation. Sharing scene state prevents independent scenes; storing memories separately for every conversation prevents a continuing relationship. Work tools, working directories and work history are outside this experience.

## Decision

The fifth built-in preset supports one player and one primary AI character through the existing Web and Desktop composition. The character can describe the environment and incidental people; the player controls their own dialogue, decisions and inner experience. [Domain terms](../../../../CONTEXT.md) distinguish character cards, independent profiles, shared memory and conversation scenes.

### Ownership and durable writes

The [roleplay service](../../../../packages/roleplay/roleplay/README.md) owns a separate storage domain. A profile binds a captured local skill-format card and owns the player persona, shared memories, numeric relationship metrics and multiple independent conversation scenes. Profiles created from one card do not share their records. Deployment limits are validated configuration; exceeding a capacity limit rejects the entire write.

Each mutation atomically publishes the complete profile, its revision snapshot and conflicts through the storage domain. Branded profile, card version, memory and operation identities retain ownership. Model operations name their conversation, reply and expected revision; repeated operation identities do not apply twice. Interrupted replies retain committed operations; undo compensates them explicitly.

Scene fields describe the AI character and current environment. Player identity is separate from the AI character's body, clothing and temporary emotion. Conversations share memories and relationship metrics rather than their scene fields or complete histories. Model relationship updates accept bounded deltas; user edits accept absolute values. Revisions retain the effective bounded delta for selective compensation.

### Logged context and corrections

Each model request receives the bound card, current profile revision, player, conversation scene, numeric relationships and selected memories through logged dynamic context. Read and update tools enforce profile ownership and validate model JSON. Roleplay exposes its own cards and tools, excludes work skills and tools, and has no work directory. Work navigation and history retrieval exclude roleplay Sessions; shared application model settings remain available.

Stale model writes retain proposals as visible conflicts while preserving the current values. Manual scene, player, relationship and memory edits are administration rather than fictional dialogue. Their checkpoints identify committed profile revisions, and later requests receive the corrected data. Previously logged requests retain the information they received.

Each memory retains its originating conversation, reply and evidence message. User corrections protect the corrected entry from conflicting model inferences. Invalidation retains the memory and a tombstone keyed by its evidence and stable memory key, preventing automatic re-extraction from that source. Archived conversations retain their shared memories.

### Cards and historical operations

Editing a source card does not alter an existing profile. Explicit card application updates its future requests across conversations, preserves historical definitions and marks active memories for review. Scene fields preserve matching values and use card defaults for added fields; metrics remain within the applied card's ranges.

A required Session checkpoint identifies an immutable profile revision and conversation scene. Checkpoints follow initialization, model requests, tool updates and administrative edits. Branching resolves the revision at the selected log position and creates an independent profile with that conversation's scene. It does not resolve the source's current state or submit a new reply. Released Session generations remain unchanged; builds without the checkpoint event refuse logs containing it.

Undo accepts only the latest completed, locally owned reply and refuses queued input. It appends a compensating profile revision, creates a replacement Session from the preceding history and archives the original. Later user assignments and unrelated contributions from other conversations survive; dependent changes become conflicts. Regeneration submits the original player input once. Invalid recorded update paths or missing metric deltas reject compensation before publication.

Cross-service lifecycle operations retain their identities in a durable recovery intent before changing profile or Session data. Recovery repeats idempotent writes, creates or resumes the same child Session, flushes its checkpoint and completes archival before removing the intent. Pending operations block profile progress. Startup recovery and historical branching do not generate dialogue; only player input or explicit Continue advances a scene.

## Alternatives considered

**One shared scene for every conversation.** Rejected because different conversations need independent time, place, clothing and temporary emotion while sharing relationship developments.

**Separate memory for each conversation.** Rejected because starting another scene must preserve the profile's continuing relationship and selected experiences.

**One rewritten memory paragraph.** Rejected because corrections, conflicting updates and selective undo need identifiable entries, sources and revisions.

**A separate card version per conversation.** Rejected because conversations sharing one profile's memories need consistent characterization; explicit profile updates preserve historical definitions.

**Rules-based simulation and offline progression.** Deferred because the experience prioritizes everyday conversation, model-maintained consistency and user-paced scenes.

## Consequences

Independent profiles and revision snapshots make correction, historical branching and selective undo inspectable. Retaining complete revisions and bound card bodies consumes storage; deployment limits bound each profile and reject excess writes atomically.

Memory extraction and narrative consistency depend on model judgment. Evidence and temporal qualifications support correction but do not guarantee recall. Shared relationship developments constrain independent scenes; incompatible histories require reconciliation or separate profiles. Undo cannot reverse consequences already narrated elsewhere.

Invalidation excludes a fact from active memory without erasing historical dialogue. Archiving preserves shared memory rather than permanently deleting Session data. New profiles provide independent beginnings. Card editing remains file-based; adventure rules, a dedicated card editor and arbitrary historical rollback are outside this decision.

## Verification

Focused behavior and interface tests cover independent ownership, restart persistence, shared memory, stale writes, human corrections, invalidation, selective compensation, exact historical branches and recovery after failed Session writes. New roleplay and interface source files meet the per-file 100% coverage requirement. The shipped Web recorded-session scenario and both SDK expected outputs retain the required checkpoint event.

A real DeepSeek conversation writes a preference and relationship changes through roleplay tools. Administrative clothing and trust corrections reach the next logged request, and a browser reload retains the corrected profile and evidenced memory. A second conversation recalls the shared Sunday cooking arrangement and jasmine tea while preserving the first scene's corrected clothing. Screenshots preserve the verified GUI states; GIF encoding is omitted at the user's request.
