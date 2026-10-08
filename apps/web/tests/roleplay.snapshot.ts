/** Roleplay state and transcript replay through the shipped Web CLI and public Remotes. */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { z } from 'zod'
import { expect, it } from 'vitest'
import {
  formatSystemPromptSnapshot, formatToolSchemasSnapshot, normalizeSessionLog,
  normalizeSessionSnapshots, normalizedSystemPrompts, normalizedToolSchemas,
  redactSessionSnapshotIds, scrubSessionSnapshot,
} from '@deepseek-ai/dsh-session-snapshot'
import { compareOrRefreshGolden, webSnapshotMode } from './scaffold.ts'
import { REPO_ROOT } from './support.ts'

const SCENARIO = fileURLToPath(new URL('../../../snapshots/web/roleplay', import.meta.url))
const FIXTURE = join(SCENARIO, 'session.v4.jsonl')
const profileSchema = z.object({ id: z.string(), revision: z.number(), state: z.object({
  metrics: z.record(z.string(), z.number()),
  scenes: z.record(z.string(), z.object({ fields: z.record(z.string(), z.string()) })),
  memories: z.record(z.string(), z.object({ key: z.string(), text: z.string(), status: z.string() })),
}) })

/** Own one CLI process, including readiness failures and drained termination. */
class RoleplayServer {
  private child: ChildProcess | undefined
  private closed: Promise<void> | undefined
  private output = ''

  async start(world: string, patch: string): Promise<string> {
    const ready = Promise.withResolvers<string>()
    const child = spawn(process.execPath, [join(REPO_ROOT, 'apps/cli/lib/bin.js'), '--profile', 'web',
      '--patch', patch, '--no-open', '--port', '0'], {
      cwd: world, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '',
        DSH_HOME: join(world, 'home'), DSH_AGENTS_HOME: join(world, 'agents'), DSH_TELEMETRY_DISABLED: '1',
        DEEPSEEK_API_KEY: '', DEEPSEEK_BASE_URL: '' },
    })
    this.child = child
    const receive = (chunk: Buffer): void => {
      this.output += chunk.toString()
      const url = /dsh web: (http:\/\/[^\s]+)/u.exec(this.output)?.[1]
      if (url) ready.resolve(url)
    }
    child.stdout?.on('data', receive)
    child.stderr?.on('data', receive)
    child.on('error', (error) => { ready.reject(error) })
    this.closed = new Promise(resolve => child.once('close', () => {
      ready.reject(new Error('Roleplay server closed before readiness: ' + this.logs()))
      resolve()
    }))
    const timer = setTimeout(() => { ready.reject(new Error('Roleplay server readiness timed out: ' + this.logs())) }, 30_000)
    try { return await ready.promise } finally { clearTimeout(timer) }
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    let forced = false
    const timer = setTimeout(() => { forced = true; child.kill('SIGKILL') }, 15_000)
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      await this.closed
    } finally { clearTimeout(timer); this.child = undefined }
    if (forced) throw new Error('Roleplay server termination timed out: ' + this.logs())
  }

  logs(): string { return this.output.replace(/([?&]token=)[A-Za-z0-9_-]+/gu, '$1<redacted>') }
}

/** Read the private writer's complete uncompressed generation for one conversation. */
async function persisted(root: string, id: string): Promise<string> {
  const files = await readdir(root, { recursive: true })
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue
    const raw = await readFile(join(root, file), 'utf8')
    const header = z.object({ type: z.literal('session'), id: z.string() }).parse(JSON.parse(raw.split('\n')[0] ?? ''))
    if (header.id === id) return raw
  }
  return ''
}

