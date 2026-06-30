/**
 * Auto-cleanup for stale artifacts from older codespec versions.
 *
 * When users upgrade codespec, stale files from removed workflows need to be
 * cleaned up. This runs once at plugin startup and removes:
 *   1. /apply-quick command file
 *   2. quick-driven-development skill directory
 *
 * Idempotent and scoped to OpenCode only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getOpenCodeUserConfigDir } from '../core/global-config.js';

function removeFileIfExists(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // best-effort
  }
  return false;
}

function removeDirIfExists(dirPath: string): boolean {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
  } catch {
    // best-effort
  }
  return false;
}

export interface CleanupSummary {
  removedCommands: string[];
  removedSkills: string[];
}

/**
 * Remove stale /apply-quick command and quick-driven-development skill
 * from OpenCode's user config directory.
 */
export function autoCleanupStaleWorkflows(): CleanupSummary {
  const removedCommands: string[] = [];
  const removedSkills: string[] = [];

  try {
    const configDir = getOpenCodeUserConfigDir();

    if (removeFileIfExists(path.join(configDir, 'commands', 'codespec', 'apply-quick.md'))) {
      removedCommands.push('apply-quick');
    }
    if (removeDirIfExists(path.join(configDir, 'skills', 'quick-driven-development'))) {
      removedSkills.push('quick-driven-development');
    }
  } catch {
    // Silent — cleanup is best-effort
  }

  return { removedCommands, removedSkills };
}
