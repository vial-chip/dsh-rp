/** Session-local roleplay data shared by host and browser consumers. @module */
import type {} from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import type {} from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /**
     * Empty user message replacing a withdrawn interaction's effective history.
     * Readers preserve its content and surface operation without the roleplay producer.
     * The source identifies the producer; the surface operation owns replacement semantics.
     * @persistenceAttribution
     */
    'roleplay-withdrawal': { kind: 'roleplay-withdrawal' }
  }
}

/** Independently readable and writable state categories. */
export type RoleplayCategory = 'world' | 'body' | 'clothing' | 'relationship'
/** A discoverable character skill. */
export interface RoleplayCardSummary {
  readonly name: string
  readonly description: string
}
/** Character instructions frozen at the first admitted interaction. */
export interface RoleplayCard extends RoleplayCardSummary {
  readonly content: string
}
/** Saved panel data; reading this value never adds model context. */
export interface RoleplayState {
  readonly card: RoleplayCard | null
  readonly selection: string | null
  readonly world: Readonly<Record<string, string>>
  readonly body: Readonly<Record<string, string>>
  readonly clothing: Readonly<Record<string, string>>
  readonly relationship: Readonly<Record<string, number>>
  readonly retractedTurns: readonly number[]
}
/** Whole post-change category values and fields changed by this operation. */
export interface RoleplayStateChange {
  readonly category: RoleplayCategory
  readonly values: Readonly<Record<string, string | number>>
  readonly fields: readonly string[]
  readonly source: 'human' | 'model'
  readonly turn: number | null
}
/** Result returned to the composer after undo. */
export interface RoleplayUndoResult {
  readonly input: string | null
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Selected character skill before the first interaction. */
    'roleplay/card-selection': { name: string }
    /** Fixed character instructions used by this session. */
    'roleplay/card': RoleplayCard
    /** Whole saved category after one human or model operation. */
    'roleplay/state': RoleplayStateChange
    /** Withdrawn completed interaction and complete restored panel state. */
    'roleplay/retract': { turn: number; state: RoleplayState }
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { roleplay: RoleplayState | null }
  interface SessionProjectionStateMap { roleplay: RoleplayState | null }
}