it('records automatic memory, relationship deltas and corrected context through the shipped roleplay preset', async (test) => {
  const world = await mkdtemp(join(tmpdir(), 'dsh-roleplay-snapshot-'))
  test.onTestFinished(() => rm(world, { recursive: true, force: true }))
  const server = new RoleplayServer()
  test.onTestFinished(() => server.stop())
  const patch = join(world, 'roleplay.patch.yml')
  await writeFile(patch, yaml.dump([
    { id: 'llm-deepseek', disabled: true }, { id: 'llm-deepseek-account', disabled: true },
    { id: 'session-title-llm', disabled: true }, { id: 'agent-instructions', disabled: true },
    { id: 'agent-default-model', config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } },
    { id: 'session-persistence-jsonl', config: { root: join(world, 'sessions'), compression: 'none' } },
    { insert: [{ id: 'llm-replay', name: pathToFileURL(join(REPO_ROOT, 'packages/test-support/llm-replay/lib/index.js')).href,
      config: { file: FIXTURE, overrideFile: join(SCENARIO, 'replay.override.json'), providers: [
        { id: 'deepseek-official', models: [{ id: 'deepseek-v4-flash', contextWindow: 128000 }] },
      ] } }] },
  ]))
  const url = await server.start(world, patch)
  const auth = await fetch(url, { redirect: 'manual' })
  const cookie = auth.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Web authentication did not return a Session cookie')
  let rpc = 0
  const invoke = async <T>(endpoint: string, args: object, schema: z.ZodType<T>): Promise<T> => {
    const response = await fetch(new URL(`/api/roleplay/${endpoint}`, url), {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'client-request', rpcId: `roleplay-${++rpc}`, method: `roleplay/${endpoint}`, payload: { args } }),
    })
    expect(response.status, server.logs()).toBe(200)
    const parsed = z.object({ result: z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true), value: schema }), z.object({ ok: z.literal(false), error: z.unknown() }),
    ]) }).parse(await response.json())
    if (!parsed.result.ok) throw new Error(JSON.stringify(parsed.result.error))
    return parsed.result.value
  }
  const profile = await invoke('createProfile', { cardName: 'lin', title: 'Tea at home',
    player: { name: 'Player', appearance: '', background: 'Likes jasmine tea.' } }, profileSchema)
  const id = await invoke('createConversation', { id: profile.id, opening: 'I like jasmine tea. Shall we make some?' }, z.string())
  const waitForTurn = async (count: number): Promise<void> => {
    await expect.poll(async () => {
      const raw = await persisted(join(world, 'sessions'), id)
      return raw.split('\n').filter(line => line.includes('"type":"turn/end"')).length
    }, { timeout: 30_000 }).toBe(count)
  }
  await waitForTurn(1)
  const firstLog = await persisted(join(world, 'sessions'), id)
  expect(firstLog, firstLog).not.toContain('"isError":true')
  const saved = await invoke('read', { id: profile.id }, profileSchema)
  expect(saved.state.metrics.trust).toBe(35)
  expect(Object.values(saved.state.memories)).toEqual([{ key: 'tea', text: 'Player likes jasmine tea.', status: 'active' }])
  await invoke('edit', { id: profile.id, sessionId: id, change: { scene: { clothing: 'red coat' }, metrics: { trust: 72 } } }, profileSchema)
  await invoke('continue', { id: profile.id, sessionId: id }, z.string())
  await waitForTurn(2)
  const current = await invoke('read', { id: profile.id }, profileSchema)
  expect(current.state.metrics.trust).toBe(72)
  expect(current.state.scenes[id]?.fields.clothing).toBe('red coat')
  const raw = await persisted(join(world, 'sessions'), id)
  const identities = { cwd: world, sessionIds: [id] }
  const identified = redactSessionSnapshotIds([raw])[0]
  if (identified === undefined) throw new Error('No roleplay Session was captured')
  const prompts = normalizedSystemPrompts(identified, identities)
  expect(prompts.at(-1)).toContain('red coat')
  expect(prompts.at(-1)).toContain('72')
  expect(prompts[0]).not.toContain(world)
  const tools = normalizedToolSchemas(identified, identities)
  expect(tools[0]).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'roleplay_read' }), expect.objectContaining({ name: 'roleplay_update' })]))
  const mode = webSnapshotMode()
  if (mode === 'record') throw new Error('The authored roleplay scenario uses keyless refresh')
  if (mode === 'refresh') await writeFile(FIXTURE, `${scrubSessionSnapshot(normalizeSessionLog(identified, identities)).trimEnd()}\n`)
  else expect(normalizeSessionSnapshots([raw], identities)[0]).toBe(normalizeSessionSnapshots([await readFile(FIXTURE, 'utf8')], identities)[0])
  await compareOrRefreshGolden(join(SCENARIO, 'system-prompt.expected.md'), formatSystemPromptSnapshot(prompts[0] ?? '', prompts.slice(1)).trimEnd(), mode)
  await compareOrRefreshGolden(join(SCENARIO, 'tool-schemas.expected.json'), formatToolSchemasSnapshot(tools[0] ?? [], tools.slice(1)).trimEnd(), mode)
})
