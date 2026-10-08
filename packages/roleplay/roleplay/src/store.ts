/** Atomic profile mutations, historical reads, and selective compensation. */
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { CharacterCard, CharacterProfile, CharacterProfileId, PlayerPersona, RoleplayContext, RoleplayLifecyclePlan, RoleplayMemoryId, RoleplayModelChange, RoleplayOperationId, RoleplaySource, RoleplayState, RoleplayUserChange } from './types.ts'

/** Deployment limits bound retained authoritative data and request selection. */
export interface RoleplayLimits { maxProfileBytes: number; maxSelectedMemories: number; maxEvidenceMessages: number }

/** Domain-backed operations; returned records are detached from authoritative storage. */
export class RoleplayStore {
  private preparation: Promise<void> = Promise.resolve()
  constructor(
    private readonly table: KvTable<CharacterProfileId, CharacterProfile>,
    private readonly lifecycle: KvTable<RoleplayOperationId, RoleplayLifecyclePlan>,
    private readonly limits: RoleplayLimits,
  ) {}

  /**
   * Read pending durable conversation operations.
   * @returns Detached recovery intents.
   */
  pending(): RoleplayLifecyclePlan[] { return [...this.lifecycle.entries()].map(([, value]) => structuredClone(value)) }

  /**
   * Retain an intent before changing a profile or Session.
   * @param plan Validated operation.
   * @returns Durable completion.
   */
  prepare(plan: RoleplayLifecyclePlan): Promise<void> {
    const result = this.preparation.then(async () => {
      this.assertReady(plan.profileId)
      await this.lifecycle.put(plan.id, plan)
    })
    this.preparation = result.catch((error: unknown) => {
      // The caller owns this failure; subsequent operations retain their queue access.
      void error
    })
    return result
  }

  /**
   * Remove an intent after every durable effect completes.
   * @param id Operation identity.
   * @returns Durable completion.
   */
  async finish(id: RoleplayOperationId): Promise<void> { await this.lifecycle.delete(id) }

  /**
   * Prevent user or model progress over incomplete conversation changes.
   * @param id Profile identity.
   */
  assertReady(id: CharacterProfileId): void {
    if (this.pending().some(plan => plan.profileId === id || (plan.kind === 'branch' && plan.childProfile === id))) {
      throw new Error('Character conversation operation requires recovery')
    }
  }

  /**
   * List detached profiles.
   * @returns Profiles in storage order.
   */
  list(): CharacterProfile[] { return [...this.table.entries()].map(([, value]) => structuredClone(value)) }

  /**
   * Read one profile or historical state.
   * @param id Profile identity.
   * @param revision Optional exact historical revision.
   * @returns Detached profile.
   */
  read(id: CharacterProfileId, revision?: number): CharacterProfile {
    const value = this.table.get(id)
    if (!value) throw new Error(`Unknown character profile: ${id}`)
    const result = structuredClone(value)
    if (revision !== undefined) {
      const entry = result.history.find(item => item.revision === revision)
      if (!entry) throw new Error(`Unknown roleplay revision: ${revision}`)
      result.state = entry.state
      result.revision = revision
      result.history = result.history.filter(item => item.revision <= revision)
      result.conflicts = entry.conflicts
    }
    return result
  }

  /**
   * Locate explicit conversation ownership.
   * @param sessionId Conversation identity.
   * @returns Profile identity when owned.
   */
  owner(sessionId: SessionId): CharacterProfileId | undefined {
    return [...this.table.entries()].find(([, profile]) => Object.hasOwn(profile.state.scenes, sessionId))?.[0]
  }

  /**
   * Create an independent portrayal from a saved card.
   * @param card Loaded card snapshot.
   * @param player Fictional player.
   * @param title Display title.
   * @returns Durable profile.
   */
  async create(card: CharacterCard, player: PlayerPersona, title: string): Promise<CharacterProfile> {
    const id = brandString<CharacterProfileId>(randomUUID())
    const state: RoleplayState = {
      card, player, metrics: Object.fromEntries(Object.entries(card.metrics).map(([key, metric]) => [key, metric.initial])),
      memories: {}, scenes: {}, blockedSources: [],
    }
    const source: RoleplaySource = { sessionId: brandString<SessionId>(id), reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>(randomUUID()) }
    const value: CharacterProfile = { id, title, revision: 0, state, conflicts: [], history: [
      { revision: 0, source, state: structuredClone(state), conflicts: [], touched: [], deltas: {}, undone: false },
    ] }
    this.bound(value)
    await this.table.put(id, value)
    return structuredClone(value)
  }

