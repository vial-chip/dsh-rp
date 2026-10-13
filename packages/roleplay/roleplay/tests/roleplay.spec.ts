import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { TestSessionQueryEngine } from '../../../session-query/session-query/tests/test-service.ts'
import { createAssistantMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import RoleplayService, { applyRoleplayEvent, roleplayProjectionDefinition } from '../src/index.ts'
import { DEFAULT_ROLEPLAY_CARD } from '../src/prompt.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function harness(preset = 'roleplay', config: ConstructorParameters<typeof RoleplayService>[1] = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(TestSessionQueryEngine, {})
  const fiber = await ctx.plugin(RoleplayService, config)
  const session = ctx.sessions.create(SessionId('roleplay-test'), { meta: { agentPreset: preset } })
  const queued: Parameters<Agent['followup']>[0][] = []
  const agent: Agent = {
    id: session.id, session, options: {}, inbox: createInboxStub(), ctx, status: 'idle',
    cancel() {}, whenIdle: () => Promise.resolve(),
    runMaintenance: task => task(new AbortController().signal),
    send() {}, followup: (message) => { queued.push(message) }, steer() {}, inject() {},
  }
  const close = await ctx.agents.register(agent)
  return { ctx, session, agent, queued, close, fiber }
}

function interaction(session: Awaited<ReturnType<typeof harness>>['session']) {
  session.append('system/message', { turn: 1, step: 0, message: createSystemMessage('固定设定') }, { surfaceOp: 'append' })
  session.append('turn/start', { turn: 1 })
  const input = createUserMessage({ content: [{ type: 'text', text: '一起做晚饭吧。' }], source: { kind: 'user' } })
  session.append('user/message', input, { surfaceOp: 'append' })
  session.append('roleplay/state', { category: 'relationship', values: { 好感: 12, 信任: 8 }, fields: ['好感', '信任'], source: 'model', turn: 1 })
  session.append('assistant/message', {
    turn: 1, step: 0, stream: [],
    message: createAssistantMessage({ content: [{ type: 'text', text: '好呀，我来洗菜。' }], source: { provider: 'test', model: 'test' } }),
  }, { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return input
}

describe('saved roleplay state', () => {
  it('enforces configured field limits and rejects updates outside an interaction', async () => {
    const { ctx, agent, session } = await harness('roleplay', { maxFields: 1, maxFieldLength: 2, maxTextLength: 3 })
    expect(() => { ctx.roleplay.edit(agent, 'world', { ' ': 'a' }) }).toThrow('字段名')
    expect(() => { ctx.roleplay.edit(agent, 'world', { abc: 'a' }) }).toThrow('字段名')
    expect(() => { ctx.roleplay.edit(agent, 'world', { a: 2 }) }).toThrow('状态描述')
    expect(() => { ctx.roleplay.update(agent, 'world', { a: 'b' }) }).toThrow('当前互动')
    expect(() => { ctx.roleplay.edit(agent, 'world', {}) }).toThrow('至少提供')
    ctx.roleplay.edit(agent, 'world', { a: 'b' })
    expect(() => { ctx.roleplay.edit(agent, 'world', { c: 'd' }) }).toThrow('数量限制')
    ctx.roleplay.edit(agent, 'relationship', { a: Number.MAX_VALUE })
    Object.defineProperty(agent, 'status', { value: 'running', configurable: true })
    expect(() => { ctx.roleplay.update(agent, 'relationship', { a: Number.MAX_VALUE }) }).toThrow('数值范围')
    ctx.roleplay.update(agent, 'world', { a: 'c' })
    expect(ctx.roleplay.read(agent, 'relationship')).toEqual({ a: Number.MAX_VALUE })
    expect(session.deriveMessages()).toEqual([])
  })

  it('reports missing character files and rejects retained closed agents', async () => {
    const { ctx, agent, close, fiber } = await harness()
    await expect(ctx.roleplay.selectCard(agent, 'missing')).rejects.toThrow('角色卡不存在')
    await expect(ctx.roleplay.selectCard(agent, 'roleplay-missing')).rejects.toThrow('角色卡不存在')
    const remove = ctx.skills.register({ name: 'roleplay-removed', description: '卡', content: '内容', source: 'runtime' })
    await ctx.roleplay.selectCard(agent, 'roleplay-removed')
    remove()
    await expect(ctx.roleplay.previewCard(agent)).rejects.toThrow('已不可用')
    await expect(ctx.systemPrompt.assemble({ agent })).rejects.toThrow('已不可用')
    const service = ctx.roleplay
    await close()
    expect(() => service.get(agent)).toThrow('已关闭')
    await fiber.dispose()
    expect(() => service.stateOf(agent.session)).toThrow('投影尚未注册')
  })

  it('rejects nonpositive deployment limits before registering the service', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    expect(() => new RoleplayService(ctx, { maxFields: 0 })).toThrow('正整数')
    const defaults = new Context()
    contexts.push(defaults)
    await defaults.plugin(SessionProjectionRegistry)
    await defaults.plugin(SessionStore)
    const service = new RoleplayService(defaults)
    const session = defaults.sessions.create(SessionId('direct-roleplay'), { meta: { agentPreset: 'roleplay' } })
    expect(service.stateOf(session)?.world).toEqual({})
  })
  it('previews current card content without freezing and retains first-send content afterward', async () => {
    const { ctx, agent, session } = await harness()
    expect(await ctx.roleplay.previewCard(agent)).toEqual(DEFAULT_ROLEPLAY_CARD)
    const remove = ctx.skills.register({ name: 'roleplay-neighbor', description: '邻居', content: '发送前的初稿。', source: 'runtime' })
    await ctx.roleplay.selectCard(agent, 'roleplay-neighbor')
    const before = session.snapshotEvents()
    expect((await ctx.roleplay.previewCard(agent)).content).toBe('发送前的初稿。')
    expect(session.snapshotEvents()).toEqual(before)
    expect(ctx.roleplay.get(agent)?.card).toBeNull()
    remove()
    const removeUpdated = ctx.skills.register({ name: 'roleplay-neighbor', description: '邻居', content: '发送时的角色设定。', source: 'runtime' })
    expect((await ctx.roleplay.previewCard(agent)).content).toBe('发送时的角色设定。')
    await ctx.systemPrompt.assemble({ agent })
    expect(ctx.roleplay.get(agent)?.card).toBeNull()
    Object.defineProperty(agent, 'status', { value: 'running' })
    await ctx.systemPrompt.assemble({ agent })
    removeUpdated()
    expect((await ctx.roleplay.previewCard(agent)).content).toBe('发送时的角色设定。')
    expect(session.snapshotEvents().filter(event => event.type === 'roleplay/card')).toHaveLength(1)
  })
  it('uses a card on the first assembly after switching a blank ordinary session', async () => {
    const { ctx, agent, session } = await harness('standard')
    session.append('agent-preset/selected', { agentPreset: 'roleplay' })
    ctx.skills.register({ name: 'roleplay-neighbor', description: '邻居', content: '你是邻居小陈。', source: 'runtime' })
    await ctx.roleplay.selectCard(agent, 'roleplay-neighbor')
    Object.defineProperty(agent, 'status', { value: 'running' })
    const first = await ctx.systemPrompt.assemble({ agent })
    expect(first.sections.map(section => section.text).join('\n')).toContain('你是邻居小陈。')
    expect(first.contexts).toEqual([])
    ctx.roleplay.edit(agent, 'world', { 天气: '细雨' })
    expect(await ctx.systemPrompt.assemble({ agent })).toEqual(first)
    expect(session.snapshotEvents().filter(event => event.type === 'roleplay/card')).toHaveLength(1)
  })
  it('keeps manual edits outside model history and returns only selected fields', async () => {
    const { ctx, agent, session } = await harness()
    ctx.roleplay.edit(agent, 'world', { 地点: '厨房', 天气: '细雨' })
    ctx.roleplay.edit(agent, 'clothing', { 上装: '围裙' })
    expect(session.deriveMessages()).toEqual([])
    expect(ctx.roleplay.read(agent, 'world', ['地点'])).toEqual({ 地点: '厨房' })
    expect(ctx.roleplay.read(agent, 'world', [])).toEqual({})
    expect(ctx.roleplay.read(agent, 'body')).toEqual({})
    expect(() => { ctx.roleplay.edit(agent, 'relationship', { 好感: '高' }) }).toThrow('关系指标必须为有限数值')
    expect(() => { ctx.roleplay.edit(agent, 'body', { 心情: '好'.repeat(2001) }) }).toThrow('长度限制')
    const before = session.snapshotEvents()
    expect(() => { ctx.roleplay.edit(agent, 'world', Object.fromEntries([['__proto__', '厨房']])) }).toThrow('状态字段名不能')
    expect(session.snapshotEvents()).toEqual(before)
  })

  it('exposes no roleplay panel for ordinary sessions', async () => {
    const { ctx, agent, session } = await harness('standard')
    expect(ctx.roleplay.get(agent)).toBeNull()
    expect(() => ctx.roleplay.read(agent, 'world')).toThrow('不是角色扮演模式')
    expect((await ctx.systemPrompt.assemble({ agent })).sections.some(section => section.name === 'roleplay:identity')).toBe(false)
    expect((await ctx.systemPrompt.assemble({})).sections.some(section => section.name === 'roleplay:identity')).toBe(false)
    expect(roleplayProjectionDefinition.wire.view(null)).toBeNull()
    expect(applyRoleplayEvent(null, session.append('turn/start', { turn: 1 }))).toBeNull()
  })

  it('assembles the bundled default and permits explicit default selection before sending', async () => {
    const { ctx, agent } = await harness()
    expect((await ctx.systemPrompt.assemble({ agent })).sections[0]?.text).toContain(DEFAULT_ROLEPLAY_CARD.content)
    await ctx.roleplay.selectCard(agent, DEFAULT_ROLEPLAY_CARD.name)
    const prompt = await ctx.systemPrompt.assemble({ agent })
    expect(prompt.sections[0]?.text).toContain(DEFAULT_ROLEPLAY_CARD.content)
  })

  it('selects available skill cards and refuses changes after freezing', async () => {
    const { ctx, agent, session } = await harness()
    ctx.skills.register({ name: 'roleplay-neighbor', description: '邻居', content: '你是成年邻居小陈。', source: 'runtime' })
    expect((await ctx.roleplay.listCards(agent)).map(card => card.name)).toEqual([DEFAULT_ROLEPLAY_CARD.name, 'roleplay-neighbor'])
    await ctx.roleplay.selectCard(agent, 'roleplay-neighbor')
    expect(ctx.roleplay.get(agent)?.selection).toBe('roleplay-neighbor')
    session.append('roleplay/card', { name: 'roleplay-neighbor', description: '邻居', content: '固定内容' })
    await expect(ctx.roleplay.selectCard(agent, DEFAULT_ROLEPLAY_CARD.name)).rejects.toThrow('首次发送后不能更换')
    await expect(ctx.roleplay.selectCard(agent, 'missing')).rejects.toThrow('首次发送后不能更换')
  })
})

describe('interaction withdrawal', () => {
  it('restores the actual human value when a later tool overwrote it in the withdrawn turn', async () => {
    const { ctx, agent, session } = await harness()
    ctx.roleplay.edit(agent, 'world', { 地点: '客厅' })
    session.append('turn/start', { turn: 1 })
    session.append('roleplay/state', { category: 'world', values: { 地点: '厨房' }, fields: ['地点'], source: 'model', turn: 1 })
    ctx.roleplay.edit(agent, 'world', { 地点: '阳台' })
    session.append('roleplay/state', { category: 'world', values: { 地点: '卧室' }, fields: ['地点'], source: 'model', turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.roleplay.undo(agent)
    expect(ctx.roleplay.read(agent, 'world')).toEqual({ 地点: '阳台' })
  })
  it('restores model fields and preserves later human edits, including after replay', async () => {
    const { ctx, agent, session } = await harness()
    ctx.roleplay.edit(agent, 'relationship', { 好感: 10, 信任: 5 })
    interaction(session)
    ctx.roleplay.edit(agent, 'relationship', { 好感: 20 })
    expect(await ctx.roleplay.undo(agent)).toEqual({ input: '一起做晚饭吧。' })
    expect(ctx.roleplay.read(agent, 'relationship')).toEqual({ 好感: 20, 信任: 5 })
    expect(session.deriveMessages().map(message => message.role)).toEqual(['system', 'user'])
    expect(session.deriveMessages().at(-1)?.content).toEqual([])
    expect(ctx.roleplay.get(agent)?.retractedTurns).toEqual([1])
    const replay = ctx.sessions.create(SessionId('replayed-roleplay'), { meta: { agentPreset: 'roleplay' }, seed: session.snapshotEvents() })
    expect(ctx.roleplay.stateOf(replay)).toEqual(ctx.roleplay.get(agent))
    expect(replay.deriveMessages()).toEqual(session.deriveMessages())
  })

  it('regenerates with a fresh input identity after withdrawing the old turn', async () => {
    const { ctx, agent, session, queued } = await harness()
    const input = interaction(session)
    await ctx.roleplay.regenerate(agent)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.content).toEqual(input.content)
    expect(queued[0]?.id).not.toBe(input.id)
    expect(session.deriveMessages().map(message => message.role)).toEqual(['system', 'user'])
    expect(session.deriveMessages().at(-1)?.content).toEqual([])
    expect(ctx.roleplay.read(agent, 'relationship')).toEqual({})
  })

  it('refuses withdrawal when no completed interaction exists', async () => {
    const { ctx, agent, session } = await harness()
    await expect(ctx.roleplay.undo(agent)).rejects.toThrow('没有可撤销')
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'blocked' } })
    await expect(ctx.roleplay.undo(agent)).rejects.toThrow('没有可撤销')
  })
})
