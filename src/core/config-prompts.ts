import type { ProjectConfig } from './project-config.js';
import {
  DEFAULT_SUBAGENT_FLOW_DOT,
  DEFAULT_SUBAGENT_FLOW_EXAMPLE,
} from '../commands/workflow/apply-subagent-flow.js';

/**
 * Serialize config to YAML string with helpful comments.
 *
 * @param config - Partial config object (schema required, context/rules optional)
 * @returns YAML string ready to write to file
 */
export function serializeConfig(config: Partial<ProjectConfig>): string {
  const lines: string[] = [];

  // Schema (required)
  lines.push(`schema: ${config.schema}`);
  lines.push('');

  // Compression section — write as active config with comment
  lines.push('# 上下文压缩设置');
  lines.push('# 已完成任务的对话上下文会被压缩为摘要以节省 token。');
  lines.push('# keepRecentTasks: 保留最近几个已完成任务不压缩');
  lines.push('compression:');
  lines.push('  apply:');
  lines.push('    keepRecentTasks: 1');
  lines.push('');

  // Plan section — strategy defaults commented out by default
  lines.push('# Plan 阶段策略默认值（可选）');
  lines.push('# 在生成实现计划（task.md）时，Plan 阶段默认会询问用户选择测试策略与执行模式。');
  lines.push('# 在此取消注释并配置后，agent 会通过 `codespec plan defaults --json` 读取并直接采用，不再询问；');
  lines.push('# 两个字段各自独立可选，配置哪个就跳过哪个询问，未配置的仍交互询问。');
  lines.push('# testStrategy（测试策略）：tdd（先写用例再写代码）/ test-after（写完代码再补 UT）/ no-test（不写 UT）');
  lines.push('# executionMode（执行模式）：subagent（质量优先，每 task 委派独立子代理）/ main（速度优先，主 Agent 统一实施）');
  lines.push('# plan:');
  lines.push('#   testStrategy: tdd');
  lines.push('#   executionMode: subagent');
  lines.push('');

  // Apply section — skipReviewers commented out by default
  lines.push('# 应用阶段审查设置（可选）');
  lines.push('# 速度优先时可跳过部分审查子代理，由 `codespec apply flow` 据此返回裁剪后的流程。');
  lines.push('# 取消注释并在下方列出要跳过的审查者即可生效；可填一个或多个，顺序无关。');
  lines.push('# 可选值：spec-reviewer / code-quality-reviewer / change-verifier');
  lines.push('# apply:');
  lines.push('#   skipReviewers:');
  lines.push('#     - spec-reviewer');
  lines.push('#     - code-quality-reviewer');
  lines.push('#     - change-verifier');
  lines.push('');

  // Subagent-apply section — per-test-mode flowDot + example, commented-out defaults for easy editing
  lines.push('# subagent 模式应用阶段设置（可选，与上面的 apply 互不干扰）');
  lines.push('# 按测试模式（tdd / test-after / no-test，对应 task.md 头部 `测试策略` 标记）分别定制 per-task 流程图与示例工作流。');
  lines.push('# 由 `codespec apply-subagent flow --tdd|--test-after|--no-test` 原样透传，不校验内容、不生成步骤列表，agent 自行解析。');
  lines.push('# 三种模式缺省时都回退到内置默认流程与默认示例；下面以 tdd 为例展开默认值，取消注释即得默认行为，可在此基础上修改。');
  lines.push('# test-after / no-test 默认与 tdd 相同，如需定制请参照 tdd 的结构取消注释并展开 flowDot / example。');
  lines.push('# 图中引用的 agent 需已随 init 安装（code-generator / spec-reviewer / code-quality-reviewer / change-verifier）。');
  const subagentYaml = [
    'subagent-apply:',
    '  tdd:',
    '    flowDot: |-',
    ...DEFAULT_SUBAGENT_FLOW_DOT.split('\n').map((l) => '      ' + l),
    '    example: |-',
    ...DEFAULT_SUBAGENT_FLOW_EXAMPLE.split('\n').map((l) => '      ' + l),
    '  # test-after：默认与 tdd 相同；如需定制，取消本行注释并按 tdd 结构补全 flowDot / example',
    '  # no-test：默认与 tdd 相同；如需定制，取消本行注释并按 tdd 结构补全 flowDot / example',
  ];
  for (const line of subagentYaml) {
    lines.push(line.trim() === '' ? '#' : '# ' + line);
  }
  lines.push('');

  // Context section with comments
  lines.push('# 项目上下文（可选）');
  lines.push('# 在创建工件时向 AI 显示此信息。');
  lines.push('# 添加您的技术栈、约定、风格指南、领域知识等。');
  lines.push('# 示例：');
  lines.push('#   context: |');
  lines.push('#     技术栈：TypeScript, React, Node.js');
  lines.push('#     我们使用约定式提交');
  lines.push('#     领域：电商平台');
  lines.push('');

  // Rules section with comments
  lines.push('# 每个工件的规则（可选）');
  lines.push('# 为特定工件添加自定义规则。');
  lines.push('# 示例：');
  lines.push('#   rules:');
  lines.push('#     specs:');
  lines.push('#       - 保持提案在500字以内');
  lines.push('#       - 始终包含"非目标"部分');
  lines.push('#     tasks:');
  lines.push('#       - 将任务分解为最多2小时的块');

  return lines.join('\n') + '\n';
}
