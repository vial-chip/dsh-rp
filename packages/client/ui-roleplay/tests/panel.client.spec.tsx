// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CharacterProfile, CharacterProfileId } from '@deepseek-ai/dsh-roleplay/types'
import { RoleplayPanel } from '../src/client/RoleplayPanel.tsx'
import { RoleplayClient, type RoleplayActions } from '../src/client/model.ts'
import { en, zh } from '../src/client/locales.ts'
import { CharacterAction, CharacterTab, CharacterTitle } from '../src/client/CharacterTab.tsx'
import { sessionSnapshot } from '@deepseek-ai/dsh-client-test-runtime'
import { RoleplayHub } from '../src/client/RoleplayHub.tsx'

import { sessionId, memoryId, conflictId, profile, remoteFor } from './fixtures.client.ts'

afterEach(cleanup)

function mount(current: CharacterProfile, remote: RoleplayActions) {
  const openSession = vi.fn()
  const model = new RoleplayClient(remote)
  model.accept(current)
  const locale = new LocaleRuntime(new Context())
  locale.register('roleplay', { en, zh })
  const t = locale.bind('roleplay')
  function View() {
    const data = useSyncExternalStore(listener => model.data.subscribe(listener), () => model.data.getSnapshot())
    const saved = data.profiles[0]!
    return <RoleplayPanel profile={saved} sessionId={sessionId} actions={model.actions} openSession={openSession}
      onChanged={(profile) => { model.accept(profile) }} history={data.history[sessionId] ?? []} t={t} />
  }
  render(<View />)
  return openSession
}


function mountHub(remote: RoleplayActions, initialOpen = true) {
  const model = new RoleplayClient(remote)
  const locale = new LocaleRuntime(new Context())
  locale.register('roleplay', { en, zh })
  const openSession = vi.fn()
  const close = vi.fn()
  function View({ open }: { open: boolean }) {
    return <RoleplayHub useRoleplayOpen={selector => selector(open)}
      useRoleplayData={selector => selector(useSyncExternalStore(
        listener => model.data.subscribe(listener), () => model.data.getSnapshot()))}
      actions={model.actions} openSession={openSession} close={close}
      onChanged={(saved) => { model.accept(saved) }} t={locale.bind('roleplay')} />
  }
  const rendered = render(<View open={initialOpen} />)
  return { model, openSession, close, setOpen: (open: boolean) => { rendered.rerender(<View open={open} />) } }
}

