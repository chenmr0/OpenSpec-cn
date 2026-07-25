/**
 * Main-Agent Development External Skill Template
 *
 * Speed-first execution: main agent executes all tasks directly,
 * with unified review only after all tasks are complete.
 * Symmetrical sibling to subagent-driven-development.
 */
import type { SkillTemplate } from '../types.js';

const mainAgentDevInstructions = `# 主 Agent 直接开发

主 Agent 逐个执行所有任务，不委派子代理。全部任务完成后统一做规格审查和代码质量审查。

**审查步骤：** 本批要执行哪些审查由 \`codespec apply flow\` 命令动态返回，在需求理解阶段第一步获取并据此执行。

**为什么用主 Agent 直接执行：** 主 Agent 拥有完整对话上下文和项目理解，无子代理上下文重建开销。

**核心原则：** 主 Agent 逐任务执行 + 全部完成后统一审查 = 高质量、快速迭代。实际执行的审查以 \`codespec apply flow\` 返回为准。

## 需求理解阶段

在开始执行任何任务之前：

1. **获取本批执行流程（关键，第一步）**：运行：
   \`\`\`bash
   codespec apply flow
   \`\`\`
   - 返回的流程图即本批实际要执行的流程，**只包含需要执行的审查节点**。
   - 严格按返回的"执行步骤"顺序执行，不要添加流程图里没有的审查步骤，也不要分派流程图里没有的子代理。
   - 立即宣布返回的执行步骤，例如："本批执行：逐任务实现 → change-verifier 变更级验证 → 报告完成"。
2. 读取 spec.md, design.md 和 task.md，建立全局需求理解。
3. **检测测试策略**：读取 \`task.md\` 文件头部的 \`> **测试策略**: \\\`tdd | test-after | no-test\\\`\` 标记（兼容旧 \`> **TDD\` 标记：\`启用\`→tdd、\`未启用\`→no-test；未找到默认 no-test）。宣布："测试策略：<tdd | test-after | no-test>"。该策略决定逐任务执行中的验证步骤形态。
4. 提取所有任务，创建 TodoWrite（审查条目按下方 TodoWrite 纪律创建，只为 \`codespec apply flow\` 返回的"执行步骤"中列出的审查创建条目）。

## 逐任务执行

对每个未完成的任务，按以下步骤执行：

1. **读取任务目标**：从 task.md 中读取当前任务的「目标」和「涉及文件」
2. **读取关联上下文**：阅读 spec.md / design.md 中与本任务相关的章节
3. **实现代码**：直接修改涉及文件，遵循现有代码风格和职责边界
4. **验证**：按需求理解阶段检测到的测试策略执行验证：
   - \`tdd\`：严格按 task.md 中该任务的步骤顺序——先写失败测试并确认失败，再写最小实现，再运行测试确认通过，最后编译检查。
   - \`test-after\`：先完成功能实现并编译检查，再补充单元测试覆盖验收场景，运行测试确认通过。
   - \`no-test\`：仅实现功能代码并做编译检查，**禁止**编写或运行任何单元测试。
5. **标记完成**：在 TodoWrite 中标记任务完成，更新 task.md 复选框

## 全部任务完成后的统一审查

本批要执行的审查已在需求理解阶段由 \`codespec apply flow\` 确定，此处按其返回的"执行步骤"委派子代理：

- **spec-reviewer**（若列入执行步骤）：分派 spec-reviewer 子代理审查整体实现的规格合规性。通过后在 TodoWrite 中标记完成。
- **code-quality-reviewer**（若列入执行步骤）：分派 code-quality-reviewer 子代理审查代码质量。通过后在 TodoWrite 中标记完成。
- **change-verifier**（若列入执行步骤）：分派 change-verifier 子代理审查编译 + 测试通过。通过后在 TodoWrite 中标记完成。
- 如审查发现问题，修复后重新审查直到通过。

## 红线

**审查执行纪律（以 \`codespec apply flow\` 返回的执行步骤为准，必须遵守）：**
- 执行步骤中**列出**的审查**必须执行**——分派子代理、创建 TodoWrite 条目、走完审查循环。
- 执行步骤中**未列出**的审查**绝不执行**——不分派子代理、不创建 TodoWrite 条目。

**绝不：**
- 将任务合并执行（合并会导致完成质量不可控）
- 带着未修复的问题继续
- 在审查未通过时报告完成
- 未经用户明确同意就在 main/master 分支上开始实现

**TodoWrite 纪律（关键）：**
- 在开始实现前，**必须**用 Todo 为所有未完成任务创建条目（只跟踪任务，不跟踪子步骤）。
- **审查条目按 \`codespec apply flow\` 返回的"执行步骤"创建**：只为执行步骤中列出的审查创建条目；未列出的审查不创建条目、不分派子代理。例如：
  - 若执行步骤为"逐任务实现 → change-verifier 变更级验证 → 报告完成"：只为 "change-verifier 变更级验证" 创建条目。
  - 若执行步骤列出全部三个审查：为 "spec-reviewer 审查规格合规性"、"code-quality-reviewer 审查代码质量"、"change-verifier 变更级验证" 各创建条目。
- 每完成一个任务后，**立即**将其标记为 completed。
- 每个审查步骤通过后，**立即**在 TodoWrite 中标记完成。
- 不要批量标记——完成一个标记一个。

**task.md 复选框同步（关键）：**
- 每完成一个任务后，**同时**用 Edit 工具更新 task.md 文件中的任务复选框
- 将对应任务的 \`### [ ]\` 改为 \`### [x]\`
- 确保 task.md 中的复选框状态与 TodoWrite 完成进度保持一致

## 优势

**与子代理模式相比：**
- 无子代理上下文重建开销
- 主 Agent 拥有完整对话上下文和项目理解
- 子代理审查仍保障最终质量

**质量关卡：**
- 全部任务完成后的统一审查确保整体一致性
- 审查循环确保修复确实有效
- 规格合规防止过度/不足构建
- 变更级验证确保编译通过、测试通过

## 完成时的输出

\`\`\`
## 实现完成

**变更：** <change-name>
**Schema：** <schema-name>
**执行模式：** main
**进度：** 7/7 任务已完成 ✓

### 本次会话已完成
- [x] 任务 3：<description>
- [x] 任务 4：<description>
...

所有任务已完成并通过验证！可以使用 \`/codespec/archive\` 归档此变更。
\`\`\`

<!-- main-agent-driven -->`;

export function getMainAgentDevelopmentSkillTemplate(): SkillTemplate {
  return {
    name: 'main-agent-development',
    description: 'main-agent-development',
    instructions: mainAgentDevInstructions,
    license: 'MIT',
    compatibility: '无特殊依赖。',
    metadata: { author: 'superpowers', version: '1.0' },
  };
}
