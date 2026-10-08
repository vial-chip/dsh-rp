/** Character selection and profile-owned conversation navigation. */
import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CharacterProfile, CharacterProfileId } from '@deepseek-ai/dsh-roleplay/types'
import { RoleplayPanel, type RoleplayFace } from './RoleplayPanel.tsx'
import type { RoleplayData } from './model.ts'
import css from './Roleplay.module.css'

/** Hub state and operations registered into the shell overlay. */
export interface RoleplayHubInjected extends RoleplayFace {
  hooks: { roleplayOpen: SnapshotStore<boolean>; roleplayData: SnapshotStore<RoleplayData> }
  onChanged: (profile: CharacterProfile) => void
  close: () => void
}
/** Composed modal props. */
export type RoleplayHubProps = InjectFace<RoleplayHubInjected> & PropsLocale<'roleplay'>

/**
 * Choose a local card, create portrayals and navigate their independent scenes.
 * @param props Hub state, operations and locale.
 * @returns Profile selector dialog.
 */
export function RoleplayHub({ useRoleplayOpen, useRoleplayData, close, actions, openSession, onChanged, t }: RoleplayHubProps) {
  const open = useRoleplayOpen(value => value)
  const { cards, profiles, history } = useRoleplayData(value => value)
  const [selected, setSelected] = useState<CharacterProfileId | null>(null)
  const [cardName, setCardName] = useState('')
  const [title, setTitle] = useState('')
  const [name, setName] = useState('')
  const [appearance, setAppearance] = useState('')
  const [background, setBackground] = useState('')
  const [opening, setOpening] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = async () => {
    const result = await actions.profiles()
    if (!result.ok) throw new Error(result.error.message)
  }
  const act = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(null)
    try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (!open) return
    let active = true
    setBusy(true); setError(null)
    void Promise.all([actions.cards(), actions.profiles()]).then(([cardResult, profileResult]) => {
      if (!active) return
      if (!cardResult.ok) throw new Error(cardResult.error.message)
      if (!profileResult.ok) throw new Error(profileResult.error.message)
      setCardName(current => current || cardResult.value[0]?.name || '')
    }).catch((reason: unknown) => { if (active) setError(String(reason)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [open, actions])
  const profile = profiles.find(item => item.id === selected)
  return <Modal open={open} title={t('title')} closeLabel={t('close')} onClose={close}
    className={css.dialog} contentClassName={css.dialogContent}>
    <div className={css.panel}>
      {busy && <p role="status">{t('loading')}</p>}
      {error && <p role="alert">{error}</p>}
      <h3>{t('profile')}</h3>
      {profiles.length === 0 && <p>{t('empty')}</p>}
      <div className={css.actions}>{profiles.map(item => <Button key={item.id} aria-pressed={item.id === selected} disabled={busy}
        onClick={() => { setSelected(item.id) }}>{item.title || item.state.card.name}</Button>)}</div>
      {profile && <>
        <div className={css.actions}>{Object.entries(profile.state.scenes).map(([id, scene]) => <div key={id} className={css.memory}>
          <span>{scene.fields.place} · {scene.fields.time}</span>
          <Button disabled={busy || scene.archived} onClick={() => { openSession(id as Parameters<RoleplayFace['openSession']>[0]); close() }}>{t('open')}</Button>
          <Button disabled={busy} onClick={() => { void act(async () => {
            const result = await actions.archive(profile.id, id as Parameters<RoleplayFace['openSession']>[0], !scene.archived)
            if (!result.ok) throw new Error(result.error.message)
            await refresh()
          }) }}>{t(scene.archived ? 'restore' : 'archive')}</Button>
          <details><summary>{t('view')}</summary><RoleplayPanel profile={profile} sessionId={id as Parameters<RoleplayFace['openSession']>[0]} actions={actions}
            openSession={(sessionId) => { openSession(sessionId); close() }} t={t}
            history={history[id] ?? []} onChanged={onChanged} /></details>
        </div>)}</div>
        <label className={css.field}>{t('opening')}<Input value={opening} onChange={(event) => { setOpening(event.target.value) }} /></label>
        <Button disabled={busy} onClick={() => { void act(async () => {
          const result = await actions.createConversation(profile.id, opening)
          if (!result.ok) throw new Error(result.error.message)
          openSession(result.value); close()
        }) }}>{t('newScene')}</Button>
      </>}
      <h3>{t('create')}</h3>
      <div className={css.actions}>{cards.map(card => <Button key={card.name} aria-pressed={cardName === card.name} disabled={busy}
        onClick={() => { setCardName(card.name) }}>{card.name}</Button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); void act(async () => {
        const result = await actions.createProfile(cardName, { name, appearance, background }, title)
        if (!result.ok) throw new Error(result.error.message)
        setSelected(result.value.id); await refresh()
      }) }}>
        <div className={css.panel}>
          {([{ localeKey: 'profileTitle', value: title, set: setTitle }, { localeKey: 'name', value: name, set: setName },
            { localeKey: 'appearance', value: appearance, set: setAppearance }, { localeKey: 'background', value: background, set: setBackground }] as const)
            .map(field => <label key={field.localeKey} className={css.field}>{t(field.localeKey)}
              <Input value={field.value} disabled={busy} onChange={(event) => { field.set(event.target.value) }} /></label>)}
          <Button disabled={busy || !cardName} type="submit">{t('create')}</Button>
        </div>
      </form>
    </div>
  </Modal>
}
