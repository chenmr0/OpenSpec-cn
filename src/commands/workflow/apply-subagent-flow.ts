/**
 * Apply-Subagent Flow Command
 *
 * Returns the subagent-mode per-task flow (graphviz dot) plus an example
 * workflow, scoped to a test mode (tdd / test-after / no-test). The test mode
 * is selected via CLI flags (--tdd / --test-after / --no-test, default tdd) and
 * resolved against config.yaml `subagent-apply.<mode>.flowDot` / `.example`.
 * When a field is absent, the built-in default is returned so out-of-box
 * behavior matches the legacy subagent-driven-development flow.
 *
 * No rendering, no validation, no step-list generation — the agent parses the
 * dot itself. The example is illustrative guidance consumed by the
 * subagent-driven-development skill.
 *
 * Symmetrical sibling to `flow.ts` (which serves main mode via
 * `apply.skipReviewers`). The two commands consume independent top-level
 * config sections and do not interfere.
 */
import ora from 'ora';
import { resolveCodespecRoot } from '../../utils/project-root.js';
import { readProjectConfig } from '../../core/project-config.js';

/** Supported test modes, matching the `测试策略` marker in task.md headers. */
export type TestMode = 'tdd' | 'test-after' | 'no-test';

export const TEST_MODES: TestMode[] = ['tdd', 'test-after', 'no-test'];

/** Per-mode flow config as authored in config.yaml `subagent-apply.<mode>`. */
export interface ModeFlowConfig {
  flowDot?: string;
  example?: string;
}

export interface FlowOptions {
  change?: string;
  json?: boolean;
  /** --tdd flag (commander boolean). */
  tdd?: boolean;
  /** --test-after flag (commander camelCase). */
  testAfter?: boolean;
  /** --no-test flag (commander exposes this as `test: false`). */
  test?: boolean;
}

export interface FlowResult {
  changeName?: string;
  /** The test mode this flow was resolved for. */
  mode: TestMode;
  flowDot: string;
  /** Whether the returned flowDot came from config or the built-in default. */
  flowDotSource: 'config' | 'default';
  /** Example workflow text for this mode. */
  example: string;
  /** Whether the returned example came from config or the built-in default. */
  exampleSource: 'config' | 'default';
}

// ---------------------------------------------------------------------------
// Built-in defaults
// ---------------------------------------------------------------------------

/**
 * Built-in default dot: the legacy subagent-driven-development per-task flow.
 * Shared by all three test modes (tdd / test-after / no-test) as the fallback
 * when `subagent-apply.<mode>.flowDot` is absent.
 */

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

    "读取计划，提取所有任务的完整文本，记录上下文，创建 TodoWrite（每任务一个条目）" [shape=box];
    "还有剩余任务?" [shape=diamond];
    "分派最终代码审查子智能体审查整体实现" [shape=box];
    "报告完成" [shape=box style=filled fillcolor=lightgreen];

    "读取计划，提取所有任务的完整文本，记录上下文，创建 TodoWrite（每任务一个条目）" -> "分派实现子智能体 (code-generator)";
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
    "分派最终代码审查子智能体审查整体实现" -> "报告完成";
}`;

/**
 * Built-in default example workflow. Illustrative guidance for the agent,
 * shown verbatim by `codespec apply-subagent flow` and consumed by the
 * subagent-driven-development skill. Shared by all three test modes as the
 * fallback when `subagent-apply.<mode>.example` is absent.
 *
 * Single source of truth: the subagent-driven-development skill references the
 * example returned by this command rather than hardcoding its own copy.
 */
export const DEFAULT_SUBAGENT_FLOW_EXAMPLE = `你：我正在使用子智能体驱动开发来执行这个计划。

[第一步：运行 codespec apply-subagent flow 获取本批流程图]
[一次性读取任务文件：task.md]
[提取全部 5 个任务的完整文本和上下文]
[用所有任务创建 TodoWrite]

任务 1：Hook 安装脚本，包含4个子步骤

[获取任务 1 的文本和上下文（已提取）]
[将任务的4个子步骤一次性分派实现子智能体，附带完整任务文本 + 上下文]

实现者："在我开始之前——hook 应该安装在用户级别还是系统级别？"

你："用户级别（~/.config/superpowers/hooks/）"

实现者："明白了。现在开始实现……"
[稍后] 实现者：
  - 实现了 install-hook 命令
  - 添加了测试，5/5 通过
  - 自审：发现遗漏了 --force 参数，已添加

[按流程图分派规格合规审查]
规格审查者：✅ 符合规格 - 所有需求已满足，无多余内容

[按流程图分派代码质量审查]
代码审查者：优点：测试覆盖好，代码整洁。问题：无。通过。

