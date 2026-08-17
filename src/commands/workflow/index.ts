/**
 * Workflow CLI Commands
 *
 * Commands for the artifact-driven workflow: status, instructions, templates, schemas, new change.
 */

export { statusCommand } from './status.js';
export type { StatusOptions } from './status.js';

export { instructionsCommand, applyInstructionsCommand } from './instructions.js';
export type { InstructionsOptions } from './instructions.js';

export { templatesCommand } from './templates.js';
export type { TemplatesOptions } from './templates.js';

export { schemasCommand } from './schemas.js';
export type { SchemasOptions } from './schemas.js';

export { newChangeCommand } from './new-change.js';
export type { NewChangeOptions } from './new-change.js';

export { createArCommand } from './create-ar.js';
export type { CreateArOptions } from './create-ar.js';

export { flowCommand, computeFlowKey, resolveFlow } from './flow.js';
export type { FlowOptions, FlowResult } from './flow.js';

export {
  applySubagentFlowCommand,
  resolveSubagentFlow,
  resolveTestMode,
  DEFAULT_SUBAGENT_FLOW_DOT,
  DEFAULT_SUBAGENT_FLOW_EXAMPLE,
  TEST_MODES,
} from './apply-subagent-flow.js';
export type {
  FlowOptions as SubagentFlowOptions,
  FlowResult as SubagentFlowResult,
  TestMode,
  ModeFlowConfig,
} from './apply-subagent-flow.js';

export { planDefaultsCommand, resolvePlanDefaults } from './plan-defaults.js';
export type { PlanDefaultsOptions, PlanDefaultsResult } from './plan-defaults.js';

export { DEFAULT_SCHEMA } from './shared.js';
