/**
 * Plan Defaults Command
 *
 * Returns the Plan-phase strategy defaults configured in `codespec/config.yaml`
 * under the top-level `plan` section:
 *   - testStrategy: tdd | test-after | no-test
 *   - executionMode: subagent | main
 *
 * Consumed by the propose workflow (`/codespec/plan`) before it asks the user to
 * pick a test strategy and execution mode. When a field is configured, the
 * propose workflow adopts the value directly and skips the corresponding
 * AskUserQuestion. When a field is absent, it falls back to asking the user.
 *
 * Symmetrical sibling to `flow.ts` / `apply-subagent-flow.ts`: reads project
 * config via `readProjectConfig` and emits a stable JSON shape for the agent.
 * `readProjectConfig` already validates enum values and drops invalid ones, so
 * the values returned here are pre-validated.
 */
import ora from 'ora';
import { resolveCodespecRoot } from '../../utils/project-root.js';
import { readProjectConfig, type PlanConfig } from '../../core/project-config.js';
import type { TestMode } from './apply-subagent-flow.js';

export interface PlanDefaultsOptions {
  json?: boolean;
}

export interface PlanDefaultsResult {
  /** Resolved test-strategy default, or null when not configured. */
  testStrategy: TestMode | null;
  /** Resolved execution-mode default, or null when not configured. */
  executionMode: 'subagent' | 'main' | null;
}

/**
 * Resolve the Plan-phase strategy defaults from a parsed project config.
 * Pure function — exposed for testing without touching the filesystem.
 *
 * Each field is resolved independently: a configured value is returned as-is,
 * an unconfigured field yields `null` (so the agent falls back to asking).
 */
export function resolvePlanDefaults(config: ReturnType<typeof readProjectConfig>): PlanDefaultsResult {
  const plan: PlanConfig | undefined = config?.plan;
  return {
    testStrategy: plan?.testStrategy ?? null,
    executionMode: plan?.executionMode ?? null,
  };
}

export async function planDefaultsCommand(options: PlanDefaultsOptions): Promise<void> {
  const spinner = options.json ? undefined : ora('正在查询 Plan 阶段策略默认值...').start();

  try {
    const projectRoot = resolveCodespecRoot();
    const config = readProjectConfig(projectRoot);
    const result = resolvePlanDefaults(config);

    spinner?.stop();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    printPlanDefaultsText(result);
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}

export function printPlanDefaultsText(result: PlanDefaultsResult): void {
  console.log('## Plan 阶段策略默认值');
  console.log();
  console.log(`**测试策略：** ${formatField(result.testStrategy)}`);
  console.log(`**执行模式：** ${formatField(result.executionMode)}`);
  console.log();
  console.log('已配置（非 null）的字段将在 Plan 阶段直接采用，不再询问用户；');
  console.log('未配置（null）的字段仍由 `/codespec/plan` 交互询问。');
  console.log('配置来源：codespec/config.yaml 的 `plan` 段。');
}

function formatField(value: string | null): string {
  return value === null ? '未配置（将交互询问）' : `${value}（已配置）`;
}