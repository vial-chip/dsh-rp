/** relationship read roleplay tool plugin. @module dsh-tool-roleplay/relationship-read */
import type { Context } from '@deepseek-ai/cordis'
import { registerRead } from './shared.ts'

export const name = 'tool-roleplay-relationship-read'
export const inject = ['tools', 'roleplay', 'agents']

/**
 * Register the relationship read tool for this plugin's lifetime.
 * @param ctx - context with tool and roleplay services.
 */
export function apply(ctx: Context): void {
  registerRead(ctx, 'relationship')
}
