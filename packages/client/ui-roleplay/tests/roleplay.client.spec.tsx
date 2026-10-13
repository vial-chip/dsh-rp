// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate, sessionSnapshot } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RoleplayState } from '@deepseek-ai/dsh-roleplay/types'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import { RoleplayDock } from '../src/client/Dock.tsx'
import { RoleplayPanel } from '../src/client/Panel.tsx'
import { RoleplayTools } from '../src/client/Tools.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)
const state: RoleplayState = { card: null, selection: null, world: { '天气': '晴' }, body: {}, clothing: {}, relationship: { '好感': 10 }, retractedTurns: [] }
function face() {
  return {
    listCards: vi.fn(async () => [{ name: '小林', description: '温柔的同伴' }, { name: '小雨', description: '活泼的同伴' }]),
    previewCard: vi.fn(async () => ({ name: 'daily-companion', description: '日常同伴', content: '你是温柔的成年同伴。' })),
    listTools: vi.fn(async () => []), setToolEnabled: vi.fn(async () => 'applied' as const),
    selectCard: vi.fn(async (_name: string) => {}), preferredCard: () => '小雨',
    edit: vi.fn(async () => {}), undo: vi.fn(async () => ({ input: null })), regenerate: vi.fn(async () => {}), notify: vi.fn(),
  }
}
function dock(over: Partial<Parameters<typeof RoleplayDock>[0]> = {}) {
  const inputActions = {
    setDraft: vi.fn(), persistDraft: vi.fn(),
    captureInsertion: vi.fn(() => ({ start: 0, end: 0, draftRev: 0 })), insertText: vi.fn(() => true),
    addAttachments: vi.fn(() => true), removeAttachment: vi.fn(), pruneAttachments: vi.fn(), submit: vi.fn(),
  }
  return {
    ...face(), t,
    useProjection: (() => state) as Parameters<typeof RoleplayDock>[0]['useProjection'],
    useSession: ((select: (s: SessionSnapshot) => unknown) => select({ ...sessionSnapshot(SessionId('roleplay-ui')), blank: true })) as Parameters<typeof RoleplayDock>[0]['useSession'],
    inputActions, ...over,
  } as Parameters<typeof RoleplayDock>[0] & { inputActions: typeof inputActions }
}
function panel(category: 'world' | 'relationship' | 'card', projected = state) {
  return {
    ...face(), t, category,
    useTabInfo: vi.fn(() => { throw new Error('This state body does not read tab navigation') }),
    useProjection: (() => projected) as Parameters<typeof RoleplayPanel>[0]['useProjection'],
  } as Parameters<typeof RoleplayPanel>[0]
}
afterEach(cleanup)
it('changes one native application tool switch and reads its saved state', async () => {
  let enabled = true
  const props = {
    ...face(), t,
    listTools: vi.fn(async () => [{ name: 'world-read' as const, enabled, canChange: true }]),
    setToolEnabled: vi.fn(async (_name: string, next: boolean) => { enabled = next; return 'applied' as const }),
  }
  render(<RoleplayTools {...props} />)
  const toggle = await screen.findByRole('switch', { name: '读取世界' })
  fireEvent.click(toggle)
  await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('false') })
  expect(props.setToolEnabled).toHaveBeenCalledWith('world-read', false)
  expect(props.notify).toHaveBeenCalledWith('toolsSaved', true)
  expect(props.regenerate).not.toHaveBeenCalled()
})
it('keeps tool state visible when native plugin management fails', async () => {
  const props = {
    ...face(), t,
    listTools: vi.fn(async () => [{ name: 'body-update' as const, enabled: true, canChange: true }]),
    setToolEnabled: vi.fn(async (): Promise<'applied'> => { throw new Error('fail') }),
  }
  render(<RoleplayTools {...props} />)
  const toggle = await screen.findByRole('switch', { name: '更新身体' })
  fireEvent.click(toggle)
  await waitFor(() => { expect(props.notify).toHaveBeenCalledWith('failed', false) })
  expect(toggle.getAttribute('aria-checked')).toBe('true')
})
it('previews the selected character before its first interaction without selecting or submitting', async () => {
  const props = panel('card')
  render(<RoleplayPanel {...props} />)
  await screen.findByText('你是温柔的成年同伴。')
  expect(screen.getByRole('heading', { name: '日常同伴' })).toBeTruthy()
  expect(props.selectCard).not.toHaveBeenCalled()
  expect(props.regenerate).not.toHaveBeenCalled()
})
it('preselects the last available character for a new roleplay session', async () => {
  const props = dock()
  render(<RoleplayDock {...props} />)
  await waitFor(() => { expect(props.selectCard).toHaveBeenCalledWith('小雨') })
  expect(props.undo).not.toHaveBeenCalled()
  expect(props.regenerate).not.toHaveBeenCalled()
})
it('keeps fixed character content and hides selection after the first message', () => {
  const props = dock({ useProjection: (() => ({ ...state, card: { name: '小林', description: '', content: '温柔的同伴' } })) })
  render(<RoleplayDock {...props} />)
  expect(screen.getByText('角色设定已固定')).toBeTruthy()
  expect(props.listCards).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '选择角色卡' })).toBeNull()
})
it('opens saved state without requesting a model response and edits only the chosen field', async () => {
  const props = panel('world')
  render(<RoleplayPanel {...props} />)
  expect(screen.getByText('晴')).toBeTruthy()
  expect(props.listCards).not.toHaveBeenCalled()
  expect(props.regenerate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '编辑 天气' }))
  fireEvent.change(screen.getByRole('textbox', { name: '记录内容' }), { target: { value: '雨' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => { expect(props.edit).toHaveBeenCalledWith('world', { '天气': '雨' }) })
  expect(props.notify).toHaveBeenCalledWith('saved', true)
})
it('edits relationship values as absolute numbers and rejects empty input', async () => {
  const props = panel('relationship')
  render(<RoleplayPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑 好感' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: '数值' }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(props.edit).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toBe('请填写项目名称和有效内容')
  fireEvent.change(screen.getByRole('spinbutton', { name: '数值' }), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => { expect(props.edit).toHaveBeenCalledWith('relationship', { '好感': 20 }) })
})
it('retains saved fields and the draft when a direct edit fails', async () => {
  const props = panel('world')
  props.edit = vi.fn(async () => { throw new Error('fail') })
  render(<RoleplayPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑 天气' }))
  fireEvent.change(screen.getByRole('textbox', { name: '记录内容' }), { target: { value: '雨' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => { expect(props.notify).toHaveBeenCalledWith('failed', false) })
  expect(screen.getByText('晴')).toBeTruthy()
  expect(screen.getByRole('textbox', { name: '记录内容' })).toHaveProperty('value', '雨')
})
it('keeps the empty-card notice hidden until the card list settles', async () => {
  let resolve: (cards: []) => void = () => {}
  const props = dock({ listCards: vi.fn(() => new Promise<[]>((done) => { resolve = done })) })
  render(<RoleplayDock {...props} />)
  expect(screen.queryByText('没有可用的角色卡')).toBeNull()
  expect(screen.getByRole('button', { name: '选择角色卡' })).toHaveProperty('disabled', true)
  resolve([])
  await screen.findByText('没有可用的角色卡')
})
it('retries the card query and applies the remembered selection after failure', async () => {
  const props = dock()
  props.listCards = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue([{ name: 'daily-companion', description: '日常同伴' }])
  render(<RoleplayDock {...props} />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => { expect(props.selectCard).toHaveBeenCalledWith('daily-companion') })
  expect(screen.queryByRole('alert')).toBeNull()
})
it('shows a Chinese card description instead of its internal skill name', async () => {
  const props = dock({
    listCards: vi.fn(async () => [{ name: 'daily-companion', description: '日常同伴' }]),
    useProjection: (() => ({ ...state, selection: 'daily-companion' })),
  })
  render(<RoleplayDock {...props} />)
  await screen.findByRole('button', { name: '日常同伴' })
  expect(screen.queryByText('daily-companion')).toBeNull()
})
it('restores withdrawn text to the native composer without submitting it', async () => {
  const props = dock({
    undo: vi.fn(async () => ({ input: '我们回家吧' })),
    useSession: ((select: (s: SessionSnapshot) => unknown) => select({ ...sessionSnapshot(SessionId('roleplay-ui')), blank: false, running: false })) as Parameters<typeof RoleplayDock>[0]['useSession'],
  })
  render(<RoleplayDock {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '撤销最近一轮' }))
  await waitFor(() => { expect(props.inputActions.setDraft).toHaveBeenCalledWith('我们回家吧') })
  expect(props.inputActions.persistDraft).toHaveBeenCalledOnce()
  expect(props.regenerate).not.toHaveBeenCalled()
})
it('leaves the composer unchanged when undo withdraws a continuation', async () => {
  const props = dock({
    useSession: ((select: (s: SessionSnapshot) => unknown) => select({ ...sessionSnapshot(SessionId('roleplay-ui')), blank: false, running: false })) as Parameters<typeof RoleplayDock>[0]['useSession'],
  })
  render(<RoleplayDock {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '撤销最近一轮' }))
  await waitFor(() => { expect(props.notify).toHaveBeenCalledWith('undoneContinue', true) })
  expect(props.inputActions.setDraft).not.toHaveBeenCalled()
})
it('disables undo and regeneration while the session is running', () => {
  const props = dock({
    useSession: ((select: (s: SessionSnapshot) => unknown) => select({ ...sessionSnapshot(SessionId('roleplay-ui')), blank: false, running: true })) as Parameters<typeof RoleplayDock>[0]['useSession'],
  })
  render(<RoleplayDock {...props} />)
  expect(screen.getByRole('button', { name: '撤销最近一轮' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: '重新生成' })).toHaveProperty('disabled', true)
})
