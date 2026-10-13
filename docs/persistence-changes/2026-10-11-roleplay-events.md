---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-11-roleplay-events

English | [中文](2026-10-11-roleplay-events.zh.md)

## Summary

Adds required log-only roleplay events for character selection, frozen cards, saved state, and withdrawal, plus the roleplay-withdrawal message source for empty history replacements.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-11-roleplay-events
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "a1c63b9741545bada2636fb8f329e6a650df23347e96127047c2c86282cbde52"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "9568178365a53165ff0f6e5bfd26336143c6297cb8f020388441a284a9c649ee"
    decision: same-version
  - root: "event:roleplay/card"
    previous: null
    after: "771178f06eea7b32c5de3b1759177a1af17e38a04024219bfeb83a37a5faae06"
    decision: same-version
  - root: "event:roleplay/card-selection"
    previous: null
    after: "e60946fe455199117d7f675cca19c58efa918a4e2bdf6946113049b655da484d"
    decision: same-version
  - root: "event:roleplay/retract"
    previous: null
    after: "417f046451a9ed9f307f134607bd12d7765f8c4ab0313993d740bf950a077789"
    decision: same-version
  - root: "event:roleplay/state"
    previous: null
    after: "6ebc4296b1d26a7b123c03b11e964a9bd7d08b2b60b472df103a1d56a8ab303c"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "ac1cae35cfd6059cd5d7df2197321c3512f831594f054d4372b36417ea04b2e1"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "62f7d3110a6e9b913be5909594349bb6df0003fa1cb69f201d6f53932f9be441"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing sessions remain valid and do not require roleplay state. The four new event types are required on read because reopening must reconstruct the frozen character, saved panels, and withdrawn interactions. The new message source identifies empty user-message replacements that remove withdrawn interaction nodes from effective history. Readers without these declarations refuse unfamiliar required events or sources. No existing event payload or Session header changes.

<a id="verification"></a>
## Verification

node node_modules/vitest/vitest.mjs run packages/roleplay/roleplay/tests/fold.spec.ts packages/roleplay/roleplay/tests/recovery-integrity.spec.ts packages/roleplay/roleplay/tests/durable-withdrawal.spec.ts: 6 tests passed, including real AgentLoop undo/regeneration, JSONL flush/read/reopen, field rollback, and recovery idempotence. DeepSeek empty-user serialization: 3 focused tests passed.

<a id="dev-note"></a>
## Dev Note

None.
