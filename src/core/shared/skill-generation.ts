/**
 * Skill Generation Utilities
 *
 * Shared utilities for generating skill and command files.
 */

import {
  getNewChangeSkillTemplate,
  getContinueChangeSkillTemplate,
  getFfChangeSkillTemplate,
  getSyncSpecsSkillTemplate,
  getBulkArchiveChangeSkillTemplate,
  getVerifyChangeSkillTemplate,
  getOnboardSkillTemplate,
  getOpsxExploreCommandTemplate,
  getOpsxNewCommandTemplate,
  getOpsxContinueCommandTemplate,
  getOpsxApplyCommandTemplate,
  getOpsxFfCommandTemplate,
  getOpsxSyncCommandTemplate,
  getOpsxArchiveCommandTemplate,
  getOpsxBulkArchiveCommandTemplate,
  getOpsxVerifyCommandTemplate,
  getOpsxOnboardCommandTemplate,
  getOpsxProposeCommandTemplate,
  type SkillTemplate,
} from '../templates/skill-templates.js';
import { getWritingPlansSkillTemplate } from '../templates/external/writing-plans.js';
import { getTestDrivenDevelopmentSkillTemplate, testingAntiPatternsContent } from '../templates/external/test-driven-development.js';
import { getSubagentDrivenDevelopmentSkillTemplate } from '../templates/external/subagent-driven-development.js';
import { getVerificationBeforeCompletionSkillTemplate } from '../templates/external/verification-before-completion.js';
import { codeGeneratorContent, specReviewerContent, codeQualityReviewerContent } from '../templates/agents/index.js';
import type { CommandContent } from '../command-generation/index.js';

/**
 * Extra file to write alongside SKILL.md in a skill directory.
 */
export interface SkillExtraFile {
  filename: string;
  content: string;
}

/**
 * Skill template with directory name and workflow ID mapping.
 */
export interface SkillTemplateEntry {
  template: SkillTemplate;
  dirName: string;
  workflowId: string;
  /** Additional files to write into the skill directory (e.g. reference docs). */
  extraFiles?: SkillExtraFile[];
}

/**
 * Command template with ID mapping.
 */
export interface CommandTemplateEntry {
  template: ReturnType<typeof getOpsxExploreCommandTemplate>;
  id: string;
}

/**
 * Gets skill templates with their directory names, optionally filtered by workflow IDs.
 *
 * @param workflowFilter - If provided, only return templates whose workflowId is in this array
 */
export function getSkillTemplates(workflowFilter?: readonly string[]): SkillTemplateEntry[] {
  // Core workflows (explore, apply, archive, propose) only generate commands, not skills.
  const all: SkillTemplateEntry[] = [
    { template: getNewChangeSkillTemplate(), dirName: 'codespec-new-change', workflowId: 'new' },
    { template: getContinueChangeSkillTemplate(), dirName: 'codespec-continue-change', workflowId: 'continue' },
    { template: getFfChangeSkillTemplate(), dirName: 'codespec-ff-change', workflowId: 'ff' },
    { template: getSyncSpecsSkillTemplate(), dirName: 'codespec-sync-specs', workflowId: 'sync' },
    { template: getBulkArchiveChangeSkillTemplate(), dirName: 'codespec-bulk-archive-change', workflowId: 'bulk-archive' },
    { template: getVerifyChangeSkillTemplate(), dirName: 'codespec-verify-change', workflowId: 'verify' },
    { template: getOnboardSkillTemplate(), dirName: 'codespec-onboard', workflowId: 'onboard' },
  ];

  if (!workflowFilter) return all;

  const filterSet = new Set(workflowFilter);
  return all.filter(entry => filterSet.has(entry.workflowId));
}

/**
 * Gets command templates with their IDs, optionally filtered by workflow IDs.
 *
 * @param workflowFilter - If provided, only return templates whose id is in this array
 */
