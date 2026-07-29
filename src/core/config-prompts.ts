import type { ProjectConfig } from './project-config.js';
import { DEFAULT_SUBAGENT_FLOW_DOT } from '../commands/workflow/apply-subagent-flow.js';

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

  // Subagent-apply section — taskFlow.flowDot commented-out default for easy editing
  lines.push('# subagent 模式应用阶段设置（可选，与上面的 apply 互不干扰）');
  lines.push('# 在此直接用 graphviz dot 原文定义每个任务的 per-task 流程图，由 `codespec apply-subagent flow` 原样透传。');
  lines.push('# 不校验内容、不生成步骤列表，agent 自行解析 dot。');
  lines.push('# 下面是内置默认流程的注释版——取消注释即得默认行为，可在此基础上修改');
  lines.push('# （如拆分为"业务实现 / 测试验证"两阶段、引入 dt-code-generator / dt-code-quality-reviewer）。');
  const subagentYaml = [
    'subagent-apply:',
    '  taskFlow:',
    '    flowDot: |-',
    ...DEFAULT_SUBAGENT_FLOW_DOT.split('\n').map((l) => '      ' + l),
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
