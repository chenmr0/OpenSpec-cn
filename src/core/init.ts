/**
 * Init Command
 *
 * Sets up CodeSpec with Agent Skills and /opsx:* slash commands.
 * This is the unified setup command that replaces both the old init and experimental commands.
 */

import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { FileSystemUtils } from '../utils/file-system.js';
import { transformToHyphenCommands } from '../utils/command-references.js';
import {
  AI_TOOLS,
  CODESPEC_DIR_NAME,
  AIToolOption,
} from './config.js';
import { PALETTE } from './styles/palette.js';
import { isInteractive } from '../utils/interactive.js';
import { serializeConfig } from './config-prompts.js';
import {
  generateCommands,
  CommandAdapterRegistry,
} from './command-generation/index.js';
import {
  detectLegacyArtifacts,
  cleanupLegacyArtifacts,
  formatCleanupSummary,
  formatDetectionSummary,
  type LegacyDetectionResult,
} from './legacy-cleanup.js';
import {
  getToolsWithSkillsDir,
  getToolSkillStatus,
  getToolStates,
  getExternalSkillTemplates,
  getExternalAgentTemplates,
  getCommandContents,
  generateSkillContent,
  type ToolSkillStatus,
} from './shared/index.js';
import { getAvailableTools } from './available-tools.js';
import { migrateIfNeeded } from './migration.js';

const require = createRequire(import.meta.url);
const { version: OPENSPEC_VERSION } = require('../../package.json');

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_SCHEMA = 'spec-driven';

const PROGRESS_SPINNER = {
  interval: 80,
  frames: ['░░░', '▒░░', '▒▒░', '▒▒▒', '▓▒▒', '▓▓▒', '▓▓▓', '▒▓▓', '░▒▓'],
};

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type InitCommandOptions = {
  tools?: string;
  force?: boolean;
  interactive?: boolean;
  profile?: string;
};

// -----------------------------------------------------------------------------
// Init Command Class
// -----------------------------------------------------------------------------

export class InitCommand {
  private readonly toolsArg?: string;
  private readonly force: boolean;
  private readonly interactiveOption?: boolean;

  constructor(options: InitCommandOptions = {}) {
    this.toolsArg = options.tools;
    this.force = options.force ?? false;
    this.interactiveOption = options.interactive;
  }

  async execute(targetPath: string): Promise<void> {
    const projectPath = path.resolve(targetPath);
    const openspecDir = CODESPEC_DIR_NAME;
    const openspecPath = path.join(projectPath, openspecDir);

    // Validation happens silently in the background
    const extendMode = await this.validate(projectPath, openspecPath);

    // Check for legacy artifacts and handle cleanup
    await this.handleLegacyCleanup(projectPath, extendMode);

    // Detect available tools in the project (task 7.1)
    const detectedTools = getAvailableTools(projectPath);

    // Migration check: migrate existing projects to profile system (task 7.3)
    if (extendMode) {
      migrateIfNeeded(projectPath, detectedTools);
    }

    // Show animated welcome screen (interactive mode only)
    const canPrompt = this.canPromptInteractively();
    if (canPrompt) {
      const { showWelcomeScreen } = await import('../ui/welcome-screen.js');
      await showWelcomeScreen();
    }

    // Get tool states before processing
    const toolStates = getToolStates(projectPath);

    // Get tool selection (pass detected tools for pre-selection)
    const selectedToolIds = await this.getSelectedTools(toolStates, extendMode, detectedTools, projectPath);

    // Validate selected tools
    const validatedTools = this.validateTools(selectedToolIds, toolStates);

    // Create directory structure and config
    await this.createDirectoryStructure(openspecPath, extendMode);

    // Generate skills and commands for each tool
    const results = await this.generateSkillsAndCommands(projectPath, validatedTools);

    // Create config.yaml if needed
    const configStatus = await this.createConfig(openspecPath, extendMode);

    // Display success message
    this.displaySuccessMessage(projectPath, validatedTools, results, configStatus);
  }

  // ═══════════════════════════════════════════════════════════
  // VALIDATION & SETUP
  // ═══════════════════════════════════════════════════════════

