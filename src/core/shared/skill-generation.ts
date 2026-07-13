/**
 * Skill Generation Utilities
 *
 * Shared utilities for generating skill and command files.
 */

import * as fs from 'fs';
import path from 'path';
import {
  getExploreSkillTemplate,
  getNewChangeSkillTemplate,
  getContinueChangeSkillTemplate,
  getApplyChangeSkillTemplate,
  getFfChangeSkillTemplate,
  getSyncSpecsSkillTemplate,
  getArchiveChangeSkillTemplate,
  getBulkArchiveChangeSkillTemplate,
  getVerifyChangeSkillTemplate,
  getOnboardSkillTemplate,
  getOpsxDesignSkillTemplate,
  getOpsxProposeSkillTemplate,
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
  getOpsxDesignCommandTemplate,
  getOpsxProposeCommandTemplate,
  type SkillTemplate,
} from '../templates/skill-templates.js';
import { getWritingPlansSubagentSkillTemplate } from '../templates/external/writing-plans-subagent.js';
import { getWritingPlansMainSkillTemplate } from '../templates/external/writing-plans-main.js';
import { getMainAgentDevelopmentSkillTemplate } from '../templates/external/main-agent-development.js';
import { getTestDrivenDevelopmentSkillTemplate, testingAntiPatternsContent } from '../templates/external/test-driven-development.js';
import { getSubagentDrivenDevelopmentSkillTemplate } from '../templates/external/subagent-driven-development.js';
import { getVerificationBeforeCompletionSkillTemplate } from '../templates/external/verification-before-completion.js';
import { codeGeneratorContent, specReviewerContent, codeQualityReviewerContent, changeVerifierContent, conceptClarifierContent } from '../templates/agents/index.js';
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
  const all: SkillTemplateEntry[] = [
    { template: getOpsxProposeSkillTemplate(), dirName: 'codespec-propose', workflowId: 'propose' },
    { template: getExploreSkillTemplate(), dirName: 'codespec-explore', workflowId: 'explore' },
    { template: getNewChangeSkillTemplate(), dirName: 'codespec-new-change', workflowId: 'new' },
    { template: getContinueChangeSkillTemplate(), dirName: 'codespec-continue-change', workflowId: 'continue' },
    { template: getApplyChangeSkillTemplate(), dirName: 'codespec-apply-change', workflowId: 'apply' },
    { template: getFfChangeSkillTemplate(), dirName: 'codespec-ff-change', workflowId: 'ff' },
    { template: getSyncSpecsSkillTemplate(), dirName: 'codespec-sync-specs', workflowId: 'sync' },
    { template: getArchiveChangeSkillTemplate(), dirName: 'codespec-archive-change', workflowId: 'archive' },
    { template: getBulkArchiveChangeSkillTemplate(), dirName: 'codespec-bulk-archive-change', workflowId: 'bulk-archive' },
    { template: getVerifyChangeSkillTemplate(), dirName: 'codespec-verify-change', workflowId: 'verify' },
    { template: getOnboardSkillTemplate(), dirName: 'codespec-onboard', workflowId: 'onboard' },
    { template: getOpsxDesignSkillTemplate(), dirName: 'codespec-design', workflowId: 'design' },
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
    { template: getOpsxDesignCommandTemplate(), id: 'design' },
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
    { template: getWritingPlansSubagentSkillTemplate(), dirName: 'writing-plans-subagent', workflowId: '_external' },
    { template: getWritingPlansMainSkillTemplate(), dirName: 'writing-plans-main', workflowId: '_external' },
    { template: getMainAgentDevelopmentSkillTemplate(), dirName: 'main-agent-development', workflowId: '_external' },
    {
      template: getTestDrivenDevelopmentSkillTemplate(),
      dirName: 'codespec-test-driven-development',
      workflowId: '_external',
      extraFiles: [
        { filename: 'testing-anti-patterns.md', content: testingAntiPatternsContent },
      ],
    },
    {
      template: getSubagentDrivenDevelopmentSkillTemplate(),
      dirName: 'codespec-subagent-driven-development',
      workflowId: '_external',
    },
    {
      template: getVerificationBeforeCompletionSkillTemplate(),
      dirName: 'codespec-verification-before-completion',
      workflowId: '_external',
    },
  ];
}

/**
 * Deprecated external skill directory names that were renamed to avoid collisions
 * with superpowers-zh skills of the same name. Kept so init/update/uninit can clean
 * up directories created by previous CodeSpec versions.
 *
 * Mapping: old dir name → current dir name.
 */
export const DEPRECATED_EXTERNAL_SKILL_DIRS: ReadonlyArray<{ oldDirName: string; newDirName: string }> = [
  { oldDirName: 'subagent-driven-development', newDirName: 'codespec-subagent-driven-development' },
  { oldDirName: 'test-driven-development', newDirName: 'codespec-test-driven-development' },
  { oldDirName: 'verification-before-completion', newDirName: 'codespec-verification-before-completion' },
];

/**
 * Detects whether a SKILL.md body was generated by CodeSpec by looking for the
 * `generatedBy:` YAML frontmatter marker. Shared with uninit so cleanup logic and
 * install logic use the same detection rule.
 */
export function isCodeSpecGeneratedSkill(content: string): boolean {
  return /^\s*generatedBy:\s*["']?[^"'\n]+["']?\s*$/m.test(content);
}

/**
 * Removes skill directories left behind by previous CodeSpec versions that used the
 * old (colliding) external skill dir names. Only deletes a directory when its
 * SKILL.md carries the CodeSpec `generatedBy` marker — a same-named skill installed
 * by another tool (e.g. superpowers-zh) has no such marker and is preserved.
 *
 * Returns the list of removed directory paths.
 */
export async function cleanupDeprecatedExternalSkillDirs(skillsDir: string): Promise<string[]> {
  const removed: string[] = [];

  for (const { oldDirName } of DEPRECATED_EXTERNAL_SKILL_DIRS) {
    const skillDir = path.join(skillsDir, oldDirName);
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillDir)) {
      continue;
    }

    try {
      if (!fs.existsSync(skillFile)) {
        // Directory exists but no SKILL.md — cannot verify provenance, leave it.
        continue;
      }

      const content = await fs.promises.readFile(skillFile, 'utf-8');
      if (!isCodeSpecGeneratedSkill(content)) {
        // Not generated by CodeSpec (e.g. superpowers-zh's own skill) — preserve.
        continue;
      }

      await fs.promises.rm(skillDir, { recursive: true, force: true });
      removed.push(skillDir);
    } catch {
      // Ignore individual errors; best-effort cleanup.
    }
  }

  return removed;
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
    { filename: 'change-verifier.md', content: changeVerifierContent },
    { filename: 'concept-clarify.md', content: conceptClarifierContent },
  ];
}
