/** Durable character ownership and revision vocabulary. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'

/** Independent character portrayal identity. */
export type CharacterProfileId = Branded<'CharacterProfileId'>
/** Immutable content-addressed card version. */
export type CharacterCardVersion = Branded<'CharacterCardVersion'>
/** Stable memory identity within a profile. */
export type RoleplayMemoryId = Branded<'RoleplayMemoryId'>
/** Idempotency identity for a submitted change. */
export type RoleplayOperationId = Branded<'RoleplayOperationId'>

/** A visible user message or completed assistant message eligible for branching. */
export interface RoleplayHistoryPoint {
  seq: number
  kind: 'userMessage' | 'assistantReply'
  text: string
}

/** Durable intent for an idempotent cross-service conversation operation. */
export type RoleplayLifecyclePlan = {
  id: RoleplayOperationId
  profileId: CharacterProfileId
  sessionId: SessionId
} & (
  | { kind: 'create'; child: SessionId }
  | { kind: 'archive'; archived: boolean }
  | { kind: 'branch'; child: SessionId; childProfile: CharacterProfileId; snapshotProfile: CharacterProfileId; revision: number; atSeq: number; fromScene: SessionId }
  | { kind: 'undo'; child: SessionId; reply: number }
)

/** Current profile information selected for a model request. */
export interface RoleplayContext {
  profileId: CharacterProfileId
  revision: number
  card: CharacterCard
  player: PlayerPersona
  scene: Record<string, string>
  metrics: Record<string, number>
  memories: RoleplayMemory[]
  conflicts: RoleplayConflict[]
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Log-only profile revision before requests, after model updates and at reply completion, used for historical branches. */
    'roleplay/checkpoint': { profileId: CharacterProfileId; revision: number; sessionId: SessionId }
  }
}

/** Card-defined numeric relationship measure. */
export interface RelationshipMetric { min: number; max: number; initial: number }
/** Saved definition; file edits never mutate this value. */
export interface CharacterCard {
  name: string
  description: string
  version: CharacterCardVersion
  content: string
  opening: string
  scene: Record<string, string>
  metrics: Record<string, RelationshipMetric>
}
/** User-authored fictional identity. */
export interface PlayerPersona { name: string; appearance: string; background: string }
/** Durable attribution shared by every change from one model reply. */
export interface RoleplaySource {
  sessionId: SessionId
  reply: number
  operation: RoleplayOperationId
  actor: 'model' | 'user'
}
/** A selected fact with retained origin and applicability. */
export interface RoleplayMemory {
  id: RoleplayMemoryId
  key: string
  text: string
  applicable: string
  evidenceId: MessageId
  source: RoleplaySource
  status: 'active' | 'invalid' | 'review'
}
/** Scene belongs to one conversation and describes only the AI character. */
export interface RoleplayScene { fields: Record<string, string>; archived: boolean }
/** Complete state at one committed revision. */
export interface RoleplayState {
  card: CharacterCard
  player: PlayerPersona
  metrics: Record<string, number>
  memories: Record<string, RoleplayMemory>
  scenes: Record<string, RoleplayScene>
  blockedSources: string[]
}
/** Rejected or partially reverted change requiring user coordination. */
export interface RoleplayConflict {
  id: RoleplayOperationId
  source: RoleplaySource
  reason: string
  proposed: string
  resolved: boolean
}
/** Immutable history entry; snapshots make historical branches independent of later writes. */
export interface RoleplayRevision {
  revision: number
  source: RoleplaySource
  state: RoleplayState
  conflicts: RoleplayConflict[]
  touched: string[]
  deltas: Record<string, number>
  undone: boolean
}
/** Atomic storage record for all data owned by one portrayal. */
export interface CharacterProfile {
  id: CharacterProfileId
  title: string
  revision: number
  state: RoleplayState
  history: RoleplayRevision[]
  conflicts: RoleplayConflict[]
}
/** Model submission accepts deltas and observed revisions, never absolute metrics. */
export interface RoleplayModelChange {
  expectedRevision: number
  scene?: Record<string, string>
  deltas?: Record<string, number>
  memory?: { key: string; text: string; applicable: string; evidenceId: MessageId }
}
/** Administrative edits do not become fictional player dialogue. */
export interface RoleplayUserChange {
  scene?: Record<string, string>
  metrics?: Record<string, number>
  player?: PlayerPersona
  memory?: { id: RoleplayMemoryId; text?: string; status?: 'active' | 'invalid' }
  resolveConflict?: RoleplayOperationId
}