[标记任务 1 完成，更新 task.md 中 ### [ ] → ### [x]]

任务 2：恢复模式

[获取任务 2 的文本和上下文（已提取）]
[分派实现子智能体，附带完整任务文本 + 上下文]

实现者：[无疑问，直接开始]
实现者：
  - 添加了 verify/repair 模式
  - 8/8 测试通过
  - 自审：一切正常

[按流程图分派规格合规审查]
规格审查者：❌ 问题：
  - 缺失：进度报告（规格要求"每 100 项报告一次"）
  - 多余：添加了 --json 参数（未被要求）

[实现者修复问题]
实现者：移除了 --json 参数，添加了进度报告

[规格审查者再次审查]
规格审查者：✅ 现在符合规格

[按流程图分派代码质量审查]
代码审查者：优点：扎实。问题（重要）：魔法数字（100）

[实现者修复]
实现者：提取了 PROGRESS_INTERVAL 常量

[代码审查者再次审查]
代码审查者：✅ 通过

[标记任务 2 完成，更新 task.md 中 ### [ ] → ### [x]]

...

[所有任务完成后]
[分派最终代码审查]
最终审查者：所有需求已满足，可以合并

完成！`;

/**
 * Resolves the flow dot and example for a given per-mode config. Exposed for
 * testing.
 *
 * Returns the user-authored `flowDot` / `example` when present (non-empty
 * string), otherwise the built-in default. Each field is resolved
 * independently — a mode may override only the dot, only the example, both,
 * or neither.
 */
export function resolveSubagentFlow(modeConfig?: ModeFlowConfig): {
  flowDot: string;
  flowDotSource: 'config' | 'default';
  example: string;
  exampleSource: 'config' | 'default';
} {
  const flowDot =
    typeof modeConfig?.flowDot === 'string' && modeConfig.flowDot.length > 0
      ? { flowDot: modeConfig.flowDot, flowDotSource: 'config' as const }
      : { flowDot: DEFAULT_SUBAGENT_FLOW_DOT, flowDotSource: 'default' as const };
  const example =
    typeof modeConfig?.example === 'string' && modeConfig.example.length > 0
      ? { example: modeConfig.example, exampleSource: 'config' as const }
      : { example: DEFAULT_SUBAGENT_FLOW_EXAMPLE, exampleSource: 'default' as const };
  return { ...flowDot, ...example };
}

/**
 * Determines the test mode from CLI flags. Exactly one flag selects a mode;
 * supplying more than one throws a mutual-exclusion error. Defaults to `tdd`
 * when no flag is given.
 */
export function resolveTestMode(options: FlowOptions): TestMode {
  const selected: TestMode[] = [];
  if (options.tdd) selected.push('tdd');
  if (options.testAfter) selected.push('test-after');
  // commander exposes `--no-test` as `test: false`; treat an explicit false as
  // the flag being present.
  if (options.test === false) selected.push('no-test');

  if (selected.length > 1) {
    throw new Error(
      `测试模式参数互斥：--tdd / --test-after / --no-test 只能指定其中一个，但收到了 ${selected
        .map((m) => `--${m}`)
        .join('、')}`
    );
  }
  return selected[0] ?? 'tdd';
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function applySubagentFlowCommand(options: FlowOptions): Promise<void> {
  const spinner = options.json ? undefined : ora('正在生成 subagent 模式执行流程...').start();

  try {
    const projectRoot = resolveCodespecRoot();

    const config = readProjectConfig(projectRoot);
    const mode = resolveTestMode(options);
    const modeConfig = config?.['subagent-apply']?.[mode];

    const resolved = resolveSubagentFlow(modeConfig);

    const result: FlowResult = {
      changeName: options.change,
      mode,
      flowDot: resolved.flowDot,
      flowDotSource: resolved.flowDotSource,
      example: resolved.example,
      exampleSource: resolved.exampleSource,
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
  console.log(`**测试模式：** ${result.mode}`);
  console.log();
  if (result.flowDotSource === 'config') {
    console.log(`**流程图来源：** config.yaml subagent-apply.${result.mode}.flowDot（用户自定义）`);
  } else {
    console.log(`**流程图来源：** 未配置 subagent-apply.${result.mode}.flowDot，使用内置默认流程`);
  }
  if (result.exampleSource === 'config') {
    console.log(`**示例工作流来源：** config.yaml subagent-apply.${result.mode}.example（用户自定义）`);
  } else {
    console.log(`**示例工作流来源：** 未配置 subagent-apply.${result.mode}.example，使用内置默认示例`);
  }
  console.log();
  console.log('### 流程图');
  console.log('```dot');
  console.log(result.flowDot.trim());
  console.log('```');
  console.log();
  console.log('### 示例工作流');
  console.log('```');
  console.log(result.example.trim());
  console.log('```');
}