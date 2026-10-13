import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '../../../preset/agent-preset-registry/src/session.ts'
import { applyRoleplayEvent, emptyRoleplayState, restoreRoleplayTurn } from '../src/fold.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function sessionLog() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  return ctx.sessions.create(SessionId('roleplay-fold'))
}

it('withdraws one model turn while retaining human replacements and other turns', async () => {
  const session = await sessionLog()
  session.append('turn/start', { turn: 1 })
  session.append('roleplay/state', {
    category: 'world', values: { 地点: '客厅', 天气: '细雨' }, fields: ['地点', '天气'], source: 'model', turn: 1,
  })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append('turn/start', { turn: 2 })
  session.append('roleplay/state', {
    category: 'world', values: { 地点: '厨房', 天气: '晴朗', 音乐: '钢琴' }, fields: ['地点', '天气', '音乐'], source: 'model', turn: 2,
  })
  session.append('roleplay/state', {
    category: 'world', values: { 地点: '花园', 天气: '晴朗', 音乐: '钢琴' }, fields: ['地点'], source: 'human', turn: null,
  })
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
  session.append('turn/start', { turn: 3 })
  session.append('roleplay/state', {
    category: 'body', values: { 动作: '散步' }, fields: ['动作'], source: 'model', turn: 3,
  })
  session.append('turn/end', { turn: 3, reason: { kind: 'completed' } })
  const events = session.snapshotEvents()
  const current = events.reduce<ReturnType<typeof applyRoleplayEvent>>(applyRoleplayEvent, emptyRoleplayState())
  expect(current).not.toBeNull()

  const restored = restoreRoleplayTurn(events, current!, 2)
  expect(restored.world).toEqual({ 地点: '花园', 天气: '细雨' })
  expect(restored.body).toEqual({ 动作: '散步' })
  expect(restored.retractedTurns).toEqual([2])
})

it('restores a roleplay interaction after ordinary preset history', async () => {
  const session = await sessionLog()
  session.append('agent-preset/selected', { agentPreset: 'standard' })
  session.append('turn/start', { turn: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append('agent-preset/selected', { agentPreset: 'roleplay' })
  session.append('roleplay/state', { category: 'clothing', values: { 外套: '夹克' }, fields: ['外套'], source: 'human', turn: null })
  session.append('turn/start', { turn: 2 })
  session.append('roleplay/state', { category: 'clothing', values: { 外套: '风衣' }, fields: ['外套'], source: 'model', turn: 2 })
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
  const events = session.snapshotEvents()
  const current = events.reduce<ReturnType<typeof applyRoleplayEvent>>(applyRoleplayEvent, emptyRoleplayState())
  expect(current).not.toBeNull()
  expect(restoreRoleplayTurn(events, current!, 2).clothing).toEqual({ 外套: '夹克' })
})
