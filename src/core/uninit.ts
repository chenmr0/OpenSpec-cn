/**
 * Uninit Command
 *
 * Removes CodeSpec-managed OpenCode artifacts from the user's OpenCode config.
 */

import * as fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { parse as parseJsonc } from 'jsonc-parser';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  getOpenCodeUserConfigDir,
} from './global-config.js';
import { FileSystemUtils } from '../utils/file-system.js';
import {
  COMMAND_IDS,
  getExternalAgentTemplates,
  getExternalSkillTemplates,
  getSkillTemplates,
  DEPRECATED_EXTERNAL_SKILL_DIRS,
  isCodeSpecGeneratedSkill,
} from './shared/index.js';
import { CommandAdapterRegistry } from './command-generation/index.js';

export interface UninitResult {
  removedSkills: string[];
  skippedSkills: string[];
  removedCommands: string[];
  removedAgents: string[];
  skippedAgents: string[];
  removedPluginEntries: string[];
  configUpdated: boolean;
  configSkippedReason?: string;
  prunedDirectories: string[];
  errors: string[];
}

function createEmptyResult(): UninitResult {
  return {
    removedSkills: [],
    skippedSkills: [],
    removedCommands: [],
    removedAgents: [],
    skippedAgents: [],
    removedPluginEntries: [],
    configUpdated: false,
    prunedDirectories: [],
    errors: [],
  };
}

function pathEquals(left: string, right: string): boolean {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);

  if (process.platform === 'win32') {
    return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
  }

  return resolvedLeft === resolvedRight;
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  return parseJsonc(raw) as unknown;
}

export class UninitCommand {
  async execute(projectPath = '.'): Promise<UninitResult> {
    const resolvedProjectPath = path.resolve(projectPath);
    const opencodeDir = getOpenCodeUserConfigDir();
    const result = createEmptyResult();

    await this.removeSkills(opencodeDir, result);
    await this.removeCommands(resolvedProjectPath, opencodeDir, result);
    await this.removeAgents(opencodeDir, result);
    await this.removeOpenCodePlugin(opencodeDir, result);
    await this.pruneEmptyDirectories(opencodeDir, result);

    this.displaySummary(opencodeDir, result);

    if (result.errors.length > 0) {
      throw new Error(`Failed to remove ${result.errors.length} CodeSpec artifact(s)`);
    }

    return result;
  }

