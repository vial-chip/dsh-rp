/** Validated authoritative roleplay storage, separate from work domains. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { CharacterCard, CharacterCardVersion, CharacterProfile, CharacterProfileId, RoleplayLifecyclePlan, RoleplayMemoryId, RoleplayOperationId } from './types.ts'

const fieldName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
  .refine(value => !['__proto__', 'constructor', 'prototype'].includes(value), 'Reserved field name')
const recordKeys = z.unknown().refine(value => !(value !== null && typeof value === 'object' && Object.hasOwn(value, '__proto__')),
  'Reserved field name')
const fields = recordKeys.pipe(z.record(fieldName, z.string()))
const numbers = recordKeys.pipe(z.record(fieldName, z.number()))
const source = z.object({
  sessionId: z.string().transform(brandString<SessionId>),
  reply: z.number().int().nonnegative(),
  operation: z.string().transform(brandString<RoleplayOperationId>),
  actor: z.enum(['model', 'user']),
})
const metric = z.object({ min: z.number(), max: z.number(), initial: z.number() })
  .refine(value => value.min < value.max && value.initial >= value.min && value.initial <= value.max,
    'Metric initial must fall within its increasing range')

/** Skill metadata consumed when loading a card. */
export const characterCardMetadata = z.object({
  opening: z.string().min(1),
  scene: fields.refine(value => ['time', 'place', 'weather', 'event', 'body', 'clothing', 'emotion'].every(key => Object.hasOwn(value, key)),
    'Scene must define time, place, weather, event, body, clothing, and emotion'),
  metrics: recordKeys.pipe(z.record(fieldName, metric)).refine(value => Object.hasOwn(value, 'affinity') && Object.hasOwn(value, 'trust'),
    'Cards must define affinity and trust'),
  resources: z.array(z.string()).default([]),
})

/** Immutable card snapshot validated on durable reads. */
export const characterCardSchema: z.ZodType<CharacterCard> = z.object({
  name: z.string().min(1), description: z.string().min(1),
  version: z.string().transform(brandString<CharacterCardVersion>), content: z.string(),
  opening: characterCardMetadata.shape.opening, scene: characterCardMetadata.shape.scene, metrics: characterCardMetadata.shape.metrics,
})
const memory = z.object({
  id: z.string().transform(brandString<RoleplayMemoryId>), key: z.string(), text: z.string(),
  applicable: z.string(), evidenceId: z.string().transform(brandString<MessageId>), source, status: z.enum(['active', 'invalid', 'review']),
})
const state = z.object({
  card: characterCardSchema,
  player: z.object({ name: z.string(), appearance: z.string(), background: z.string() }),
  metrics: numbers, memories: z.record(z.string(), memory),
  scenes: z.record(z.string(), z.object({ fields, archived: z.boolean() })),
  blockedSources: z.array(z.string()),
})
const conflict = z.object({
  id: z.string().transform(brandString<RoleplayOperationId>), source,
  reason: z.string(), proposed: z.string(), resolved: z.boolean(),
})

/** Profile records publish state and revision history together. */
export const characterProfileSchema: z.ZodType<CharacterProfile> = z.object({
  id: z.string().transform(brandString<CharacterProfileId>), title: z.string(),
  revision: z.number().int().nonnegative(), state,
  history: z.array(z.object({
    revision: z.number().int().nonnegative(), source, state, conflicts: z.array(conflict), touched: z.array(z.string()),
    deltas: numbers, undone: z.boolean(),
  })),
  conflicts: z.array(conflict),
})

const planBase = z.object({
  id: z.string().transform(brandString<RoleplayOperationId>),
  profileId: z.string().transform(brandString<CharacterProfileId>),
  sessionId: z.string().transform(brandString<SessionId>),
})
/** Recovery intents retain every identity before external effects start. */
export const roleplayLifecycleSchema: z.ZodType<RoleplayLifecyclePlan> = z.discriminatedUnion('kind', [
  planBase.extend({ kind: z.literal('create'), child: z.string().transform(brandString<SessionId>) }),
  planBase.extend({ kind: z.literal('archive'), archived: z.boolean() }),
  planBase.extend({ kind: z.literal('branch'), child: z.string().transform(brandString<SessionId>),
    childProfile: z.string().transform(brandString<CharacterProfileId>),
    snapshotProfile: z.string().transform(brandString<CharacterProfileId>), revision: z.number().int().nonnegative(),
    atSeq: z.number().int().nonnegative(), fromScene: z.string().transform(brandString<SessionId>) }),
  planBase.extend({ kind: z.literal('undo'), child: z.string().transform(brandString<SessionId>), reply: z.number().int().nonnegative() }),
])

/** Atomic profile records and separately replayable cross-service intents. */
export const roleplayDomainSpec = defineDomain({
  name: 'roleplay', version: 0,
  tables: { profiles: domainTable<CharacterProfileId, CharacterProfile>(characterProfileSchema),
    lifecycle: domainTable<RoleplayOperationId, RoleplayLifecyclePlan>(roleplayLifecycleSchema) },
})
