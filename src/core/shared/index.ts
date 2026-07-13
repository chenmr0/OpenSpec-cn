/**
 * Shared Utilities
 *
 * Common code shared between init and update commands.
 */

export {
  SKILL_NAMES,
  type SkillName,
  COMMAND_IDS,
  type CommandId,
  type ToolSkillStatus,
  type ToolVersionStatus,
  getToolsWithSkillsDir,
  getToolSkillStatus,
  getToolStates,
  extractGeneratedByVersion,
  getToolVersionStatus,
  getConfiguredTools,
  getAllToolVersionStatus,
} from './tool-detection.js';

export {
  type SkillTemplateEntry,
  type SkillExtraFile,
  type CommandTemplateEntry,
  type AgentTemplateEntry,
  getSkillTemplates,
  getExternalSkillTemplates,
  getExternalAgentTemplates,
  OPENCODE_SUBAGENT_FILES,
  injectFrontmatterMode,
  getCommandTemplates,
  getCommandContents,
  generateSkillContent,
  DEPRECATED_EXTERNAL_SKILL_DIRS,
  isCodeSpecGeneratedSkill,
  cleanupDeprecatedExternalSkillDirs,
} from './skill-generation.js';
