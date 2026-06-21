/**
 * Template exports for CodeSpec.
 *
 * The old config file templates (AGENTS.md, project.md, claude-template, etc.)
 * have been removed. The skill-based workflow uses skill-templates.ts directly.
 */

// Re-export all skill templates and related types through the compatibility facade.
export * from './skill-templates.js';

// External skills (always installed, not workflow-bound)
export { getWritingPlansSubagentSkillTemplate } from './external/writing-plans-subagent.js';
export { getWritingPlansMainSkillTemplate } from './external/writing-plans-main.js';
export { getMainAgentDevelopmentSkillTemplate } from './external/main-agent-development.js';
export { getTestDrivenDevelopmentSkillTemplate, testingAntiPatternsContent } from './external/test-driven-development.js';
