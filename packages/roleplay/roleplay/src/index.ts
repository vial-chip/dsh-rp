/** Session-local roleplay service, character freezing, and interaction withdrawal. @module */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-session-query'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { applyRoleplayEvent, emptyRoleplayState, restoreRoleplayTurn, roleplayStateSchema } from './fold.ts'
import { DEFAULT_ROLEPLAY_CARD, ROLEPLAY_PROMPT } from './prompt.ts'
import type { RoleplayCard, RoleplayCardSummary, RoleplayCategory, RoleplayState, RoleplayUndoResult } from './types.ts'
export type * from './types.ts'
export { ROLEPLAY_PROMPT } from './prompt.ts'
export { applyRoleplayEvent, emptyRoleplayState, restoreRoleplayTurn } from './fold.ts'

declare module '@deepseek-ai/cordis' { interface Context { roleplay: RoleplayService } }

/** Saved roleplay panel projection; ordinary sessions expose null. */
export const roleplayProjectionDefinition = {
  key: 'roleplay', stateVersion: 1, stateSchema: roleplayStateSchema,
  init: header => header.agentPreset === 'roleplay' ? emptyRoleplayState() : null,
  apply: applyRoleplayEvent,
  wire: { viewSchema: roleplayStateSchema, view: state => state },
} satisfies ProjectionDefinition<'roleplay'>

/** Deployment limits for saved roleplay fields. */
export interface Config {
  /** Maximum saved fields in each category. */
  maxFields?: number
  /** Maximum characters in a field name. */
  maxFieldLength?: number
  /** Maximum characters in a descriptive value. */
  maxTextLength?: number
}

