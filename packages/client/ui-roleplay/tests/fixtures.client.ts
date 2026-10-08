import { vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { MessageId } from '@deepseek-ai/dsh-llm/brand'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CharacterCardVersion, CharacterProfile, CharacterProfileId, RoleplayMemoryId, RoleplayOperationId } from '@deepseek-ai/dsh-roleplay/types'
import type { RoleplayActions } from '../src/client/model.ts'

export const sessionId = SessionId('conversation')
export const memoryId = brandString<RoleplayMemoryId>('tea-memory')
export const conflictId = brandString<RoleplayOperationId>('conflict')
export function profile(): CharacterProfile {
  const source = { sessionId, reply: 2, actor: 'model' as const, operation: brandString<RoleplayOperationId>('reply-update') }
  return {
    id: brandString<CharacterProfileId>('lin-profile'), title: 'Lin', revision: 3, history: [],
    state: {
      card: { name: 'lin', description: 'Housemate', version: brandString<CharacterCardVersion>('version-one'), content: 'Play Lin.', opening: 'Tea?',
        scene: { clothing: 'cardigan' }, metrics: { trust: { min: 0, max: 100, initial: 30 } } },
      player: { name: 'Player', appearance: '', background: '' }, metrics: { trust: 35 },
      scenes: { [sessionId]: { archived: false, fields: { clothing: 'cardigan' } } }, blockedSources: [],
      memories: { [memoryId]: { id: memoryId, key: 'tea', text: 'Likes jasmine tea', applicable: 'daily life',
        evidenceId: MessageId('user-evidence'), status: 'active', source } },
    },
    conflicts: [{ id: conflictId, source, reason: 'stale revision', proposed: 'trust +5', resolved: false }],
  }
}

export function remoteFor(current: CharacterProfile): RoleplayActions {
  return {
    cards: vi.fn(async () => ({ ok: true as const, value: [current.state.card] })),
    profiles: vi.fn(async () => ({ ok: true as const, value: [current] })),
    read: vi.fn(async () => ({ ok: true as const, value: current })),
    createProfile: vi.fn(async () => ({ ok: true as const, value: current })),
    createConversation: vi.fn(async () => ({ ok: true as const, value: sessionId })),
    edit: vi.fn(async () => ({ ok: true as const, value: current })),
    applyCard: vi.fn(async () => ({ ok: true as const, value: current })),
    archive: vi.fn(async () => ({ ok: true as const, value: current })),
    continue: vi.fn(async () => ({ ok: true as const, value: sessionId })),
    undo: vi.fn(async () => ({ ok: true as const, value: sessionId })),
    history: vi.fn(async () => ({ ok: true as const, value: [{ seq: 7, kind: 'assistantReply' as const, text: 'Shall we make tea?' }] })),
    branch: vi.fn(async () => ({ ok: true as const, value: { profileId: current.id, sessionId: SessionId('branch') } })),
  }
}
