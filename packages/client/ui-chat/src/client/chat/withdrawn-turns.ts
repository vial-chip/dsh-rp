/** Roleplay withdrawals hide whole interactions while retaining their durable records. */
import type { ConversationLocation } from '@deepseek-ai/dsh-client-ui-conversation/client'

const EMPTY: ReadonlySet<number> = new Set()

/**
 * Read withdrawn turns from the optional roleplay wire projection.
 * @param projection - roleplay projection received from the Host.
 * @returns valid withdrawn turn numbers, or an empty set for other sessions.
 */
export function withdrawnTurns(projection: unknown): ReadonlySet<number> {
  if (typeof projection !== 'object' || projection === null || !('retractedTurns' in projection)) return EMPTY
  const turns = projection.retractedTurns
  if (!Array.isArray(turns)) return EMPTY
  return new Set(turns.filter((turn): turn is number => typeof turn === 'number' && Number.isSafeInteger(turn) && turn >= 0))
}

/**
 * Check whether a located Chat node belongs to a withdrawn interaction.
 * @param location - node's conversation position.
 * @param turns - withdrawn turn numbers.
 * @returns true when the node belongs to one of those turns.
 */
export function isWithdrawnLocation(location: ConversationLocation | undefined, turns: ReadonlySet<number>): boolean {
  return location !== undefined && (location.kind === 'turn' || location.kind === 'step') && turns.has(location.turn.turn)
}
