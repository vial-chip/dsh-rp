/** Typed Host administration and supported Session lifecycle for roleplay. */
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Agent, AgentSetup } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-workspace'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionLogOffset, SessionSeq, type SessionEvent, type SessionId } from '@deepseek-ai/dsh-session'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from './index.ts'
import type { CharacterCard, CharacterProfile, CharacterProfileId, PlayerPersona, RoleplayHistoryPoint, RoleplayLifecyclePlan, RoleplayOperationId, RoleplaySource, RoleplayUserChange } from './types.ts'

declare module '@deepseek-ai/cordis' { interface Context { roleplayController: RoleplayController } }

/** Roleplay-only administrative Remote namespace. */
export class RoleplayController extends TypertRemoteService {
  static inject = ['roleplay', 'agents', 'agentPresets', 'agentDefaultModel', 'sessionQuery', 'workspaceRegistry', 'sessions']
  constructor(ctx: Context) { super(ctx, 'roleplayController', { namespace: 'roleplay' }) }

  protected async [Service.init](): Promise<void> {
    for (const plan of this.ctx.roleplay.store.pending()) await this.recover(plan)
  }

  /**
   * Discover roleplay cards only.
   * @returns Current local card snapshots.
   */
  @Remote('cards')
  cards(): Promise<CharacterCard[]> { return this.ctx.roleplay.cards.list() }

  /**
   * List independent portrayals and their conversations.
   * @returns Detached durable records.
   */
  @Remote('profiles')
  profiles(): CharacterProfile[] { return this.ctx.roleplay.store.list() }

  /**
   * Read all saved state, memory sources, conflicts and revisions.
   * @param id Profile identity.
   * @returns Detached record.
   */
  @Remote('read')
  read(id: CharacterProfileId): CharacterProfile { return this.ctx.roleplay.store.read(id) }

