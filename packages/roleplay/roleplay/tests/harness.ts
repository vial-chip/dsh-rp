import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Group from '@deepseek-ai/cordis-plugin-group'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import SessionQuery from '@deepseek-ai/dsh-session-query-sqlite'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { load, DEFAULT_SCHEMA, Type } from 'js-yaml'
import { z } from 'zod'
import { expect, type TestContext } from 'vitest'
import Roleplay from '../src/index.ts'
import * as Runtime from '../src/runtime.ts'

const patchSchema = z.array(z.object({ insert: z.array(z.object({
  id: z.string(), name: z.string(), config: z.unknown().optional(),
})) }))

/**
 * Mount the shipped preset through the real Loader using source-module builtins.
 * @param test Resource owner.
 * @returns Isolated Host context and private storage root.
 */
export async function roleplayHarness(test: TestContext): Promise<{ ctx: Context; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-roleplay-runtime-'))
  test.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  test.onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  ctx.loader.builtins['roleplay-preset'] = AgentPreset
  ctx.loader.builtins['roleplay-runtime'] = Runtime
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(SessionQuery, { path: join(root, 'query.sqlite'), openAt: 'never' })
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(Roleplay, { cardRoots: [], maxProfileBytes: 10_000_000, maxSelectedMemories: 24, maxEvidenceMessages: 24 })
  await ctx.plugin(AgentPresets, { default: 'roleplay' })
  await mountAgentLoopTestHarness(ctx)
  const raw = await readFile(new URL('../../../bundle/web-app/presets/roleplay.patch.yml', import.meta.url), 'utf8')
  const rows = patchSchema.parse(load(raw, { schema: DEFAULT_SCHEMA.extend([new Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (value: string) => value })]) }))[0]!.insert
  const preset = rows.find(row => row.id === 'preset-roleplay')!
  const config = z.object({ id: z.string(), order: z.number(),
    plugins: z.array(z.object({ id: z.string(), name: z.string() })) }).parse(preset.config)
  expect(config.plugins.map(plugin => plugin.name)).toEqual(['@deepseek-ai/dsh-roleplay/runtime'])
  await ctx.loader.create({ name: 'cordis:roleplay-preset', config: { ...config,
    plugins: config.plugins.map(plugin => ({ ...plugin, name: 'cordis:roleplay-runtime' })) } })
  await ctx.loader.await()
  return { ctx, root }
}