  /**
   * Add a scene without copying shared history into a conversation.
   * @param id Profile identity.
   * @param source Administrative source.
   * @param fields Optional opening overrides.
   * @returns Committed profile.
   */
  addConversation(id: CharacterProfileId, source: RoleplaySource, fields: Record<string, string> = {}): Promise<CharacterProfile> {
    return this.commit(id, source, (value, touched) => {
      if (Object.hasOwn(value.state.scenes, source.sessionId)) throw new Error('Conversation already belongs to this profile')
      validateFields(value.state.card, fields)
      value.state.scenes[source.sessionId] = { fields: { ...value.state.card.scene, ...fields }, archived: false }
      touched.push(`scene/${source.sessionId}`)
    })
  }

  /**
   * Apply an observed model update; stale writes retain a conflict without overwriting state.
   * @param id Profile identity.
   * @param source Model attribution.
   * @param change Deltas and scene or memory updates.
   * @returns Current committed profile, including conflicts.
   */
  model(id: CharacterProfileId, source: RoleplaySource, change: RoleplayModelChange): Promise<CharacterProfile> {
    if (source.actor !== 'model') throw new Error('Model updates require model attribution')
    return this.commit(id, source, (value, touched, deltas) => {
      this.assertReady(id)
      this.scene(value, source.sessionId)
      if (change.expectedRevision !== value.revision) {
        this.conflict(value, source, 'stale-revision', change)
        return
      }
      if (change.memory) {
        const memory = change.memory
        const prior = Object.values(value.state.memories).find(item => item.key === memory.key && item.status !== 'invalid')
        if (prior?.source.actor === 'user' && prior.text !== memory.text) {
          this.conflict(value, source, 'user-correction', change)
          return
        }
      }
      if (change.scene) {
        validateFields(value.state.card, change.scene)
        for (const [key, text] of Object.entries(change.scene)) {
          this.scene(value, source.sessionId).fields[key] = text
          touched.push(`scene/${source.sessionId}/${key}`)
        }
      }
      for (const [key, delta] of Object.entries(change.deltas ?? {})) {
        if (!Number.isFinite(delta)) throw new Error('Relationship delta must be finite')
        const metric = requiredEntry(value.state.card.metrics, key)
        const previous = requiredEntry(value.state.metrics, key)
        const next = clamp(previous + delta, metric.min, metric.max)
        value.state.metrics[key] = next
        deltas[key] = next - previous
        touched.push(`metric/${key}`)
      }
      if (change.memory) {
        const input = change.memory
        const blocked = memorySource(input.evidenceId, input.key)
        if (value.state.blockedSources.includes(blocked)) throw new Error('This memory source was invalidated')
        const previous = Object.values(value.state.memories).find(item => item.key === input.key && item.status !== 'invalid')
        const memoryId = previous?.id ?? brandString<RoleplayMemoryId>(randomUUID())
        value.state.memories[memoryId] = { id: memoryId, ...input, source, status: 'active' }
        touched.push(`memory/${memoryId}`)
      }
    })
  }

  /**
   * Edit saved values as an administrative correction.
   * @param id Profile identity.
   * @param source User attribution.
   * @param change Absolute edits.
   * @returns Committed profile.
   */
  edit(id: CharacterProfileId, source: RoleplaySource, change: RoleplayUserChange): Promise<CharacterProfile> {
    if (source.actor !== 'user') throw new Error('Administrative edits require user attribution')
    return this.commit(id, source, (value, touched) => {
      if (change.scene) {
        validateFields(value.state.card, change.scene)
        for (const [key, text] of Object.entries(change.scene)) {
          this.scene(value, source.sessionId).fields[key] = text
          touched.push(`scene/${source.sessionId}/${key}`)
        }
      }
      for (const [key, absolute] of Object.entries(change.metrics ?? {})) {
        const metric = requiredEntry(value.state.card.metrics, key)
        if (!Number.isFinite(absolute) || absolute < metric.min || absolute > metric.max) throw new Error(`Metric outside its card range: ${key}`)
        value.state.metrics[key] = absolute
        touched.push(`metric/${key}`)
      }
      if (change.player) { value.state.player = change.player; touched.push('player') }
      if (change.memory) {
        const memory = Object.hasOwn(value.state.memories, change.memory.id) ? value.state.memories[change.memory.id] : undefined
        if (!memory) throw new Error('Unknown memory')
        if (change.memory.status === 'invalid') value.state.blockedSources.push(memorySource(memory.evidenceId, memory.key))
        if (change.memory.text !== undefined) memory.text = change.memory.text
        if (change.memory.status !== undefined) memory.status = change.memory.status
        memory.source = source
        touched.push(`memory/${memory.id}`)
      }
      if (change.resolveConflict) {
        const conflict = value.conflicts.find(item => item.id === change.resolveConflict)
        if (!conflict) throw new Error('Unknown conflict')
        conflict.resolved = true
      }
    })
  }

