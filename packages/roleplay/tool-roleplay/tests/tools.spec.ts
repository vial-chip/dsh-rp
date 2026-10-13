import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader, { EntryTree } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { createScope } from '@deepseek-ai/dsh-scope'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import Roleplay from '@deepseek-ai/dsh-roleplay'
import * as entries from '../src/index.ts'

let context: Context | undefined
let directory: string | undefined
const agentDisposers = new Map<Agent, Awaited<ReturnType<Context['effect']>>>()

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  agentDisposers.clear()
  vi.restoreAllMocks()
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

async function boot(disabled?: string): Promise<Context> {
  directory = await mkdtemp(join(tmpdir(), 'dsh-roleplay-tools-'))
  const path = join(directory, 'cordis.yml')
  await writeFile(path, [
    "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-query'",
    "- name: '@deepseek-ai/dsh-skill'",
    "- name: '@deepseek-ai/dsh-roleplay'",
    ...Object.keys(entries).flatMap(key => [
      `- name: '@deepseek-ai/dsh-tool-roleplay/${key.replace('_', '-')}'`,
      ...key === disabled ? ['  disabled: true'] : [],
    ]), '',
  ].join('\n'))
  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(directory).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-query', SessionQuery],
    ['@deepseek-ai/dsh-skill', SkillRegistry],
    ['@deepseek-ai/dsh-roleplay', Roleplay],
    ...Object.entries(entries).map(([key, value]): [string, unknown] => [
      `@deepseek-ai/dsh-tool-roleplay/${key.replace('_', '-')}`, value,
    ]),
  ])
  // The Loader method needs each intercepted EntryTree as its receiver.
  // oxlint-disable-next-line typescript/unbound-method
  const importModule = EntryTree.prototype.import
  vi.spyOn(EntryTree.prototype, 'import').mockImplementation(function (this: EntryTree, specifier, stack) {
    if (specifier.startsWith('cordis:')) {
      const loaded: unknown = importModule.call(this, specifier, stack)
      return loaded
    }
    if (!modules.has(specifier)) throw new Error(`Unexpected Loader module: ${specifier}`)
    return modules.get(specifier)
  })
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return ctx
}

