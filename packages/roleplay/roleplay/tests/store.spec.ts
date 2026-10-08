import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { RoleplayStore } from '../src/store.ts'
import { roleplayDomainSpec } from '../src/spec.ts'
import type { CharacterCard, CharacterCardVersion, CharacterProfile, CharacterProfileId, RoleplayMemoryId, RoleplayOperationId, RoleplaySource } from '../src/types.ts'

const card: CharacterCard = {
  name: 'lin', description: 'Housemate', content: 'Play Lin.', opening: 'Tea?',
  version: brandString<CharacterCardVersion>('first'),
  scene: { time: 'evening', place: 'kitchen', weather: 'rain', event: 'tea', body: 'rested', clothing: 'cardigan', emotion: 'calm' },
  metrics: { affinity: { min: 0, max: 100, initial: 95 }, trust: { min: 0, max: 100, initial: 30 } },
}
const player = { name: 'Player', appearance: '', background: '' }
const first = brandString<SessionId>('first')
const second = brandString<SessionId>('second')
let sequence = 0
function source(sessionId = first, actor: 'model' | 'user' = 'user', reply = 10): RoleplaySource {
  return { sessionId, actor, reply, operation: brandString<RoleplayOperationId>(`operation-${sequence++}`) }
}
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-roleplay-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  const storageFiber = ctx.plugin(Storage)
  await storageFiber
  cleanup.push(() => storageFiber.dispose())
  let backend = new JsonStorageBackend(root)
  ctx.storage.backend.register('json', backend)
  let facility = new DomainFacility(ctx, { backend: 'json' })
  let domain = await facility.open(roleplayDomainSpec)
  cleanup.push(async () => { await domain.close(); await backend.close() })
  const make = () => new RoleplayStore(domain.table('profiles'), domain.table('lifecycle'), { maxProfileBytes: 10_000_000, maxSelectedMemories: 24, maxEvidenceMessages: 24 })
  return {
    store: make(),
    async replacePersisted(record: CharacterProfile) { await domain.table('profiles').put(record.id, record) },
    async restart() {
      await domain.close(); await backend.close()
      backend = new JsonStorageBackend(root)
      const other = new Context()
      const otherStorageFiber = other.plugin(Storage)
      await otherStorageFiber
      cleanup.push(() => otherStorageFiber.dispose())
      other.storage.backend.register('json', backend)
      facility = new DomainFacility(other, { backend: 'json' })
      domain = await facility.open(roleplayDomainSpec)
      return make()
    },
  }
}

