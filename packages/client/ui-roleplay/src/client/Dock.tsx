/** Card selection and latest-interaction actions beside the native composer. */
import { useEffect, useRef, useState } from 'react'
import { Button, Menu, IconSkillOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoleplayCardSummary } from '@deepseek-ai/dsh-roleplay/types'
import type { RoleplayInjected } from './face.ts'
import css from './Roleplay.module.css'

/** Derived native input-dock props. */
type DockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'roleplay'> & InjectFace<RoleplayInjected>

/**
 * Show roleplay controls only for a roleplay Session.
 * @param props - Session projection, input actions and injected Host callbacks.
 * @returns the compact composer dock, or null for other presets.
 */
export function RoleplayDock(props: DockProps) {
  const { t, listCards, selectCard, preferredCard, notify } = props
  const state = props.useProjection('roleplay')
  const running = props.useSession(s => s.running)
  const blank = props.useSession(s => s.blank)
  const [cards, setCards] = useState<RoleplayCardSummary[]>([])
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [pending, setPending] = useState(false)
  const lock = useRef(false)
  const enabled = state != null
  const fixed = state?.card != null
  const selection = state?.selection

  useEffect(() => {
    if (!enabled || fixed) return
    let active = true
    setLoadError(false)
    setLoading(true)
    void listCards().then(async (available) => {
      if (!active) return
      setCards(available)
      if (selection != null) return
      const preferred = preferredCard()
      const initial = available.find(card => card.name === preferred) ?? available[0]
      if (initial !== undefined) await selectCard(initial.name)
    }).catch(() => { if (active) setLoadError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [enabled, fixed, listCards, selectCard, preferredCard, selection, reload])

  async function run(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setPending(true)
    try { await action() }
    catch (_error) { notify('failed', false) }
    finally { lock.current = false; setPending(false) }
  }
  if (state == null) return null
  const selected = cards.find(card => card.name === state.selection)
  const label = fixed ? state.card.description || state.card.name : selected?.description || selected?.name
  return <div className={css.dock} data-roleplay-dock>
    <div className={css.toolbar}>
      <IconSkillOutlineRegular size={16} />
      {fixed ? <span className={css.name}>{label}</span> : <Menu
        open={open} portal autoFocus side="top" onClose={() => { setOpen(false) }}
        selectedId={state.selection ?? undefined}
        items={cards.map(card => ({ id: card.name, label: card.description || card.name }))}
        onSelect={(name) => { setOpen(false); void run(async () => { await selectCard(name); notify('selected', true) }) }}
        anchor={<Button className={css.cardChoice} size="sm" disabled={running || pending || loading || loadError || cards.length === 0} onClick={() => { setOpen(v => !v) }}><span className={css.name}>{label ?? t('choose')}</span></Button>}
      />}
      <span className={css.hint}>{t(fixed ? 'fixed' : 'cardHint')}</span>
      {!blank && <div className={css.actions}>
        <Button size="sm" disabled={running || pending} onClick={() => { void run(async () => {
          const result = await props.undo()
          if (result.input !== null) {
            props.inputActions.setDraft(result.input)
            props.inputActions.persistDraft()
          }
          notify(result.input === null ? 'undoneContinue' : 'undone', true)
        }) }}>{t('undo')}</Button>
        <Button size="sm" disabled={running || pending} onClick={() => { void run(async () => {
          await props.regenerate(); notify('regenerated', true)
        }) }}>{t('regenerate')}</Button>
      </div>}
    </div>
    {loadError && <div className={css.notice} role="alert">{t('loadFailed')} <Button size="sm" onClick={() => { setReload(value => value + 1) }}>{t('retry')}</Button></div>}
    {!fixed && loading && <span className={css.skeleton} aria-hidden="true" />}
    {!fixed && !loading && !loadError && cards.length === 0 && <span className={css.hint}>{t('emptyCards')}</span>}
  </div>
}
