import { describe, expect, it } from 'vitest';
import { getMainAgentDevelopmentSkillTemplate } from '../../../src/core/templates/external/main-agent-development.js';

describe('main-agent-development template', () => {
  const instructions = getMainAgentDevelopmentSkillTemplate().instructions;

  it('makes task.md numbered steps the authoritative execution order', () => {
    expect(instructions).toContain('task.md 的步骤是本任务的唯一执行清单');
    expect(instructions).toContain('一次只执行当前步骤');
    expect(instructions).toContain('不合并、不跳过、不重排');
    expect(instructions).toContain('禁止提前修改后续步骤涉及的文件或提前运行后续命令');
  });

  it('requires real command evidence before advancing', () => {
    expect(instructions).toContain('实际运行的命令、退出码和关键输出');
    expect(instructions).toContain('没有工具调用与实际输出，不能声称命令已运行或步骤已完成');
    expect(instructions).toContain('最终 change-verifier');
    expect(instructions).toContain('不能替代该命令');
  });

  it('enforces RED before production implementation and GREEN afterwards', () => {
    const redGate = instructions.indexOf('RED 门禁（写生产代码前）');
    const greenGate = instructions.indexOf('GREEN 门禁（实现之后）');

    expect(redGate).toBeGreaterThan(-1);
    expect(greenGate).toBeGreaterThan(redGate);
    expect(instructions).toContain('禁止修改任何生产实现文件');
    expect(instructions).toContain('失败原因一致，才算有效 RED');
    expect(instructions).toContain('测试意外 PASS');
    expect(instructions).toContain('退出码为 0');
  });

  it('does not allow blocked or incomplete verification to be marked complete', () => {
    expect(instructions).toContain('保持任务未完成并明确报告阻塞');
    expect(instructions).toContain('只有全部步骤都有有效证据且没有未解决问题时');
    expect(instructions).toContain('无“未运行”“预计通过”或留待统一审查代替的步骤');
  });
});
