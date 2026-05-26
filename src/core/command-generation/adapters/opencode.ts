/**
 * OpenCode Command Adapter
 *
 * Formats commands for OpenCode following its frontmatter specification.
 * Commands are placed under .opencode/commands/sdd/ so they appear as
 * `/sdd/<id>` in the OpenCode UI.
 */

import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';
import { transformToOpenCodeCommands, OPENCODE_COMMAND_MAP } from '../../../utils/command-references.js';
import { getOpenCodeUserConfigDir } from '../../global-config.js';

/**
 * OpenCode adapter for command generation.
 * File path: .opencode/commands/sdd/<id>.md
 * Frontmatter: description
 */
export const opencodeAdapter: ToolCommandAdapter = {
  toolId: 'opencode',

  getFilePath(commandId: string): string {
    const slug = OPENCODE_COMMAND_MAP[commandId] ?? commandId;
    return path.join(getOpenCodeUserConfigDir(), 'commands', 'codespec', `${slug}.md`);
  },

  formatFile(content: CommandContent): string {
    // Transform command references from /opsx:xxx or /opsx-xxx to /sdd/<mapped>
    const transformedBody = transformToOpenCodeCommands(content.body);

    return `---
description: ${content.description}
---

${transformedBody}
`;
  },
};
