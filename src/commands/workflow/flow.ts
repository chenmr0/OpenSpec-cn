/**
 * Flow Command
 *
 * Returns the apply-phase flow (dot graph + ordered step list) tailored to
 * the project's config.yaml `apply.skipReviewers`. Eight pre-authored
 * variants cover all 2^3 combinations of the three reviewers — no dynamic
 * edge splicing, no connection repair. Each variant is a hand-written
 * constant; we only look up the right one by a 3-bit key.
 */
import ora from 'ora';
import { resolveCodespecRoot } from '../../utils/project-root.js';
import { readProjectConfig, VALID_REVIEWERS } from '../../core/project-config.js';
import { resolveTestMode, type TestMode } from './apply-subagent-flow.js';

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
  skipReviewers: string[];
  activeReviewers: string[];
  steps: string[];
  flowDot: string;
}

// ---------------------------------------------------------------------------
// Flow graph: per-test-mode prefix + 8 hand-written suffixes
// ---------------------------------------------------------------------------
// The prefix contains the entry node, the per-task subgraph (expanded per
// test mode: tdd red-green cycle / test-after / no-test), the "还有剩余任务?"
// branch, and the two terminal nodes. Every suffix attaches at "还有剩余任务?否"
// and closes the digraph with `}`.

/** Per-task subgraph node declarations, one variant per test mode. */
const PER_TASK_SUBGRAPH: Record<TestMode, string> = {
  'tdd': `    subgraph cluster_per_task {
        label="每个任务（主 Agent 直接执行，TDD 红绿循环）";
        "读取任务目标、涉及文件和完整执行步骤" [shape=box];
        "读取关联 spec/design 章节" [shape=box];
        "编写失败的测试（红灯）" [shape=box];
        "运行测试验证失败（确认红灯）" [shape=box];
        "按实现约束完成最小实现（绿灯）" [shape=box];
        "运行测试验证通过（确认绿灯）" [shape=box];
        "编译检查" [shape=box];
        "标记完成（TodoWrite + task.md 复选框）" [shape=box];
    }`,
  'test-after': `    subgraph cluster_per_task {
        label="每个任务（主 Agent 直接执行，实现后补测）";
        "读取任务目标、涉及文件和完整执行步骤" [shape=box];
        "读取关联 spec/design 章节" [shape=box];
        "实现功能代码" [shape=box];
        "编译检查" [shape=box];
        "编写单元测试覆盖验收场景" [shape=box];
        "运行测试验证通过" [shape=box];
        "标记完成（TodoWrite + task.md 复选框）" [shape=box];
    }`,
  'no-test': `    subgraph cluster_per_task {
        label="每个任务（主 Agent 直接执行，无单元测试）";
        "读取任务目标、涉及文件和完整执行步骤" [shape=box];
        "读取关联 spec/design 章节" [shape=box];
        "实现功能代码" [shape=box];
        "编译检查" [shape=box];
        "标记完成（TodoWrite + task.md 复选框）" [shape=box];
    }`,
};

/** Per-task internal edges (from "读取任务目标…" to "标记完成…"), one variant per test mode. */
const PER_TASK_EDGES: Record<TestMode, string[]> = {
  'tdd': [
    `    "读取任务目标、涉及文件和完整执行步骤" -> "读取关联 spec/design 章节";`,
    `    "读取关联 spec/design 章节" -> "编写失败的测试（红灯）";`,
    `    "编写失败的测试（红灯）" -> "运行测试验证失败（确认红灯）";`,
    `    "运行测试验证失败（确认红灯）" -> "按实现约束完成最小实现（绿灯）";`,
    `    "按实现约束完成最小实现（绿灯）" -> "运行测试验证通过（确认绿灯）";`,
    `    "运行测试验证通过（确认绿灯）" -> "编译检查";`,
    `    "编译检查" -> "标记完成（TodoWrite + task.md 复选框）";`,
  ],
  'test-after': [
    `    "读取任务目标、涉及文件和完整执行步骤" -> "读取关联 spec/design 章节";`,
    `    "读取关联 spec/design 章节" -> "实现功能代码";`,
    `    "实现功能代码" -> "编译检查";`,
    `    "编译检查" -> "编写单元测试覆盖验收场景";`,
    `    "编写单元测试覆盖验收场景" -> "运行测试验证通过";`,
    `    "运行测试验证通过" -> "标记完成（TodoWrite + task.md 复选框）";`,
  ],
  'no-test': [
    `    "读取任务目标、涉及文件和完整执行步骤" -> "读取关联 spec/design 章节";`,
    `    "读取关联 spec/design 章节" -> "实现功能代码";`,
    `    "实现功能代码" -> "编译检查";`,
    `    "编译检查" -> "标记完成（TodoWrite + task.md 复选框）";`,
  ],
};

