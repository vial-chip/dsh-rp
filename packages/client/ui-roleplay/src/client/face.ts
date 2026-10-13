/** Plain callbacks injected into roleplay presentation entries. */
import type { RoleplayCard, RoleplayCardSummary, RoleplayCategory } from '@deepseek-ai/dsh-roleplay/types'
import type { RoleplayKey } from './locales.ts'

/** Independently configured roleplay tool entry. */
export type RoleplayToolName = `${RoleplayCategory}-${'read' | 'update'}`
/** Current application-level plugin switch state. */
export interface RoleplayToolSetting { readonly name: RoleplayToolName; readonly enabled: boolean; readonly canChange: boolean }

/** Host operations; durable values arrive through the Session projection. */
export interface RoleplayInjected {
  /** List skill-format cards without requesting a model response. */
  listCards(this: void): Promise<RoleplayCardSummary[]>
  /** Read selected instructions without freezing the card or requesting a response. */
  previewCard(this: void): Promise<RoleplayCard>
  /** Read the native application plugin switches. */
  listTools(this: void): Promise<RoleplayToolSetting[]>
  /** Persist one switch through native plugin management. */
  setToolEnabled(this: void, name: RoleplayToolName, enabled: boolean): Promise<'applied' | 'restart-required'>
  /** Select and remember the card used by new roleplay conversations. */
  selectCard(this: void, name: string): Promise<void>
  /** Read the browser's last selected card name. */
  preferredCard(this: void): string | null
  /** Write only the supplied fields, without injecting model context. */
  edit(this: void, category: RoleplayCategory, patch: Record<string, string | number>): Promise<void>
  /** Retract the latest completed interaction and return its input. */
  undo(this: void): Promise<{ input: string | null }>
  /** Retract and repeat the latest completed interaction. */
  regenerate(this: void): Promise<void>
  /** Publish an operation outcome in the persistent shell overlay. */
  notify(this: void, key: RoleplayKey, success: boolean): void
}
