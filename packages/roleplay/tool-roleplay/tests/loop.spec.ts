import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { TestSessionQueryEngine } from '../../../session-query/session-query/tests/test-service.ts'
import Roleplay from '@deepseek-ai/dsh-roleplay'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as tools from '../src/index.ts'

let context: Context | undefined
afterEach(async () => { await context?.fiber.dispose(); context = undefined })

function idle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      dispose()
      resolve()
    })
  })
}

it('regenerates a real tool interaction without discarded messages and preserves later human fields', async () => {
  const ctx = new Context()
  context = ctx
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(TestSessionQueryEngine, {})
  await ctx.plugin(Roleplay)
  for (const tool of Object.values(tools)) await ctx.plugin(tool)
  const adapter = new MockAdapter([
    toolCallResponse('discarded-relationship', 'roleplay_relationship_update', { changes: [{ field: '好感', delta: 2 }, { field: '信任', delta: 3 }, { field: 'constructor', delta: 2 }] }),
    textResponse('旧的回答。'), textResponse('重新回答。'), textResponse('下一轮。'),
  ])
  ctx.llm.registerAdapter(['mock'], adapter)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('roleplay-real-loop'), { provider: 'mock', model: 'mock' })
  agent.session.append('agent-preset/selected', { agentPreset: 'roleplay' })
  const removeCard = ctx.skills.register({ name: 'roleplay-neighbor', description: '邻居', content: '你是成年邻居小陈。', source: 'runtime' })
  await ctx.roleplay.selectCard(agent, 'roleplay-neighbor')
  ctx.roleplay.edit(agent, 'relationship', Object.fromEntries([['好感', 10], ['信任', 5], ['constructor', 1]]))
  let completed = idle(ctx, agent)
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '一起做晚饭吧。' }], source: { kind: 'user' } }))
  await completed
  expect(ctx.roleplay.read(agent, 'relationship')).toEqual(Object.fromEntries([['好感', 12], ['信任', 8], ['constructor', 3]]))
  expect(Object.hasOwn(ctx.roleplay.read(agent, 'relationship'), 'constructor')).toBe(true)
  expect(JSON.stringify(adapter.requests[0]?.messages[0])).toContain('成年邻居小陈')
  removeCard()
  ctx.skills.register({ name: 'roleplay-neighbor', description: '邻居', content: '替换的设定。', source: 'runtime' })
  ctx.roleplay.edit(agent, 'relationship', { 好感: 20 })
  completed = idle(ctx, agent)
  await ctx.roleplay.regenerate(agent)
  await completed
  expect(ctx.roleplay.read(agent, 'relationship')).toEqual(Object.fromEntries([['好感', 20], ['信任', 5], ['constructor', 1]]))
  const regenerated = JSON.stringify(adapter.requests[2]?.messages.map(message => message.content))
  expect(regenerated).toContain('成年邻居小陈')
  expect(regenerated).not.toMatch(/旧的回答|discarded-relationship|已更新关系|替换的设定|20/)
  expect(await ctx.roleplay.undo(agent)).toEqual({ input: '一起做晚饭吧。' })
  expect(JSON.stringify(agent.session.deriveMessages())).not.toContain('重新回答')
  completed = idle(ctx, agent)
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '重新开始。' }], source: { kind: 'user' } }))
  await completed
  expect(JSON.stringify(adapter.requests[3]?.messages)).not.toMatch(/旧的回答|重新回答|discarded-relationship|一起做晚饭/)
})
