/** Editable authoritative character data with visible attribution and conflicts. */
import { useEffect, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RoleplayActions } from './model.ts'
import type { CharacterProfile, RoleplayHistoryPoint, RoleplayUserChange } from '@deepseek-ai/dsh-roleplay/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoleplayKey } from './locales.ts'
import css from './Roleplay.module.css'

/** Runtime operations consumed by the panel and hub. */
export interface RoleplayFace {
  actions: RoleplayActions
  openSession: (id: SessionId) => void
}
/** Editable panel inputs, all copy supplied by its locale owner. */
export interface RoleplayPanelProps extends RoleplayFace {
  profile: CharacterProfile
  sessionId: SessionId
  t: TranslateNS<'roleplay'>
  onChanged: (profile: CharacterProfile) => void
  history: RoleplayHistoryPoint[]
}

/**
 * Render editable scene, player, relationship and memory data.
 * @param props Authoritative snapshot and Host operations.
 * @returns Character detail panel.
 */
export function RoleplayPanel({ profile, sessionId, actions, openSession, onChanged, history, t }: RoleplayPanelProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scene = profile.state.scenes[sessionId]
  const act = async (operation: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(null)
    try { await operation() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const refresh = async () => {
    const result = await actions.read(profile.id)
    if (!result.ok) throw new Error(result.error.message)
    onChanged(result.value)
  }
  const edit = (change: RoleplayUserChange) => act(async () => {
    const result = await actions.edit(profile.id, sessionId, change)
    if (!result.ok) throw new Error(result.error.message)
    onChanged(result.value)
  })
  if (!scene) return <p>{t('noCharacter')}</p>
  return <div className={css.panel}>
    <div className={css.actions}>
      <Button disabled={busy} onClick={() => { void act(refresh) }}>{t('refresh')}</Button>
      <Button disabled={busy || scene.archived} onClick={() => { void act(async () => {
        const result = await actions.continue(profile.id, sessionId)
        if (!result.ok) throw new Error(result.error.message)
      }) }}>{t('continue')}</Button>
    </div>
    {error && <p role="alert" className={css.error}>{error}</p>}
    <h3>{t('scene')}</h3>
    {Object.entries(scene.fields).map(([key, value]) => <Editable key={`${sessionId}/${key}`} label={fieldLabel(key, t)} value={value} disabled={busy}
      save={text => edit({ scene: { [key]: text } })} saveLabel={t('save')} />)}
    <h3>{t('metrics')}</h3>
    {Object.entries(profile.state.metrics).map(([key, value]) => <Editable key={key} label={fieldLabel(key, t)} value={String(value)} type="number" disabled={busy}
      save={text => edit({ metrics: { [key]: Number(text) } })} saveLabel={t('save')} />)}
    <h3>{t('player')}</h3>
    {(['name', 'appearance', 'background'] as const).map(key => <Editable key={key} label={t(key)} value={profile.state.player[key]} disabled={busy}
      save={text => edit({ player: { ...profile.state.player, [key]: text } })} saveLabel={t('save')} />)}
    <h3>{t('memory')}</h3>
    {Object.values(profile.state.memories).length === 0 && <p>{t('noMemory')}</p>}
    {Object.values(profile.state.memories).map(memory => <div key={memory.id} className={css.memory}>
      <Editable label={memory.key} value={memory.text} disabled={busy || memory.status === 'invalid'} saveLabel={t('save')}
        save={text => edit({ memory: { id: memory.id, text } })} />
      <p>{t(memory.status === 'review' ? 'review' : memory.status)} · {memory.applicable}</p>
      <div className={css.actions}>
        <Button disabled={busy || memory.status === 'invalid'} onClick={() => { void edit({ memory: { id: memory.id, status: 'invalid' } }) }}>{t('invalidate')}</Button>
        {memory.status === 'review' && <Button disabled={busy} onClick={() => { void edit({ memory: { id: memory.id, status: 'active' } }) }}>{t('resolve')}</Button>}
      </div>
      <details><summary>{t('sources')}</summary><pre>{JSON.stringify({ evidenceId: memory.evidenceId, source: memory.source,
        revisions: profile.history.filter(revision => revision.touched.includes(`memory/${memory.id}`)).map(revision => ({ revision: revision.revision, source: revision.source,
          memory: revision.state.memories[memory.id] })) }, null, 2)}</pre></details>
    </div>)}
    {profile.conflicts.some(conflict => !conflict.resolved) && <><h3>{t('conflicts')}</h3>
      {profile.conflicts.filter(conflict => !conflict.resolved).map(conflict => <div key={conflict.id} className={css.memory}>
        <pre>{JSON.stringify({ source: conflict.source, reason: conflict.reason, proposed: conflict.proposed }, null, 2)}</pre>
        <Button disabled={busy} onClick={() => { void edit({ resolveConflict: conflict.id }) }}>{t('resolve')}</Button>
      </div>)}</>}
    <details><summary>{t('cardVersion')}</summary><pre>{profile.state.card.version}</pre><pre>{profile.state.card.content}</pre></details>
    <p>{t('cardNotice')}</p>
    <Button disabled={busy} onClick={() => { void act(async () => {
      const result = await actions.applyCard(profile.id, sessionId)
      if (!result.ok) throw new Error(result.error.message)
      onChanged(result.value)
    }) }}>{t('updateCard')}</Button>
    <p>{t('undoNotice')}</p>
    <div className={css.actions}>{([false, true] as const).map(regenerate => <Button key={String(regenerate)}
      disabled={busy || scene.archived} onClick={() => { void act(async () => {
        const result = await actions.undo(profile.id, sessionId, regenerate)
        if (!result.ok) throw new Error(result.error.message)
        openSession(result.value)
        await refresh()
      }) }}>{t(regenerate ? 'regenerate' : 'undo')}</Button>)}</div>
    <Button disabled={busy} onClick={() => { void act(async () => {
      const result = await actions.history(profile.id, sessionId)
      if (!result.ok) throw new Error(result.error.message)
    }) }}>{t('viewHistory')}</Button>
    {history.map(point => <div className={css.memory} key={point.seq}>
      <p>{t(point.kind)}</p><p>{point.text}</p>
      <Button disabled={busy} onClick={() => { void act(async () => {
        const result = await actions.branch(profile.id, sessionId, point.seq)
        if (!result.ok) throw new Error(result.error.message)
        openSession(result.value.sessionId)
      }) }}>{t('branch')}</Button>
    </div>)}
  </div>
}

function Editable({ label, value, disabled, save, saveLabel, type = 'text' }: {
  label: string
  value: string
  disabled: boolean
  save: (text: string) => Promise<void>
  saveLabel: string
  type?: 'text' | 'number'
}) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  return <form className={css.field} onSubmit={(event) => { event.preventDefault(); void save(text) }}>
    <label>{label}<Input type={type} value={text} disabled={disabled} onChange={(event) => { setText(event.target.value) }} /></label>
    <Button disabled={disabled || text === value} type="submit">{saveLabel}</Button>
  </form>
}

function fieldLabel(key: string, t: TranslateNS<'roleplay'>): string {
  const labels: Readonly<Record<string, RoleplayKey>> = { time: 'time', place: 'place', weather: 'weather', event: 'event', body: 'body', clothing: 'clothing', emotion: 'emotion', affinity: 'affinity', trust: 'trust' }
  const label = Object.hasOwn(labels, key) ? labels[key] : undefined
  return label ? t(label) : key
}
