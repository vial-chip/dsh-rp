/** clothing update roleplay tool plugin. @module dsh-tool-roleplay/clothing-update */
import type { Context } from '@deepseek-ai/cordis'
import { registerUpdate } from './shared.ts'

export const name = 'tool-roleplay-clothing-update'
export const inject = ['tools', 'roleplay', 'agents']

/**
 * Register the clothing update tool for this plugin's lifetime.
 * @param ctx - context with tool and roleplay services.
 */
export function apply(ctx: Context): void {
  registerUpdate(ctx, 'clothing')
}