  private async validate(
    projectPath: string,
    openspecPath: string
  ): Promise<boolean> {
    const extendMode = await FileSystemUtils.directoryExists(openspecPath);

    // Check write permissions
    if (!(await FileSystemUtils.ensureWritePermissions(projectPath))) {
      throw new Error(`没有权限写入 ${projectPath}`);
    }
    return extendMode;
  }

  private canPromptInteractively(): boolean {
    if (this.interactiveOption === false) return false;
    if (this.toolsArg !== undefined) return false;
    return isInteractive({ interactive: this.interactiveOption });
  }

  // ═══════════════════════════════════════════════════════════
  // LEGACY CLEANUP
  // ═══════════════════════════════════════════════════════════

  private async handleLegacyCleanup(projectPath: string, extendMode: boolean): Promise<void> {
    // Detect legacy artifacts
    const detection = await detectLegacyArtifacts(projectPath);

    if (!detection.hasLegacyArtifacts) {
      return; // No legacy artifacts found
    }

    // Show what was detected
    console.log();
    console.log(formatDetectionSummary(detection));
    console.log();

    const canPrompt = this.canPromptInteractively();

    if (this.force || !canPrompt) {
      // --force flag or non-interactive mode: proceed with cleanup automatically.
      // Legacy slash commands are 100% CodeSpec-managed, and config file cleanup
      // only removes markers (never deletes files), so auto-cleanup is safe.
      await this.performLegacyCleanup(projectPath, detection);
      return;
    }

    // Interactive mode: prompt for confirmation
    const { confirm } = await import('@inquirer/prompts');
    const shouldCleanup = await confirm({
      message: '升级并清理旧文件？',
      default: true,
    });

    if (!shouldCleanup) {
      console.log(chalk.dim('初始化已取消。'));
      console.log(chalk.dim('使用 --force 跳过此提示，或手动删除旧文件。'));
      process.exit(0);
    }

    await this.performLegacyCleanup(projectPath, detection);
  }

  private async performLegacyCleanup(projectPath: string, detection: LegacyDetectionResult): Promise<void> {
    const spinner = ora('正在清理旧文件...').start();
    const result = await cleanupLegacyArtifacts(projectPath, detection);
    spinner.succeed('旧文件已清理');

    const summary = formatCleanupSummary(result);
    if (summary) {
      console.log();
      console.log(summary);
    }

    console.log();
  }

  // ═══════════════════════════════════════════════════════════
  // TOOL SELECTION
  // ═══════════════════════════════════════════════════════════

  private async getSelectedTools(
    toolStates: Map<string, ToolSkillStatus>,
    extendMode: boolean,
    detectedTools: AIToolOption[],
    projectPath: string
  ): Promise<string[]> {
    // Check for --tools flag first
    const nonInteractiveSelection = this.resolveToolsArg();
    if (nonInteractiveSelection !== null) {
      return nonInteractiveSelection;
    }

    const validTools = getToolsWithSkillsDir();
    const detectedToolIds = new Set(detectedTools.map((t) => t.value));
    const configuredToolIds = new Set(
      [...toolStates.entries()]
        .filter(([, status]) => status.configured)
        .map(([toolId]) => toolId)
    );
    const shouldPreselectDetected = !extendMode && configuredToolIds.size === 0;
    const canPrompt = this.canPromptInteractively();

    // Non-interactive mode: use detected tools as fallback (task 7.8)
    if (!canPrompt) {
      if (detectedToolIds.size > 0) {
        return [...detectedToolIds];
      }
      throw new Error(
        `未检测到工具且未提供 --tools 参数。有效工具：\n  ${validTools.join('\n  ')}\n\n请使用 --tools all、--tools none 或 --tools claude,cursor,...`
      );
    }

    if (validTools.length === 0) {
      throw new Error(
        `没有可用于技能生成的工具。`
      );
    }

    // Interactive mode: show searchable multi-select
    const { searchableMultiSelect } = await import('../prompts/searchable-multi-select.js');

    // Build choices: pre-select configured tools; keep detected tools visible but unselected.
    const sortedChoices = validTools
      .map((toolId) => {
        const tool = AI_TOOLS.find((t) => t.value === toolId);
        const status = toolStates.get(toolId);
        const configured = status?.configured ?? false;
        const detected = detectedToolIds.has(toolId);

        return {
          name: tool?.name || toolId,
          value: toolId,
          configured,
          detected: detected && !configured,
          preSelected: configured || (shouldPreselectDetected && detected && !configured),
        };
      })
      .sort((a, b) => {
        // Configured tools first, then detected (not configured), then everything else.
        if (a.configured && !b.configured) return -1;
        if (!a.configured && b.configured) return 1;
        if (a.detected && !b.detected) return -1;
        if (!a.detected && b.detected) return 1;
        return 0;
      });

    const configuredNames = validTools
      .filter((toolId) => configuredToolIds.has(toolId))
      .map((toolId) => AI_TOOLS.find((t) => t.value === toolId)?.name || toolId);

    if (configuredNames.length > 0) {
      console.log(`CodeSpec 已配置：${configuredNames.join(', ')}（已预选）`);
    }

    const detectedOnlyNames = detectedTools
      .filter((tool) => !configuredToolIds.has(tool.value))
      .map((tool) => tool.name);

    if (detectedOnlyNames.length > 0) {
      const detectionLabel = shouldPreselectDetected
        ? '首次设置已预选'
        : '未预选';
      console.log(`检测到工具目录：${detectedOnlyNames.join(', ')}（${detectionLabel}）`);
    }

    const selectedTools = await searchableMultiSelect({
      message: `选择要设置的工具（共 ${validTools.length} 个可用）`,
      pageSize: 15,
      choices: sortedChoices,
      validate: (selected: string[]) => selected.length > 0 || '至少选择一个工具',
    });

    if (selectedTools.length === 0) {
      throw new Error('必须至少选择一个工具');
    }

    return selectedTools;
  }

