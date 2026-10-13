/** Pure saved-state projection and field-level interaction rollback. @module */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { RoleplayState, RoleplayCategory } from './types.ts'

/** Validated panel snapshot shared by host checkpoints and wire views. */
export const roleplayStateSchema: z.ZodType<RoleplayState | null> = z.object({
  card: z.object({ name: z.string(), description: z.string(), content: z.string() }).nullable(),
  selection: z.string().nullable(),
  world: z.record(z.string(), z.string()), body: z.record(z.string(), z.string()),
  clothing: z.record(z.string(), z.string()), relationship: z.record(z.string(), z.number()),
  retractedTurns: z.array(z.number().int().nonnegative()),
}).strict().nullable()

/**
 * Create independent empty state for a roleplay session.
 * @returns empty panel state.
 */
export function emptyRoleplayState(): RoleplayState {
  return { card: null, selection: null, world: {}, body: {}, clothing: {}, relationship: {}, retractedTurns: [] }
}

/**
 * Fold one committed roleplay event.
 * @param state - preceding state, null for other session modes.
 * @param event - committed event.
 * @returns saved panel state.
 */
export function applyRoleplayEvent(state: RoleplayState | null, event: SessionEvent): RoleplayState | null {
  if (event.type === 'agent-preset/selected') return event.data.agentPreset === 'roleplay' ? state ?? emptyRoleplayState() : null
  if (state === null) return state
  switch (event.type) {
    case 'roleplay/card-selection': return { ...state, selection: event.data.name }
    case 'roleplay/card': return { ...state, card: event.data, selection: event.data.name }
    case 'roleplay/state': {
      const { category, values } = event.data
      if (category === 'relationship') {
        const parsed = z.record(z.string(), z.number()).parse(values)
        return { ...state, relationship: parsed }
      }
      const parsed = z.record(z.string(), z.string()).parse(values)
      return { ...state, [category]: parsed }
    }
    case 'roleplay/retract': return roleplayStateSchema.parse(event.data.state)
    default: return state
  }
}

/**
 * Restore fields changed by a withdrawn model turn while retaining later human edits.
 * @param events - complete committed session log.
 * @param current - latest saved state.
 * @param turn - completed turn to withdraw.
 * @returns complete restored panel state.
 */
export function restoreRoleplayTurn(events: readonly SessionEvent[], current: RoleplayState, turn: number): RoleplayState {
  let prior = emptyRoleplayState()
  const affected = new Map<RoleplayCategory, Set<string>>()
  const preserved = new Map<RoleplayCategory, Map<string, string | number>>()
  let entered = false
  let baseline = prior
  for (const event of events) {
    if (event.type === 'turn/start' && event.data.turn === turn) { entered = true; baseline = prior }
    if (entered && event.type === 'roleplay/state') {
      const change = event.data
      if (change.source === 'model' && change.turn === turn) {
        const fields = affected.get(change.category) ?? new Set<string>()
        change.fields.forEach(field => fields.add(field))
        affected.set(change.category, fields)
      } else if (change.source === 'human') {
        const fields = preserved.get(change.category) ?? new Map<string, string | number>()
        const changed = Object.entries(change.values).filter(([field]) => change.fields.includes(field))
        for (const [field, value] of changed) fields.set(field, value)
        preserved.set(change.category, fields)
      }
    }
    prior = applyRoleplayEvent(prior, event) ?? prior
  }
  const restored = { ...current, retractedTurns: [...current.retractedTurns, turn] }
  for (const [category, fields] of affected) {
    const values: Record<string, string | number> = { ...current[category] }
    for (const field of fields) {
      const value = preserved.get(category)?.get(field)
        ?? (Object.hasOwn(baseline[category], field) ? baseline[category][field] : undefined)
      if (value === undefined) Reflect.deleteProperty(values, field)
      else Object.defineProperty(values, field, { value, enumerable: true, configurable: true, writable: true })
    }
    if (category === 'relationship') restored.relationship = z.record(z.string(), z.number()).parse(values)
    else restored[category] = z.record(z.string(), z.string()).parse(values)
  }
  return restored
}
