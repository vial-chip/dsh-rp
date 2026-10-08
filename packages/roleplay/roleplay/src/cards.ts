/** Explicitly loads local skill-format cards from roleplay-only roots. */
import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { characterCardMetadata } from './spec.ts'
import type { CharacterCard, CharacterCardVersion } from './types.ts'

/** Isolated catalog; ordinary project and user work skills are never included. */
export class RoleplayCards {
  private readonly provider: FileSystemSkillProvider
  private readonly lifecycle = new AbortController()

  /** @param ctx Host context. @param roots Explicit roleplay skill directories. */
  constructor(ctx: Context, roots: string[]) {
    this.provider = new FileSystemSkillProvider(ctx, { signal: this.lifecycle.signal, invalidate() {} }, {
      providerName: 'roleplay-cards', includeDefaultRoots: false, customSkillDirs: roots, watch: false,
    })
  }

  /**
   * Discover validated cards, failing loudly on invalid roleplay metadata.
   * @returns Immutable card definitions.
   */
  async list(): Promise<CharacterCard[]> {
    const observed = await this.provider.list({ signal: this.lifecycle.signal })
    const candidates = Array.isArray(observed) ? observed : observed.candidates
    const cards: CharacterCard[] = []
    for (const candidate of candidates) {
      if (cards.some(card => card.name === candidate.name)) throw new Error(`Duplicate character card name: ${candidate.name}`)
      const definition = await this.provider.get(candidate, { signal: this.lifecycle.signal })
      if (!definition) throw new Error(`Character card disappeared during discovery: ${candidate.name}`)
      const metadata = characterCardMetadata.parse(definition.metadata?.roleplay)
      let content = definition.content
      for (const resource of metadata.resources) {
        if (!definition.path) throw new Error('Character resources require a local card path')
        const root = await realpath(dirname(definition.path))
        const path = await realpath(resolve(root, resource))
        const local = relative(root, path)
        if (isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\')) throw new Error('Character resource leaves the card directory')
        content += `\n\n${await readFile(path, 'utf8')}`
      }
      const saved = { name: definition.name, description: definition.description, content,
        opening: metadata.opening, scene: metadata.scene, metrics: metadata.metrics }
      const version = brandString<CharacterCardVersion>(createHash('sha256').update(JSON.stringify(saved)).digest('hex'))
      cards.push({ ...saved, version })
    }
    return cards
  }

  /**
   * Load the currently selected version.
   * @param name Card skill name.
   * @returns Validated card snapshot.
   */
  async load(name: string): Promise<CharacterCard> {
    const card = (await this.list()).find(value => value.name === name)
    if (!card) throw new Error(`Unknown character card: ${name}`)
    return card
  }

  /** Stop discovery and drain the provider's owned resources. @returns Quiescent completion. */
  async dispose(): Promise<void> { this.lifecycle.abort(); await this.provider.dispose() }
}
