/** Scoped roleplay tools and exact, logged character context. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-query'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import type {} from './index.ts'
import type { CharacterProfileId, RoleplayOperationId, RoleplaySource } from './types.ts'

/** Scoped preset contributor. */
export const name = 'roleplay-runtime'
/** Global authority and scoped model interfaces. */
export const inject = ['roleplay', 'tools', 'systemPrompt', 'sessionProjections', 'sessionQuery']

const updateSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  scene: z.record(z.string(), z.string()).optional(),
  deltas: z.record(z.string(), z.number()).optional(),
  memory: z.strictObject({
    key: z.string().min(1), text: z.string().min(1), applicable: z.string(),
    evidenceId: z.string().transform(brandString<MessageId>),
  }).optional(),
})
const readSchema = z.strictObject({ query: z.string().optional() })
const presentationSchema = z.object({
  profileId: z.string(), revision: z.number().int().nonnegative(),
  memories: z.array(z.object({ id: z.string() })), conflicts: z.array(z.object({ id: z.string() })),
})
const guidance = `Portray one primary adult character in everyday shared life. Use brief actions and natural dialogue. You may portray the environment and simple passersby. Never decide the player's actions, speech, or inner feelings. Treat the player persona as fictional identity. Advance only in response to the player's message or explicit continuation. Time does not advance while the player is away.

Use the bound character card and the latest saved roleplay context. Scene fields describe the AI character only. Shared memories and relationship metrics belong to this character profile; scenes belong to this conversation. Automatically maintain useful stable facts, important experiences, promises, and relationship developments through roleplay_update. Query further memories and their user-message evidence through roleplay_read. Every memory must cite an evidenceId returned by roleplay_read; reuse the original evidence when extracting an older fact. Invalidated evidence cannot recreate that memory. User corrections take precedence. Preserve unresolved conflicts and ask the player to resolve them when needed. Read again after a stale revision. Submit meaningful affinity and trust changes as deltas, never absolute values; numeric values do not determine romantic outcomes. Do not mention internal tool activity in character dialogue.`

/**
 * Install isolated capability contributions for Agents using this preset.
 * @param ctx Preset context.
 */
export function apply(ctx: Context): void {
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  function install(agent: Agent) {
    const profileId = ctx.roleplay.store.owner(agent.session.id)
    if (!profileId) throw new Error('Select a character profile before starting roleplay')
    const local = agent.ctx
    local.effect(() => local.tools.presentAs('native'))
    local.effect(() => local.tools.restrict({ allow: [] }))
    local.effect(() => local.tools.guard(exec => exec.name === 'roleplay_read' || exec.name === 'roleplay_update'
      ? undefined : 'Roleplay cannot use work tools'))
    local.effect(() => local.systemPrompt.section({ name: 'roleplay:character', order: 0, complete: true, interpolate: false,
      text: () => `${guidance}\n\n${ctx.roleplay.store.read(profileId).state.card.content}\n\n${JSON.stringify(ctx.roleplay.store.context(profileId, agent.session.id))}` }))
    local.effect(() => local.systemPrompt.suppressRuntimeContext())
    local.on('agent/request', async (_payload, next) => {
      agent.session.append('roleplay/checkpoint', { profileId, revision: ctx.roleplay.store.read(profileId).revision, sessionId: agent.session.id })
      return next()
    })
    local.on('agent/turn-stopping', () => {
      agent.session.append('roleplay/checkpoint', { profileId, revision: ctx.roleplay.store.read(profileId).revision, sessionId: agent.session.id })
    })
    local.effect(() => local.tools.register(readTool(ctx, profileId)))
    local.effect(() => local.tools.register(updateTool(ctx, profileId)))
  }
}

