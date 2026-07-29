/**
 * Apply-Subagent Flow Command
 *
 * Returns the subagent-mode per-task flow as a raw graphviz dot string, read
 * verbatim from config.yaml `subagent-apply.taskFlow.flowDot`. No rendering,
 * no validation, no step-list generation — the agent parses the dot itself.
 * When `flowDot` is absent, the built-in default dot is returned so out-of-box
 * behavior matches the legacy subagent-driven-development flow.
 *
 * Symmetrical sibling to `flow.ts` (which serves main mode via
 * `apply.skipReviewers`). The two commands consume independent top-level
 * config sections and do not interfere.
 */
import ora from 'ora';
import { resolveCodespecRoot } from '../../utils/project-root.js';
import { readProjectConfig } from '../../core/project-config.js';

export interface FlowOptions {
  change?: string;
  json?: boolean;
}

export interface FlowResult {
  changeName?: string;
  /** Whether the returned dot came from config or the built-in default. */
  source: 'config' | 'default';
  flowDot: string;
}

// ---------------------------------------------------------------------------
// Built-in default dot: the legacy subagent-driven-development per-task flow.
// Serves as fallback when `subagent-apply.taskFlow.flowDot` is absent.
// ---------------------------------------------------------------------------

export const DEFAULT_SUBAGENT_FLOW_DOT = `digraph process {
    rankdir=TB;

    subgraph cluster_per_task {
        label="每个任务";
        "分派实现子智能体 (code-generator)" [shape=box];
        "实现子智能体有疑问?" [shape=diamond];
        "回答问题，提供上下文" [shape=box];
        "实现子智能体实现、测试、自审" [shape=box];
        "分派规格审查子智能体 (spec-reviewer)" [shape=box];
        "规格审查子智能体确认代码匹配规格?" [shape=diamond];
        "实现子智能体修复规格差距" [shape=box];
        "分派代码质量审查子智能体 (code-quality-reviewer)" [shape=box];
        "代码质量审查子智能体通过?" [shape=diamond];
        "实现子智能体修复质量问题" [shape=box];
        "在 TodoWrite 中标记任务完成，更新 task.md 中对应任务复选框 [ ] → [x]" [shape=box];
    }

    "读取计划，提取所有任务的完整文本，记录上下文，创建 TodoWrite" [shape=box];
    "还有剩余任务?" [shape=diamond];
    "分派最终代码审查子智能体审查整体实现" [shape=box];
    "委派 change-verifier 变更级验证" [shape=box];
    "验证通过?" [shape=diamond];
    "修复循环（最多3次）" [shape=box];
    "报告完成，验证测试通过" [shape=box style=filled fillcolor=lightgreen];
    "报告暂停——需要人工介入" [shape=box style=filled fillcolor=orange];

    "读取计划，提取所有任务的完整文本，记录上下文，创建 TodoWrite" -> "分派实现子智能体 (code-generator)";
    "分派实现子智能体 (code-generator)" -> "实现子智能体有疑问?";
    "实现子智能体(code-generator)有疑问?" -> "回答问题，提供上下文" [label="是"];
    "回答问题，提供上下文" -> "分派实现子智能体 (code-generator)";
    "实现子智能体有疑问?" -> "实现子智能体实现、测试、自审" [label="否"];
    "实现子智能体实现、测试、自审" -> "分派规格审查子智能体 (spec-reviewer)";
    "分派规格审查子智能体 (spec-reviewer)" -> "规格审查子智能体确认代码匹配规格?";
    "规格审查子智能体确认代码匹配规格?" -> "实现子智能体修复规格差距" [label="否"];
    "实现子智能体修复规格差距" -> "分派规格审查子智能体 (spec-reviewer)" [label="重新审查"];
    "规格审查子智能体确认代码匹配规格?" -> "分派代码质量审查子智能体 (code-quality-reviewer)" [label="是"];
    "分派代码质量审查子智能体 (code-quality-reviewer)" -> "代码质量审查子智能体通过?";
    "代码质量审查子智能体通过?" -> "实现子智能体修复质量问题" [label="否"];
    "实现子智能体修复质量问题" -> "分派代码质量审查子智能体 (code-quality-reviewer)" [label="重新审查"];
    "代码质量审查子智能体通过?" -> "在 TodoWrite 中标记任务完成，更新 task.md 中对应任务复选框 [ ] → [x]" [label="是"];
    "在 TodoWrite 中标记任务完成，更新 task.md 中对应任务复选框 [ ] → [x]" -> "还有剩余任务?";
    "还有剩余任务?" -> "分派实现子智能体 (code-generator)" [label="是"];
    "还有剩余任务?" -> "分派最终代码审查子智能体审查整体实现" [label="否"];
    "分派最终代码审查子智能体审查整体实现" -> "委派 change-verifier 变更级验证";
    "委派 change-verifier 变更级验证" -> "验证通过?";
    "验证通过?" -> "修复循环（最多3次）" [label="否"];
    "修复循环（最多3次）" -> "委派 change-verifier 变更级验证" [label="重新验证"];
    "验证通过?" -> "报告完成，验证测试通过" [label="是"];
    "修复循环（最多3次）" -> "报告暂停——需要人工介入" [label="超过3次"];
}`;

/**
 * Resolves the flow dot for a given config. Exposed for testing.
 *
 * Returns the user-authored `subagent-apply.taskFlow.flowDot` when present,
 * otherwise the built-in default dot. `source` records which one was used.
 */
export function resolveSubagentFlow(
  configFlowDot: string | undefined
): { source: 'config' | 'default'; flowDot: string } {
  if (typeof configFlowDot === 'string' && configFlowDot.length > 0) {
    return { source: 'config', flowDot: configFlowDot };
  }
  return { source: 'default', flowDot: DEFAULT_SUBAGENT_FLOW_DOT };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function applySubagentFlowCommand(options: FlowOptions): Promise<void> {
  const spinner = options.json ? undefined : ora('正在生成 subagent 模式执行流程...').start();

  try {
    const projectRoot = resolveCodespecRoot();

    const config = readProjectConfig(projectRoot);
    const configFlowDot = config?.['subagent-apply']?.taskFlow?.flowDot;

    const resolved = resolveSubagentFlow(configFlowDot);

    const result: FlowResult = {
      changeName: options.change,
      source: resolved.source,
      flowDot: resolved.flowDot,
    };

    spinner?.stop();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    printFlowText(result);
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}

export function printFlowText(result: FlowResult): void {
  const changeLabel = result.changeName ? `（变更： ${result.changeName}）` : '';
  console.log(`## subagent 模式执行流程${changeLabel}`);
  console.log();
  if (result.source === 'config') {
    console.log('来源：config.yaml subagent-apply.taskFlow.flowDot（用户自定义）');
  } else {
    console.log('来源：未配置 subagent-apply.taskFlow.flowDot，使用内置默认流程');
  }
  console.log();
  console.log('### 流程图');
  console.log('```dot');
  console.log(result.flowDot.trim());
  console.log('```');
}