  private resolveToolsArg(): string[] | null {
    if (typeof this.toolsArg === 'undefined') {
      return null;
    }

    const raw = this.toolsArg.trim();
    if (raw.length === 0) {
      throw new Error(
        '--tools 选项需要一个值。请使用 "all"、"none" 或以逗号分隔的工具 ID 列表。'
      );
    }

    const availableTools = getToolsWithSkillsDir();
    const availableSet = new Set(availableTools);
    const availableList = ['all', 'none', ...availableTools].join(', ');

    const lowerRaw = raw.toLowerCase();
    if (lowerRaw === 'all') {
      return availableTools;
    }

    if (lowerRaw === 'none') {
      return [];
    }

    const tokens = raw
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    if (tokens.length === 0) {
      throw new Error(
        '当未使用 "all" 或 "none" 时，--tools 选项至少需要一个工具 ID。'
      );
    }

    const normalizedTokens = tokens.map((token) => token.toLowerCase());

    if (normalizedTokens.some((token) => token === 'all' || token === 'none')) {
      throw new Error('不能同时使用保留值 "all" 或 "none" 与具体工具 ID。');
    }

    const invalidTokens = tokens.filter(
      (_token, index) => !availableSet.has(normalizedTokens[index])
    );

    if (invalidTokens.length > 0) {
      throw new Error(
        `无效工具: ${invalidTokens.join(', ')}。可用值: ${availableList}`
      );
    }

    // Deduplicate while preserving order
    const deduped: string[] = [];
    for (const token of normalizedTokens) {
      if (!deduped.includes(token)) {
        deduped.push(token);
      }
    }

    return deduped;
  }

  private validateTools(
    toolIds: string[],
    toolStates: Map<string, ToolSkillStatus>
  ): Array<{ value: string; name: string; skillsDir: string; wasConfigured: boolean }> {
    const validatedTools: Array<{ value: string; name: string; skillsDir: string; wasConfigured: boolean }> = [];

    for (const toolId of toolIds) {
      const tool = AI_TOOLS.find((t) => t.value === toolId);
      if (!tool) {
        const validToolIds = getToolsWithSkillsDir();
        throw new Error(
          `未知工具 '${toolId}'。有效工具：\n  ${validToolIds.join('\n  ')}`
        );
      }

      if (!tool.skillsDir) {
        const validToolsWithSkills = getToolsWithSkillsDir();
        throw new Error(
          `工具 '${toolId}' 不支持技能生成。支持技能生成的工具：\n  ${validToolsWithSkills.join('\n  ')}`
        );
      }

      const preState = toolStates.get(tool.value);
      validatedTools.push({
        value: tool.value,
        name: tool.name,
        skillsDir: tool.skillsDir,
        wasConfigured: preState?.configured ?? false,
      });
    }

    return validatedTools;
  }