/**
 * Builds the flow prefix for a given test mode: digraph head + per-task
 * subgraph + shared node declarations + shared edges + per-task internal
 * edges. Ends at "还有剩余任务?是" so every FLOW_VARIANTS suffix splices in
 * unchanged.
 */
export function buildFlowPrefix(testMode: TestMode): string {
  return `digraph process {
    rankdir=TB;

${PER_TASK_SUBGRAPH[testMode]}

    "读取 spec.md, design.md, task.md；提取任务，创建 TodoWrite" [shape=box];
    "还有剩余任务?" [shape=diamond];
    "报告完成，验证测试通过" [shape=box style=filled fillcolor=lightgreen];
    "报告暂停——需要人工介入" [shape=box style=filled fillcolor=orange];

    "读取 spec.md, design.md, task.md；提取任务，创建 TodoWrite" -> "读取任务目标、涉及文件和完整执行步骤";
${PER_TASK_EDGES[testMode].join('\n')}
    "标记完成（TodoWrite + task.md 复选框）" -> "还有剩余任务?";
    "还有剩余任务?" -> "读取任务目标、涉及文件和完整执行步骤" [label="是"];
`;
}

/** Per-test-mode implement step summary. `IMPLEMENT_STEP` aliases the tdd default so the 8 FLOW_VARIANTS step lists stay unchanged. */
const IMPLEMENT_STEPS: Record<TestMode, string> = {
  'tdd': '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：编写失败测试并运行确认失败→最小实现→运行确认通过→编译检查→标记完成）',
  'test-after': '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：实现功能→编译检查→编写单元测试→运行确认通过→标记完成）',
  'no-test': '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：实现功能→编译检查→标记完成）',
};
const IMPLEMENT_STEP = IMPLEMENT_STEPS['tdd'];
const SPEC_STEP = 'spec-reviewer 审查规格合规性（失败→修复→重审）';
const CQ_STEP = 'code-quality-reviewer 审查代码质量（失败→修复→重审）';
const CV_STEP = 'change-verifier 变更级验证（失败→修复循环，最多3次）';
const REPORT_STEP = '报告完成';

interface FlowVariant {
  suffix: string;
  steps: string[];
}

