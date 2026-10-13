/** clothing read roleplay tool plugin. @module dsh-tool-roleplay/clothing-read */
import type { Context } from '@deepseek-ai/cordis'
import { registerRead } from './shared.ts'

export const name = 'tool-roleplay-clothing-read'
export const inject = ['tools', 'roleplay', 'agents']

/**
 * Register the clothing read tool for this plugin's lifetime.
 * @param ctx - context with tool and roleplay services.
 */
export function apply(ctx: Context): void {
  registerRead(ctx, 'clothing')
}