  // ═══════════════════════════════════════════════════════════
  // DIRECTORY STRUCTURE
  // ═══════════════════════════════════════════════════════════

  private async createDirectoryStructure(openspecPath: string, extendMode: boolean): Promise<void> {
    if (extendMode) {
      // In extend mode, just ensure directories exist without spinner
      const directories = [
        openspecPath,
        path.join(openspecPath, 'specs'),
        path.join(openspecPath, 'changes'),
        path.join(openspecPath, 'changes', 'archive'),
      ];

      for (const dir of directories) {
        await FileSystemUtils.createDirectory(dir);
      }
      return;
    }

    const spinner = this.startSpinner('正在创建 CodeSpec 结构...');

    const directories = [
      openspecPath,
      path.join(openspecPath, 'specs'),
      path.join(openspecPath, 'changes'),
      path.join(openspecPath, 'changes', 'archive'),
    ];

    for (const dir of directories) {
      await FileSystemUtils.createDirectory(dir);
    }

    spinner.stopAndPersist({
      symbol: PALETTE.white('▌'),
      text: PALETTE.white('CodeSpec 结构已创建'),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SKILL & COMMAND GENERATION
  // ═══════════════════════════════════════════════════════════

  private async generateSkillsAndCommands(
    projectPath: string,
    tools: Array<{ value: string; name: string; skillsDir: string; wasConfigured: boolean }>
  ): Promise<{
    createdTools: typeof tools;
    refreshedTools: typeof tools;
    failedTools: Array<{ name: string; error: Error }>;
    commandsSkipped: string[];
    removedCommandCount: number;
    removedSkillCount: number;
  }> {
    const createdTools: typeof tools = [];
    const refreshedTools: typeof tools = [];
    const failedTools: Array<{ name: string; error: Error }> = [];
    const commandsSkipped: string[] = [];
    let removedCommandCount = 0;
    let removedSkillCount = 0;

    // Only generate external skills (4), agents (3), and 3 core commands.
    // Internal skillTemplates are workflow-specific (new/continue/ff/sync etc.)
    // and never matched the core propose/apply/archive workflows, so skip them.
    const externalSkillTemplates = getExternalSkillTemplates();
    const commandContents = getCommandContents(['propose', 'apply', 'archive']);

    // Process each tool
    for (const tool of tools) {
      const spinner = ora(`正在配置 ${tool.name}...`).start();

      try {
        {
          // Use tool-specific skillsDir
          const skillsDir = path.join(projectPath, tool.skillsDir, 'skills');

          // Always create external skills (writing-plans, test-driven-development, etc.)
          for (const { template, dirName, extraFiles } of externalSkillTemplates) {
            const skillDir = path.join(skillsDir, dirName);
            const skillFile = path.join(skillDir, 'SKILL.md');

            const transformer = (tool.value === 'opencode' || tool.value === 'pi') ? transformToHyphenCommands : undefined;
            const skillContent = generateSkillContent(template, OPENSPEC_VERSION, transformer);

            await FileSystemUtils.writeFile(skillFile, skillContent);

            // Write extra files (e.g. testing-anti-patterns.md)
            if (extraFiles) {
              for (const extra of extraFiles) {
                const extraFile = path.join(skillDir, extra.filename);
                await FileSystemUtils.writeFile(extraFile, extra.content);
              }
            }
          }

          // Always install agent files to agents directory
          const agentTemplates = getExternalAgentTemplates();
          for (const agent of agentTemplates) {
            const agentsDir = path.join(projectPath, tool.skillsDir, 'agents');
            const agentFile = path.join(agentsDir, agent.filename);
            await FileSystemUtils.writeFile(agentFile, agent.content);
          }
        }

        // Always generate commands
        {
          const adapter = CommandAdapterRegistry.get(tool.value);
          if (adapter) {
            const generatedCommands = generateCommands(commandContents, adapter);

            for (const cmd of generatedCommands) {
              const commandFile = path.isAbsolute(cmd.path) ? cmd.path : path.join(projectPath, cmd.path);
              await FileSystemUtils.writeFile(commandFile, cmd.fileContent);
            }
          } else {
            commandsSkipped.push(tool.value);
          }
        }

        // Configure opencode continuation plugin when opencode tool is selected
        if (tool.value === 'opencode') {
          try {
            await this.configureOpenCodePlugin(projectPath);
          } catch (pluginError) {
            console.log(chalk.dim(`  插件配置: ${pluginError instanceof Error ? pluginError.message : String(pluginError)}`));
          }
        }

        spinner.succeed(`${tool.name} 配置完成`);

        if (tool.wasConfigured) {
          refreshedTools.push(tool);
        } else {
          createdTools.push(tool);
        }
      } catch (error) {
        spinner.fail(`${tool.name} 配置失败`);
        failedTools.push({ name: tool.name, error: error as Error });
      }
    }

    return {
      createdTools,
      refreshedTools,
      failedTools,
      commandsSkipped,
      removedCommandCount,
      removedSkillCount,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CONFIG FILE
  // ═══════════════════════════════════════════════════════════

  private async createConfig(openspecPath: string, extendMode: boolean): Promise<'created' | 'exists' | 'skipped'> {
    const configPath = path.join(openspecPath, 'config.yaml');
    const configYmlPath = path.join(openspecPath, 'config.yml');
    const configYamlExists = fs.existsSync(configPath);
    const configYmlExists = fs.existsSync(configYmlPath);

    if (configYamlExists || configYmlExists) {
      return 'exists';
    }

    // In non-interactive mode without --force, skip config creation
    if (!this.canPromptInteractively() && !this.force) {
      return 'skipped';
    }

    try {
      const yamlContent = serializeConfig({ schema: DEFAULT_SCHEMA });
      await FileSystemUtils.writeFile(configPath, yamlContent);
      return 'created';
    } catch {
      return 'skipped';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UI & OUTPUT
  // ═══════════════════════════════════════════════════════════

  private displaySuccessMessage(
    projectPath: string,
    tools: Array<{ value: string; name: string; skillsDir: string; wasConfigured: boolean }>,
    results: {
      createdTools: typeof tools;
      refreshedTools: typeof tools;
      failedTools: Array<{ name: string; error: Error }>;
      commandsSkipped: string[];
      removedCommandCount: number;
      removedSkillCount: number;
    },
    configStatus: 'created' | 'exists' | 'skipped'
  ): void {
    console.log();
    console.log(chalk.bold('CodeSpec 设置完成'));
    console.log();

    // Show created vs refreshed tools
    if (results.createdTools.length > 0) {
      console.log(`已创建：${results.createdTools.map((t) => t.name).join(', ')}`);
    }
    if (results.refreshedTools.length > 0) {
      console.log(`已刷新：${results.refreshedTools.map((t) => t.name).join(', ')}`);
    }

    // Show counts
    const successfulTools = [...results.createdTools, ...results.refreshedTools];
    if (successfulTools.length > 0) {
      const toolDirs = [...new Set(successfulTools.map((t) => t.skillsDir))].join(', ');
      const skillCount = getExternalSkillTemplates().length;
      const commandCount = getCommandContents(['propose', 'apply', 'archive']).length;
      if (skillCount > 0 && commandCount > 0) {
        console.log(`${skillCount} 个技能和 ${commandCount} 个命令在 ${toolDirs}/ 中`);
      } else if (skillCount > 0) {
        console.log(`${skillCount} 个技能在 ${toolDirs}/ 中`);
      } else if (commandCount > 0) {
        console.log(`${commandCount} 个命令在 ${toolDirs}/ 中`);
      }
    }

    // Show failures
    if (results.failedTools.length > 0) {
      console.log(chalk.red(`失败：${results.failedTools.map((f) => `${f.name} (${f.error.message})`).join(', ')}`));
    }

    // Show skipped commands
    if (results.commandsSkipped.length > 0) {
      console.log(chalk.dim(`已跳过命令：${results.commandsSkipped.join(', ')} (无适配器)`));
    }

    // Show opencode plugin info
    const hasOpenCode = tools.some((t) => t.value === 'opencode');
    if (hasOpenCode) {
      console.log(chalk.dim('插件：codespec 已注册到 .opencode/opencode.json（自动续行未完成任务，主动回收上下文）'));
    }

    // Config status
    if (configStatus === 'created') {
      console.log(`配置：openspec/config.yaml (schema: ${DEFAULT_SCHEMA})`);
    } else if (configStatus === 'exists') {
      // Show actual filename (config.yaml or config.yml)
      const configYaml = path.join(projectPath, CODESPEC_DIR_NAME, 'config.yaml');
      const configYml = path.join(projectPath, CODESPEC_DIR_NAME, 'config.yml');
      const configName = fs.existsSync(configYaml) ? 'config.yaml' : fs.existsSync(configYml) ? 'config.yml' : 'config.yaml';
      console.log(`配置：openspec/${configName} (已存在)`);
    } else {
      console.log(chalk.dim(`配置：已跳过 (非交互模式)`));
    }

    // Getting started
    console.log();
    console.log(chalk.bold('开始使用：'));
    console.log('  开始您的第一个变更：/codespec/plan "您的想法"');

    // Links
    console.log();

    // Restart instruction if any tools were configured
    if (results.createdTools.length > 0 || results.refreshedTools.length > 0) {
      console.log();
      console.log(chalk.white('重启您的 CodeAgent 以使斜杠命令生效。'));
    }

    console.log();
  }

  private startSpinner(text: string) {
    return ora({
      text,
      stream: process.stdout,
      color: 'gray',
      spinner: PROGRESS_SPINNER,
    }).start();
  }

  // ═══════════════════════════════════════════════════════════
  // OPENCODE PLUGIN CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Configure the codespec continuation plugin for OpenCode.
   * Adds "codespec" to the plugin array in .opencode/opencode.json.
   *
   * OpenCode discovers plugins from these config files (in priority order):
   *   1. <project>/.opencode/opencode.json[c]
   *   2. ~/.config/opencode/opencode.json[c] (Windows: %APPDATA%/opencode/)
   *
   * The "plugin" array contains npm package name strings, e.g. ["codespec"].
   * OpenCode will import the package and call its default export as Plugin().
   */
  private async configureOpenCodePlugin(projectPath: string): Promise<void> {
    const opencodeDir = path.join(projectPath, '.opencode');
    const configPath = path.join(opencodeDir, 'opencode.json');

    await FileSystemUtils.createDirectory(opencodeDir);

    // Read existing config or start fresh
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        const raw = await fs.promises.readFile(configPath, 'utf-8');
        config = JSON.parse(raw);
      } catch {
        // Corrupted or empty config, start fresh
        config = {};
      }
    }

    // The "plugin" array contains specifier strings (npm names or file:// URLs).
    // We use a file:// URL pointing to the codespec package root to avoid
    // collision with an unrelated "codespec" package on the npm registry.
    const packageName = 'codespec';
    // This file is at <codespec-root>/dist/core/init.js, so go up 2 levels to find root.
    const thisFileDir = path.dirname(fileURLToPath(import.meta.url));
    const codespecRoot = path.resolve(thisFileDir, '..', '..');
    const fileUrl = pathToFileURL(codespecRoot).href;
    const plugins = ((config.plugin as string[]) ?? []).filter(
      (p) => typeof p === 'string'
    );

    // Check if codespec is already in the plugin list (by name, versioned name, or file URL)
    const alreadyConfigured = plugins.some(
      (p) => p === packageName || p.startsWith(`${packageName}@`) || p === fileUrl
    );

    if (!alreadyConfigured) {
      plugins.push(fileUrl);
    }

    config.plugin = plugins;

    // Auto-configure permissions for unattended /codespec/apply sessions.
    // Only set if the user hasn't already configured permissions.
    if (config.permission === undefined) {
      config.permission = {
        "bash": "allow",
        "edit": "allow",
        "write": "allow",
        "glob": "allow",
        "grep": "allow",
        "read": "allow",
        "external_directory": "allow",
      };
    }

    await FileSystemUtils.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  }
}
