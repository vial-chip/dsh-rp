import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { RoleplayCards } from '../src/cards.ts'
import { characterCardMetadata } from '../src/spec.ts'

const definition = `---
name: housemate
description: An adult housemate
metadata:
  roleplay:
    opening: Tea?
    scene: { time: evening, place: kitchen, weather: rain, event: tea, body: rested, clothing: cardigan, emotion: calm }
    metrics:
      affinity: { min: 0, max: 100, initial: 20 }
      trust: { min: 0, max: 100, initial: 30 }
    resources: [notes.txt]
---
Portray a thoughtful adult housemate.
`

describe('roleplay card discovery', () => {
  it('loads readable candidates from an incomplete provider observation and refuses resources without a file locator', async (test) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-character-provider-'))
    test.onTestFinished(() => rm(root, { recursive: true, force: true }))
    const directory = join(root, 'housemate')
    await mkdir(directory)
    const path = join(directory, 'SKILL.md')
    await writeFile(path, definition)
    await writeFile(join(directory, 'notes.txt'), 'Likes jasmine tea.')
    const cards = new RoleplayCards(new Context(), [root])
    test.onTestFinished(() => cards.dispose())
    const observation = vi.spyOn(FileSystemSkillProvider.prototype, 'list').mockImplementationOnce(async function (this: FileSystemSkillProvider, options) {
      const result = await this.list(options)
      this.observeHostMutation(path)
      return { candidates: Array.isArray(result) ? result : result.candidates, complete: false }
    })
    test.onTestFinished(() => { observation.mockRestore() })
    expect((await cards.load('housemate')).content).toContain('Likes jasmine tea.')
    const locator = vi.spyOn(FileSystemSkillProvider.prototype, 'get').mockImplementationOnce(async function (this: FileSystemSkillProvider, candidate, options) {
      const result = await this.get(candidate, options)
      if (!result) throw new Error('Fixture card is missing')
      const { path: _path, ...withoutPath } = result
      return withoutPath
    })
    test.onTestFinished(() => { locator.mockRestore() })
    await expect(cards.load('housemate')).rejects.toThrow('Character resources require a local card path')
  })
  it('reports a removed selection and a card deleted between discovery and loading', async (test) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-character-disappeared-'))
    test.onTestFinished(() => rm(root, { recursive: true, force: true }))
    const directory = join(root, 'housemate')
    await mkdir(directory)
    const path = join(directory, 'SKILL.md')
    await writeFile(path, definition.replace('[notes.txt]', '[]'))
    const cards = new RoleplayCards(new Context(), [root])
    test.onTestFinished(() => cards.dispose())
    await expect(cards.load('removed')).rejects.toThrow('Unknown character card: removed')
    const disappearing = vi.spyOn(FileSystemSkillProvider.prototype, 'get').mockImplementationOnce(async function (this: FileSystemSkillProvider, candidate, options) {
      await rm(path)
      return this.get(candidate, options)
    })
    test.onTestFinished(() => { disappearing.mockRestore() })
    await expect(cards.list()).rejects.toThrow('Character card disappeared during discovery: housemate')
  })
  it('rejects ambiguous card names across explicit roots', async (test) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-character-duplicates-'))
    test.onTestFinished(() => rm(root, { recursive: true, force: true }))
    const roots = [join(root, 'one'), join(root, 'two')]
    for (const directory of roots) {
      await mkdir(join(directory, 'housemate'), { recursive: true })
      await writeFile(join(directory, 'housemate', 'SKILL.md'), definition.replace('[notes.txt]', '[]'))
    }
    const cards = new RoleplayCards(new Context(), roots)
    test.onTestFinished(() => cards.dispose())
    await expect(cards.list()).rejects.toThrow('Duplicate character card name: housemate')
  })
  it('rejects path separators and inherited object member names in saved field definitions', () => {
    const metadata = {
      opening: 'Tea?',
      scene: { time: 'evening', place: 'kitchen', weather: 'rain', event: 'tea', body: 'rested', clothing: 'cardigan', emotion: 'calm' },
      metrics: { affinity: { min: 0, max: 100, initial: 20 }, trust: { min: 0, max: 100, initial: 30 } },
    }
    expect(characterCardMetadata.safeParse(metadata).success).toBe(true)
    for (const key of ['clothing/extra', 'constructor', '__proto__']) {
      expect(characterCardMetadata.safeParse({ ...metadata, scene: { ...metadata.scene, [key]: 'unsafe' } }).success).toBe(false)
      const metrics = { ...metadata.metrics, [key]: metadata.metrics.trust }
      expect(characterCardMetadata.safeParse({ ...metadata, metrics }).success).toBe(false)
    }
  })
  it('loads only explicit roots, includes resources and changes saved versions after a file edit', async (test) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-character-cards-'))
    test.onTestFinished(() => rm(root, { recursive: true, force: true }))
    const cardRoot = join(root, 'characters')
    const cardDir = join(cardRoot, 'housemate')
    await mkdir(cardDir, { recursive: true })
    await mkdir(join(root, '.agents', 'skills', 'work'), { recursive: true })
    await writeFile(join(root, '.agents', 'skills', 'work', 'SKILL.md'), '---\nname: work\ndescription: Work skill\n---\nRead project files.\n')
    await writeFile(join(cardDir, 'SKILL.md'), definition)
    await writeFile(join(cardDir, 'notes.txt'), 'Likes jasmine tea.')
    const cards = new RoleplayCards(new Context(), [cardRoot])
    test.onTestFinished(() => cards.dispose())
    const initial = await cards.list()
    expect(initial.map(card => card.name)).toEqual(['housemate'])
    expect(initial[0]!.content).toContain('Likes jasmine tea.')
    await writeFile(join(cardDir, 'notes.txt'), 'Likes green tea.')
    const updated = await cards.load('housemate')
    expect(updated.version).not.toBe(initial[0]!.version)
    expect(initial[0]!.content).toContain('Likes jasmine tea.')
    await writeFile(join(cardDir, 'SKILL.md'), definition.replace('[notes.txt]', '[../../secret.txt]'))
    await writeFile(join(root, 'secret.txt'), 'Outside the character directory')
    await expect(cards.list()).rejects.toThrow(/leaves the card directory/)
  })
})