describe('durable roleplay ownership', () => {

  it.each(['missing-delta', 'malformed-scene', 'unsupported-path'] as const)('refuses %s in a reloaded revision before undo publishes changes', async (damage) => {
    const fixture = await harness()
    const profile = await fixture.store.create(card, player, 'Lin')
    const scene = await fixture.store.addConversation(profile.id, source())
    const saved = await fixture.store.model(profile.id, source(first, 'model'),
      { expectedRevision: scene.revision, deltas: { trust: 5 }, scene: { clothing: 'apron' } })
    const revision = saved.history.at(-1)!
    if (damage === 'missing-delta') revision.deltas = {}
    else revision.touched = [damage === 'malformed-scene' ? 'scene/' : 'player/background']
    await fixture.replacePersisted(saved)
    const restarted = await fixture.restart()
    await expect(restarted.undo(profile.id, source(), 10)).rejects.toThrow(
      damage === 'missing-delta' ? 'Missing roleplay state field' : 'Invalid recorded roleplay')
    expect(restarted.read(profile.id).revision).toBe(saved.revision)
    expect(restarted.read(profile.id).state.scenes[first]!.fields.clothing).toBe('apron')
  })

  it('reports an undo conflict when a persisted card omits a metric referenced by the reply', async () => {
    const fixture = await harness()
    const extended = { ...card, metrics: { ...card.metrics, patience: { min: 0, max: 100, initial: 40 } } }
    const profile = await fixture.store.create(extended, player, 'Lin')
    const scene = await fixture.store.addConversation(profile.id, source())
    const saved = await fixture.store.model(profile.id, source(first, 'model'),
      { expectedRevision: scene.revision, deltas: { patience: 5 } })
    saved.state.card.metrics = { ...card.metrics }
    await fixture.replacePersisted(saved)
    const restarted = await fixture.restart()
    const undone = await restarted.undo(profile.id, source(), 10)
    expect(undone.state.metrics.patience).toBe(45)
    expect(undone.conflicts.at(-1)!.reason).toBe('undo-card-change')
  })

  it('blocks both profiles named by a pending branch while unrelated portrayals remain usable', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const unrelated = await store.create(card, player, 'Other')
    await store.addConversation(unrelated.id, source(second))
    const childProfile = brandString<CharacterProfileId>('pending-child')
    const operation = brandString<RoleplayOperationId>('branch-intent')
    await store.prepare({ kind: 'branch', id: operation, profileId: profile.id, snapshotProfile: profile.id,
      sessionId: first, child: second, childProfile, revision: 0, atSeq: 0, fromScene: first })
    expect(() => { store.assertReady(profile.id) }).toThrow('requires recovery')
    expect(() => { store.assertReady(childProfile) }).toThrow('requires recovery')
    expect(store.context(unrelated.id, second).metrics.trust).toBe(30)
    await store.finish(operation)
    expect(() => { store.assertReady(profile.id) }).not.toThrow()
    expect(() => { store.assertReady(childProfile) }).not.toThrow()
  })

  it('initializes added card metrics once and retains reviewed or invalidated memories across later card updates', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const scene = await store.addConversation(profile.id, source())
    const written = await store.model(profile.id, source(first, 'model'), { expectedRevision: scene.revision,
      memory: { evidenceId: MessageId('card-evidence'), key: 'tea', text: 'jasmine', applicable: 'daily' } })
    const next = { ...card, metrics: { ...card.metrics, patience: { min: 0, max: 100, initial: 48 } } }
    const updated = await store.applyCard(profile.id, source(), next)
    expect(updated.state.metrics.patience).toBe(48)
    const reviewed = await store.applyCard(profile.id, source(), { ...next, content: 'Another version' })
    expect(Object.values(reviewed.state.memories)[0]!.status).toBe('review')
    const memory = Object.values(written.state.memories)[0]!
    await store.edit(profile.id, source(), { memory: { id: memory.id, status: 'invalid' } })
    const invalidated = await store.applyCard(profile.id, source(), { ...next,
      metrics: { ...next.metrics, patience: { min: 0, max: 100, initial: 99 } } })
    expect(invalidated.state.metrics.patience).toBe(48)
    expect(invalidated.state.memories[memory.id]!.status).toBe('invalid')
  })
  it('rejects unavailable profiles, revisions, fields and corrections without publishing a partial revision', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const baseline = await store.addConversation(profile.id, source())
    expect(store.list().map(value => value.id)).toEqual([profile.id])
    expect(() => store.read(brandString<CharacterProfileId>('missing'))).toThrow('Unknown character profile')
    expect(() => store.read(profile.id, 999)).toThrow('Unknown roleplay revision')
    await expect(store.addConversation(profile.id, source())).rejects.toThrow('already belongs')
    await expect(store.edit(profile.id, source(), { scene: { unknown: 'value' } })).rejects.toThrow('Unknown AI scene field')
    await expect(store.edit(profile.id, source(), { metrics: { unknown: 20 } })).rejects.toThrow('Missing roleplay state field')
    await expect(store.edit(profile.id, source(), { metrics: { trust: 101 } })).rejects.toThrow('outside its card range')
    await expect(store.model(profile.id, source(first, 'model'), { expectedRevision: baseline.revision, deltas: { trust: Number.POSITIVE_INFINITY } }))
      .rejects.toThrow('Relationship delta must be finite')
    await expect(store.edit(profile.id, source(), { resolveConflict: brandString<RoleplayOperationId>('missing') })).rejects.toThrow('Unknown conflict')
    expect(() => store.model(profile.id, source(), { expectedRevision: baseline.revision })).toThrow('model attribution')
    expect(() => store.edit(profile.id, source(first, 'model'), {})).toThrow('user attribution')
    expect(store.read(profile.id).revision).toBe(baseline.revision)
  })

  it('resolves retained conflicts and updates the fictional player without adding dialogue', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    await store.addConversation(profile.id, source())
    const stale = await store.model(profile.id, source(first, 'model'), { expectedRevision: 0, deltas: { trust: 5 } })
    const conflict = stale.conflicts[0]!
    const corrected = await store.edit(profile.id, source(), { resolveConflict: conflict.id,
      player: { name: 'Rain', appearance: 'red coat', background: 'Likes tea' } })
    expect(store.context(profile.id, first).conflicts).toEqual([])
    expect(corrected.state.player.name).toBe('Rain')
    expect(store.read(profile.id, stale.revision).conflicts[0]!.resolved).toBe(false)
  })

  it('restores prior memory and scene values when undo has no subsequent dependent edit', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const baseline = await store.addConversation(profile.id, source())
    const firstWrite = await store.model(profile.id, source(first, 'model', 10), { expectedRevision: baseline.revision,
      memory: { evidenceId: MessageId('evidence'), key: 'tea', text: 'green tea', applicable: 'daily' } })
    const updated = await store.model(profile.id, source(first, 'model', 20), { expectedRevision: firstWrite.revision,
      memory: { evidenceId: MessageId('new-evidence'), key: 'tea', text: 'jasmine tea', applicable: 'daily' }, scene: { clothing: 'apron' } })
    expect(Object.keys(updated.state.memories)).toEqual(Object.keys(firstWrite.state.memories))
    const undone = await store.undo(profile.id, source(), 20)
    expect(Object.values(undone.state.memories)[0]!.text).toBe('green tea')
    expect(undone.state.scenes[first]!.fields.clothing).toBe(card.scene.clothing)
    const repeated = await store.undo(profile.id, source(), 20)
    expect(repeated.state).toEqual(undone.state)
    const childId = brandString<CharacterProfileId>('stable-child')
    const child = await store.branch(profile.id, firstWrite.revision, second, first, childId)
    const restored = await store.branch(profile.id, updated.revision, second, first, childId)
    expect(restored).toEqual(child)
  })

  it('rejects growth beyond the configured profile limit without evicting retained history', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const baseline = await store.addConversation(profile.id, source())
    await expect(store.edit(profile.id, source(), { player: { ...player, background: 'x'.repeat(10_000_001) } }))
      .rejects.toThrow('configured byte limit')
    expect(store.read(profile.id)).toEqual(baseline)
  })

  it('rejects inherited member names as conversation and memory identities', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    await store.addConversation(profile.id, source())
    const inherited = brandString<SessionId>('constructor')
    expect(store.owner(inherited)).toBeUndefined()
    expect(() => store.context(profile.id, inherited)).toThrow('does not belong')
    await expect(store.edit(profile.id, source(), { memory: { id: brandString<RoleplayMemoryId>('constructor'), text: 'Changed' } }))
      .rejects.toThrow('Unknown memory')
    expect(store.read(profile.id).revision).toBe(1)
  })
  it('retains recovery intent across restart and excludes model progress until publication completes', async () => {
    const fixture = await harness()
    const profile = await fixture.store.create(card, player, 'Lin')
    await fixture.store.prepare({ kind: 'create', id: brandString<RoleplayOperationId>('create-scene'), profileId: profile.id, sessionId: first, child: first })
    const restarted = await fixture.restart()
    expect(restarted.pending()).toMatchObject([{ kind: 'create', child: first }])
    const sceneSource = { ...source(first), operation: brandString<RoleplayOperationId>('create-scene:scene') }
    const created = await restarted.addConversation(profile.id, sceneSource)
    const replayed = await restarted.addConversation(profile.id, sceneSource)
    expect(replayed.revision).toBe(created.revision)
    expect(() => restarted.context(profile.id, first)).toThrow(/requires recovery/)
    await expect(restarted.model(profile.id, source(first, 'model'), { expectedRevision: replayed.revision, deltas: { trust: 1 } })).rejects.toThrow(/requires recovery/)
    await restarted.finish(brandString<RoleplayOperationId>('create-scene'))
    expect(restarted.context(profile.id, first).metrics.trust).toBe(30)
  })

  it('admits only one concurrent lifecycle operation for a profile', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const results = await Promise.allSettled([first, second].map(sessionId => store.prepare({ kind: 'create',
      id: brandString<RoleplayOperationId>(sessionId), profileId: profile.id, sessionId, child: sessionId })))
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(store.pending()).toHaveLength(1)
  })
  it('shares selected memories and relationship while retaining independent scenes and profiles across restart', async () => {
    const fixture = await harness()
    const store = fixture.store
    const profile = await store.create(card, player, 'Lin')
    const independent = await store.create(card, player, 'Other Lin')
    await store.addConversation(profile.id, source(first))
    const baseline = await store.addConversation(profile.id, source(second), { clothing: 'coat' })
    const written = await store.model(profile.id, source(first, 'model'), { expectedRevision: baseline.revision,
      deltas: { affinity: 20 }, scene: { clothing: 'apron' }, memory: { evidenceId: MessageId('evidence'), key: 'tea', text: 'Player likes jasmine tea', applicable: 'ongoing' } })
    expect(written.state.metrics.affinity).toBe(100)
    const restarted = await fixture.restart()
    expect(restarted.context(profile.id, second)).toMatchObject({ scene: { clothing: 'coat' }, metrics: { affinity: 100 }, memories: [{ text: 'Player likes jasmine tea' }] })
    expect(restarted.read(profile.id, baseline.revision).state.memories).toEqual({})
    expect(restarted.read(independent.id).state.metrics.affinity).toBe(95)
    expect(restarted.read(independent.id).state.memories).toEqual({})
    await expect(restarted.model(independent.id, source(first, 'model'), { expectedRevision: 0, deltas: { trust: 1 } })).rejects.toThrow(/does not belong/)
  })

  it('retains concurrent conflicts and gives user corrections priority', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const baseline = await store.addConversation(profile.id, source())
    const changes = await Promise.all([
      store.model(profile.id, source(first, 'model'), { expectedRevision: baseline.revision, memory: { evidenceId: MessageId('evidence'), key: 'tea', text: 'green', applicable: '' } }),
      store.model(profile.id, source(first, 'model'), { expectedRevision: baseline.revision, memory: { evidenceId: MessageId('evidence'), key: 'tea', text: 'black', applicable: '' } }),
    ])
    expect(changes[1].conflicts).toMatchObject([{ reason: 'stale-revision' }])
    const memory = Object.values(changes[1].state.memories)[0]!
    const edited = await store.edit(profile.id, source(), { memory: { id: memory.id, text: 'jasmine' } })
    const attempted = await store.model(profile.id, source(first, 'model', 20), { expectedRevision: edited.revision,
      memory: { evidenceId: MessageId('evidence'), key: 'tea', text: 'black', applicable: '' } })
    expect(attempted.state.memories[memory.id]!.text).toBe('jasmine')
    expect(attempted.conflicts.at(-1)!.reason).toBe('user-correction')
  })

  it('deduplicates tools and blocks invalidated historical extraction after archival', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const baseline = await store.addConversation(profile.id, source())
    const origin = source(first, 'model')
    const change = { expectedRevision: baseline.revision, deltas: { trust: 5 }, memory: { evidenceId: MessageId('evidence'), key: 'tea', text: 'green', applicable: '' } }
    const written = await store.model(profile.id, origin, change)
    expect((await store.model(profile.id, origin, change)).revision).toBe(written.revision)
    const memory = Object.values(written.state.memories)[0]!
    const invalidated = await store.edit(profile.id, source(), { memory: { id: memory.id, status: 'invalid' } })
    await expect(store.model(profile.id, source(first, 'model'), { expectedRevision: invalidated.revision, memory: change.memory })).rejects.toThrow(/invalidated/)
    expect(store.context(profile.id, first).memories).toEqual([])
    await store.archive(profile.id, source(), true)
    expect(store.read(profile.id).state.memories[memory.id]).toBeDefined()
    expect(() => store.context(profile.id, first)).toThrow(/Archived/)
  })

  it('selectively undoes effective bounded deltas while keeping other conversations and manual edits', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    await store.addConversation(profile.id, source(first))
    const baseline = await store.addConversation(profile.id, source(second))
    const original = await store.model(profile.id, source(first, 'model'), { expectedRevision: baseline.revision,
      deltas: { affinity: 20, trust: 5 }, scene: { clothing: 'apron' }, memory: { evidenceId: MessageId('evidence'), key: 'promise', text: 'Cook together', applicable: '' } })
    const later = await store.model(profile.id, source(second, 'model', 40), { expectedRevision: original.revision,
      deltas: { affinity: -10 }, memory: { evidenceId: MessageId('evidence'), key: 'walk', text: 'Walk tomorrow', applicable: '' } })
    await store.edit(profile.id, source(first, 'user', 50), { scene: { clothing: 'coat' }, metrics: { trust: 77 } })
    const undone = await store.undo(profile.id, source(first, 'user', 60), 10)
    expect(undone.state.metrics).toEqual({ affinity: 85, trust: 77 })
    expect(undone.state.scenes[first]!.fields.clothing).toBe('coat')
    expect(Object.values(undone.state.memories).map(item => item.key)).toEqual(['walk'])
    expect(undone.conflicts.at(-1)!.reason).toBe('undo-later-change')
    expect(store.read(profile.id, later.revision).state.scenes[first]!.fields.clothing).toBe('apron')
  })

  it('branches from exact historical snapshots and applies card versions explicitly', async () => {
    const { store } = await harness()
    const profile = await store.create(card, player, 'Lin')
    const boundary = await store.addConversation(profile.id, source())
    const written = await store.model(profile.id, source(first, 'model'), { expectedRevision: boundary.revision,
      memory: { evidenceId: MessageId('evidence'), key: 'tea', text: 'green', applicable: '' } })
    const branch = await store.branch(profile.id, boundary.revision, second, first)
    expect(branch.state.memories).toEqual({})
    expect(branch.state.scenes[second]!.fields).toEqual(boundary.state.scenes[first]!.fields)
    const newCard = { ...card, content: 'Changed identity', version: brandString<CharacterCardVersion>('second'),
      scene: { ...card.scene, activity: 'reading' }, metrics: { ...card.metrics, trust: { min: 0, max: 25, initial: 10 } } }
    expect(store.read(profile.id).state.card.content).toBe(card.content)
    const applied = await store.applyCard(profile.id, source(), newCard)
    expect(Object.values(applied.state.memories)[0]!.status).toBe('review')
    expect(applied.state.scenes[first]!.fields).toEqual({ ...card.scene, activity: 'reading' })
    expect(applied.state.metrics.trust).toBe(25)
    expect(store.read(profile.id, written.revision).state.card.content).toBe(card.content)
    expect(store.read(branch.id).state.card.content).toBe(card.content)
  })
})
