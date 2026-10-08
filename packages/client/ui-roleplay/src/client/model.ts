/** React-free ownership of the Host's character catalog and profile snapshots. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { CharacterCard, CharacterProfile, RoleplayHistoryPoint } from '@deepseek-ai/dsh-roleplay/types'

/** Published character data shared by the hub and conversation tab. */
export interface RoleplayData { cards: CharacterCard[]; profiles: CharacterProfile[]; history: Record<string, RoleplayHistoryPoint[]> }

/** Host administration callbacks published at the Slots binding site. */
export type RoleplayActions = ClientRemote['roleplay']

/** Owns character data independently of presentation component lifetimes. */
export class RoleplayClient {
  /** Stable source bound to useRoleplayData by the renderer. */
  readonly data = createSnapshotStore<RoleplayData>({ cards: [], profiles: [], history: {} })
  /** Administrative callbacks; successful writes publish the returned profile. */
  readonly actions: RoleplayActions
  private catalogRequest = 0
  private profileRequest = 0

  /** @param remote Typed Host administration namespace. */
  constructor(remote: ClientRemote['roleplay']) {
    const publish = async (request: ReturnType<RoleplayActions['read']>) => {
      const result = await request
      if (result.ok) this.accept(result.value)
      return result
    }
    this.actions = {
      cards: async () => {
        const generation = ++this.catalogRequest
        const result = await remote.cards()
        if (result.ok && generation === this.catalogRequest) this.data.set({ ...this.data.getSnapshot(), cards: result.value })
        return result
      },
      profiles: async () => {
        const generation = ++this.profileRequest
        const result = await remote.profiles()
        if (result.ok && generation === this.profileRequest) this.data.set({ ...this.data.getSnapshot(), profiles: result.value })
        return result
      },
      read: (...args) => publish(remote.read(...args)),
      createProfile: (...args) => publish(remote.createProfile(...args)),
      edit: (...args) => publish(remote.edit(...args)),
      applyCard: (...args) => publish(remote.applyCard(...args)),
      archive: (...args) => publish(remote.archive(...args)),
      createConversation: (...args) => remote.createConversation(...args),
      continue: (...args) => remote.continue(...args),
      undo: (...args) => remote.undo(...args),
      history: async (...args) => {
        const result = await remote.history(...args)
        if (result.ok) {
          const current = this.data.getSnapshot()
          this.data.set({ ...current, history: { ...current.history, [args[1]]: result.value } })
        }
        return result
      },
      branch: (...args) => remote.branch(...args),
    }
  }

  /**
   * Publish a returned profile and invalidate earlier catalog reads.
   * @param profile Committed Host record.
   */
  accept(profile: CharacterProfile): void {
    this.profileRequest++
    const current = this.data.getSnapshot()
    if (current.profiles.some(item => item.id === profile.id && item.revision > profile.revision)) return
    const profiles = current.profiles.some(item => item.id === profile.id)
      ? current.profiles.map(item => item.id === profile.id ? profile : item) : [...current.profiles, profile]
    this.data.set({ ...current, profiles })
  }
}