describe('authoritative character panel', () => {
  it('shows an explicit empty memory state for a new portrayal', () => {
    const current = profile()
    current.state.memories = {}
    mount(current, remoteFor(current))
    expect(screen.getByText('No selected memories yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Invalidate' })).toBeNull()
  })


  it.each([false, true])('handles a rejected tab catalog with unmounted=%s', async (unmounted) => {
    const remote = remoteFor(profile())
    let reject: ((reason: Error) => void) | undefined
    vi.mocked(remote.profiles).mockImplementationOnce(() => new Promise((_resolve, refuse) => { reject = refuse }))
    const model = new RoleplayClient(remote)
    const locale = new LocaleRuntime(new Context())
    locale.register('roleplay', { en, zh })
    const view = render(<CharacterTab sessionId={sessionId} useSession={selector => selector(sessionSnapshot(sessionId))}
      useRoleplayData={selector => selector(model.data.getSnapshot())} actions={model.actions}
      openSession={vi.fn()} onChanged={(saved) => { model.accept(saved) }} t={locale.bind('roleplay')} />)
    if (unmounted) view.unmount()
    await act(async () => { reject?.(new Error('Transport unavailable')) })
    if (unmounted) expect(screen.queryByRole('alert')).toBeNull()
    else expect(screen.getByRole('alert').textContent).toContain('Transport unavailable')
  })

  it.each([false, true])('discards hub loading completion after closing, rejected=%s', async (rejected) => {
    const remote = remoteFor(profile())
    let complete: ((value: Awaited<ReturnType<RoleplayActions['cards']>>) => void) | undefined
    let reject: ((reason: Error) => void) | undefined
    vi.mocked(remote.cards).mockImplementationOnce(() => new Promise((resolve, refuse) => { complete = resolve; reject = refuse }))
    const { setOpen } = mountHub(remote)
    expect(screen.getByRole('status')).toBeTruthy()
    setOpen(false)
    await act(async () => {
      if (rejected) reject?.(new Error('Card catalog failed'))
      else complete?.({ ok: true, value: [] })
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens an initially closed hub with no cards and falls back to a card name for an untitled portrayal', async () => {
    const current = profile()
    current.state.scenes[sessionId]!.fields.place = 'Kitchen'
    current.state.scenes[sessionId]!.fields.time = 'Evening'
    current.title = ''
    const remote = remoteFor(current)
    vi.mocked(remote.cards).mockResolvedValueOnce({ ok: true, value: [] })
    const { setOpen } = mountHub(remote, false)
    expect(remote.cards).not.toHaveBeenCalled()
    setOpen(true)
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create profile' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'lin' }))
    expect(screen.getByRole('textbox', { name: 'Opening situation (optional)' })).toBeTruthy()
    expect(screen.getByText('Kitchen · Evening')).toBeTruthy()
  })

  it('deduplicates profile creation while pending and reports a non-Error rejection', async () => {
    const remote = remoteFor(profile())
    let reject: ((reason: string) => void) | undefined
    vi.mocked(remote.createProfile).mockImplementationOnce(() => new Promise((_resolve, refuse) => { reject = refuse }))
    mountHub(remote)
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
    const form = screen.getByRole('textbox', { name: 'Profile name' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(remote.createProfile).toHaveBeenCalledOnce()
    await act(async () => { reject?.('Creation unavailable') })
    expect(screen.getByRole('alert').textContent).toBe('Creation unavailable')
  })

  it.each(['archive', 'profiles', 'createConversation'] as const)('keeps %s navigation errors in the hub', async (method) => {
    const current = profile()
    const remote = remoteFor(current)
    const { openSession } = mountHub(remote)
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: 'Lin' }))
    vi.mocked(remote[method]).mockResolvedValueOnce({ ok: false,
      error: { name: 'RemoteError', isDSHRemoteError: true, code: 'gateway/internal', message: 'Operation unavailable', details: {} } })
    fireEvent.click(screen.getByRole('button', { name: method === 'createConversation' ? 'New conversation' : 'Archive' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Operation unavailable')
    expect(openSession).not.toHaveBeenCalled()
  })

  it('opens a branch chosen from the hub details and closes the hub', async () => {
    const remote = remoteFor(profile())
    const { openSession, close } = mountHub(remote)
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: 'Lin' }))
    fireEvent.click(screen.getByText('Character details'))
    fireEvent.click(screen.getByRole('button', { name: 'Choose a point in history' }))
    await screen.findByText('Shall we make tea?')
    fireEvent.click(screen.getByRole('button', { name: 'Branch here' }))
    await waitFor(() => { expect(openSession).toHaveBeenCalledWith(SessionId('branch')) })
    expect(close).toHaveBeenCalledOnce()
  })

  it.each(['remote', 'transport'] as const)('reports %s edit refusal and disables an invalid memory', async (failure) => {
    const current = profile()
    current.state.memories[memoryId]!.status = 'invalid'
    const remote = remoteFor(current)
    if (failure === 'remote') vi.mocked(remote.edit).mockResolvedValueOnce({ ok: false,
      error: { name: 'RemoteError', isDSHRemoteError: true, code: 'gateway/internal', message: 'Edit refused', details: {} } })
    else vi.mocked(remote.edit).mockRejectedValueOnce('Edit refused')
    mount(current, remote)
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'tea' }).disabled).toBe(true)
    const input = screen.getByRole('textbox', { name: 'Player name' })
    fireEvent.change(input, { target: { value: 'Rain' } })
    fireEvent.submit(input.closest('form')!)
    expect((await screen.findByRole('alert')).textContent).toBe('Edit refused')
  })


  it('labels the character tab from its live record and shows catalog failures until a successful refresh', async () => {
    const current = profile()
    const remote = remoteFor(current)
    const model = new RoleplayClient(remote)
    const locale = new LocaleRuntime(new Context())
    locale.register('roleplay', { en, zh })
    vi.mocked(remote.profiles).mockResolvedValueOnce({ ok: false,
      error: { name: 'RemoteError', isDSHRemoteError: true, code: 'gateway/internal', message: 'Unavailable profile', details: {} } })
    function View({ running }: { running: boolean }) {
      return <CharacterTab sessionId={sessionId} useSession={selector => selector({ ...sessionSnapshot(sessionId), running })}
        useRoleplayData={selector => selector(useSyncExternalStore(
          listener => model.data.subscribe(listener), () => model.data.getSnapshot()))}
        actions={model.actions} openSession={vi.fn()} onChanged={(saved) => { model.accept(saved) }} t={locale.bind('roleplay')} />
    }
    const view = render(<View running />)
    expect((await screen.findByRole('alert')).textContent).toBe('Unavailable profile')
    view.rerender(<View running={false} />)
    expect(await screen.findByRole('spinbutton', { name: 'Trust' })).toBeTruthy()
    cleanup()
    render(<CharacterTitle useTabInfo={() => ({ sidebar: { expanded: true, fullscreen: false }, panel: { id: brandString<PaneId>('pane') },
      tab: { id: brandString<TabId>('tab'), kind: 'roleplay', title: 'Lin at home', contentId: 'roleplay', visible: true,
        navigation: { address: 'roleplay', params: undefined, revision: 0 }, signal: new AbortController().signal,
        actions: { bindCommands: () => () => {}, openResource: vi.fn(), openTab: vi.fn(), close: vi.fn() } } })} />)
    expect(screen.getByText('Lin at home')).toBeTruthy()
  })

  it('ignores a character catalog response after its tab unmounts', async () => {
    const remote = remoteFor(profile())
    let complete: ((value: Awaited<ReturnType<RoleplayActions['profiles']>>) => void) | undefined
    vi.mocked(remote.profiles).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    const model = new RoleplayClient(remote)
    const locale = new LocaleRuntime(new Context())
    locale.register('roleplay', { en, zh })
    const view = render(<CharacterTab sessionId={sessionId} useSession={selector => selector(sessionSnapshot(sessionId))}
      useRoleplayData={selector => selector(model.data.getSnapshot())} actions={model.actions}
      openSession={vi.fn()} onChanged={(saved) => { model.accept(saved) }} t={locale.bind('roleplay')} />)
    view.unmount()
    await act(async () => { complete?.({ ok: true, value: [profile()] }) })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retains the newest card catalog when an older request settles last', async () => {
    const current = profile()
    const remote = remoteFor(current)
    let complete: ((value: Awaited<ReturnType<RoleplayActions['cards']>>) => void) | undefined
    vi.mocked(remote.cards).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    const model = new RoleplayClient(remote)
    const pending = model.actions.cards()
    const fresh = { ...current.state.card, content: 'Latest card' }
    vi.mocked(remote.cards).mockResolvedValueOnce({ ok: true, value: [fresh] })
    await model.actions.cards()
    complete?.({ ok: true, value: [current.state.card] })
    await pending
    expect(model.data.getSnapshot().cards).toEqual([fresh])
    model.accept(current)
    model.accept({ ...current, id: brandString<CharacterProfileId>('another-profile') })
    model.accept({ ...current, revision: 4 })
    expect(model.data.getSnapshot().profiles).toHaveLength(2)
  })


  it('creates a portrayal from a selected card and starts only its explicitly requested scene', async () => {
    const current = profile()
    const remote = remoteFor(current)
    vi.mocked(remote.profiles).mockResolvedValueOnce({ ok: true, value: [] })
    const { openSession, close } = mountHub(remote)
    await screen.findByText('Create a character profile to start a conversation.')
    fireEvent.click(screen.getByRole('button', { name: 'lin' }))
    for (const [label, value] of [['Profile name', 'Rainy tea'], ['Player name', 'Rain'],
      ['Player appearance', 'Green coat'], ['Player background', 'Adult neighbor']] as const) {
      fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
    }
    fireEvent.submit(screen.getByRole('textbox', { name: 'Profile name' }).closest('form')!)
    await waitFor(() => { expect(remote.createProfile).toHaveBeenCalledWith('lin',
      { name: 'Rain', appearance: 'Green coat', background: 'Adult neighbor' }, 'Rainy tea') })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'New conversation' }).disabled).toBe(false) })
    fireEvent.change(screen.getByRole('textbox', { name: 'Opening situation (optional)' }), { target: { value: 'Sunday tea.' } })
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
    await waitFor(() => { expect(openSession).toHaveBeenCalledWith(sessionId) })
    expect(remote.createConversation).toHaveBeenCalledWith(current.id, 'Sunday tea.')
    expect(close).toHaveBeenCalledOnce()
    expect(remote.continue).not.toHaveBeenCalled()
  })

  it.each(['cards', 'profiles'] as const)('reports a failed %s catalog and recovers when reopened', async (method) => {
    const remote = remoteFor(profile())
    vi.mocked(remote[method]).mockResolvedValueOnce({ ok: false,
      error: { name: 'RemoteError', isDSHRemoteError: true, code: 'gateway/internal', message: 'Catalog unavailable', details: {} } })
    const { setOpen } = mountHub(remote)
    expect((await screen.findByRole('alert')).textContent).toContain('Catalog unavailable')
    setOpen(false)
    setOpen(true)
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
    expect(remote[method]).toHaveBeenCalledTimes(2)
  })

  it('shows administrative refusal and retry on the hub without navigating', async () => {
    const remote = remoteFor(profile())
    vi.mocked(remote.createProfile).mockResolvedValueOnce({ ok: false,
      error: { name: 'RemoteError', isDSHRemoteError: true, code: 'gateway/internal', message: 'Profile refused', details: {} } })
    const { openSession } = mountHub(remote)
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
    const form = screen.getByRole('textbox', { name: 'Profile name' }).closest('form')!
    fireEvent.submit(form)
    expect((await screen.findByRole('alert')).textContent).toBe('Profile refused')
    fireEvent.submit(form)
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    expect(openSession).not.toHaveBeenCalled()
    expect(remote.createProfile).toHaveBeenCalledTimes(2)
  })

  it('saves player and memory corrections and exposes memory revision sources', async () => {
    const current = profile()
    const source = current.state.memories[memoryId]!.source
    current.history.push({ revision: 3, source, touched: [`memory/${memoryId}`], deltas: {}, state: structuredClone(current.state), conflicts: [], undone: false })
    const remote = remoteFor(current)
    mount(current, remote)
    expect(screen.getByText(/"revision": 3/).textContent).toContain('Likes jasmine tea')
    for (const [label, value, change] of [
      ['Player name', 'Rain', { player: { ...current.state.player, name: 'Rain' } }],
      ['tea', 'Prefers green tea', { memory: { id: memoryId, text: 'Prefers green tea' } }],
    ] as const) {
      const input = screen.getByRole('textbox', { name: label })
      fireEvent.change(input, { target: { value } })
      fireEvent.submit(input.closest('form')!)
      await waitFor(() => { expect(remote.edit).toHaveBeenCalledWith(current.id, sessionId, change) })
      await waitFor(() => { expect(screen.getByRole<HTMLInputElement>('textbox', { name: label }).disabled).toBe(false) })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Apply current card version' }))
    await waitFor(() => { expect(remote.applyCard).toHaveBeenCalledWith(current.id, sessionId) })
  })

  it('shows branch refusals and renders an unrelated session as an empty character panel', async () => {
    const current = profile()
    const remote = remoteFor(current)
    vi.mocked(remote.branch).mockResolvedValueOnce({ ok: false,
      error: { name: 'RemoteError', isDSHRemoteError: true, code: 'gateway/internal', message: 'Branch refused', details: {} } })
    mount(current, remote)
    fireEvent.click(screen.getByRole('button', { name: 'Choose a point in history' }))
    await screen.findByText('Shall we make tea?')
    fireEvent.click(screen.getByRole('button', { name: 'Branch here' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Branch refused')
    cleanup()
    const unrelated = structuredClone(current)
    unrelated.state.scenes = {}
    mount(unrelated, remote)
    expect(screen.getByText('Choose a roleplay conversation to view its character.')).toBeTruthy()
  })

  it('refreshes a character tab after reply completion and hides character actions on Work', async () => {
    const current = profile()
    const remote = remoteFor(current)
    const model = new RoleplayClient(remote)
    model.accept(current)
    const locale = new LocaleRuntime(new Context())
    locale.register('roleplay', { en, zh })
    const t = locale.bind('roleplay')
    function View({ running }: { running: boolean }) {
      return <CharacterTab sessionId={sessionId} useSession={selector => selector({ ...sessionSnapshot(sessionId), running })}
        useRoleplayData={selector => selector(useSyncExternalStore(
          listener => model.data.subscribe(listener), () => model.data.getSnapshot()))}
        actions={model.actions} openSession={vi.fn()} onChanged={(saved) => { model.accept(saved) }} t={t} />
    }
    const view = render(<View running />)
    await waitFor(() => { expect(remote.profiles).toHaveBeenCalledOnce() })
    view.rerender(<View running={false} />)
    await waitFor(() => { expect(remote.profiles).toHaveBeenCalledTimes(2) })
    const show = vi.fn()
    cleanup()
    const action = render(<CharacterAction useProjection={() => 'roleplay'} show={show} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Roleplay' }))
    expect(show).toHaveBeenCalledOnce()
    action.rerender(<CharacterAction useProjection={() => 'standard'} show={show} t={t} />)
    expect(screen.queryByRole('button', { name: 'Roleplay' })).toBeNull()
  })

  it.each([
    ['Refresh', 'read'], ['Continue', 'continue'], ['Apply current card version', 'applyCard'],
    ['Undo latest reply', 'undo'], ['Regenerate latest reply', 'undo'], ['Choose a point in history', 'history'],
  ] as const)('keeps %s failures visible without accepting a profile or navigating', async (label, method) => {
    const current = profile()
    const remote = remoteFor(current)
    vi.mocked(remote[method]).mockResolvedValueOnce({ ok: false,
      error: { name: 'RemoteError', isDSHRemoteError: true, code: 'gateway/internal', message: 'Host unavailable', details: {} } })
    const openSession = mount(current, remote)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect((await screen.findByRole('alert')).textContent).toBe('Host unavailable')
    expect(openSession).not.toHaveBeenCalled()
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Trust' }).value).toBe('35')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: label }).disabled).toBe(false)
  })

  it('applies a reviewed memory and renders card-specific field names literally', async () => {
    const current = profile()
    current.conflicts = []
    current.state.memories[memoryId]!.status = 'review'
    current.state.scenes[sessionId]!.fields['toString'] = 'custom value'
    const remote = remoteFor(current)
    mount(current, remote)
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'toString' }).value).toBe('custom value')
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await waitFor(() => { expect(remote.edit).toHaveBeenCalledWith(current.id, sessionId, { memory: { id: memoryId, status: 'active' } }) })
  })

  it('continues explicitly and opens replacements only after successful undo or regeneration', async () => {
    const current = profile()
    const remote = remoteFor(current)
    const openSession = mount(current, remote)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(false) })
    expect(remote.continue).toHaveBeenCalledWith(current.id, sessionId)
    fireEvent.click(screen.getByRole('button', { name: 'Undo latest reply' }))
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Undo latest reply' }).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate latest reply' }))
    await waitFor(() => { expect(remote.undo).toHaveBeenCalledWith(current.id, sessionId, true) })
    expect(remote.undo).toHaveBeenCalledWith(current.id, sessionId, false)
    await waitFor(() => { expect(openSession).toHaveBeenCalledTimes(2) })
  })
  it('loads the shared catalog, archives and restores a scene, and opens it without extra dialogue', async () => {
    const current = profile()
    const remote = remoteFor(current)
    const model = new RoleplayClient(remote)
    const openSession = vi.fn()
    const close = vi.fn()
    const locale = new LocaleRuntime(new Context())
    locale.register('roleplay', { en, zh })
    const t = locale.bind('roleplay')
    vi.mocked(remote.archive).mockImplementation(async (_id, scene, archived) => {
      const saved = { ...current, revision: archived ? 4 : 5, state: { ...current.state,
        scenes: { [scene]: { ...current.state.scenes[scene]!, archived } } } }
      vi.mocked(remote.profiles).mockResolvedValue({ ok: true, value: [saved] })
      return { ok: true, value: saved }
    })
    function View() {
      return <RoleplayHub useRoleplayOpen={selector => selector(true)}
        useRoleplayData={selector => selector(useSyncExternalStore(
          listener => model.data.subscribe(listener), () => model.data.getSnapshot()))}
        actions={model.actions} openSession={openSession} close={close} onChanged={(profile) => { model.accept(profile) }} t={t} />
    }
    render(<View />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lin' }))
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Archive' }).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Restore' }).disabled).toBe(false) })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Open' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Open' }).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(openSession).toHaveBeenCalledWith(sessionId)
    expect(close).toHaveBeenCalledOnce()
    expect(remote.continue).not.toHaveBeenCalled()
  })
  it('shares accepted profile changes and discards a catalog response started before a correction', async () => {
    const current = profile()
    const remote = remoteFor(current)
    let complete: ((value: Awaited<ReturnType<RoleplayActions['profiles']>>) => void) | undefined
    vi.mocked(remote.profiles).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    const model = new RoleplayClient(remote)
    model.accept(current)
    const pending = model.actions.profiles()
    const corrected = { ...current, revision: 4, state: { ...current.state, metrics: { trust: 72 } } }
    vi.mocked(remote.edit).mockResolvedValueOnce({ ok: true, value: corrected })
    await model.actions.edit(current.id, sessionId, { metrics: { trust: 72 } })
    complete?.({ ok: true, value: [current] })
    await pending
    expect(model.data.getSnapshot().profiles).toEqual([corrected])
    await model.actions.read(current.id)
    expect(model.data.getSnapshot().profiles[0]!.revision).toBe(4)
    vi.mocked(remote.edit).mockResolvedValueOnce({ ok: false,
      error: { name: 'RemoteError', isDSHRemoteError: true, message: 'Write refused', code: 'gateway/internal', details: {} } })
    await model.actions.edit(current.id, sessionId, { metrics: { trust: 99 } })
    expect(model.data.getSnapshot().profiles).toEqual([corrected])
  })
  it('holds an edit pending, then displays the accepted absolute value without duplicate submission', async () => {
    const current = profile()
    const remote = remoteFor(current)
    let accept: (() => void) | undefined
    vi.mocked(remote.edit).mockImplementation(() => new Promise((resolve) => {
      accept = () => { resolve({ ok: true as const, value: { ...current, revision: 4,
        state: { ...current.state, metrics: { trust: 72 } } } }) }
    }))
    mount(current, remote)
    const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Trust' })
    fireEvent.change(input, { target: { value: '72' } })
    const form = input.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)
    await waitFor(() => { expect(input.disabled).toBe(true) })
    fireEvent.submit(form!)
    expect(remote.edit).toHaveBeenCalledTimes(1)
    expect(remote.edit).toHaveBeenCalledWith(current.id, sessionId, { metrics: { trust: 72 } })
    await act(async () => { accept?.() })
    expect(input.value).toBe('72')
    expect(input.disabled).toBe(false)
    expect(form?.querySelector('button')?.disabled).toBe(true)
  })

  it('shows rejected edits beside the form and allows retry without advancing dialogue', async () => {
    const current = profile()
    const remote = remoteFor(current)
    vi.mocked(remote.edit).mockRejectedValueOnce(new Error('Profile write failed'))
    mount(current, remote)
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'AI clothing' })
    fireEvent.change(input, { target: { value: 'red coat' } })
    fireEvent.submit(input.closest('form')!)
    expect((await screen.findByRole('alert')).textContent).toContain('Profile write failed')
    expect(input.disabled).toBe(false)
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    expect(remote.edit).toHaveBeenCalledTimes(2)
    expect(remote.continue).not.toHaveBeenCalled()
  })

  it('exposes evidence, invalidates memory, resolves conflicts and branches at the selected visible reply', async () => {
    const current = profile()
    const remote = remoteFor(current)
    const openSession = mount(current, remote)
    expect(screen.getByText(/user-evidence/).textContent).toContain('user-evidence')
    fireEvent.click(screen.getByRole('button', { name: 'Invalidate' }))
    await waitFor(() => { expect(remote.edit).toHaveBeenCalledWith(current.id, sessionId, { memory: { id: memoryId, status: 'invalid' } }) })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Resolve' }).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await waitFor(() => { expect(remote.edit).toHaveBeenCalledWith(current.id, sessionId, { resolveConflict: conflictId }) })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Choose a point in history' }).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Choose a point in history' }))
    expect((await screen.findByText('Shall we make tea?')).textContent).toBe('Shall we make tea?')
    fireEvent.click(screen.getByRole('button', { name: 'Branch here' }))
    await waitFor(() => { expect(remote.branch).toHaveBeenCalledWith(current.id, sessionId, 7) })
    expect(openSession).toHaveBeenCalledWith(SessionId('branch'))
    expect(remote.continue).not.toHaveBeenCalled()
  })
})
