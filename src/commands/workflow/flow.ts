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

export interface FlowOptions {
  change?: string;
  json?: boolean;
}

export interface FlowResult {
  changeName?: string;
  skipReviewers: string[];
  activeReviewers: string[];
  steps: string[];
  flowDot: string;
}

// ---------------------------------------------------------------------------
// Flow graph: shared prefix + 8 hand-written suffixes
// ---------------------------------------------------------------------------
// The prefix contains the entry node, the per-task subgraph, the
// "还有剩余任务?" branch, and the two terminal nodes. Every suffix attaches
// at "还有剩余任务?否" and closes the digraph with `}`.

const FLOW_PREFIX = `digraph process {
    rankdir=TB;

    subgraph cluster_per_task {
        label="每个任务（主 Agent 直接执行）";
        "读取任务目标、涉及文件和完整执行步骤" [shape=box];
        "读取关联 spec/design 章节" [shape=box];
        "按 task.md 编号步骤逐条执行并记录证据" [shape=box];
        "标记完成（TodoWrite + task.md 复选框）" [shape=box];
    }

    "读取 spec.md, design.md, task.md；提取任务，创建 TodoWrite" [shape=box];
    "还有剩余任务?" [shape=diamond];
    "报告完成，验证测试通过" [shape=box style=filled fillcolor=lightgreen];
    "报告暂停——需要人工介入" [shape=box style=filled fillcolor=orange];

    "读取 spec.md, design.md, task.md；提取任务，创建 TodoWrite" -> "读取任务目标、涉及文件和完整执行步骤";
    "读取任务目标、涉及文件和完整执行步骤" -> "读取关联 spec/design 章节";
    "读取关联 spec/design 章节" -> "按 task.md 编号步骤逐条执行并记录证据";
    "按 task.md 编号步骤逐条执行并记录证据" -> "标记完成（TodoWrite + task.md 复选框）";
    "标记完成（TodoWrite + task.md 复选框）" -> "还有剩余任务?";
    "还有剩余任务?" -> "读取任务目标、涉及文件和完整执行步骤" [label="是"];
`;

const IMPLEMENT_STEP = '逐任务执行（读取完整步骤→按 task.md 编号逐条执行并记录证据→全部通过后标记完成）';
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
export function resolveFlow(skipReviewers: string[]): FlowVariant {
  const key = computeFlowKey(skipReviewers);
  const variant = FLOW_VARIANTS[key];
  if (!variant) {
    // Defensive: unknown reviewers are filtered out before reaching here,
    // but guard anyway with the full-review fallback.
    return FLOW_VARIANTS['SCV'];
  }
  return variant;
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

    const variant = resolveFlow(skipReviewers);
    const activeReviewers = ['spec-reviewer', 'code-quality-reviewer', 'change-verifier'].filter(
      (r) => !skipReviewers.includes(r)
    );

    const result: FlowResult = {
      changeName: options.change,
      skipReviewers,
      activeReviewers,
      steps: variant.steps,
      flowDot: FLOW_PREFIX + variant.suffix + '\n',
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
