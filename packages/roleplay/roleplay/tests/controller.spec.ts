import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Workspace from '@deepseek-ai/dsh-workspace'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { RoleplayOperationId } from '../src/types.ts'
import Controller from '../src/controller.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { roleplayHarness } from './harness.ts'

describe('durable roleplay conversation lifecycle', () => {

  it('leaves an undo intent pending when its source scene is absent from persisted data', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(Workspace)
    await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
    const controller = ctx.plugin(Controller)
    await controller
    const profile = await ctx.roleplayController.createProfile('lin', { name: 'Rain', appearance: '', background: '' }, 'Lin')
    await ctx.roleplay.store.prepare({ kind: 'undo', id: brandString<RoleplayOperationId>('missing-scene'),
      profileId: profile.id, sessionId: SessionId('missing'), child: SessionId('replacement'), reply: 0 })
    await controller.dispose()
    await expect(ctx.plugin(Controller)).rejects.toThrow('Recovery source scene is missing')
    expect(ctx.roleplay.store.pending()).toHaveLength(1)
    expect(ctx.agents.get(SessionId('replacement')) === undefined).toBe(true)
  })


  it('refuses queued input and undoes a completed turn without player input', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(Workspace)
    await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
    await ctx.plugin(Controller)
    const profile = await ctx.roleplayController.createProfile('lin', { name: 'Rain', appearance: '', background: '' }, 'Lin')
    const conversation = SessionId('turn-without-player')
    await ctx.roleplay.store.addConversation(profile.id, { sessionId: conversation, reply: 0, actor: 'user',
      operation: brandString<RoleplayOperationId>('inputless-scene') })
    const handle = await ctx.agents.create({ sessionId: conversation, meta: { agentPreset: 'roleplay' },
      agentOptions: { provider: 'mock', model: 'mock' }, setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    handle.agent.inbox.append('next-turn', createUserMessage({ content: [{ type: 'text', text: 'Queued.' }], source: { kind: 'user' } }))
    await expect(ctx.roleplayController.undo(profile.id, conversation, false)).rejects.toThrow('queued messages')
    handle.agent.inbox.clear()
    handle.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await expect(ctx.roleplayController.undo(profile.id, conversation, false)).rejects.toThrow('No completed reply')
    const inputless = SessionId('inputless-turn')
    await ctx.roleplay.store.addConversation(profile.id, { sessionId: inputless, reply: 0, actor: 'user',
      operation: brandString<RoleplayOperationId>('inputless-conversation') })
    const other = await ctx.agents.create({ sessionId: inputless, meta: { agentPreset: 'roleplay' },
      agentOptions: { provider: 'mock', model: 'mock' }, setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    other.agent.session.append('turn/start', { turn: 1 })
    other.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const replacement = await ctx.roleplayController.undo(profile.id, inputless, true)
    expect(ctx.agents.get(replacement)!.status).toBe('idle')
    expect(ctx.roleplay.store.read(profile.id).state.scenes[inputless]!.archived).toBe(true)
  })

  it('rejects historical operations before a checkpoint or a completed locally owned reply exists', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(Workspace)
    await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
    await ctx.plugin(Controller)
    const profile = await ctx.roleplayController.createProfile('lin', { name: 'Rain', appearance: '', background: '' }, 'Lin')
    const conversation = SessionId('uncheckpointed-character')
    await ctx.roleplay.store.addConversation(profile.id, { sessionId: conversation, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('uncheckpointed-scene') })
    const handle = await ctx.agents.create({ sessionId: conversation, meta: { agentPreset: 'roleplay' },
      agentOptions: { provider: 'mock', model: 'mock' }, setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    const message = handle.agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Hello.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    await expect(ctx.roleplayController.branch(profile.id, conversation, message.seq)).rejects.toThrow('no character snapshot')
    await expect(ctx.roleplayController.undo(profile.id, conversation, false)).rejects.toThrow('latest completed reply')
    const flush = vi.spyOn(ctx.sessions, 'flush').mockResolvedValueOnce(false)
    test.onTestFinished(() => { flush.mockRestore() })
    await expect(ctx.roleplayController.edit(profile.id, conversation, { metrics: { trust: 72 } })).rejects.toThrow('requires Session persistence')
    expect(ctx.roleplay.store.read(profile.id).state.metrics.trust).toBe(72)
  })
  it('resumes persisted scenes after their Agent unloads without advancing them offline', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(Workspace)
    await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
    await ctx.plugin(Controller)
    const adapter = new MockAdapter([textResponse('First evening.'), textResponse('You returned.')])
    ctx.llm.registerAdapter(['mock'], adapter)
    const profile = await ctx.roleplayController.createProfile('lin', { name: 'Rain', appearance: '', background: '' }, 'Lin')
    const conversation = SessionId('persisted-character')
    await ctx.roleplay.store.addConversation(profile.id, { sessionId: conversation, reply: 0, actor: 'user',
      operation: brandString<RoleplayOperationId>('persisted-scene') })
    const handle = await ctx.agents.create({ sessionId: conversation, meta: { agentPreset: 'roleplay' },
      agentOptions: { provider: 'mock', model: 'mock' }, setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'A quiet evening.' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    await ctx.roleplayController.edit(profile.id, conversation, { metrics: { trust: 72 } })
    await handle.dispose()
    expect(ctx.agents.get(conversation) === undefined).toBe(true)
    expect(adapter.requests).toHaveLength(1)
    expect(ctx.roleplayController.read(profile.id).state.metrics.trust).toBe(72)
    await ctx.roleplayController.continueConversation(profile.id, conversation)
    await ctx.agents.get(conversation)!.whenIdle()
    expect(adapter.requests).toHaveLength(2)
    expect(JSON.stringify(adapter.requests[1]!.messages)).toContain('72')
  })
  it('exposes visible history, explicit card updates and reversible archival without generating extra dialogue', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(Workspace)
    await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
    await ctx.plugin(Controller)
    const adapter = new MockAdapter([toolCallResponse('read-context', 'roleplay_read', {}), textResponse('Tea is ready.')])
    ctx.llm.registerAdapter(['mock'], adapter)
    expect((await ctx.roleplayController.cards()).map(card => card.name)).toContain('lin')
    const profile = await ctx.roleplayController.createProfile('lin', { name: 'Rain', appearance: '', background: '' }, 'Lin')
    const conversation = await ctx.roleplayController.createConversation(profile.id, 'Make tea together.')
    await ctx.agents.get(conversation)!.whenIdle()
    expect(ctx.roleplayController.profiles().map(value => value.id)).toContain(profile.id)
    const history = await ctx.roleplayController.history(profile.id, conversation)
    expect(history.map(point => [point.kind, point.text])).toEqual([
      ['userMessage', 'Make tea together.'], ['assistantReply', 'Tea is ready.'],
    ])
    await expect(ctx.roleplayController.branch(profile.id, conversation, 999_999)).rejects.toThrow('does not exist')
    await expect(ctx.roleplayController.history(profile.id, SessionId('unowned'))).rejects.toThrow('does not belong')
    const updated = await ctx.roleplayController.applyCard(profile.id, conversation)
    expect(updated.state.card.version).toBe(profile.state.card.version)
    const corrected = await ctx.roleplayController.edit(profile.id, conversation, { metrics: { trust: 72 } })
    using observed = await ctx.sessionQuery.observeSession(conversation)
    const checkpoint = observed.events.findLast(event => event.type === 'roleplay/checkpoint')!
    expect(checkpoint).toMatchObject({ data: { revision: corrected.revision } })
    const branch = await ctx.roleplayController.branch(profile.id, conversation, checkpoint.seq)
    expect(ctx.roleplayController.read(branch.profileId).state.metrics.trust).toBe(72)
    const archived = await ctx.roleplayController.archive(profile.id, conversation, true)
    expect(archived.state.scenes[conversation]!.archived).toBe(true)
    await expect(ctx.roleplayController.continueConversation(profile.id, conversation)).rejects.toThrow('Archived')
    const restored = await ctx.roleplayController.archive(profile.id, conversation, false)
    expect(restored.state.scenes[conversation]!.archived).toBe(false)
    expect(ctx.workspaceRegistry.archivedSessionIds).not.toContain(conversation)
    expect(adapter.requests).toHaveLength(2)
  })

  it('rejects continuation and archival while a reply is running and refuses undo after interruption', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(Workspace)
    await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
    await ctx.plugin(Controller)
    const adapter = new MockAdapter(['hang'])
    ctx.llm.registerAdapter(['mock'], adapter)
    const profile = await ctx.roleplayController.createProfile('lin', { name: 'Rain', appearance: '', background: '' }, 'Lin')
    const conversation = await ctx.roleplayController.createConversation(profile.id)
    const agent = ctx.agents.get(conversation)!
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
    await expect(ctx.roleplayController.continueConversation(profile.id, conversation)).rejects.toThrow('current reply')
    await expect(ctx.roleplayController.archive(profile.id, conversation, true)).rejects.toThrow('Stop the current reply')
    agent.cancel({ kind: 'user' })
    await agent.whenIdle()
    await expect(ctx.roleplayController.undo(profile.id, conversation, false)).rejects.toThrow('latest completed reply')
    expect(ctx.roleplay.store.read(profile.id).state.scenes[conversation]!.archived).toBe(false)
  })

  it('recovers a failed Session flush without duplicating the scene or starting an offline reply', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(Workspace)
    await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
    const controller = ctx.plugin(Controller)
    await controller
    const adapter = new MockAdapter([textResponse('You explicitly continued.')])
    ctx.llm.registerAdapter(['mock'], adapter)
    const profile = await ctx.roleplayController.createProfile('lin', { name: 'Player', appearance: '', background: '' }, 'Lin')
    let created: AgentHandle | undefined
    const create = ctx.agents.create.bind(ctx.agents)
    const creation = vi.spyOn(ctx.agents, 'create').mockImplementationOnce(async (request) => {
      created = await create(request)
      return created
    })
    const flush = vi.spyOn(ctx.sessions, 'flush').mockResolvedValueOnce(false)
    test.onTestFinished(() => { flush.mockRestore(); creation.mockRestore() })
    await expect(ctx.roleplayController.createConversation(profile.id)).rejects.toThrow('requires Session persistence')
    const pending = ctx.roleplay.store.pending()
    expect(pending).toHaveLength(1)
    const sessionId = pending[0]!.sessionId
    const revision = ctx.roleplay.store.read(profile.id).revision
    expect(() => ctx.roleplay.store.context(profile.id, sessionId)).toThrow(/requires recovery/)
    await ctx.sessions.flush(ctx.agents.get(sessionId)!.session)
    await created!.dispose()
    await controller.dispose()
    await ctx.plugin(Controller)
    expect(ctx.roleplay.store.pending()).toEqual([])
    expect(ctx.roleplay.store.read(profile.id).revision).toBe(revision)
    expect(Object.keys(ctx.roleplay.store.read(profile.id).state.scenes)).toEqual([sessionId])
    expect(adapter.requests).toEqual([])
    await ctx.roleplayController.continueConversation(profile.id, sessionId)
    await ctx.agents.get(sessionId)!.whenIdle()
    expect(adapter.requests).toHaveLength(1)
  })
  it('publishes independent scenes, compensates only owned replies and seeds historical branches', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(Workspace)
    await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
    await ctx.plugin(Controller)
    const adapter = new MockAdapter([textResponse('Tea is ready.'), textResponse('Another evening.'), textResponse('A fresh reply.')])
    ctx.llm.registerAdapter(['mock'], adapter)
    const profile = await ctx.roleplayController.createProfile('lin', { name: 'Player', appearance: '', background: '' }, 'Lin')
    const first = await ctx.roleplayController.createConversation(profile.id)
    const original = ctx.agents.get(first)!
    await original.whenIdle()
    const second = await ctx.roleplayController.createConversation(profile.id, 'A different evening.')
    await ctx.agents.get(second)!.whenIdle()
    using observed = await ctx.sessionQuery.observeSession(first)
    const start = observed.events.find(event => event.type === 'turn/start')!
    const before = ctx.roleplay.store.read(profile.id)
    await ctx.roleplay.store.model(profile.id, { sessionId: first, actor: 'model', reply: start.seq, operation: brandString<RoleplayOperationId>('first-relationship') },
      { expectedRevision: before.revision, deltas: { trust: 5 }, scene: { clothing: 'apron' } })
    const later = ctx.roleplay.store.read(profile.id)
    await ctx.roleplay.store.model(profile.id, { sessionId: second, actor: 'model', reply: 99, operation: brandString<RoleplayOperationId>('second-relationship') },
      { expectedRevision: later.revision, deltas: { trust: 3 } })
    await ctx.roleplayController.edit(profile.id, first, { scene: { clothing: 'blue coat' } })
    const replacement = await ctx.roleplayController.undo(profile.id, first, true)
    await ctx.agents.get(replacement)!.whenIdle()
    const current = ctx.roleplayController.read(profile.id)
    expect(current.state.metrics.trust).toBe(33)
    expect(current.state.scenes[replacement]!.fields.clothing).toBe('blue coat')
    expect(current.state.scenes[first]!.archived).toBe(true)
    expect(ctx.workspaceRegistry.archivedSessionIds).toContain(first)
    expect(current.state.scenes[second]!.archived).toBe(false)
    expect(ctx.roleplay.store.pending()).toEqual([])
    expect(adapter.requests).toHaveLength(3)
    const completed = observed.events.find(event => event.type === 'turn/end')!
    const inheritedReply = await ctx.roleplayController.branch(profile.id, first, completed.seq)
    await expect(ctx.roleplayController.undo(inheritedReply.profileId, inheritedReply.sessionId, false))
      .rejects.toThrow('inherited reply')
    const checkpoint = observed.events.find(event => event.type === 'roleplay/checkpoint')!
    const branch = await ctx.roleplayController.branch(profile.id, first, checkpoint.seq)
    const separate = ctx.roleplayController.read(branch.profileId)
    expect(separate.state.metrics.trust).toBe(30)
    expect(separate.state.scenes[branch.sessionId]!.fields.clothing).toBe('soft cardigan and comfortable trousers')
    expect(adapter.requests).toHaveLength(3)
    expect(ctx.agents.get(branch.sessionId)!.session.header.cwd).toBeUndefined()
    using inherited = await ctx.sessionQuery.observeSession(replacement)
    expect(inherited.events.filter(event => event.type === 'assistant/message')).toHaveLength(1)
    expect(ctx.roleplay.store.read(profile.id).state.metrics.trust).toBe(33)
  })
})
