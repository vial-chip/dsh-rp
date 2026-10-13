import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { TestSessionQueryEngine } from '../../../session-query/session-query/tests/test-service.ts'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import RoleplayService from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function harness() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(TestSessionQueryEngine, {})
  await ctx.plugin(RoleplayService)
  const session = ctx.sessions.create(SessionId('roleplay-continuation'), { meta: { agentPreset: 'roleplay' } })
  const queued: UserMessage[] = []
  const agent: Agent = {
    id: session.id, session, options: {}, inbox: createInboxStub(), ctx, status: 'idle',
    cancel() {}, whenIdle: () => Promise.resolve(),
    runMaintenance: task => task(new AbortController().signal),
    send() {}, followup: (message) => { queued.push(message) }, steer() {}, inject() {},
  }
  await ctx.agents.register(agent)
  return { ctx, session, agent, queued }
}

it('preserves a nonhuman trigger when regenerating and returns no composer text on undo', async () => {
  const { ctx, session, agent, queued } = await harness()
  const trigger = createUserMessage({
    content: [{ type: 'text', text: '继续。' }],
    source: { kind: 'model-selection', form: 'notice', summary: '继续当前互动。' },
  })
  session.append('turn/start', { turn: 1 })
  session.append('user/message', trigger, { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  await ctx.roleplay.regenerate(agent)
  expect(queued).toHaveLength(1)
  expect(queued[0]?.content).toEqual(trigger.content)
  expect(queued[0]?.source).toEqual(trigger.source)
  expect(queued[0]?.id).not.toBe(trigger.id)

  session.append('turn/start', { turn: 2 })
  session.append('user/message', queued[0]!, { surfaceOp: 'append' })
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
  await expect(ctx.roleplay.undo(agent)).resolves.toEqual({ input: null })
  expect(ctx.roleplay.stateOf(session)?.retractedTurns).toEqual([1, 2])
})

it('refuses regeneration of a turn without an original trigger before withdrawing it', async () => {
  const { ctx, session, agent, queued } = await harness()
  session.append('turn/start', { turn: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const before = session.snapshotEvents()

  await expect(ctx.roleplay.regenerate(agent)).rejects.toThrow('最近互动缺少原始输入，无法重生成。')
  expect(session.snapshotEvents()).toEqual(before)
  expect(queued).toEqual([])
  expect(ctx.roleplay.stateOf(session)?.retractedTurns).toEqual([])
})

it('regenerates browser input with fresh submission identity and preserves its content', async () => {
  const { ctx, session, agent, queued } = await harness()
  const source = { kind: 'user' as const, rpcId: 'consumed-browser-request', clientTimeZone: 'Asia/Shanghai' }
  const trigger = createUserMessage({ content: [{ type: 'text', text: '继续。' }], source })
  session.append('turn/start', { turn: 1 })
  session.append('user/message', trigger, { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  await ctx.roleplay.regenerate(agent)
  expect(queued).toHaveLength(1)
  expect(queued[0]?.id).not.toBe(trigger.id)
  expect(queued[0]?.content).toEqual(trigger.content)
  expect(queued[0]?.source).toEqual({ kind: 'user', clientTimeZone: 'Asia/Shanghai' })
  session.append('turn/start', { turn: 2 })
  session.append('user/message', queued[0]!, { surfaceOp: 'append' })
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
  await expect(ctx.roleplay.undo(agent)).resolves.toEqual({ input: '继续。' })
})
