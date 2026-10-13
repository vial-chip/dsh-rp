/** Character selection and human edits for the recorded roleplay interaction. */
import { deepStrictEqual, ok } from 'node:assert'
import { writeFileSync } from 'node:fs'

export const inject = ['agents', 'roleplay', 'skills']

/** @param {import('@deepseek-ai/cordis').Context} ctx - Scenario runtime. */
export function apply(ctx) {
  let removeCard = ctx.skills.register({
    name: 'roleplay-neighbor', description: '邻居小陈', content: '你是成年邻居小陈，说话温和，喜欢一起做饭。', source: 'runtime',
  })
  ctx.on('agent/created', ({ agent }) => {
    agent.session.append('agent-preset/selected', { agentPreset: 'roleplay' })
    agent.session.append('roleplay/card-selection', { name: 'roleplay-neighbor' })
  })
  let awaitingEdit = false
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'turn/end' && event.data.turn === 1) awaitingEdit = true
  })
  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle' || !awaitingEdit) return
    awaitingEdit = false
    ctx.roleplay.edit(agent, 'clothing', { 上装: '蓝色围裙', 下装: '长裤' })
    ctx.roleplay.edit(agent, 'relationship', { 好感: 20 })
    removeCard()
    removeCard = ctx.skills.register({
      name: 'roleplay-neighbor', description: '邻居小陈', content: '替换后的角色设定。', source: 'runtime',
    })
  })
  let previous
  const requests = []
  const metricsPath = process.env.DSH_ROLEPLAY_METRICS_FILE
  const saveMetrics = () => {
    if (metricsPath !== undefined) writeFileSync(metricsPath, JSON.stringify({
      environment: 'keyless recorded replay; lengths are JSON UTF-16 characters, not provider tokens',
      realProviderCacheMetrics: 'not measured: no API credentials',
      requests,
    }, null, 2) + '\n')
  }
  ctx.on('llm/stream', (options, next) => {
    if (options.purpose !== undefined) return next()
    const request = { messages: structuredClone(options.messages), tools: structuredClone(options.tools) }
    if (previous !== undefined) {
      deepStrictEqual(request.tools, previous.tools)
      deepStrictEqual(request.messages.slice(0, previous.messages.length), previous.messages)
    }
    const system = JSON.stringify(request.messages[0])
    ok(system.includes('成年邻居小陈'))
    ok(!system.includes('替换后的角色设定'))
    ok(!system.includes('蓝色围裙'))
    ok(!JSON.stringify(request.messages).includes('长裤'))
    const measurement = {
      call: requests.length + 1,
      messageCharacters: JSON.stringify(request.messages).length,
      toolCharacters: JSON.stringify(request.tools).length,
      stablePrefixMessages: previous?.messages.length ?? 0,
    }
    requests.push(measurement)
    saveMetrics()
    previous = request
    const started = performance.now()
    const stream = next()
    return (async function* () {
      for await (const chunk of stream) {
        if ((chunk.type === 'text-delta' || chunk.type === 'tool-call-delta') && measurement.firstOutputDeltaMs === undefined) {
          measurement.firstOutputDeltaMs = performance.now() - started
          saveMetrics()
        }
        yield chunk
      }
    })()
  })
}