function attribution(ctx: Context, exec: ToolRunContext): { agent: Agent; source: RoleplaySource } {
  if (!exec.agent) throw new Error('Roleplay tools require a conversation')
  const reply = ctx.sessionProjections.stateOf(exec.agent.session, 'turnBoundary')?.openTurnStartSeq
  if (reply === undefined || reply === null) throw new Error('Roleplay update requires a current reply')
  return { agent: exec.agent, source: { sessionId: exec.agent.session.id, reply, actor: 'model',
    operation: brandString<RoleplayOperationId>(`${exec.agent.session.id}:${exec.callId}`) } }
}

const output: ToolDefinition['output'] = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: z.string().parse(value) }],
  presentationMeta: (_args, value) => ({ roleplay: presentationSchema.parse(JSON.parse(z.string().parse(value))) }),
}

function readTool(ctx: Context, profileId: CharacterProfileId): ToolDefinition {
  return {
    name: 'roleplay_read', description: 'Read the current scene, relationship and selected memories. Supply query to search all active memories in this character profile.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
    output,
    async execute(raw, exec) {
      const { query } = readSchema.parse(raw)
      const sessionId = exec.agent?.session.id
      if (!sessionId || ctx.roleplay.store.owner(sessionId) !== profileId) throw new Error('Roleplay profile access denied')
      exec.signal.throwIfAborted()
      const context = ctx.roleplay.store.context(profileId, sessionId)
      if (query !== undefined) context.memories = Object.values(ctx.roleplay.store.read(profileId).state.memories)
        .filter(memory => memory.status === 'active' && `${memory.key} ${memory.text}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      using observed = await ctx.sessionQuery.observeSession(sessionId)
      const evidence = observed.events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'user'
        ? [{ id: event.data.id, content: event.data.content }] : []).slice(-ctx.roleplay.maxEvidenceMessages)
      return JSON.stringify({ ...context, evidence })
    },
    presentCall: () => ({ card: 'generic', title: 'roleplay_read', kind: 'read' }),
  }
}

function updateTool(ctx: Context, profileId: CharacterProfileId): ToolDefinition {
  return {
    name: 'roleplay_update', description: 'Save AI scene fields, relationship deltas or a stable memory. Use the observed expectedRevision. Conflicts retain the current information. User corrections take precedence.',
    parameters: { type: 'object', required: ['expectedRevision'], additionalProperties: false, properties: {
      expectedRevision: { type: 'integer', minimum: 0 },
      scene: { type: 'object', additionalProperties: { type: 'string' } },
      deltas: { type: 'object', additionalProperties: { type: 'number' } },
      memory: { type: 'object', additionalProperties: false, required: ['key', 'text', 'applicable', 'evidenceId'], properties: {
        key: { type: 'string' }, text: { type: 'string' }, applicable: { type: 'string' }, evidenceId: { type: 'string' },
      } },
    } },
    output,
    async execute(raw, exec) {
      const change = updateSchema.parse(raw)
      const { agent, source } = attribution(ctx, exec)
      if (ctx.roleplay.store.owner(source.sessionId) !== profileId) throw new Error('Roleplay profile access denied')
      exec.signal.throwIfAborted()
      if (change.memory) {
        const evidenceId = change.memory.evidenceId
        using observed = await ctx.sessionQuery.observeSession(source.sessionId)
        if (!observed.events.some(event => event.type === 'user/message' && event.data.source.kind === 'user' && event.data.id === evidenceId)) {
          throw new Error('Memory evidence must name a user message in this conversation')
        }
      }
      await ctx.roleplay.store.model(profileId, source, {
        expectedRevision: change.expectedRevision,
        ...(change.scene === undefined ? {} : { scene: change.scene }),
        ...(change.deltas === undefined ? {} : { deltas: change.deltas }),
        ...(change.memory === undefined ? {} : { memory: change.memory }),
      })
      agent.session.append('roleplay/checkpoint', { profileId, revision: ctx.roleplay.store.read(profileId).revision, sessionId: source.sessionId })
      return JSON.stringify(ctx.roleplay.store.context(profileId, source.sessionId))
    },
    presentCall: () => ({ card: 'generic', title: 'roleplay_update', kind: 'other' }),
  }
}