  private async removeSkills(opencodeDir: string, result: UninitResult): Promise<void> {
    const skillsDir = path.join(opencodeDir, 'skills');
    const skillEntries = [...getSkillTemplates(), ...getExternalSkillTemplates()];

    // Also enumerate deprecated external skill dir names so that uninit cleans up
    // stale directories created by previous CodeSpec versions (renamed to avoid
    // collisions with superpowers-zh skills of the same name).
    const dirNamesToCheck: string[] = [
      ...skillEntries.map((entry) => entry.dirName),
      ...DEPRECATED_EXTERNAL_SKILL_DIRS.map((entry) => entry.oldDirName),
    ];

    for (const dirName of dirNamesToCheck) {
      const skillDir = path.join(skillsDir, dirName);
      const skillFile = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(skillDir)) {
        continue;
      }

      try {
        if (!fs.existsSync(skillFile)) {
          result.skippedSkills.push(skillDir);
          continue;
        }

        const content = await fs.promises.readFile(skillFile, 'utf-8');
        if (!isCodeSpecGeneratedSkill(content)) {
          result.skippedSkills.push(skillDir);
          continue;
        }

        await fs.promises.rm(skillDir, { recursive: true, force: true });
        result.removedSkills.push(skillDir);
      } catch (error) {
        result.errors.push(this.formatFsError('skill', skillDir, error));
      }
    }
  }

  private async removeCommands(
    projectPath: string,
    opencodeDir: string,
    result: UninitResult
  ): Promise<void> {
    const adapter = CommandAdapterRegistry.get('opencode');
    if (!adapter) {
      return;
    }

    const commandsNamespaceDir = path.join(opencodeDir, 'commands', 'codespec');

    for (const commandId of COMMAND_IDS) {
      const commandPath = adapter.getFilePath(commandId);
      const fullPath = path.isAbsolute(commandPath)
        ? commandPath
        : path.join(projectPath, commandPath);

      if (!isPathInside(commandsNamespaceDir, fullPath)) {
        continue;
      }

      if (!fs.existsSync(fullPath)) {
        continue;
      }

      try {
        await fs.promises.unlink(fullPath);
        result.removedCommands.push(fullPath);
      } catch (error) {
        result.errors.push(this.formatFsError('command', fullPath, error));
      }
    }
  }

  private async removeAgents(opencodeDir: string, result: UninitResult): Promise<void> {
    const agentsDir = path.join(opencodeDir, 'agents');

    for (const agent of getExternalAgentTemplates()) {
      const agentFile = path.join(agentsDir, agent.filename);

      if (!fs.existsSync(agentFile)) {
        continue;
      }

      try {
        const content = await fs.promises.readFile(agentFile, 'utf-8');
        if (content !== agent.content) {
          result.skippedAgents.push(agentFile);
          continue;
        }

        await fs.promises.unlink(agentFile);
        result.removedAgents.push(agentFile);
      } catch (error) {
        result.errors.push(this.formatFsError('agent', agentFile, error));
      }
    }
  }

  private async removeOpenCodePlugin(opencodeDir: string, result: UninitResult): Promise<void> {
    const configPath = path.join(opencodeDir, 'opencode.json');

    if (!fs.existsSync(configPath)) {
      result.configSkippedReason = 'missing';
      return;
    }

    let config: Record<string, unknown>;
    try {
      const parsed = await readJsonFile(configPath);
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        result.configSkippedReason = 'invalid-shape';
        return;
      }
      config = parsed as Record<string, unknown>;
    } catch {
      result.configSkippedReason = 'invalid-json';
      return;
    }

    const plugin = config.plugin;
    if (!Array.isArray(plugin)) {
      result.configSkippedReason = 'missing-plugin-array';
      return;
    }

    const remainingPlugins: unknown[] = [];
    const removedPlugins: string[] = [];

    for (const entry of plugin) {
      if (typeof entry === 'string' && await this.isCodeSpecPluginSpecifier(entry)) {
        removedPlugins.push(entry);
        continue;
      }

      remainingPlugins.push(entry);
    }

    if (removedPlugins.length === 0) {
      result.configSkippedReason = 'no-codespec-plugin';
      return;
    }

    config.plugin = remainingPlugins;

    try {
      await FileSystemUtils.backupFile(configPath);
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      result.configUpdated = true;
      result.removedPluginEntries.push(...removedPlugins);
      result.configSkippedReason = undefined;
    } catch (error) {
      result.errors.push(this.formatFsError('opencode.json', configPath, error));
    }
  }

  private async isCodeSpecPluginSpecifier(specifier: string): Promise<boolean> {
    if (specifier === 'codespec' || specifier.startsWith('codespec@')) {
      return true;
    }

    const currentRoot = this.getCurrentPackageRoot();
    const currentFileUrl = pathToFileURL(currentRoot).href;
    if (specifier === currentFileUrl) {
      return true;
    }

    if (!specifier.startsWith('file://')) {
      return false;
    }

    let pluginPath: string;
    try {
      pluginPath = fileURLToPath(specifier);
    } catch {
      return false;
    }

    if (pathEquals(pluginPath, currentRoot)) {
      return true;
    }

    if (path.basename(pluginPath).toLowerCase() === 'codespec') {
      return true;
    }

    const packageDir = await this.findPackageDir(pluginPath);
    if (!packageDir) {
      return false;
    }

    try {
      const packageJson = await readJsonFile(path.join(packageDir, 'package.json'));
      return (
        packageJson !== null &&
        !Array.isArray(packageJson) &&
        typeof packageJson === 'object' &&
        (packageJson as Record<string, unknown>).name === 'codespec'
      );
    } catch {
      return false;
    }
  }

  private getCurrentPackageRoot(): string {
    const thisFileDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(thisFileDir, '..', '..');
  }

  private async findPackageDir(pluginPath: string): Promise<string | null> {
    try {
      const stats = await fs.promises.stat(pluginPath);
      return stats.isDirectory() ? pluginPath : path.dirname(pluginPath);
    } catch {
      return null;
    }
  }

  private async pruneEmptyDirectories(opencodeDir: string, result: UninitResult): Promise<void> {
    const candidates = [
      path.join(opencodeDir, 'commands', 'codespec'),
      path.join(opencodeDir, 'commands'),
      path.join(opencodeDir, 'skills'),
      path.join(opencodeDir, 'agents'),
      opencodeDir,
    ];

    for (const dir of candidates) {
      try {
        if (!fs.existsSync(dir)) {
          continue;
        }

        const entries = await fs.promises.readdir(dir);
        if (entries.length === 0) {
          await fs.promises.rmdir(dir);
          result.prunedDirectories.push(dir);
        }
      } catch {
        // Non-empty or inaccessible directories are intentionally preserved.
      }
    }
  }

  private formatFsError(kind: string, targetPath: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `${kind}: ${targetPath}: ${message}`;
  }

  private displaySummary(opencodeDir: string, result: UninitResult): void {
    const removedTotal =
      result.removedSkills.length +
      result.removedCommands.length +
      result.removedAgents.length +
      result.removedPluginEntries.length;

    console.log();
    console.log(chalk.bold('CodeSpec OpenCode uninit complete'));
    console.log(`OpenCode config: ${opencodeDir}`);
    console.log(`Removed: ${removedTotal} item(s)`);

    if (result.skippedSkills.length > 0 || result.skippedAgents.length > 0) {
      console.log(chalk.dim(
        `Skipped user-modified/unmarked artifacts: ${result.skippedSkills.length + result.skippedAgents.length}`
      ));
    }

    if (result.configSkippedReason && result.configSkippedReason !== 'missing') {
      console.log(chalk.dim(`opencode.json unchanged: ${result.configSkippedReason}`));
    }

    if (result.errors.length > 0) {
      console.log(chalk.red(`Errors: ${result.errors.length}`));
    }

    console.log();
  }
}
