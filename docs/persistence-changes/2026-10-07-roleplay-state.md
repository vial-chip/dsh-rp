---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-07-roleplay-state

English | [中文](2026-10-07-roleplay-state.zh.md)

## Summary

Adds required roleplay profile checkpoints to Session logs and independent roleplay profile and recovery-intent storage.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-07-roleplay-state
baseline: false
changes:
  - root: "event:roleplay/checkpoint"
    previous: null
    after: "026d7018d6f929ad8d650c80ed10c755f938abdd0ca6fa94502cb902aa15e575"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing logs and storage domains remain valid. New roleplay checkpoints name an immutable profile revision and conversation scene; builds without the event refuse these logs. Existing Session format generations remain unchanged. The new roleplay domain starts at version zero and retains card definitions, corrections, memory evidence and selective compensation history separately from work data.

<a id="verification"></a>
## Verification

Focused roleplay and interface coverage: 74 tests passed; every selected source file has 100% statement, branch, function and line coverage. Workspace constraints: 109 tests passed. The complete build, including Host and Client TypeScript aggregates, and repository lint passed. The shipped Web roleplay Session snapshot replay and corpus validation passed. TypeScript and Python SDK expected-output tests retain the required checkpoint event. Real DeepSeek GUI flows verified evidenced memory, administrative corrections, reload persistence and shared memory in an independent scene.

<a id="dev-note"></a>
## Dev Note

None.
