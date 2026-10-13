/** world update roleplay tool plugin. @module dsh-tool-roleplay/world-update */
import type { Context } from '@deepseek-ai/cordis'
import { registerUpdate } from './shared.ts'

export const name = 'tool-roleplay-world-update'
export const inject = ['tools', 'roleplay', 'agents']

/**
 * Register the world update tool for this plugin's lifetime.
 * @param ctx - context with tool and roleplay services.
 */
export function apply(ctx: Context): void {
  registerUpdate(ctx, 'world')
}
