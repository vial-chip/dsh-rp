/** Saved state readers and field editors in native right-sidebar tabs. */
import { useEffect, useState } from 'react'
import { Button, IconSkillOutlineRegular, IconGlobeOutlineRegular, IconUserOutlineRegular, IconPersonalizationOutlineRegular, IconUsersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoleplayCard, RoleplayCategory } from '@deepseek-ai/dsh-roleplay/types'
import type { RoleplayInjected } from './face.ts'
import { RoleplayTools } from './Tools.tsx'
import css from './Roleplay.module.css'

/** Category selected by this native tab registration. */
export interface PanelInjected extends RoleplayInjected {
  readonly category: RoleplayCategory | 'card'
}
/** Derived right-sidebar body inputs. */
type PanelProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'roleplay'> & InjectFace<PanelInjected>

/**
 * Read the authoritative projection; opening a tab performs no model request.
 * @param props - projected state and direct field-edit callback.
 * @returns the saved card or editable state category.
 */
export function RoleplayPanel(props: PanelProps) {
  const { category, t } = props
  const state = props.useProjection('roleplay')
  const [editing, setEditing] = useState(false)
  const [field, setField] = useState('')
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [preview, setPreview] = useState<RoleplayCard | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [reload, setReload] = useState(0)
  const { previewCard } = props
  const selected = state?.selection
  const fixedCard = state?.card
  const enabled = state != null
  useEffect(() => {
    if (category !== 'card' || !enabled || fixedCard != null) return
    let active = true
    setPreview(null)
    setPreviewError(false)
    void previewCard().then((card) => { if (active) setPreview(card) })
      .catch(() => { if (active) setPreviewError(true) })
    return () => { active = false }
  }, [category, enabled, fixedCard, selected, previewCard, reload])
  if (state == null) return <div className={css.empty}>{t('noRoleplay')}</div>
  if (category === 'card') return <section className={css.panel}>
    <h2>{(state.card ?? preview)?.description || (state.card ?? preview)?.name || t('choose')}</h2>
    <p className={css.hint}>{t(state.card === null ? 'cardHint' : 'fixed')}</p>
    {(state.card ?? preview) !== null && <div className={css.cardContent}>{(state.card ?? preview)?.content}</div>}
    {state.card === null && preview === null && !previewError && <span className={css.skeleton} aria-hidden="true" />}
    {previewError && <div className={css.notice} role="alert">{t('loadFailed')} <Button size="sm" onClick={() => { setReload(value => value + 1) }}>{t('retry')}</Button></div>}
    <RoleplayTools {...props} />
  </section>
  const values = state[category]
  const editableCategory = category
  async function save() {
    const key = field.trim()
    const parsed = category === 'relationship' ? Number(value) : value.trim()
    if (key === '' || value.trim() === '' || (typeof parsed === 'number' && !Number.isFinite(parsed))) { setInvalid(true); return }
    if (pending) return
    setPending(true)
    try { await props.edit(editableCategory, { [key]: parsed }); setEditing(false); props.notify('saved', true) }
    catch (_error) { props.notify('failed', false) }
    finally { setPending(false) }
  }
  return <section className={css.panel}>
    <p className={css.hint}>{t('recorded')}</p>
    {Object.keys(values).length === 0 && <div className={css.empty}>{t('empty')}</div>}
    <dl className={css.fields}>{Object.entries(values).map(([key, current]) => <div className={css.field} key={key}>
      <div><dt>{key}</dt><dd>{String(current)}</dd></div>
      <Button size="sm" aria-label={`${t('edit')} ${key}`} disabled={pending} onClick={() => { setField(key); setValue(String(current)); setInvalid(false); setEditing(true) }}>{t('edit')}</Button>
    </div>)}</dl>
    {editing ? <form className={css.editor} onSubmit={(event) => { event.preventDefault(); void save() }}>
      <label>{t('field')}<input value={field} disabled={pending} onChange={(event) => { setField(event.target.value) }} /></label>
      <label>{t(category === 'relationship' ? 'number' : 'value')}{category === 'relationship'
        ? <input type="number" step="any" value={value} disabled={pending} onChange={(event) => { setValue(event.target.value) }} />
        : <textarea value={value} disabled={pending} onChange={(event) => { setValue(event.target.value) }} />}</label>
      {invalid && <p className={css.notice} role="alert">{t('invalid')}</p>}
      <div className={css.actions}><Button type="submit" size="sm" variant="primary" disabled={pending}>{t('save')}</Button><Button size="sm" disabled={pending} onClick={() => { setEditing(false) }}>{t('cancel')}</Button></div>
    </form> : <Button size="sm" onClick={() => { setField(''); setValue(''); setInvalid(false); setEditing(true) }}>{t('add')}</Button>}
  </section>
}

/** Existing library glyphs for each roleplay bookmark. */
export const tabIcons = {
  card: IconSkillOutlineRegular, world: IconGlobeOutlineRegular, body: IconUserOutlineRegular,
  clothing: IconPersonalizationOutlineRegular, relationship: IconUsersOutlineRegular,
}

/**
 * Pair the tab title with its category glyph.
 * @param props - native tab information and its registered category.
 * @returns icon and native title text.
 */
export function RoleplayTitle(props: PropsRuntime<'sidebar.right.pane.tab.title'> & { category: RoleplayCategory | 'card' }) {
  const info = props.useTabInfo()
  const Icon = tabIcons[props.category]
  return <><Icon size={16} />{info.tab.title}</>
}
