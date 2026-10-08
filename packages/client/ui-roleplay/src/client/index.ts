/** Shared Web and Desktop roleplay hub and existing right-sidebar panel. */
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IconUserOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { RoleplayHub, type RoleplayHubInjected } from './RoleplayHub.tsx'
import type { RoleplayFace } from './RoleplayPanel.tsx'
import { en, zh } from './locales.ts'
import { CharacterTab, CharacterTitle, CharacterAction, type CharacterTabInjected } from './CharacterTab.tsx'
import { RoleplayClient } from './model.ts'

const ID = '@deepseek-ai/dsh-client-ui-roleplay'
/** Required browser runtime capabilities. */
export const inject = ['slots', 'locale', 'remote', 'remote.roleplay', 'uiWorkspace', 'sidebarRightTabs', 'sidebarRight']

/** Register the hub, character panel and profile navigation. @param ctx Browser context. */
export function apply(ctx: Context): void {
  const opened = createSnapshotStore(false)
  const t = ctx.locale.bind('roleplay')
  const model = new RoleplayClient(ctx.remote.roleplay)
  const face: RoleplayFace = { actions: model.actions, openSession: (id) => { ctx.uiWorkspace.openSession(id) } }
  const hub: RoleplayHubInjected = { ...face, hooks: { roleplayOpen: opened, roleplayData: model.data },
    onChanged: (profile) => { model.accept(profile) }, close: () => { opened.set(false) } }
  const tab: CharacterTabInjected = { ...face, hooks: { roleplayData: model.data }, onChanged: (profile) => { model.accept(profile) } }
  ctx.effect(() => ctx.locale.register('roleplay', { en, zh }))
  ctx.on('roleplay/open', () => { opened.set(true) })
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'roleplay-hub', locale: 'roleplay',
    inject: () => hub,
  }, RoleplayHub)))
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind: 'roleplay', priority: 'builtin', title: () => t('title'),
    guide: [{ id: 'roleplay', order: 15, title: () => t('title'), description: () => t('view'), icon: IconUserOutlineRegular }] }))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: ID, locale: 'roleplay',
    inject: () => tab,
  }, CharacterTab)))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: ID,
  }, CharacterTitle)))
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'roleplay-open', order: 30, locale: 'roleplay',
    inject: () => ({ show: () => { opened.set(true) } }),
  }, CharacterAction)))
}