const FLOW_VARIANTS: Record<string, FlowVariant> = {
  // S + C + V (no skip)
  SCV: {
    suffix: `    "还有剩余任务?" -> "分派 spec-reviewer 子代理审查规格合规性" [label="否"];
    "分派 spec-reviewer 子代理审查规格合规性" [shape=box];
    "spec-reviewer 通过?" [shape=diamond];
    "主 Agent 修复规格差距" [shape=box];
    "分派 code-quality-reviewer 子代理审查代码质量" [shape=box];
    "code-quality-reviewer 通过?" [shape=diamond];
    "主 Agent 修复质量问题" [shape=box];
    "委派 change-verifier 变更级验证" [shape=box];
    "验证通过?" [shape=diamond];
    "修复循环（最多3次）" [shape=box];

    "分派 spec-reviewer 子代理审查规格合规性" -> "spec-reviewer 通过?";
    "spec-reviewer 通过?" -> "主 Agent 修复规格差距" [label="否"];
    "主 Agent 修复规格差距" -> "分派 spec-reviewer 子代理审查规格合规性" [label="重新审查"];
    "spec-reviewer 通过?" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="是"];
    "分派 code-quality-reviewer 子代理审查代码质量" -> "code-quality-reviewer 通过?";
    "code-quality-reviewer 通过?" -> "主 Agent 修复质量问题" [label="否"];
    "主 Agent 修复质量问题" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="重新审查"];
    "code-quality-reviewer 通过?" -> "委派 change-verifier 变更级验证" [label="是"];
    "委派 change-verifier 变更级验证" -> "验证通过?";
    "验证通过?" -> "修复循环（最多3次）" [label="否"];
    "修复循环（最多3次）" -> "委派 change-verifier 变更级验证" [label="重新验证"];
    "验证通过?" -> "报告完成，验证测试通过" [label="是"];
    "修复循环（最多3次）" -> "报告暂停——需要人工介入" [label="超过3次"];
}`,
    steps: [IMPLEMENT_STEP, SPEC_STEP, CQ_STEP, CV_STEP, REPORT_STEP],
  },

  // C + V (skip spec)
  CV: {
    suffix: `    "还有剩余任务?" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="否"];
    "分派 code-quality-reviewer 子代理审查代码质量" [shape=box];
    "code-quality-reviewer 通过?" [shape=diamond];
    "主 Agent 修复质量问题" [shape=box];
    "委派 change-verifier 变更级验证" [shape=box];
    "验证通过?" [shape=diamond];
    "修复循环（最多3次）" [shape=box];

    "分派 code-quality-reviewer 子代理审查代码质量" -> "code-quality-reviewer 通过?";
    "code-quality-reviewer 通过?" -> "主 Agent 修复质量问题" [label="否"];
    "主 Agent 修复质量问题" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="重新审查"];
    "code-quality-reviewer 通过?" -> "委派 change-verifier 变更级验证" [label="是"];
    "委派 change-verifier 变更级验证" -> "验证通过?";
    "验证通过?" -> "修复循环（最多3次）" [label="否"];
    "修复循环（最多3次）" -> "委派 change-verifier 变更级验证" [label="重新验证"];
    "验证通过?" -> "报告完成，验证测试通过" [label="是"];
    "修复循环（最多3次）" -> "报告暂停——需要人工介入" [label="超过3次"];
}`,
    steps: [IMPLEMENT_STEP, CQ_STEP, CV_STEP, REPORT_STEP],
  },

  // S + V (skip code-quality)
  SV: {
    suffix: `    "还有剩余任务?" -> "分派 spec-reviewer 子代理审查规格合规性" [label="否"];
    "分派 spec-reviewer 子代理审查规格合规性" [shape=box];
    "spec-reviewer 通过?" [shape=diamond];
    "主 Agent 修复规格差距" [shape=box];
    "委派 change-verifier 变更级验证" [shape=box];
    "验证通过?" [shape=diamond];
    "修复循环（最多3次）" [shape=box];

    "分派 spec-reviewer 子代理审查规格合规性" -> "spec-reviewer 通过?";
    "spec-reviewer 通过?" -> "主 Agent 修复规格差距" [label="否"];
    "主 Agent 修复规格差距" -> "分派 spec-reviewer 子代理审查规格合规性" [label="重新审查"];
    "spec-reviewer 通过?" -> "委派 change-verifier 变更级验证" [label="是"];
    "委派 change-verifier 变更级验证" -> "验证通过?";
    "验证通过?" -> "修复循环（最多3次）" [label="否"];
    "修复循环（最多3次）" -> "委派 change-verifier 变更级验证" [label="重新验证"];
    "验证通过?" -> "报告完成，验证测试通过" [label="是"];
    "修复循环（最多3次）" -> "报告暂停——需要人工介入" [label="超过3次"];
}`,
    steps: [IMPLEMENT_STEP, SPEC_STEP, CV_STEP, REPORT_STEP],
  },

  // S + C (skip verifier)
  SC: {
    suffix: `    "还有剩余任务?" -> "分派 spec-reviewer 子代理审查规格合规性" [label="否"];
    "分派 spec-reviewer 子代理审查规格合规性" [shape=box];
    "spec-reviewer 通过?" [shape=diamond];
    "主 Agent 修复规格差距" [shape=box];
    "分派 code-quality-reviewer 子代理审查代码质量" [shape=box];
    "code-quality-reviewer 通过?" [shape=diamond];
    "主 Agent 修复质量问题" [shape=box];

    "分派 spec-reviewer 子代理审查规格合规性" -> "spec-reviewer 通过?";
    "spec-reviewer 通过?" -> "主 Agent 修复规格差距" [label="否"];
    "主 Agent 修复规格差距" -> "分派 spec-reviewer 子代理审查规格合规性" [label="重新审查"];
    "spec-reviewer 通过?" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="是"];
    "分派 code-quality-reviewer 子代理审查代码质量" -> "code-quality-reviewer 通过?";
    "code-quality-reviewer 通过?" -> "主 Agent 修复质量问题" [label="否"];
    "主 Agent 修复质量问题" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="重新审查"];
    "code-quality-reviewer 通过?" -> "报告完成，验证测试通过" [label="是"];
}`,
    steps: [IMPLEMENT_STEP, SPEC_STEP, CQ_STEP, REPORT_STEP],
  },

  // V only (skip spec + code-quality)
  V: {
    suffix: `    "还有剩余任务?" -> "委派 change-verifier 变更级验证" [label="否"];
    "委派 change-verifier 变更级验证" [shape=box];
    "验证通过?" [shape=diamond];
    "修复循环（最多3次）" [shape=box];

    "委派 change-verifier 变更级验证" -> "验证通过?";
    "验证通过?" -> "修复循环（最多3次）" [label="否"];
    "修复循环（最多3次）" -> "委派 change-verifier 变更级验证" [label="重新验证"];
    "验证通过?" -> "报告完成，验证测试通过" [label="是"];
    "修复循环（最多3次）" -> "报告暂停——需要人工介入" [label="超过3次"];
}`,
    steps: [IMPLEMENT_STEP, CV_STEP, REPORT_STEP],
  },

  // C only (skip spec + verifier)
  C: {
    suffix: `    "还有剩余任务?" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="否"];
    "分派 code-quality-reviewer 子代理审查代码质量" [shape=box];
    "code-quality-reviewer 通过?" [shape=diamond];
    "主 Agent 修复质量问题" [shape=box];

    "分派 code-quality-reviewer 子代理审查代码质量" -> "code-quality-reviewer 通过?";
    "code-quality-reviewer 通过?" -> "主 Agent 修复质量问题" [label="否"];
    "主 Agent 修复质量问题" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="重新审查"];
    "code-quality-reviewer 通过?" -> "报告完成，验证测试通过" [label="是"];
}`,
    steps: [IMPLEMENT_STEP, CQ_STEP, REPORT_STEP],
  },

  // S only (skip code-quality + verifier)
  S: {
    suffix: `    "还有剩余任务?" -> "分派 spec-reviewer 子代理审查规格合规性" [label="否"];
    "分派 spec-reviewer 子代理审查规格合规性" [shape=box];
    "spec-reviewer 通过?" [shape=diamond];
    "主 Agent 修复规格差距" [shape=box];

    "分派 spec-reviewer 子代理审查规格合规性" -> "spec-reviewer 通过?";
    "spec-reviewer 通过?" -> "主 Agent 修复规格差距" [label="否"];
    "主 Agent 修复规格差距" -> "分派 spec-reviewer 子代理审查规格合规性" [label="重新审查"];
    "spec-reviewer 通过?" -> "报告完成，验证测试通过" [label="是"];
}`,
    steps: [IMPLEMENT_STEP, SPEC_STEP, REPORT_STEP],
  },

  // NONE (skip all three)
  NONE: {
    suffix: `    "还有剩余任务?" -> "报告完成，验证测试通过" [label="否"];
}`,
    steps: [IMPLEMENT_STEP, REPORT_STEP],
  },
};

