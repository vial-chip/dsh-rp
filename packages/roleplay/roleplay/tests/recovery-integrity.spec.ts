import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { TestSessionQueryEngine } from '../../../session-query/session-query/tests/test-service.ts'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import RoleplayService from '../src/index.ts'
import { emptyRoleplayState } from '../src/fold.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function harness() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(TestSessionQueryEngine, {})
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(RoleplayService)
  const recorded = ctx.sessions.create(SessionId('roleplay-recovery-recording'), { meta: { agentPreset: 'roleplay' } })
  function agentFor(session: typeof recorded): Agent {
    return {
      id: session.id, session, options: {}, inbox: createInboxStub(), ctx, status: 'idle',
      cancel() {}, whenIdle: () => Promise.resolve(),
      runMaintenance: task => task(new AbortController().signal),
      send() {}, followup() {}, steer() {}, inject() {},
    }
  }
  return { ctx, recorded, agentFor }
}

it('rejects a durable withdrawal referring to an absent interaction on resume', async () => {
  const { ctx, recorded, agentFor } = await harness()
  recorded.append('turn/start', { turn: 1 })
  recorded.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  recorded.append('roleplay/retract', { turn: 2, state: { ...emptyRoleplayState(), retractedTurns: [2] } })
  // Seeded events exercise durable replay, where a structurally valid withdrawal can refer to missing history.
  const session = ctx.sessions.create(SessionId('roleplay-corrupt-resume'), {
    meta: { agentPreset: 'roleplay' }, seed: recorded.snapshotEvents(),
  })
  const agent = agentFor(session)
  ctx.agents.enter(agent, undefined)
  await expect(ctx.agents.announce(agent, 'resume')).rejects.toThrow('撤销记录缺少互动范围。')
})

it('finishes a saved withdrawal before announcing readiness and does not repeat it on another resume', async () => {
  const { ctx, recorded, agentFor } = await harness()
  recorded.append('turn/start', { turn: 1 })
  recorded.append('user/message', createUserMessage({ content: [{ type: 'text', text: '一起做晚饭吧。' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  recorded.append('step/start', { turn: 1, step: 1 })
  recorded.append('assistant/message', {
    turn: 1, step: 1, stream: [],
    message: createAssistantMessage({ content: [{ type: 'text', text: '好呀。' }], source: { provider: 'test', model: 'test' } }),
  }, { surfaceOp: 'append' })
  recorded.append('step/end', { turn: 1, step: 1 })
  recorded.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  recorded.append('roleplay/retract', { turn: 1, state: { ...emptyRoleplayState(), retractedTurns: [1] } })
  const resumed = ctx.sessions.create(SessionId('roleplay-recovery-first'), {
    meta: { agentPreset: 'roleplay' }, seed: recorded.snapshotEvents(),
  })
  const agent = agentFor(resumed)
  expect(resumed.deriveMessages().map(message => message.role)).toEqual(['user', 'assistant'])
  ctx.agents.enter(agent, undefined)
  await ctx.agents.announce(agent, 'resume')
  expect(resumed.deriveMessages()).toMatchObject([{ role: 'user', content: [], source: { kind: 'roleplay-withdrawal' } }])
  const completed = resumed.snapshotEvents()
  expect(completed.filter(event => event.type === 'user/message' && event.data.source.kind === 'roleplay-withdrawal')).toHaveLength(1)
  const second = ctx.sessions.create(SessionId('roleplay-recovery-second'), {
    meta: { agentPreset: 'roleplay' }, seed: completed,
  })
  const secondAgent = agentFor(second)
  const beforeSecondResume = second.snapshotEvents()
  ctx.agents.enter(secondAgent, undefined)
  await ctx.agents.announce(secondAgent, 'resume')
  expect(second.snapshotEvents()).toEqual(beforeSecondResume)
  expect(second.deriveMessages()).toEqual(resumed.deriveMessages())
})
