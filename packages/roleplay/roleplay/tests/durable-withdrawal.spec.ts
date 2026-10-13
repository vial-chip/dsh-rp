import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { TestSessionQueryEngine } from '../../../session-query/session-query/tests/test-service.ts'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import Roleplay from '../src/index.ts'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function harness(root: string, script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root })
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(TestSessionQueryEngine, {})
  await ctx.plugin(Roleplay)
  ctx.tools.register({
    name: 'withdrawal_probe', description: '记录当前互动。', parameters: {},
    output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: '已撤回工具结果。' }] },
    execute: () => Promise.resolve('已撤回工具结果。'),
  })
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  await mountAgentLoopTestHarness(ctx)
  return { ctx, adapter }
}

function idle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      dispose()
      resolve()
    })
  })
}

it.each(['undo', 'regenerate'] as const)('persists %s after a real completed turn and resumes without withdrawn history', async (operation) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-roleplay-withdrawal-'))
  roots.push(root)
  const { ctx } = await harness(root, [
    toolCallResponse('withdrawn-tool-call', 'withdrawal_probe', {}), textResponse('旧的回答。'), textResponse('新的回答。'),
  ])
  const id = SessionId('durable-roleplay')
  const handle = await ctx.agents.create({
    sessionId: id, meta: { agentPreset: 'roleplay' }, agentOptions: { provider: 'mock', model: 'mock' },
  })
  const agent = handle.agent
  let completed = idle(ctx, agent)
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '一起做晚饭吧。' }], source: { kind: 'user' } }))
  await completed
  expect(agent.session.snapshotEvents()).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'step/end' }),
    expect.objectContaining({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }),
  ]))
  if (operation === 'regenerate') {
    completed = idle(ctx, agent)
    await ctx.roleplay.regenerate(agent)
    await completed
  } else {
    await expect(ctx.roleplay.undo(agent)).resolves.toEqual({ input: '一起做晚饭吧。' })
  }
  await ctx.sessions.flush(agent.session)
  const stored = await ctx.sessionPersistence.open(id, 'read')
  try {
    const { events } = await stored.read()
    expect(events.some(event => event.type === 'tool/call')).toBe(true)
    expect(events.some(event => event.type === 'tool/result')).toBe(true)
    expect(events.some(event => event.type === 'roleplay/retract')).toBe(true)
    expect(events.some(event => event.type === 'user/message' && event.data.source.kind === 'roleplay-withdrawal')).toBe(true)
  } finally {
    await stored.close()
  }
  await handle.dispose()
  await ctx.fiber.dispose()

  const reopened = await harness(root, [textResponse('恢复后的回答。')])
  const resumed = await reopened.ctx.agents.resume({ resumeSessionId: id, agentOptions: { provider: 'mock', model: 'mock' } })
  expect(JSON.stringify(resumed.agent.session.deriveMessages())).not.toMatch(/旧的回答|withdrawn-tool-call|已撤回工具结果/)
  expect(reopened.ctx.roleplay.get(resumed.agent)?.retractedTurns).toEqual([1])
  completed = idle(reopened.ctx, resumed.agent)
  resumed.agent.followup(createUserMessage({ content: [{ type: 'text', text: '接着聊。' }], source: { kind: 'user' } }))
  await completed
  expect(JSON.stringify(reopened.adapter.requests[0]?.messages)).not.toMatch(/旧的回答|withdrawn-tool-call|已撤回工具结果/)
  await reopened.ctx.sessions.flush(resumed.agent.session)
})
