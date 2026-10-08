/** Conversation entry points for the roleplay panel. */
import { useEffect, useState } from 'react'
import type { CharacterProfile } from '@deepseek-ai/dsh-roleplay/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconUserOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { RoleplayPanel, type RoleplayFace } from './RoleplayPanel.tsx'

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RoleplayData } from './model.ts'

/** Reactive character data and callbacks bound at the tab registration site. */
export interface CharacterTabInjected extends RoleplayFace {
  hooks: { roleplayData: SnapshotStore<RoleplayData> }
  onChanged: (profile: CharacterProfile) => void
}

type TabProps = Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'sessionId' | 'useSession'> & PropsLocale<'roleplay'> & InjectFace<CharacterTabInjected>
/**
 * Display the current conversation's authoritative character data.
 * @param props Conversation seats and roleplay administration.
 * @returns Editable character panel.
 */
export function CharacterTab({ sessionId, useSession, useRoleplayData, actions, openSession, onChanged, t }: TabProps) {
  const state = useSession(value => value)
  const data = useRoleplayData(value => value)
  const profile = data.profiles.find(item => Object.hasOwn(item.state.scenes, sessionId))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void actions.profiles().then((result) => {
      if (!active) return
      if (!result.ok) { setError(result.error.message); return }
      setError(null)
    }).catch((reason: unknown) => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [sessionId, state.running, actions])
  if (error) return <p role="alert">{error}</p>
  if (!profile) return <p>{t('noCharacter')}</p>
  return <RoleplayPanel profile={profile} sessionId={sessionId} actions={actions} openSession={openSession}
    history={data.history[sessionId] ?? []} onChanged={onChanged} t={t} />
}
/**
 * Label an open character tab.
 * @param props Current tab information.
 * @returns Tab title and icon.
 */
export function CharacterTitle({ useTabInfo }: Pick<PropsRuntime<'sidebar.right.pane.tab.title'>, 'useTabInfo'>) {
  return <><IconUserOutlineRegular size={16} />{useTabInfo().tab.title}</>
}
/**
 * Offer profile navigation from a roleplay conversation.
 * @param props Preset projection, opening action and locale.
 * @returns Character hub button for roleplay Sessions.
 */
export function CharacterAction({ useProjection, show, t }: Pick<PropsRuntime<'conversation.session.header.actions'>, 'useProjection'> & PropsLocale<'roleplay'> & { show: () => void }) {
  const preset = useProjection('agentPreset')
  return preset === 'roleplay' ? <Button onClick={show}>{t('title')}</Button> : null
}
