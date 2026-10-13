/** Independent model tools for one roleplay state category. @module dsh-tool-roleplay/shared */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-roleplay'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'

type Category = 'world' | 'body' | 'clothing' | 'relationship'

function registerScoped(ctx: Context, definition: ToolDefinition): void {
  const registrations = new Map<Agent, () => void>()
  const sync = (agent: Agent, enabled = ctx.roleplay.stateOf(agent.session) !== null): void => {
    if (enabled && !registrations.has(agent)) registrations.set(agent, agent.ctx.tools.register(definition))
    else if (!enabled) { registrations.get(agent)?.(); registrations.delete(agent) }
  }
  ctx.effect(() => () => {
    for (const dispose of registrations.values()) dispose()
    registrations.clear()
  })
  ctx.on('agent/created', ({ agent }) => { sync(agent) })
  ctx.on('agent/disposed', ({ agent }) => { registrations.get(agent)?.(); registrations.delete(agent) })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'agent-preset/selected') return
    const agent = ctx.agents.get(session.id)
    if (agent !== undefined) sync(agent, event.data.agentPreset === 'roleplay')
  })
  for (const agent of ctx.agents.list()) sync(agent)
}

const LABELS: Record<Category, string> = {
  world: '世界', body: '身体', clothing: '服饰', relationship: '关系',
}

const EXAMPLES: Record<Category, string> = {
  world: '时间、地点、天气、事件',
  body: '身体状况、临时情绪',
  clothing: '当前穿着',
  relationship: '好感、信任等数值指标',
}

function owner(exec: ToolRunContext): Agent {
  exec.signal.throwIfAborted()
  if (!exec.agent) throw new Error('角色扮演工具需要当前会话。')
  return exec.agent
}

function patch<T extends string | number>(changes: readonly { field: string; value: T }[]): Record<string, T> {
  if (changes.length === 0) throw new Error('请至少提供一个要更新的字段。')
  const result: Record<string, T> = {}
  for (const change of changes) {
    if (Object.hasOwn(result, change.field)) throw new Error(`字段“${change.field}”重复，请合并后更新。`)
    Object.defineProperty(result, change.field, { value: change.value, enumerable: true, writable: true, configurable: true })
  }
  return result
}

/**
 * Register the independently disposable reader for one category.
 * @param ctx - context with tool and roleplay services.
 * @param category - state category exposed by this entry.
 */
export function registerRead(ctx: Context, category: Category): void {
  const label = LABELS[category]
  registerScoped(ctx, defineTool({
    name: `roleplay_${category}_read`,
    description: `读取已记录的${label}状态，包括${EXAMPLES[category]}。可选择字段；省略字段时读取本类全部状态。未记录的字段不返回。`,
    parameters: {
      fields: {
        type: 'array', description: '要读取的字段名称；省略时读取本类全部字段。',
        items: { type: 'string', description: '字段名称，可使用中文。' },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args, exec) => Promise.resolve(ctx.roleplay.read(owner(exec), category, args.fields)),
    presentCall: args => ({ card: 'generic', title: `读取${label}`, kind: 'read', rawInput: args }),
    presentResult: (_args, result) => ({ card: 'generic', title: `读取${label}`, content: result.content }),
  }))
}

/**
 * Register a text-state writer or relationship delta writer.
 * @param ctx - context with tool and roleplay services.
 * @param category - state category exposed by this entry.
 */
export function registerUpdate(ctx: Context, category: Category): void {
  const label = LABELS[category]
  const confirmation = `已更新${label}。`
  const output = {
    schema: { type: 'string' as const },
    render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
  }
  const presentation = {
    presentCall: (args: unknown) => ({ card: 'generic' as const, title: `更新${label}`, kind: 'other' as const, rawInput: args }),
    presentResult: (_args: unknown, result: { content: import('@deepseek-ai/dsh-llm').ContentBlock[] }) => ({
      card: 'generic' as const, title: `更新${label}`, content: result.content,
    }),
  }
  if (category === 'relationship') {
    registerScoped(ctx, defineTool({
      name: 'roleplay_relationship_update',
      description: '增减已记录的关系指标，包括好感、信任等数值。正数增加，负数减少；未记录的指标从零开始。只返回简短确认。',
      parameters: {
        changes: {
          type: 'array', required: true, description: '本次要增减的关系指标，每个指标只出现一次。',
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              field: { type: 'string', required: true, description: '关系指标名称，可使用中文。' },
              delta: { type: 'number', required: true, description: '增减量；正数增加，负数减少。' },
            },
          },
        },
      },
      output,
      execute(args, exec) {
        const agent = owner(exec)
        ctx.roleplay.update(agent, category, patch(args.changes.map(change => ({ field: change.field, value: change.delta }))))
        return Promise.resolve(confirmation)
      },
      ...presentation,
    }))
    return
  }
  registerScoped(ctx, defineTool({
    name: `roleplay_${category}_update`,
    description: `更新${label}状态，包括${EXAMPLES[category]}。只修改指定字段，保留其他字段；只返回简短确认。`,
    parameters: {
      changes: {
        type: 'array', required: true, description: '本次要更新的字段，每个字段只出现一次。',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            field: { type: 'string', required: true, description: '字段名称，可使用中文。' },
            value: { type: 'string', required: true, description: '该字段的新状态文本。' },
          },
        },
      },
    },
    output,
    execute(args, exec) {
      const agent = owner(exec)
      ctx.roleplay.update(agent, category, patch(args.changes))
      return Promise.resolve(confirmation)
    },
    ...presentation,
  }))
}