  /**
   * Apply a card snapshot to future requests in every conversation.
   * @param id Profile identity.
   * @param source User attribution.
   * @param card Newly loaded definition.
   * @returns Committed profile with memories marked for review.
   */
  applyCard(id: CharacterProfileId, source: RoleplaySource, card: CharacterCard): Promise<CharacterProfile> {
    return this.commit(id, source, (value, touched) => {
      const metricKeys = new Set([...Object.keys(value.state.card.metrics), ...Object.keys(card.metrics)])
      for (const [sessionId, scene] of Object.entries(value.state.scenes)) {
        const fieldKeys = new Set([...Object.keys(scene.fields), ...Object.keys(card.scene)])
        scene.fields = Object.fromEntries(Object.entries(card.scene).map(([key, initial]) => [key, scene.fields[key] ?? initial]))
        touched.push(...[...fieldKeys].map(key => `scene/${sessionId}/${key}`))
      }
      value.state.card = card
      value.state.metrics = Object.fromEntries(Object.entries(card.metrics).map(([key, metric]) => [key,
        clamp(value.state.metrics[key] ?? metric.initial, metric.min, metric.max)]))
      for (const memory of Object.values(value.state.memories)) if (memory.status === 'active') memory.status = 'review'
      touched.push('card', ...[...metricKeys].map(key => `metric/${key}`), ...Object.keys(value.state.memories).map(key => `memory/${key}`))
    })
  }

  /**
   * Archive without removing shared contributions.
   * @param id Profile identity.
   * @param source User source naming the conversation.
   * @param archived Desired marker.
   * @returns Committed profile.
   */
  archive(id: CharacterProfileId, source: RoleplaySource, archived: boolean): Promise<CharacterProfile> {
    return this.commit(id, source, (value) => { this.scene(value, source.sessionId).archived = archived })
  }

  /**
   * Compensate a reply while preserving subsequent related edits and reporting conflicts.
   * @param id Profile identity.
   * @param source User operation.
   * @param reply Reply start event sequence.
   * @returns Committed profile.
   * @throws When retained revision paths or metric deltas are invalid.
   */
  undo(id: CharacterProfileId, source: RoleplaySource, reply: number): Promise<CharacterProfile> {
    return this.commit(id, source, (value, touched) => {
      const targets = value.history.filter(item => item.source.sessionId === source.sessionId && item.source.reply === reply && item.source.actor === 'model' && !item.undone)
      const targetIds = new Set(targets.map(item => item.source.operation))
      for (const entry of targets.toReversed()) {
        const before = this.read(id, entry.revision - 1).state
        for (const path of entry.touched) {
          const later = value.history.filter(item => item.revision > entry.revision && !item.undone
            && !targetIds.has(item.source.operation) && item.touched.includes(path))
          if (path.startsWith('metric/')) {
            const key = path.slice(7)
            if (later.some(item => item.source.actor === 'user')) continue
            const metric = value.state.card.metrics[key]
            if (!metric) { this.conflict(value, source, 'undo-card-change', path); continue }
            const current = requiredEntry(value.state.metrics, key)
            value.state.metrics[key] = clamp(current - requiredEntry(entry.deltas, key), metric.min, metric.max)
          } else if (later.length > 0) { this.conflict(value, source, 'undo-later-change', path); continue }
          else if (path.startsWith('memory/')) {
            const key = path.slice(7)
            const previous = before.memories[key]
            if (previous) value.state.memories[key] = structuredClone(previous)
            else value.state.memories = Object.fromEntries(Object.entries(value.state.memories).filter(([id]) => id !== key))
          } else if (path.startsWith('scene/')) {
            const [, sessionId, key] = path.split('/')
            if (!sessionId || !key) throw new Error('Invalid recorded roleplay scene path')
            const previous = requiredEntry(requiredEntry(before.scenes, sessionId).fields, key)
            requiredEntry(value.state.scenes, sessionId).fields[key] = previous
          } else throw new Error('Invalid recorded roleplay update path')
          touched.push(path)
        }
        entry.undone = true
      }
    })
  }