export function getCommandTemplates(workflowFilter?: readonly string[]): CommandTemplateEntry[] {
  const all: CommandTemplateEntry[] = [
    { template: getOpsxExploreCommandTemplate(), id: 'explore' },
    { template: getOpsxNewCommandTemplate(), id: 'new' },
    { template: getOpsxContinueCommandTemplate(), id: 'continue' },
    { template: getOpsxApplyCommandTemplate(), id: 'apply' },
    { template: getOpsxFfCommandTemplate(), id: 'ff' },
    { template: getOpsxSyncCommandTemplate(), id: 'sync' },
    { template: getOpsxArchiveCommandTemplate(), id: 'archive' },
    { template: getOpsxBulkArchiveCommandTemplate(), id: 'bulk-archive' },
    { template: getOpsxVerifyCommandTemplate(), id: 'verify' },
    { template: getOpsxOnboardCommandTemplate(), id: 'onboard' },
    { template: getOpsxProposeCommandTemplate(), id: 'propose' },
  ];

  if (!workflowFilter) return all;

  const filterSet = new Set(workflowFilter);
  return all.filter(entry => filterSet.has(entry.id));
}

/**
 * Converts command templates to CommandContent array, optionally filtered by workflow IDs.
 *
 * @param workflowFilter - If provided, only return contents whose id is in this array
 */
export function getCommandContents(workflowFilter?: readonly string[]): CommandContent[] {
  const commandTemplates = getCommandTemplates(workflowFilter);
  return commandTemplates.map(({ template, id }) => ({
    id,
    name: template.name,
    description: template.description,
    category: template.category,
    tags: template.tags,
    body: template.content,
  }));
}

/**
 * Generates skill file content with YAML frontmatter.
 *
 * @param template - The skill template
 * @param generatedByVersion - The CodeSpec version to embed in the file
 * @param transformInstructions - Optional callback to transform the instructions content
 */
export function generateSkillContent(
  template: SkillTemplate,
  generatedByVersion: string,
  transformInstructions?: (instructions: string) => string
): string {
  const instructions = transformInstructions
    ? transformInstructions(template.instructions)
    : template.instructions;

  return `---
name: ${template.name}
description: ${template.description}
license: ${template.license || 'MIT'}
compatibility: ${template.compatibility || '需要 codespec CLI。'}
metadata:
  author: ${template.metadata?.author || 'codespec'}
  version: "${template.metadata?.version || '1.0'}"
  generatedBy: "${generatedByVersion}"
---

${instructions}
`;
}

/**
 * External skills that are always installed during init, regardless of profile.
 * These are not tied to any workflow and come from external sources (e.g. superpowers-cn).
 */
export function getExternalSkillTemplates(): SkillTemplateEntry[] {
  return [
    { template: getWritingPlansSkillTemplate(), dirName: 'writing-plans', workflowId: '_external' },
    {
      template: getTestDrivenDevelopmentSkillTemplate(),
      dirName: 'test-driven-development',
      workflowId: '_external',
      extraFiles: [
        { filename: 'testing-anti-patterns.md', content: testingAntiPatternsContent },
      ],
    },
    {
      template: getSubagentDrivenDevelopmentSkillTemplate(),
      dirName: 'subagent-driven-development',
      workflowId: '_external',
    },
    {
      template: getVerificationBeforeCompletionSkillTemplate(),
      dirName: 'verification-before-completion',
      workflowId: '_external',
    },
  ];
}

/**
 * Agent template entry for installation to the agents directory.
 */
export interface AgentTemplateEntry {
  filename: string;
  content: string;
}

/**
 * External agents that are always installed during init, regardless of profile.
 * These are installed to the agents directory (e.g., .claude/agents/).
 */
export function getExternalAgentTemplates(): AgentTemplateEntry[] {
  return [
    { filename: 'code-generator.md', content: codeGeneratorContent },
    { filename: 'spec-reviewer.md', content: specReviewerContent },
    { filename: 'code-quality-reviewer.md', content: codeQualityReviewerContent },
  ];
}
