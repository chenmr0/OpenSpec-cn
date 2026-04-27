/**
 * Command Reference Utilities
 *
 * Utilities for transforming command references to tool-specific formats.
 */

/**
 * Transforms colon-based command references to hyphen-based format.
 * Converts `/opsx:` patterns to `/opsx-` for tools that use hyphen syntax.
 *
 * @param text - The text containing command references
 * @returns Text with command references transformed to hyphen format
 *
 * @example
 * transformToHyphenCommands('/opsx:new') // returns '/opsx-new'
 * transformToHyphenCommands('Use /opsx:apply to implement') // returns 'Use /opsx-apply to implement'
 */
export function transformToHyphenCommands(text: string): string {
  return text.replace(/\/opsx:/g, '/opsx-');
}

/**
 * Mapping from commandId to OpenCode-specific slug names.
 * Most IDs map to themselves; only those needing a different
 * display name are listed here.
 */
export const OPENCODE_COMMAND_MAP: Record<string, string> = {
  'explore': 'explore',
  'new': 'new',
  'continue': 'continue',
  'apply': 'apply',
  'ff': 'ff',
  'sync': 'sync',
  'archive': 'archive',
  'bulk-archive': 'bulk-archive',
  'verify': 'verify',
  'onboard': 'onboard',
  'propose': 'proposal',
  'proposal': 'proposal',
  'specs': 'specs',
  'design': 'design',
  'plan': 'plan',
};

/**
 * Transforms command references to OpenCode `/sdd/<slug>` format.
 * Converts both `/opsx:xxx` and `/opsx-xxx` patterns to `/sdd/<mapped>`.
 *
 * @param text - The text containing command references
 * @returns Text with command references transformed to OpenCode format
 *
 * @example
 * transformToOpenCodeCommands('/opsx:apply') // returns '/sdd/apply'
 * transformToOpenCodeCommands('/opsx-propose') // returns '/sdd/proposal'
 */
export function transformToOpenCodeCommands(text: string): string {
  // Replace both /opsx:xxx and /opsx-xxx with /sdd/<mapped>
  return text.replace(/\/opsx[:-]([\w-]+)/g, (match, commandId: string) => {
    const mapped = OPENCODE_COMMAND_MAP[commandId] ?? commandId;
    return `/sdd/${mapped}`;
  });
}