  /**
   * Copy an exact historical portrayal into a new profile.
   * @param id Original identity.
   * @param revision Exact checkpoint.
   * @param sessionId New conversation.
   * @param fromScene Original scene identity.
   * @param newId Stable identity for recovery; generated when omitted.
   * @returns Independent durable profile.
   */
  async branch(
    id: CharacterProfileId, revision: number, sessionId: SessionId, fromScene: SessionId,
    newId: CharacterProfileId = brandString<CharacterProfileId>(randomUUID()),
  ): Promise<CharacterProfile> {
    const existing = this.table.get(newId)
    if (existing) return structuredClone(existing)
    const old = this.read(id, revision)
    const state = old.state
    const scene = this.scene(old, fromScene)
    state.scenes = { [sessionId]: { ...scene, archived: false } }
    const source: RoleplaySource = { sessionId, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>(randomUUID()) }
    const result: CharacterProfile = { id: newId, title: old.title, revision: 0, state, conflicts: old.conflicts, history: [
      { revision: 0, source, state: structuredClone(state), conflicts: structuredClone(old.conflicts),
        touched: [], deltas: {}, undone: false },
    ] }
    this.bound(result)
    await this.table.put(newId, result)
    return structuredClone(result)
  }

  /**
   * Select active memories for one model request.
   * @param id Profile identity.
   * @param sessionId Owned conversation.
   * @returns Detached context snapshot.
   */
  context(id: CharacterProfileId, sessionId: SessionId): RoleplayContext {
    this.assertReady(id)
    const profile = this.read(id)
    const scene = this.scene(profile, sessionId)
    if (scene.archived) throw new Error('Archived roleplay conversation cannot advance')
    return { profileId: id, revision: profile.revision, card: profile.state.card, player: profile.state.player,
      scene: scene.fields, metrics: profile.state.metrics,
      memories: Object.values(profile.state.memories).filter(item => item.status === 'active').slice(-this.limits.maxSelectedMemories),
      conflicts: profile.conflicts.filter(item => !item.resolved) }
  }

  private commit(
    id: CharacterProfileId, source: RoleplaySource,
    mutate: (value: CharacterProfile, touched: string[], deltas: Record<string, number>) => void,
  ): Promise<CharacterProfile> {
    return this.table.update(id, (current) => {
      if (current.history.some(item => item.source.operation === source.operation)) return current
      const value = structuredClone(current)
      const touched: string[] = []
      const deltas: Record<string, number> = {}
      mutate(value, touched, deltas)
      value.revision += 1
      value.history.push({ revision: value.revision, source, state: structuredClone(value.state),
        conflicts: structuredClone(value.conflicts), touched, deltas, undone: false })
      this.bound(value)
      return value
    }).then(value => structuredClone(value))
  }

  private scene(profile: CharacterProfile, sessionId: SessionId) {
    const scene = Object.hasOwn(profile.state.scenes, sessionId) ? profile.state.scenes[sessionId] : undefined
    if (!scene) throw new Error('Conversation does not belong to this character profile')
    return scene
  }

  private conflict(value: CharacterProfile, source: RoleplaySource, reason: string, proposed: unknown) {
    value.conflicts.push({ id: source.operation, source, reason, proposed: JSON.stringify(proposed), resolved: false })
  }

  private bound(value: CharacterProfile) {
    if (Buffer.byteLength(JSON.stringify(value)) > this.limits.maxProfileBytes) throw new Error('Character profile exceeds configured byte limit')
  }
}

function memorySource(evidenceId: string, key: string): string { return JSON.stringify([evidenceId, key]) }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)) }
function validateFields(card: CharacterCard, fields: Record<string, string>) {
  for (const key of Object.keys(fields)) if (!Object.hasOwn(card.scene, key)) throw new Error(`Unknown AI scene field: ${key}`)
}

function requiredEntry<T>(record: Record<string, T>, key: string): T {
  const value = Object.hasOwn(record, key) ? record[key] : undefined
  if (value === undefined) throw new Error(`Missing roleplay state field: ${key}`)
  return value
}