  /** List visible historical messages for selecting a branch.
   * @param id Profile identity.
   * @param sessionId Owned conversation.
   * @returns Message previews with exact log positions.
   */
  @Remote('history')
  async history(id: CharacterProfileId, sessionId: SessionId): Promise<RoleplayHistoryPoint[]> {
    this.requireOwner(id, sessionId)
    using observed = await this.ctx.sessionQuery.observeSession(sessionId)
    const points: RoleplayHistoryPoint[] = []
    for (const event of observed.events) {
      if (event.type === 'user/message' && event.data.source.kind === 'user') {
        points.push({ seq: event.seq, kind: 'userMessage',
          text: event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n') })
      } else if (event.type === 'assistant/message') {
        const text = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
        if (text) points.push({ seq: event.seq, kind: 'assistantReply', text })
      }
    }
    return points
  }

  /**
   * Create an independent portrayal bound to the current file version.
   * @param cardName Local skill name.
   * @param player Player's fictional identity.
   * @param title Profile title.
   * @returns Durable profile.
   */
  @Remote('createProfile')
  async createProfile(cardName: string, player: PlayerPersona, title: string): Promise<CharacterProfile> {
    return this.ctx.roleplay.store.create(await this.ctx.roleplay.cards.load(cardName), player, title)
  }

  /**
   * Start an independent scene in an existing portrayal.
   * @param id Profile identity.
   * @param opening Optional player-authored situation.
   * @returns Published conversation identity.
   */
  @Remote('createConversation')
  async createConversation(id: CharacterProfileId, opening?: string): Promise<SessionId> {
    const sessionId = brandString<SessionId>(`roleplay-${randomUUID()}`)
    const plan: RoleplayLifecyclePlan = { kind: 'create', id: brandString<RoleplayOperationId>(randomUUID()), profileId: id, sessionId, child: sessionId }
    await this.ctx.roleplay.store.prepare(plan)
    await this.recover(plan)
    const agent = await this.agent(sessionId)
    const profile = this.read(id)
    const situation = opening?.trim() || profile.state.card.opening
    agent.followup(createUserMessage({ content: [{ type: 'text', text: situation }], source: { kind: 'user' } }))
    return sessionId
  }

  /**
   * Apply administrative values without adding fictional dialogue.
   * @param id Profile identity.
   * @param sessionId Owned conversation.
   * @param change User corrections.
   * @returns Durable profile.
   */
  @Remote('edit')
  async edit(id: CharacterProfileId, sessionId: SessionId, change: RoleplayUserChange): Promise<CharacterProfile> {
    this.requireOwner(id, sessionId)
    const profile = await this.ctx.roleplay.store.edit(id, userSource(sessionId), change)
    await this.checkpoint(profile, sessionId)
    return profile
  }

  /**
   * Explicitly update this portrayal's bound card version.
   * @param id Profile identity.
   * @param sessionId Owned conversation.
   * @returns Profile with active memories awaiting review.
   */
  @Remote('applyCard')
  async applyCard(id: CharacterProfileId, sessionId: SessionId): Promise<CharacterProfile> {
    this.requireOwner(id, sessionId)
    const card = await this.ctx.roleplay.cards.load(this.read(id).state.card.name)
    const profile = await this.ctx.roleplay.store.applyCard(id, userSource(sessionId), card)
    await this.checkpoint(profile, sessionId)
    return profile
  }

  /**
   * Advance only after an explicit user continuation.
   * @param id Profile identity.
   * @param sessionId Owned conversation.
   * @returns Accepted conversation identity.
   */
  @Remote('continue')
  async continueConversation(id: CharacterProfileId, sessionId: SessionId): Promise<SessionId> {
    this.requireOwner(id, sessionId)
    this.ctx.roleplay.store.context(id, sessionId)
    const agent = await this.agent(sessionId)
    if (agent.status !== 'idle') throw new Error('Wait for the current reply before continuing')
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Continue the current scene.' }], source: { kind: 'user' } }))
    return sessionId
  }

  /**
   * Archive without deleting shared memories.
   * @param id Profile identity.
   * @param sessionId Conversation identity.
   * @param archived Desired marker.
   * @returns Committed profile.
   */
  @Remote('archive')
  async archive(id: CharacterProfileId, sessionId: SessionId, archived: boolean): Promise<CharacterProfile> {
    this.requireOwner(id, sessionId)
    const agent = this.ctx.agents.get(sessionId)
    if (agent?.status === 'running') throw new Error('Stop the current reply before archiving')
    const plan: RoleplayLifecyclePlan = { kind: 'archive', id: brandString<RoleplayOperationId>(randomUUID()), profileId: id, sessionId, archived }
    await this.ctx.roleplay.store.prepare(plan)
    await this.recover(plan)
    return this.read(id)
  }

  /**
   * Branch an exact log node into an independent portrayal.
   * @param id Source profile.
   * @param sessionId Source conversation.
   * @param atSeq Selected event.
   * @returns New portrayal and conversation.
   */
  @Remote('branch')
  async branch(id: CharacterProfileId, sessionId: SessionId, atSeq: number): Promise<{
    profileId: CharacterProfileId
    sessionId: SessionId
  }> {
    this.requireOwner(id, sessionId)
    using observed = await this.ctx.sessionQuery.observeSession(sessionId)
    const seq = SessionSeq(atSeq)
    if (!observed.events[seq]) throw new Error('Branch event does not exist')
    const checkpoint = observed.events.slice(0, seq + 1).findLast(event => event.type === 'roleplay/checkpoint')
    if (checkpoint?.type !== 'roleplay/checkpoint') throw new Error('Branch point has no character snapshot')
    const child = brandString<SessionId>(`roleplay-${randomUUID()}`)
    const plan: RoleplayLifecyclePlan = { kind: 'branch', id: brandString<RoleplayOperationId>(randomUUID()), profileId: id, snapshotProfile: checkpoint.data.profileId,
      sessionId, child, childProfile: brandString<CharacterProfileId>(randomUUID()), revision: checkpoint.data.revision,
      atSeq, fromScene: checkpoint.data.sessionId }
    await this.ctx.roleplay.store.prepare(plan)
    await this.recover(plan)
    return { profileId: plan.childProfile, sessionId: child }
  }

  /**
   * Replace the latest completed reply after selective data compensation. The original append-only Session remains archived.
   * @param id Profile identity.
   * @param sessionId Source conversation.
   * @param regenerate Whether to replay its user input.
   * @returns Replacement conversation in the same portrayal.
   */
  @Remote('undo')
  async undo(id: CharacterProfileId, sessionId: SessionId, regenerate: boolean): Promise<SessionId> {
    this.requireOwner(id, sessionId)
    const agent = await this.agent(sessionId)
    return agent.runMaintenance(async () => {
      if (agent.inbox.nextTurn.length || agent.inbox.nextStep.length) throw new Error('Wait for queued messages before undoing a reply')
      using observed = await this.ctx.sessionQuery.observeSession(sessionId)
      const events = observed.events
      const end = events.findLast(event => event.type === 'turn/end')
      if (!end || end.data.reason.kind !== 'completed' || events.slice(end.seq + 1).some(event => event.type === 'turn/start')) throw new Error('Only the latest completed reply can be undone')
      const start = events.slice(0, end.seq + 1).findLast(event => event.type === 'turn/start')
      if (!start) throw new Error('No completed reply to undo')
      if (start.seq < observed.inheritedEventCount) throw new Error('An inherited reply cannot be undone in this conversation')
      const input = events.slice(start.seq, end.seq + 1).find(event => event.type === 'user/message' && event.data.source.kind === 'user')
      const child = brandString<SessionId>(`roleplay-${randomUUID()}`)
      const plan: RoleplayLifecyclePlan = { kind: 'undo', id: brandString<RoleplayOperationId>(randomUUID()), profileId: id, sessionId, child, reply: start.seq }
      await this.ctx.roleplay.store.prepare(plan)
      await this.recover(plan)
      const replacement = await this.agent(child)
      if (regenerate && input?.type === 'user/message') replacement.followup(createUserMessage({ content: input.data.content, source: input.data.source }))
      return child
    })
  }

  private requireOwner(id: CharacterProfileId, sessionId: SessionId): void {
    this.ctx.roleplay.store.assertReady(id)
    if (this.ctx.roleplay.store.owner(sessionId) !== id) throw new Error('Conversation does not belong to this character profile')
  }

  private async checkpoint(profile: CharacterProfile, sessionId: SessionId): Promise<void> {
    const agent = await this.agent(sessionId)
    agent.session.append('roleplay/checkpoint', { profileId: profile.id, revision: profile.revision, sessionId })
    if (!await this.ctx.sessions.flush(agent.session)) throw new Error('Roleplay conversation requires Session persistence')
  }

  private async recover(plan: RoleplayLifecyclePlan): Promise<void> {
    const store = this.ctx.roleplay.store
    const source = (sessionId: SessionId, stage: string): RoleplaySource => ({ sessionId, reply: 0, actor: 'user',
      operation: brandString<RoleplayOperationId>(`${plan.id}:${stage}`) })
    if (plan.kind === 'archive') {
      if (plan.archived) await this.ctx.workspaceRegistry.archiveSession(plan.sessionId)
      else await this.ctx.workspaceRegistry.unarchiveSession(plan.sessionId)
      await store.archive(plan.profileId, source(plan.sessionId, 'archive'), plan.archived)
      await store.finish(plan.id)
      return
    }
    let seed: readonly SessionEvent[] | undefined
    let inheritedCount = 0
    let profileId = plan.profileId
    if (plan.kind === 'create') {
      await store.addConversation(profileId, source(plan.child, 'scene'))
    } else if (plan.kind === 'branch') {
      await store.branch(plan.snapshotProfile, plan.revision, plan.child, plan.fromScene, plan.childProfile)
      profileId = plan.childProfile
      using observed = await this.ctx.sessionQuery.observeSession(plan.sessionId)
      seed = buildForkSeed(observed.events, SessionSeq(plan.atSeq))
      inheritedCount = plan.atSeq + 1
    } else {
      await store.undo(profileId, source(plan.sessionId, 'undo'), plan.reply)
      const scene = store.read(profileId).state.scenes[plan.sessionId]
      if (!scene) throw new Error('Recovery source scene is missing')
      await store.addConversation(profileId, source(plan.child, 'scene'), scene.fields)
      using observed = await this.ctx.sessionQuery.observeSession(plan.sessionId)
      const prefix = observed.events.slice(0, plan.reply)
      seed = prefix.length ? buildForkSeed(prefix, SessionSeq(prefix.length - 1)) : undefined
      inheritedCount = prefix.length
    }
    const known = await this.ctx.sessionQuery.filterSessions([{ kind: 'id', values: [plan.child] }])
    const agent = this.ctx.agents.get(plan.child) ?? (known.length ? await this.agent(plan.child)
      : await this.createAgent(plan.child, seed, seed ? plan.sessionId : undefined, inheritedCount))
    agent.session.append('roleplay/checkpoint', { profileId, revision: store.read(profileId).revision, sessionId: plan.child })
    if (!await this.ctx.sessions.flush(agent.session)) throw new Error('Roleplay conversation requires Session persistence')
    if (plan.kind === 'undo') {
      await this.ctx.workspaceRegistry.archiveSession(plan.sessionId)
      await store.archive(profileId, source(plan.sessionId, 'archive'), true)
    }
    await store.finish(plan.id)
  }

  private async agent(sessionId: SessionId): Promise<Agent> {
    const live = this.ctx.agents.get(sessionId)
    if (live) return live
    return (await this.ctx.agents.resume({ resumeSessionId: sessionId, setup: this.setup(),
      agentOptions: this.ctx.agentDefaultModel.currentSelection() })).agent
  }

  private setup(clearInheritedInput = false): AgentSetup {
    return async (agentCtx, agent) => {
      await this.ctx.agentPresets.mount(agentCtx, 'roleplay')
      if (clearInheritedInput) agent.inbox.clear()
    }
  }

  private async createAgent(
    sessionId: SessionId, seed?: readonly SessionEvent[], parentSession?: SessionId, inheritedCount = 0,
  ): Promise<Agent> {
    return (await this.ctx.agents.create({ sessionId,
      ...(seed === undefined ? {} : { seed, inheritedEventCount: SessionLogOffset(inheritedCount) }),
      meta: { agentPreset: 'roleplay', ...(parentSession === undefined ? {} : { parentSession, isSeeded: true }) },
      setup: this.setup(seed !== undefined), agentOptions: this.ctx.agentDefaultModel.currentSelection(),
    })).agent
  }
}

function userSource(sessionId: SessionId): RoleplaySource {
  return { sessionId, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>(randomUUID()) }
}

export default RoleplayController
