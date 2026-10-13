/** Roleplay controls contribute to the native composer and right sidebar. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-roleplay/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { RoleplayDock } from './Dock.tsx'
import { RoleplayPanel, RoleplayTitle, tabIcons } from './Panel.tsx'
import { RoleplayNotice, type NoticeState } from './Notice.tsx'
import { zh, en } from './locales.ts'
import type { RoleplayInjected, RoleplayToolName } from './face.ts'

/** Native presentation services and generated roleplay Host methods. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.roleplay', 'remote.pluginManager']

const toolNames: readonly RoleplayToolName[] = [
  'world-read', 'world-update', 'body-read', 'body-update',
  'clothing-read', 'clothing-update', 'relationship-read', 'relationship-update',
]

/**
 * Register roleplay's native controls and independent state bookmarks.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('roleplay', { zh, en }))
  const t = ctx.locale.bind('roleplay')
  const notices = createSnapshotStore<NoticeState | null>(null)
  let seq = 0
  const face = (sessionId: SessionId): RoleplayInjected => ({
    listCards: async () => {
      const result = await ctx.remote.roleplay.listCards(sessionId)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    previewCard: async () => {
      const result = await ctx.remote.roleplay.previewCard(sessionId)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    listTools: async () => {
      const result = await ctx.remote.pluginManager.listPlugins()
      if (!result.ok) throw new Error(result.error.message)
      return toolNames.map((name) => {
        const row = result.value.find(entry => entry.moduleName === `@deepseek-ai/dsh-tool-roleplay/${name}`)
        if (row === undefined) throw new Error(t('toolsUnavailable'))
        return { name, enabled: row.enabled, canChange: row.readOnlyReason === undefined }
      })
    },
    setToolEnabled: async (name, enabled) => {
      const inventory = await ctx.remote.pluginManager.listPlugins()
      if (!inventory.ok) throw new Error(inventory.error.message)
      const row = inventory.value.find(entry => entry.moduleName === `@deepseek-ai/dsh-tool-roleplay/${name}`)
      if (row === undefined) throw new Error(t('toolsUnavailable'))
      const result = await ctx.remote.pluginManager.setPluginEnabled(row.entryId, enabled)
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.application !== 'applied' && result.value.application !== 'restart-required') throw new Error(t('failed'))
      return result.value.application
    },
    selectCard: async (name) => {
      const result = await ctx.remote.roleplay.selectCard(sessionId, name)
      if (!result.ok) throw new Error(result.error.message)
      try { localStorage.setItem('dsh.roleplay.last-card', name) }
      catch (_storageUnavailable) { /* Card selection remains usable without browser preferences. */ }
    },
    preferredCard: () => {
      try { return localStorage.getItem('dsh.roleplay.last-card') }
      catch (_storageUnavailable) { return null }
    },
    edit: async (category, patch) => {
      const result = await ctx.remote.roleplay.edit(sessionId, category, patch)
      if (!result.ok) throw new Error(result.error.message)
    },
    undo: async () => {
      const result = await ctx.remote.roleplay.undo(sessionId)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    regenerate: async () => {
      const result = await ctx.remote.roleplay.regenerate(sessionId)
      if (!result.ok) throw new Error(result.error.message)
    },
    notify: (key, success) => { notices.set({ key, success, seq: ++seq }) },
  })
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'roleplay', order: 5, locale: 'roleplay', inject: face,
  }, RoleplayDock))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'roleplay.notice', locale: 'roleplay',
    inject: () => ({ hooks: { notice: notices }, dismiss: () => { notices.set(null) } }),
  }, RoleplayNotice))
  for (const category of ['card', 'world', 'body', 'clothing', 'relationship'] as const) {
    const id = `@deepseek-ai/dsh-client-ui-roleplay/${category}`
    ctx.effect(() => ctx.sidebarRightTabs.register({
      id, kind: `roleplay-${category}`, priority: 'builtin', title: () => t(category),
      guide: [{ id: category, order: 50, title: () => t(category), icon: tabIcons[category] }],
    }))
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab', key: id, locale: 'roleplay',
      inject: sessionId => ({ ...face(sessionId), category }),
    }, RoleplayPanel))
    ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab.title', key: id, inject: () => ({ category }),
    }, RoleplayTitle))
  }
}
