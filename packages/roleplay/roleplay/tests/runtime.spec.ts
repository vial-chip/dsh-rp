import { roleplayHarness } from './harness.ts'
import { join } from 'node:path'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import type { RoleplayOperationId } from '../src/types.ts'

describe('shipped roleplay preset composition', () => {
  it('keeps captured tool definitions bound to their profile and permits scene-only updates', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    const profile = await ctx.roleplay.store.create(await ctx.roleplay.cards.load('lin'), { name: 'Player', appearance: '', background: '' }, 'Tea')
    const id = SessionId('scoped-character')
    await ctx.roleplay.store.addConversation(profile.id, { sessionId: id, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('scoped-scene') })
    const adapter = new MockAdapter([
      toolCallResponse('read-scoped', 'roleplay_read', {}),
      toolCallResponse('scene-only', 'roleplay_update', { expectedRevision: 1, scene: { clothing: 'blue sweater' } }),
      textResponse('A quiet evening.'), 'hang',
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const create = (sessionId: ReturnType<typeof SessionId>) => ctx.agents.create({ sessionId, meta: { agentPreset: 'roleplay' },
      agentOptions: { provider: 'mock', model: 'mock' }, setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    const handle = await create(id)
    const read = ctx.tools.get('roleplay_read', handle.agent)!
    const update = ctx.tools.get('roleplay_update', handle.agent)!
    const executeRead = read.execute.bind(read)
    let captured: ToolRunContext | undefined
    const spy = vi.spyOn(read, 'execute').mockImplementation(async (args, exec) => { captured = exec; return executeRead(args, exec) })
    test.onTestFinished(() => { spy.mockRestore() })
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Stay here.' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    expect(ctx.roleplay.store.read(profile.id).state.scenes[id]!.fields.clothing).toBe('blue sweater')
    if (!captured) throw new Error('The real tool registry did not execute roleplay_read')
    const { agent: _agent, ...subjectless } = captured
    await expect(read.execute({}, subjectless)).rejects.toThrow('access denied')
    await expect(update.execute({ expectedRevision: 2 }, subjectless)).rejects.toThrow('require a conversation')
    const other = await ctx.roleplay.store.create(await ctx.roleplay.cards.load('lin'), profile.state.player, 'Other')
    const otherId = SessionId('other-scoped-character')
    await ctx.roleplay.store.addConversation(other.id, { sessionId: otherId, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('other-scene') })
    const foreign = await create(otherId)
    foreign.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Wait.' }], source: { kind: 'user' } }))
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(4) })
    await expect(read.execute({}, { ...captured, agent: foreign.agent })).rejects.toThrow('access denied')
    await expect(update.execute({ expectedRevision: 2 }, { ...captured, agent: foreign.agent })).rejects.toThrow('access denied')
    foreign.agent.cancel({ kind: 'user' })
    await foreign.agent.whenIdle()
    expect(ctx.roleplay.store.read(profile.id).revision).toBe(2)
    expect(ctx.roleplay.store.read(other.id).revision).toBe(1)
  })
  it('refuses an unbound roleplay Agent and an update outside an active reply', async (test) => {
    const { ctx } = await roleplayHarness(test)
    await expect(ctx.agents.create({ sessionId: SessionId('unbound-character'), meta: { agentPreset: 'roleplay' },
      agentOptions: { provider: 'mock', model: 'mock' }, setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } }))
      .rejects.toThrow('Select a character profile')
    const profile = await ctx.roleplay.store.create(await ctx.roleplay.cards.load('lin'), { name: 'Player', appearance: '', background: '' }, 'Tea')
    const id = SessionId('idle-character')
    await ctx.roleplay.store.addConversation(profile.id, { sessionId: id, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('idle-scene') })
    const handle = await ctx.agents.create({ sessionId: id, meta: { agentPreset: 'roleplay' }, agentOptions: { provider: 'mock', model: 'mock' },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    const result = await ctx.tools.execute({ agent: handle.agent, callId: ToolCallId('idle-update'), name: 'roleplay_update',
      arguments: { expectedRevision: 1, deltas: { trust: 5 } }, signal: new AbortController().signal })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('requires a current reply')
    expect(ctx.roleplay.store.read(profile.id).revision).toBe(1)
    expect(ctx.tools.get('roleplay_read', handle.agent)?.presentCall?.({})).toEqual({ card: 'generic', title: 'roleplay_read', kind: 'read' })
    expect(ctx.tools.get('roleplay_update', handle.agent)?.presentCall?.({}))
      .toEqual({ card: 'generic', title: 'roleplay_update', kind: 'other' })
  })
  it('searches only active profile memories and rejects invented conversation evidence atomically', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    const profile = await ctx.roleplay.store.create(await ctx.roleplay.cards.load('lin'), { name: 'Player', appearance: '', background: '' }, 'Tea')
    const id = SessionId('searchable-character')
    const user = createUserMessage({ content: [{ type: 'text', text: 'I like jasmine tea.' }], source: { kind: 'user' } })
    await ctx.roleplay.store.addConversation(profile.id, { sessionId: id, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('search-scene') })
    const adapter = new MockAdapter([
      toolCallResponse('save-tea', 'roleplay_update', { expectedRevision: 1,
        memory: { key: 'tea', text: 'Enjoys jasmine tea.', applicable: 'meals', evidenceId: user.id } }),
      toolCallResponse('search-tea', 'roleplay_read', { query: 'JASMINE' }),
      toolCallResponse('search-missing', 'roleplay_read', { query: 'coffee' }),
      toolCallResponse('invent-evidence', 'roleplay_update', { expectedRevision: 2, deltas: { trust: 50 },
        memory: { key: 'coffee', text: 'Enjoys coffee.', applicable: 'meals', evidenceId: 'invented-message' } }),
      textResponse('Shall I make jasmine tea?'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const handle = await ctx.agents.create({ sessionId: id, meta: { agentPreset: 'roleplay' }, agentOptions: { provider: 'mock', model: 'mock' },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    handle.agent.followup(user)
    await handle.agent.whenIdle()
    const results = handle.agent.session.snapshotEvents().filter(event => event.type === 'tool/result')
    const memoryId = Object.keys(ctx.roleplay.store.read(profile.id).state.memories)[0]
    expect(results[1]!.data.meta).toMatchObject({ roleplay: { memories: [{ id: memoryId }] } })
    expect(results[2]!.data.meta).toMatchObject({ roleplay: { memories: [] } })
    expect(results[3]!.data.message).toMatchObject({ isError: true })
    expect(JSON.stringify(results[3]!.data.message)).toContain('Memory evidence must name a user message')
    const saved = ctx.roleplay.store.read(profile.id)
    expect(saved.revision).toBe(2)
    expect(saved.state.metrics.trust).toBe(30)
    expect(Object.values(saved.state.memories).map(memory => memory.key)).toEqual(['tea'])
  })
  it('saves evidenced memories through model tools and retains user invalidation on another extraction', async (test) => {
    const { ctx, root } = await roleplayHarness(test)
    await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
    const profile = await ctx.roleplay.store.create(await ctx.roleplay.cards.load('lin'), { name: 'Player', appearance: '', background: '' }, 'Tea')
    const id = SessionId('evidenced-character')
    await ctx.roleplay.store.addConversation(profile.id, { sessionId: id, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('scene') })
    const input = createUserMessage({ content: [{ type: 'text', text: 'I like jasmine tea.' }], source: { kind: 'user' } })
    const memory = { key: 'tea', text: 'Player likes jasmine tea.', applicable: 'shared meals', evidenceId: input.id }
    const adapter = new MockAdapter([
      toolCallResponse('read', 'roleplay_read', {}),
      toolCallResponse('save', 'roleplay_update', { expectedRevision: 1, deltas: { trust: 5 }, memory }),
      textResponse('I will put the kettle on.'),
      () => toolCallResponse('reextract', 'roleplay_update', { expectedRevision: ctx.roleplay.store.read(profile.id).revision, memory }),
      textResponse('What would you prefer today?'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const handle = await ctx.agents.create({ sessionId: id, meta: { agentPreset: 'roleplay' }, agentOptions: { provider: 'mock', model: 'mock' },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    handle.agent.followup(input)
    await handle.agent.whenIdle()
    const results = handle.agent.session.snapshotEvents().filter(event => event.type === 'tool/result')
    expect(results.map(event => event.data.message), JSON.stringify(results))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ isError: true })]))
    const saved = ctx.roleplay.store.read(profile.id)
    expect(saved.state.metrics.trust).toBe(35)
    const entry = Object.values(saved.state.memories)[0]!
    expect(entry).toMatchObject({ ...memory, status: 'active', source: { actor: 'model', sessionId: id } })
    expect(results[0]!.data).toMatchObject({ meta: { roleplay: { profileId: profile.id, revision: 1 } } })
    expect(results[1]!.data).toMatchObject({ meta: { roleplay: { memories: [{ id: entry.id }] } } })
    await ctx.roleplay.store.edit(profile.id, { sessionId: id, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('invalidate') },
      { memory: { id: entry.id, status: 'invalid' } })
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Let us choose a drink.' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    expect(ctx.roleplay.store.context(profile.id, id).memories).toEqual([])
    expect(handle.agent.session.snapshotEvents().filter(event => event.type === 'tool/result').at(-1)?.data.message)
      .toMatchObject({ isError: true, content: [{ type: 'text' }] })
    expect(JSON.stringify(handle.agent.session.snapshotEvents().filter(event => event.type === 'tool/result').at(-1)?.data.message)).toContain('invalidated')
    expect(JSON.stringify(adapter.requests[2]!.messages)).toContain('Player likes jasmine tea.')
  })
  it('uses the real Loader and Agent loop, logs corrected state, and rejects work and absolute-value tool execution', async (test) => {
    const { ctx } = await roleplayHarness(test)
    ctx.systemPrompt.section({ name: 'work:instructions', order: 10, text: 'WORK INSTRUCTIONS MUST STAY PRIVATE' })
    ctx.systemPrompt.context({ name: 'work:cwd', order: 10, text: 'WORK DIRECTORY MUST STAY PRIVATE' })
    let workRuns = 0
    ctx.tools.register({ name: 'work_files', description: 'Work filesystem', parameters: { type: 'object' },
      output: { schema: { type: 'string' }, render: () => [] }, execute: async () => { workRuns++; return 'work' } })
    const card = await ctx.roleplay.cards.load('lin')
    const profile = await ctx.roleplay.store.create(card, { name: 'Player', appearance: '', background: '' }, 'Lin')
    const id = SessionId('character')
    const initial = await ctx.roleplay.store.addConversation(profile.id, { sessionId: id, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('first-scene') })
    const adapter = new MockAdapter([
      toolCallResponse('absolute', 'roleplay_update', { expectedRevision: initial.revision, metrics: { trust: 99 } }),
      toolCallResponse('work', 'work_files', {}), textResponse('Would you like some tea?'), textResponse('A quiet evening.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const handle = await ctx.agents.create({ sessionId: id, meta: { agentPreset: 'roleplay' }, agentOptions: { provider: 'mock', model: 'mock' },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'roleplay') } })
    const events: SessionEvent[] = []
    ctx.on('session/event', (session, event) => { if (session.id === id) events.push(event) })
    const send = async (text: string) => {
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
      await handle.agent.whenIdle()
    }
    await send('Hello')
    expect(workRuns).toBe(0)
    expect(ctx.roleplay.store.read(profile.id).state.metrics.trust).toBe(30)
    expect(adapter.requests[0]!.tools?.map(tool => tool.name)).toEqual(['roleplay_read', 'roleplay_update'])
    const text = JSON.stringify(adapter.requests[0]!.messages)
    expect(text).toContain('Lin')
    expect(text).not.toContain('WORK INSTRUCTIONS')
    expect(text).not.toContain('WORK DIRECTORY')
    expect(handle.agent.session.header.cwd).toBeUndefined()
    expect(events.filter(event => event.type === 'tool/result').map(event => event.data)).toHaveLength(2)
    const previousRequest = structuredClone(adapter.requests[0]!.messages)
    await ctx.roleplay.store.edit(profile.id, { sessionId: id, reply: 0, actor: 'user', operation: brandString<RoleplayOperationId>('human-edit') }, { scene: { clothing: 'blue sweater' }, metrics: { trust: 72 } })
    await send('Stay here for a moment')
    expect(JSON.stringify(adapter.requests.at(-1)!.messages)).toContain('blue sweater')
    expect(JSON.stringify(adapter.requests.at(-1)!.messages)).toContain('72')
    expect(adapter.requests[0]!.messages).toEqual(previousRequest)
    expect(events.some(event => event.type === 'roleplay/checkpoint')).toBe(true)
  })
})
