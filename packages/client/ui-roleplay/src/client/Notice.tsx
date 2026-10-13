/** Shell-owned operation feedback survives sidebar dismissal. */
import { Toast, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoleplayKey } from './locales.ts'

/** One transient operation outcome. */
export interface NoticeState { readonly key: RoleplayKey; readonly success: boolean; readonly seq: number }
/** Shell overlay inputs. */
export interface NoticeInjected { readonly hooks: { readonly notice: HostObservable<NoticeState | null> }; dismiss(): void }
/**
 * Render the latest operation outcome in the app-wide Toast primitive.
 * @param props - observable notice, dismissal and Chinese copy.
 * @returns a transient banner or null.
 */
export function RoleplayNotice(props: InjectFace<NoticeInjected> & PropsLocale<'roleplay'>) {
  const notice = props.useNotice(s => s)
  return notice === null ? null : <Toast key={notice.seq} text={props.t(notice.key)} {...(notice.success ? { tone: 'success' as const } : { icon: <IconWarningOutlineRegular /> })} onDone={props.dismiss} />
}
