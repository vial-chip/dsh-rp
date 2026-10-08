import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import Roleplay from '../src/index.ts'

it('refuses storage access until the service has opened its durable domain', async (test) => {
  const ctx = new Context()
  test.onTestFinished(() => ctx.fiber.dispose())
  const roleplay = new Roleplay(ctx, { cardRoots: [], maxProfileBytes: 100_000, maxSelectedMemories: 24, maxEvidenceMessages: 24 })
  expect(() => roleplay.store).toThrow('Roleplay storage is not ready')
})