async function agent(ctx: Context, preset = 'roleplay'): Promise<Agent> {
  const scopeOwner = await ctx.plugin({ inject: ['systemPrompt', 'tools'], apply() {} })
  const id = SessionId(`roleplay-tools-${ctx.agents.list().length}`)
  const session = ctx.sessions.create(id, { meta: { agentPreset: preset } })
  const value: Agent = {
    id, session, options: {}, inbox: unsupportedInbox(), status: 'running', ctx: scopeOwner.ctx,
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  const scope = createScope(scopeOwner.ctx, value)
  Object.assign(value, { ctx: scope.ctx })
  agentDisposers.set(value, await ctx.agents.register(value))
  return value
}

function execute(ctx: Context, owner: Agent | undefined, name: string, args: unknown, signal = new AbortController().signal) {
  return ctx.tools.execute({
    signal, callId: ToolCallId(name), name: `roleplay_${name}`, arguments: args,
    ...owner === undefined ? {} : { agent: owner },
  })
}

describe('independent roleplay tools through the real Loader', () => {
  it('writes only one category, reads selected fields, and keeps confirmations compact', async () => {
    const ctx = await boot()
    const owner = await agent(ctx)
    for (const [category, field, value, label] of [
      ['world', '地点', '厨房', '世界'], ['body', '情绪', '开心', '身体'], ['clothing', '上衣', '白衬衫', '服饰'],
    ] as const) {
      const result = await execute(ctx, owner, `${category}_update`, { changes: [{ field, value }] })
      expect(result.isError).toBe(false)
      expect(result.value).toBe(`已更新${label}。`)
      expect(result.content).toEqual([{ type: 'text', text: `已更新${label}。` }])
      const update = ctx.tools.get(`roleplay_${category}_update`, owner)!
      const input = { changes: [{ field, value }] }
      expect(update.presentCall?.(input)).toEqual({ card: 'generic', title: `更新${label}`, kind: 'other', rawInput: input })
      expect(update.presentResult?.(input, result)).toEqual({ card: 'generic', title: `更新${label}`, content: result.content })
      expect((await execute(ctx, owner, `${category}_read`, { fields: [field, '未记录'] })).value).toEqual({ [field]: value })
    }
    await execute(ctx, owner, 'world_update', { changes: [{ field: '天气', value: '晴' }] })
    expect((await execute(ctx, owner, 'world_read', { fields: ['地点'] })).value).toEqual({ 地点: '厨房' })
    expect((await execute(ctx, owner, 'world_read', {})).value).toEqual({ 地点: '厨房', 天气: '晴' })
    expect((await execute(ctx, owner, 'world_read', { fields: [] })).value).toEqual({})
    expect(ctx.roleplay.read(owner, 'body')).toEqual({ 情绪: '开心' })
    const before = ctx.tools.schemas()
    ctx.roleplay.edit(owner, 'world', { 地点: '客厅' })
    expect(ctx.tools.schemas()).toEqual(before)
    expect((await execute(ctx, owner, 'world_update', { changes: [{ field: '时间', value: '午后' }] })).content)
      .toEqual([{ type: 'text', text: '已更新世界。' }])
    expect((await execute(ctx, owner, 'world_read', { fields: ['地点'] })).content)
      .toEqual([{ type: 'text', text: '{"地点":"客厅"}' }])
  })

  it('adds relationship deltas without returning or accepting an absolute replacement', async () => {
    const ctx = await boot()
    const owner = await agent(ctx)
    ctx.roleplay.edit(owner, 'relationship', { 好感: 10 })
    expect((await execute(ctx, owner, 'relationship_update', { changes: [{ field: '好感', delta: 2 }] })).value)
      .toBe('已更新关系。')
    await execute(ctx, owner, 'relationship_update', { changes: [{ field: '好感', delta: -3 }, { field: '信任', delta: 4 }] })
    expect((await execute(ctx, owner, 'relationship_read', { fields: ['好感'] })).value).toEqual({ 好感: 9 })
    expect((await execute(ctx, owner, 'relationship_update', { changes: [{ field: '好感', value: 20 }] })).isError).toBe(true)
    expect(ctx.roleplay.read(owner, 'relationship')).toEqual({ 好感: 9, 信任: 4 })
  })

  it('rejects empty or duplicate changes and calls without a session before writing', async () => {
    const ctx = await boot()
    const owner = await agent(ctx)
    for (const changes of [[], [{ field: '地点', value: '厨房' }, { field: '地点', value: '客厅' }]]) {
      const result = await execute(ctx, owner, 'world_update', { changes })
      expect(result.isError).toBe(true)
      const first = result.content[0]
      expect(first?.type).toBe('text')
      if (first?.type === 'text') expect(first.text).toMatch(/请至少|重复/)
    }
    const missingOwner = (await execute(ctx, undefined, 'world_read', {})).content[0]
    expect(missingOwner?.type).toBe('text')
    if (missingOwner?.type === 'text') expect(missingOwner.text).toContain('unknown tool')
    const read = ctx.tools.get('roleplay_world_read', owner)!
    ctx.tools.register({ ...read, name: 'detached-world-read' })
    const detached = await ctx.tools.execute({ callId: ToolCallId('detached-reader'), name: 'detached-world-read', arguments: {}, signal: new AbortController().signal })
    expect(detached.content).toEqual([{ type: 'text', text: 'Error: 角色扮演工具需要当前会话。' }])
    const abort = new AbortController()
    abort.abort()
    expect((await execute(ctx, owner, 'world_update', { changes: [{ field: '地点', value: '厨房' }] }, abort.signal)).isError).toBe(true)
    expect(ctx.roleplay.read(owner, 'world')).toEqual({})
  })

  it('disables and disposes entries independently and presents replay without state reads', async () => {
    const ctx = await boot('body_update')
    const owner = await agent(ctx)
    expect(ctx.tools.schemas(owner)).toHaveLength(7)
    expect(ctx.tools.get('roleplay_body_update', owner)).toBeUndefined()
    const tool = ctx.tools.get('roleplay_world_read', owner)!
    expect(tool.presentCall?.({ fields: ['天气'] })).toEqual({
      card: 'generic', title: '读取世界', kind: 'read', rawInput: { fields: ['天气'] },
    })
    expect(tool.presentCall?.({ fields: 1 })).toBeUndefined()
    const content = [{ type: 'text' as const, text: '{"天气":"晴"}' }]
    expect(tool.presentResult?.({}, { content, isError: false })).toEqual({ card: 'generic', title: '读取世界', content })
    const entry = [...ctx.loader.entries()].find(value => value.options.name.endsWith('/world-read'))!
    await entry.fiber?.dispose()
    expect(ctx.tools.get('roleplay_world_read', owner)).toBeUndefined()
    expect(ctx.tools.get('roleplay_world_update', owner)).toBeDefined()
    expect(ctx.tools.schemas(owner)).toHaveLength(6)
    await entry.update({ disabled: false }, false, true)
    await ctx.loader.await()
    await entry.fiber?.await()
    expect(ctx.tools.schemas(owner)).toHaveLength(7)
    expect((await execute(ctx, owner, 'world_read', {})).isError).toBe(false)
    await agentDisposers.get(owner)?.()
    expect(ctx.agents.get(owner.id)).toBeUndefined()
    expect(ctx.tools.schemas(owner)).toHaveLength(0)
    await entry.fiber?.dispose()
  })

  it('keeps tools out of ordinary sessions and follows blank preset changes', async () => {
    const ctx = await boot()
    const ordinary = await agent(ctx, 'standard')
    const roleplay = await agent(ctx)
    expect(ctx.tools.schemas()).toHaveLength(0)
    expect(ctx.tools.schemas(ordinary)).toHaveLength(0)
    expect(ctx.tools.schemas(roleplay)).toHaveLength(8)
    expect((await execute(ctx, ordinary, 'world_read', {})).isError).toBe(true)
    ordinary.session.append('agent-preset/selected', { agentPreset: 'roleplay' })
    expect(ctx.tools.schemas(ordinary)).toHaveLength(8)
    ordinary.session.append('agent-preset/selected', { agentPreset: 'roleplay' })
    expect(ctx.tools.schemas(ordinary)).toHaveLength(8)
    ordinary.session.append('agent-preset/selected', { agentPreset: 'standard' })
    expect(ctx.tools.schemas(ordinary)).toHaveLength(0)
    expect(ctx.tools.schemas(roleplay)).toHaveLength(8)
    const detached = ctx.sessions.create(SessionId('roleplay-tools-detached'))
    detached.append('agent-preset/selected', { agentPreset: 'roleplay' })
    expect(ctx.agents.get(detached.id)).toBeUndefined()
  })
})