/** Durable roleplay state and idle-only interaction operations. */
export class RoleplayService extends TypertRemoteService {
  static inject = ['agents', 'sessionProjections', 'systemPrompt', 'skills', 'sessions', 'sessionQuery']
  static Config: z<Config> = z.object({
    maxFields: z.number().default(64), maxFieldLength: z.number().default(80), maxTextLength: z.number().default(2000),
  })
  private readonly limits: Required<Config>

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'roleplay')
    this.limits = {
      maxFields: config.maxFields ?? 64, maxFieldLength: config.maxFieldLength ?? 80, maxTextLength: config.maxTextLength ?? 2000,
    }
    for (const value of Object.values(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('角色扮演字段限制必须为正整数。')
    }
    ctx.sessionProjections.register(roleplayProjectionDefinition)
    ctx.on('agent/created', async ({ agent }) => {
      await this.finishWithdrawal(agent.session)
    })
    ctx.on('system-prompt/assemble', async (_assembly, { agent, signal }, next) => {
      const assembly = await next()
      if (agent === undefined) return assembly
      const state = this.stateOf(agent.session)
      if (state === null) return assembly
      let card = state.card
      if (card === null) {
        const name = state.selection ?? DEFAULT_ROLEPLAY_CARD.name
        const selected = name === DEFAULT_ROLEPLAY_CARD.name ? DEFAULT_ROLEPLAY_CARD : await ctx.skills.get(name, {
          scope: agent, cwd: agent.session.header.cwd, signal,
        })
        if (selected === undefined) throw new Error('所选角色卡已不可用，请重新选择。')
        card = { name: selected.name, description: selected.description, content: selected.content }
        if (agent.status === 'running') agent.session.append('roleplay/card', card)
      }
      return { ...assembly, contexts: [], sections: [{
        name: 'roleplay:identity', interpolate: false,
        text: `${ROLEPLAY_PROMPT}\n\n角色卡：\n${card.content}`,
      }] }
    })
  }

  /**
   * Read saved state without opening a model request.
   * @param session - live or detached session.
   * @returns saved state, or null for another mode.
   */
  stateOf(session: Session): RoleplayState | null {
    const state = this.ctx.sessionProjections.stateOf(session, 'roleplay')
    if (state === undefined) throw new Error('角色扮演状态投影尚未注册。')
    return state
  }

  /**
   * Read the panel for a live session.
   * @param agent - owning live agent.
   * @returns saved panel or null for another mode.
   */
  @Remote('get')
  get(agent: Agent): RoleplayState | null { this.assertLive(agent); return this.stateOf(agent.session) }

  /**
   * Read the selected character instructions without freezing the card or adding events.
   * @param agent - viewing live roleplay agent.
   * @returns frozen instructions, or the currently available selected card before first send.
   */
  @Remote('previewCard')
  async previewCard(agent: Agent): Promise<RoleplayCard> {
    const state = this.requireState(agent)
    if (state.card !== null) return structuredClone(state.card)
    const name = state.selection ?? DEFAULT_ROLEPLAY_CARD.name
    const card = name === DEFAULT_ROLEPLAY_CARD.name ? DEFAULT_ROLEPLAY_CARD : await this.ctx.skills.get(name, {
      scope: agent, cwd: agent.session.header.cwd,
    })
    if (card === undefined) throw new Error('所选角色卡已不可用，请重新选择。')
    return { name: card.name, description: card.description, content: card.content }
  }

  /**
   * List the bundled card and skills whose names begin with roleplay-.
   * @param agent - viewing live agent.
   * @returns available character summaries with the bundled card first.
   */
  @Remote('listCards')
  async listCards(agent: Agent): Promise<RoleplayCardSummary[]> {
    this.requireState(agent)
    const skills = await this.ctx.skills.list({ scope: agent, cwd: agent.session.header.cwd })
    return [{ name: DEFAULT_ROLEPLAY_CARD.name, description: DEFAULT_ROLEPLAY_CARD.description },
      ...skills.filter(skill => skill.name.startsWith('roleplay-') && skill.name !== DEFAULT_ROLEPLAY_CARD.name)
        .map(({ name, description }) => ({ name, description }))]
  }

  /**
   * Select a character before the first admitted interaction.
   * @param agent - owning live agent.
   * @param name - character skill name.
   */
  @Remote('selectCard')
  async selectCard(agent: Agent, name: string): Promise<void> {
    await agent.runMaintenance(async (signal) => {
      if (this.requireState(agent).card !== null) throw new Error('首次发送后不能更换当前会话的角色卡。')
      if (name !== DEFAULT_ROLEPLAY_CARD.name) {
        if (!name.startsWith('roleplay-') || await this.ctx.skills.get(name, { scope: agent, cwd: agent.session.header.cwd, signal }) === undefined) {
          throw new Error('角色卡不存在，请重新选择。')
        }
      }
      agent.session.append('roleplay/card-selection', { name })
    })
  }

  /**
   * Read only requested saved fields for a model tool.
   * @param agent - owning live agent.
   * @param category - category to read.
   * @param fields - selected fields; omitted selects all saved fields.
   * @returns detached selected values without host bookkeeping.
   */
  read(agent: Agent, category: RoleplayCategory, fields?: readonly string[]): Record<string, string | number> {
    const values = this.requireState(agent)[category]
    return Object.fromEntries(Object.entries(values).filter(([field]) => fields === undefined || fields.includes(field)))
  }

  /**
   * Save model changes; relationship numbers are increments.
   * @param agent - owning live agent.
   * @param category - category to update.
   * @param patch - replacement text or relationship increments.
   */
  update(agent: Agent, category: RoleplayCategory, patch: Readonly<Record<string, string | number>>): void {
    if (agent.status !== 'running') throw new Error('状态工具只能在当前互动中更新。')
    this.change(agent, category, patch, 'model')
  }

  /**
   * Save human replacements without adding messages or waking the agent.
   * @param agent - owning live agent.
   * @param category - category to edit.
   * @param patch - direct replacement values, including relationship numbers.
   */
  @Remote('edit')
  edit(agent: Agent, category: RoleplayCategory, patch: Readonly<Record<string, string | number>>): void {
    this.change(agent, category, patch, 'human')
  }

  /**
   * Withdraw the latest completed interaction while idle.
   * @param agent - owning live agent.
   * @returns original user input for the composer, when present.
   */
  @Remote('undo')
  async undo(agent: Agent): Promise<RoleplayUndoResult> {
    return agent.runMaintenance(async () => {
      const result = await this.withdraw(agent, 'undo')
      await this.ctx.sessions.flush(agent.session)
      return { input: result.input === null ? null : result.input.content.filter(part => part.type === 'text').map(part => part.text).join('\n') }
    })
  }

  /**
   * Withdraw the latest interaction and enqueue the same input again.
   * @param agent - owning live agent.
   * @throws before withdrawal when the interaction has no original input message.
   */
  @Remote('regenerate')
  async regenerate(agent: Agent): Promise<void> {
    await agent.runMaintenance(async () => {
      const { trigger } = await this.withdraw(agent, 'regenerate')
      await this.ctx.sessions.flush(agent.session)
      let source = trigger.source
      if (source.kind === 'user' && 'rpcId' in source) {
        const { rpcId: _rpcId, ...originalSource } = source
        source = originalSource
      }
      agent.followup(createUserMessage({ content: trigger.content, source }))
    })
  }

  private withdraw(agent: Agent, mode: 'regenerate'): Promise<{ input: UserMessage | null; trigger: UserMessage }>
  private withdraw(agent: Agent, mode: 'undo'): Promise<{ input: UserMessage | null; trigger: UserMessage | null }>
  private async withdraw(agent: Agent, mode: 'undo' | 'regenerate'): Promise<{ input: UserMessage | null; trigger: UserMessage | null }> {
    const state = this.requireState(agent)
    const { events } = await this.ctx.sessionQuery.readSession(agent.id)
    const end = events.findLast(event => event.type === 'turn/end' && !state.retractedTurns.includes(event.data.turn))
    if (end?.type !== 'turn/end' || end.data.reason.kind !== 'completed') throw new Error('没有可撤销的最近一轮已完成互动。')
    const turn = end.data.turn
    const start = events.findLastIndex(event => event.type === 'turn/start' && event.data.turn === turn)
    const interaction = events.slice(start + 1, end.seq)
    const trigger = interaction.find(event => event.type === 'user/message')
    if (mode === 'regenerate' && trigger === undefined) throw new Error('最近互动缺少原始输入，无法重生成。')
    const input = interaction.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    agent.session.append('roleplay/retract', { turn, state: restoreRoleplayTurn(events, state, turn) })
    await this.finishWithdrawal(agent.session)
    return {
      input: input?.type === 'user/message' ? input.data : null,
      trigger: trigger?.type === 'user/message' ? trigger.data : null,
    }
  }

  private requireState(agent: Agent): RoleplayState {
    this.assertLive(agent)
    const state = this.stateOf(agent.session)
    if (state === null) throw new Error('当前会话不是角色扮演模式。')
    return state
  }
  private assertLive(agent: Agent): void {
    if (this.ctx.agents.get(agent.id) !== agent) throw new Error('当前会话已关闭，请重新打开。')
  }
  private change(agent: Agent, category: RoleplayCategory, patch: Readonly<Record<string, string | number>>, source: 'human' | 'model'): void {
    const state = this.requireState(agent)
    const values: Record<string, string | number> = { ...state[category] }
    const entries = Object.entries(patch)
    if (entries.length === 0) throw new Error('请至少提供一个要修改的字段。')
    for (const [field, value] of entries) {
      if (field.trim().length === 0 || field.length > this.limits.maxFieldLength) throw new Error('状态字段名为空或过长。')
      if (field === '__proto__') throw new Error('状态字段名不能为“__proto__”，请使用其他名称。')
      if (category === 'relationship') {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('关系指标必须为有限数值。')
        const previous = Object.entries(state.relationship).find(([name]) => name === field)?.[1] ?? 0
        const next = source === 'model' ? previous + value : value
        if (!Number.isFinite(next)) throw new Error('关系指标超出可保存的数值范围。')
        Object.defineProperty(values, field, { value: next, enumerable: true, configurable: true, writable: true })
      } else {
        if (typeof value !== 'string' || value.length > this.limits.maxTextLength) throw new Error('状态描述必须为长度限制内的文字。')
        Object.defineProperty(values, field, { value, enumerable: true, configurable: true, writable: true })
      }
    }
    if (Object.keys(values).length > this.limits.maxFields) throw new Error('此类状态已达到字段数量限制。')
    const boundary = this.ctx.sessionProjections.stateOf(agent.session, 'turnBoundary')
    agent.session.append('roleplay/state', {
      category, values, fields: entries.map(([field]) => field), source,
      turn: source === 'model' ? boundary?.lastTurn ?? null : null,
    })
  }
  /** Complete a committed withdrawal after restart or immediately before the next request. */
  private async finishWithdrawal(session: Session): Promise<void> {
    const state = this.stateOf(session)
    if (state === null) return
    if (state.retractedTurns.length === 0) return
    const { events } = await this.ctx.sessionQuery.readSession(session.id)
    for (const turn of state.retractedTurns) {
      const start = events.findLast(event => event.type === 'turn/start' && event.data.turn === turn)
      const end = events.findLast(event => event.type === 'turn/end' && event.data.turn === turn)
      if (start === undefined || end === undefined) throw new Error('撤销记录缺少互动范围。')
      const nodes = session.surface.nodes.filter(seq => seq > start.seq && seq < end.seq
        && events[seq]?.type !== 'system/message')
      const first = nodes[0]
      const last = nodes.at(-1)
      if (first === undefined || last === undefined) continue
      session.append('user/message', createUserMessage({ content: [], source: { kind: 'roleplay-withdrawal' } }), {
        surfaceOp: { op: 'replace', startSeq: first, endSeq: last },
        sourceEventSeqs: session.surface.nodes.filter(seq => seq >= first && seq <= last),
      })
    }
  }
}
export default RoleplayService
