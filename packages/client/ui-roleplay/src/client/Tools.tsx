/** Native application plugin switches shown with the character settings. */
import { useEffect, useRef, useState } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoleplayInjected, RoleplayToolName, RoleplayToolSetting } from './face.ts'
import css from './Roleplay.module.css'

/**
 * Show independently persisted application switches without changing conversation state.
 * @param props - native plugin management callbacks and localized copy.
 * @returns the roleplay tool settings section.
 */
export function RoleplayTools(props: InjectFace<RoleplayInjected> & PropsLocale<'roleplay'>) {
  const { listTools, setToolEnabled, notify, t } = props
  const [tools, setTools] = useState<RoleplayToolSetting[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const [reload, setReload] = useState(0)
  const lock = useRef(false)
  useEffect(() => {
    let active = true
    setFailed(false)
    void listTools().then((rows) => { if (active) setTools(rows) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [listTools, reload])
  async function toggle(name: RoleplayToolName, enabled: boolean): Promise<void> {
    if (lock.current) return
    lock.current = true
    setPending(true)
    try {
      const result = await setToolEnabled(name, enabled)
      notify(result === 'applied' ? 'toolsSaved' : 'restartRequired', true)
      setReload(value => value + 1)
    } catch (_error) { notify('failed', false) }
    finally { lock.current = false; setPending(false) }
  }
  return <section className={css.tools}>
    <h2>{t('tools')}</h2>
    <p className={css.hint}>{t('toolsHint')}</p>
    {tools === null && !failed && <span className={css.skeleton} aria-hidden="true" />}
    {failed && <p className={css.notice} role="alert">{t('toolsUnavailable')} <Button size="sm" onClick={() => { setReload(value => value + 1) }}>{t('retry')}</Button></p>}
    {tools?.map(tool => <div className={css.field} key={tool.name}>
      <div>{t(`tool-${tool.name}`)}</div>
      <Switch label={t(`tool-${tool.name}`)} checked={tool.enabled} disabled={pending || !tool.canChange} onChange={(enabled) => { void toggle(tool.name, enabled) }} />
    </div>)}
  </section>
}
