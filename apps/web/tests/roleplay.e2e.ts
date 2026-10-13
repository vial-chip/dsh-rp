/** Real browser coverage for roleplay's native composer, state tabs, and plugin switches. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it, onTestFailed } from 'vitest'
import { type ReplayOverrideDoc } from '@deepseek-ai/dsh-llm-replay'
import { ToolCallId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-roleplay'
import { launchWebScaffold, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspaceZh, expandOwningTurnProcess, openSettings, saveFailureShot, REPO_ROOT, ZH_BROWSER_LOCALE } from './support.ts'

let scaffold: WebScaffold
let browser: Browser
let page: Page
let replayDir: string

function reply(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 100, outputTokens: 10 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

beforeAll(async () => {
  replayDir = await mkdtemp(join(tmpdir(), 'dsh-roleplay-browser-'))
  const replayOverride = join(replayDir, 'reply.json')
  const script: ReplayOverrideDoc = ['一起做饭吧。', '先洗菜吧。', '我来准备晚饭。'].map(text => ({ kind: 'chunks', chunks: reply(text) }))
  const id = ToolCallId('roleplay-browser-world')
  const args = JSON.stringify({ changes: [{ field: '天气', value: '晴' }] })
  script.unshift({ kind: 'chunks', chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'roleplay_world_update', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'roleplay_world_update', arguments: args } },
    { type: 'usage', usage: { inputTokens: 100, outputTokens: 10 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] })
  await writeFile(replayOverride, JSON.stringify(script))
  scaffold = await launchWebScaffold({ profile: { packages: [] }, replayFixture: join(replayDir, 'override-only.jsonl'), replayOverride })
  scaffold.ctx.skills.register({ name: 'roleplay-browser-companion', description: '小陈：温和独立、喜欢一起做饭、阅读、散步和分享日常生活的成年同住伙伴。', content: '你是小陈，与用户一起住在公寓，喜欢一起做饭。', source: 'runtime' })
  browser = await chromium.launch()
  page = await browser.newPage({ locale: ZH_BROWSER_LOCALE, viewport: { width: 1440, height: 1000 } })
  await page.goto(scaffold.authenticatedUrl)
  await connectFreshWorkspaceZh(page, scaffold.workspaceCwd, 'roleplay-browser')
}, 120_000)

afterAll(async () => {
  const errors: unknown[] = []
  await browser?.close().catch((error: unknown) => errors.push(error))
  await scaffold?.close().catch((error: unknown) => errors.push(error))
  if (replayDir !== undefined) await rm(replayDir, { recursive: true, force: true }).catch((error: unknown) => errors.push(error))
  if (errors.length > 0) throw new AggregateError(errors, 'roleplay browser cleanup failed')
})

it.skipIf(webSnapshotMode() === 'record')('previews a card, edits state, persists native tools, and restores an interaction', async () => {
  onTestFailed(() => saveFailureShot(page, 'web-e2e-roleplay'))
  await page.getByRole('button', { name: '标准模式', exact: true }).click()
  await page.getByRole('menuitem', { name: /^角色扮演/ }).click()
  const dock = page.locator('[data-roleplay-dock]')
  await dock.waitFor()
  await expect.poll(() => dock.getByRole('button').first().isEnabled()).toBe(true)
  await dock.getByRole('button').first().click()
  await page.getByRole('menuitem', { name: '小陈：温和独立、喜欢一起做饭、阅读、散步和分享日常生活的成年同住伙伴。', exact: true }).click()
  await page.locator('[data-sidebar-right-expand]').click()
  const column = page.locator('[data-rightbar-col]')
  async function tab(id: string) {
    const entry = column.locator(`[data-sidebar-right-guide-entry="roleplay-${id}"]`)
    if (await entry.count() === 0) await column.locator('[data-dockkit-add-tab]').last().click()
    await entry.click()
  }
  await tab('card')
  await column.getByRole('heading', { name: '工具', exact: true }).waitFor()
  await expect.poll(() => column.getByRole('switch').count()).toBe(8)
  await column.getByText('你是小陈，与用户一起住在公寓，喜欢一起做饭。', { exact: true }).waitFor()
  await page.screenshot({ animations: 'disabled', path: join(REPO_ROOT, '.artifacts/roleplay/ui-card.png') })
  const tool = column.getByRole('switch', { name: '读取世界', exact: true })
  expect(await tool.getAttribute('aria-checked')).toBe('true')
  await tool.click()
  await expect.poll(() => tool.getAttribute('aria-checked'), { timeout: 20_000 }).toBe('false')
  const agent = scaffold.ctx.agents.list().find(value => scaffold.ctx.roleplay.stateOf(value.session) !== null)
  expect(agent).toBeDefined()
  if (agent === undefined) throw new Error('roleplay agent missing')
  expect(scaffold.ctx.roleplay.stateOf(agent.session)?.card).toBeNull()
  await expect.poll(() => scaffold.ctx.tools.schemas(agent).some(value => value.name === 'roleplay_world_read')).toBe(false)
  expect((await scaffold.ctx.tools.execute({ agent, callId: ToolCallId('disabled-read'), name: 'roleplay_world_read', arguments: {}, signal: new AbortController().signal })).isError).toBe(true)
  await tool.click()
  await expect.poll(() => tool.getAttribute('aria-checked'), { timeout: 20_000 }).toBe('true')
  await expect.poll(() => scaffold.ctx.tools.schemas(agent).some(value => value.name === 'roleplay_world_read')).toBe(true)
  for (const [id, field, value] of [['world', '地点', '厨房'], ['body', '状态', '精神很好'], ['clothing', '外套', '蓝色'], ['relationship', '信任', '2.5']] as const) {
    await tab(id)
    await column.getByRole('button', { name: '添加状态', exact: true }).click()
    await column.getByLabel('项目名称', { exact: true }).fill(field)
    await column.getByLabel(id === 'relationship' ? '数值' : '记录内容', { exact: true }).fill(value)
    await column.getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(() => column.getByRole('definition').allTextContents()).toContain(value)
    await column.getByLabel('项目名称', { exact: true }).waitFor({ state: 'detached' })
  }
  expect(agent.session.snapshotEvents().some(event => event.type === 'request/header')).toBe(false)
  const composer = page.locator('[data-composer-input][contenteditable="true"]').last()
  await composer.fill('今晚一起做饭。')
  let settled = scaffold.whenTurnSettled()
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await settled
  await page.getByText('一起做饭吧。', { exact: true }).waitFor()
  const toolRow = page.locator('[data-chat-call-id="roleplay-browser-world"]')
  await expandOwningTurnProcess(page, toolRow)
  const disclosure = toolRow.locator('[data-disclosure-row]')
  if (await disclosure.getAttribute('aria-expanded') === 'false') await disclosure.click()
  const result = page.getByText('已更新世界。', { exact: true }).last()
  await result.waitFor({ state: 'visible' })
  expect(agent.session.snapshotEvents().some(event => event.type === 'request/header')).toBe(true)
  await page.screenshot({ animations: 'disabled', path: join(REPO_ROOT, '.artifacts/roleplay/ui-tool-result.png') })
  expect(scaffold.ctx.roleplay.stateOf(agent.session)?.card?.name).toBe('roleplay-browser-companion')
  expect(scaffold.ctx.roleplay.stateOf(agent.session)?.world).toEqual({ 地点: '厨房', 天气: '晴' })
  const prompt = agent.session.snapshotEvents().find(event => event.type === 'system/message')
  expect(prompt).toBeDefined()
  expect(JSON.stringify(prompt)).toContain('你是小陈')
  expect(JSON.stringify(prompt)).not.toContain('精神很好')
  expect(JSON.stringify(prompt)).not.toContain('蓝色')
  const completedTurns = agent.session.snapshotEvents().filter(event => event.type === 'turn/end').length
  const regeneration = page.waitForResponse(response => response.url().endsWith('/roleplay/regenerate'))
  await dock.getByRole('button', { name: '重新生成', exact: true }).click()
  const regenerationResult: unknown = await (await regeneration).json()
  expect(regenerationResult).toMatchObject({ result: { ok: true } })
  await expect.poll(() => agent.session.snapshotEvents().filter(event => event.type === 'turn/end').length, { timeout: 30_000 }).toBeGreaterThan(completedTurns)
  await page.getByText('先洗菜吧。', { exact: true }).waitFor()
  expect(await page.getByText('一起做饭吧。', { exact: true }).count()).toBe(0)
  expect(await page.locator('[data-chat-flow-kind="context"]').count()).toBe(0)
  expect(scaffold.ctx.roleplay.stateOf(agent.session)?.world).toEqual({ 地点: '厨房' })
  const startedTurns = agent.session.snapshotEvents().filter(event => event.type === 'turn/start').length
  await dock.getByRole('button', { name: '撤销最近一轮', exact: true }).click()
  await expect.poll(() => composer.textContent()).toBe('今晚一起做饭。')
  await expect.poll(() => page.locator('[data-chat-node-key]').count()).toBe(0)
  expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/start')).toHaveLength(startedTurns)
  await page.screenshot({ animations: 'disabled', path: join(REPO_ROOT, '.artifacts/roleplay/ui-undo.png') })
  settled = scaffold.whenTurnSettled()
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await settled
  await page.getByText('我来准备晚饭。', { exact: true }).waitFor()
  await tab('card')
  await tool.click()
  await expect.poll(() => tool.getAttribute('aria-checked'), { timeout: 20_000 }).toBe('false')
  await page.reload()
  await page.locator('[data-roleplay-dock]').waitFor()
  await tab('card')
  await expect.poll(() => tool.getAttribute('aria-checked')).toBe('false')
  await tool.click()
  await expect.poll(() => tool.getAttribute('aria-checked'), { timeout: 20_000 }).toBe('true')
  await tab('relationship')
  await column.getByText('2.5', { exact: true }).waitFor()
  await column.getByRole('button', { name: '添加状态', exact: true }).click()
  const colors: string[] = []
  for (const name of ['浅色', '深色']) {
    await openSettings(page, 'zh')
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await dialog.getByRole('button', { name, exact: true }).click()
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(name === '深色')
    await page.screenshot({ animations: 'disabled', path: join(REPO_ROOT, '.artifacts/roleplay', name === '浅色' ? 'ui-light.png' : 'ui-dark.png') })
    colors.push(await column.getByLabel('项目名称', { exact: true }).evaluate(element => getComputedStyle(element).backgroundColor))
  }
  expect(colors[0]).not.toBe('rgba(0, 0, 0, 0)')
  expect(colors[0]).not.toBe(colors[1])
  await column.locator('[data-sidebar-right-toggle]').click()
  await page.setViewportSize({ width: 800, height: 900 })
  await page.screenshot({ animations: 'disabled', path: join(REPO_ROOT, '.artifacts/roleplay/ui-narrow.png') })
  const bounds = await dock.boundingBox()
  expect(bounds).not.toBeNull()
  if (bounds !== null) expect(bounds.x + bounds.width).toBeLessThanOrEqual(800)
})
