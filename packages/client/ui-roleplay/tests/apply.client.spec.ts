import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SidebarRightTabRegistry } from '../../ui-sidebar-right/src/client/tab-registry.ts'
import { tabInfoFactory } from '../../ui-sidebar-right/src/client/tab-info.ts'
import type { RoleplayHubInjected } from '../src/client/RoleplayHub.tsx'
import type { CharacterTabInjected } from '../src/client/CharacterTab.tsx'
import * as Host from '../src/index.ts'
import { profile, remoteFor, sessionId } from './fixtures.client.ts'
import * as Roleplay from '../src/client/index.ts'

function Root(_props: PropsRenderSlots<'shell.overlay' | 'conversation.session.header.actions' | 'sidebar.right.pane.tab' | 'sidebar.right.pane.tab.title'>) {
  return null
}

describe('roleplay interface composition', () => {
  it('registers its hub and character tab against the real slot and locale services', async (test) => {
    const ctx = new Context()
    test.onTestFinished(() => ctx.fiber.dispose())
    const slots = new SlotRegistry(ctx)
    const locale = new LocaleRuntime(ctx)
    const tabs = new SidebarRightTabRegistry(ctx)
    ctx.reflect.provide('locale', locale)
    ctx.reflect.provide('sidebarRightTabs', tabs)
    const remote = remoteFor(profile())
    ctx.reflect.provide('remote', { roleplay: remote })
    ctx.reflect.provide('remote.roleplay', {})
    ctx.reflect.provide('sidebarRight', {})
    const opened: string[] = []
    ctx.reflect.provide('uiWorkspace', { openSession(id: string) { opened.push(id) } })
    slots.register({ name: 'root', children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
      'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
    } }, Root)
    const feature = ctx.plugin(Roleplay)
    await feature
    Host.apply(ctx)
    const hub = slots.entries('shell.overlay')[0]!.inject!() as RoleplayHubInjected & Record<string, unknown>
    const tab = slots.entries('sidebar.right.pane.tab')[0]!.inject!() as CharacterTabInjected & Record<string, unknown>
    expect(hub.hooks.roleplayOpen.getSnapshot()).toBe(false)
    ctx.emit('roleplay/open')
    expect(hub.hooks.roleplayOpen.getSnapshot()).toBe(true)
    hub.close()
    expect(hub.hooks.roleplayOpen.getSnapshot()).toBe(false)
    const action = slots.entries('conversation.session.header.actions')[0]!.inject!() as { show: () => void }
    action.show()
    expect(hub.hooks.roleplayOpen.getSnapshot()).toBe(true)
    const saved = profile()
    hub.onChanged(saved)
    tab.onChanged({ ...saved, revision: 4 })
    expect(hub.hooks.roleplayData.getSnapshot().profiles[0]!.revision).toBe(4)
    tab.openSession(sessionId)
    expect(opened).toEqual([sessionId])
    expect(tabs.get('roleplay')?.title('')).toBe('Roleplay')
    expect(tabs.get('roleplay')?.guide?.[0]?.title()).toBe('Roleplay')
    expect(tabs.get('roleplay')?.guide?.[0]?.description?.()).toBe('Character details')
    expect(locale.bind('roleplay')('newScene')).toBe('New conversation')
  })
})
