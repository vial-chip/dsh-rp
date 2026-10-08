/** Durable roleplay data service; model and Host consumers share one authority. */
import { Context, Service } from '@deepseek-ai/cordis'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { roleplayDomainSpec } from './spec.ts'
import { RoleplayStore } from './store.ts'
import { RoleplayCards } from './cards.ts'

export type * from './types.ts'
export { RoleplayStore } from './store.ts'
export type { RoleplayLimits } from './store.ts'
export { RoleplayCards } from './cards.ts'
export { characterCardMetadata, characterCardSchema, characterProfileSchema, roleplayDomainSpec } from './spec.ts'

/** Deployment-specific card discovery and capacity. */
export interface Config {
  /** Explicit roleplay skill roots, in addition to the bundled example card. */
  cardRoots: string[]
  /** Maximum encoded profile bytes, including immutable revision snapshots. */
  maxProfileBytes: number
  /** Maximum recent active memories included in one model request. */
  maxSelectedMemories: number
  /** Maximum recent user messages returned as evidence by roleplay_read. */
  maxEvidenceMessages: number
}

declare module '@deepseek-ai/cordis' {
  interface Context { roleplay: Roleplay }
}

/** Character profiles persist independently of workspaces and session logs. */
export class Roleplay extends Service {
  static inject = ['storageDomain']
  static Config: z<Config> = z.object({
    cardRoots: z.array(z.string()).required(),
    maxProfileBytes: z.natural().min(1).default(64 * 1024 * 1024),
    maxSelectedMemories: z.natural().min(1).default(24),
    maxEvidenceMessages: z.natural().min(1).default(24),
  })
  /** Explicit skill-format card catalog. */
  readonly cards: RoleplayCards
  private storeValue?: RoleplayStore

  /** @param ctx Host context with storage-domain. @param config Validated discovery and limits. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'roleplay')
    this.cards = new RoleplayCards(ctx, [...config.cardRoots, fileURLToPath(new URL('../cards/', import.meta.url))])
    ctx.effect(() => () => this.cards.dispose())
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(roleplayDomainSpec)
    this.ctx.effect(() => () => domain.close())
    this.storeValue = new RoleplayStore(domain.table('profiles'), domain.table('lifecycle'), this.config)
  }

  /** Authoritative profile operations; unavailable before service readiness. */
  get store(): RoleplayStore {
    if (!this.storeValue) throw new Error('Roleplay storage is not ready')
    return this.storeValue
  }

  /** Maximum recent conversation messages returned as memory evidence. */
  get maxEvidenceMessages(): number { return this.config.maxEvidenceMessages }
}

export default Roleplay