/**
 * Maps a skipReviewers list to one of the 8 pre-authored variant keys.
 * Key is built from which reviewers are NOT skipped: S/C/V present means
 * that reviewer is active. Empty (all skipped) maps to "NONE".
 */
export function computeFlowKey(skipReviewers: string[]): string {
  const active = (r: string) => !skipReviewers.includes(r);
  const s = active('spec-reviewer') ? 'S' : '';
  const c = active('code-quality-reviewer') ? 'C' : '';
  const v = active('change-verifier') ? 'V' : '';
  const key = s + c + v;
  return key === '' ? 'NONE' : key;
}

/**
 * Resolves the flow variant for a given skipReviewers list.
 * Exposed for testing.
 */
export function resolveFlow(skipReviewers: string[], testMode: TestMode = 'tdd'): FlowVariant {
  const key = computeFlowKey(skipReviewers);
  // Defensive: unknown reviewers are filtered out before reaching here,
  // but guard anyway with the full-review fallback.
  const variant = FLOW_VARIANTS[key] ?? FLOW_VARIANTS['SCV'];
  // tdd is the default step list baked into FLOW_VARIANTS; only swap the
  // implement step when a non-default test mode is requested.
  if (testMode === 'tdd') {
    return variant;
  }
  return { ...variant, steps: [IMPLEMENT_STEPS[testMode], ...variant.steps.slice(1)] };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function flowCommand(options: FlowOptions): Promise<void> {
  const spinner = options.json ? undefined : ora('正在生成本批执行流程...').start();

  try {
    const projectRoot = resolveCodespecRoot();

    const config = readProjectConfig(projectRoot);
    const skipReviewers = (config?.apply?.skipReviewers ?? []).filter((r) =>
      VALID_REVIEWERS.has(r)
    );

    const mode = resolveTestMode(options);
    const variant = resolveFlow(skipReviewers, mode);
    const activeReviewers = ['spec-reviewer', 'code-quality-reviewer', 'change-verifier'].filter(
      (r) => !skipReviewers.includes(r)
    );

    const result: FlowResult = {
      changeName: options.change,
      mode,
      skipReviewers,
      activeReviewers,
      steps: variant.steps,
      flowDot: buildFlowPrefix(mode) + variant.suffix + '\n',
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
  console.log(`## 本批执行流程${changeLabel}`);
  console.log();
  console.log(`**测试模式：** ${result.mode}`);
  console.log();
  if (result.skipReviewers.length > 0) {
    console.log(`跳过的审查者： ${result.skipReviewers.join(', ')}`);
    console.log('（来自 config.yaml apply.skipReviewers）');
  } else {
    console.log('跳过的审查者：无（执行全部审查）');
  }
  console.log();
  console.log('### 执行步骤');
  result.steps.forEach((step, i) => console.log(`${i + 1}. ${step}`));
  console.log();
  console.log('### 流程图');
  console.log('```dot');
  console.log(result.flowDot.trim());
  console.log('```');
}
