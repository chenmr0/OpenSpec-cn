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

**为什么用主 Agent 直接执行：** 主 Agent 拥有完整对话上下文和项目理解，无子代理上下文重建开销。

**核心原则：** 主 Agent 逐任务执行 + 全部完成后统一审查（先规格后质量）= 高质量、快速迭代

## 流程

\`\`\`dot
digraph process {
    rankdir=TB;

    subgraph cluster_per_task {
        label="每个任务（主 Agent 直接执行）";
        "读取任务目标和涉及文件" [shape=box];
        "读取关联 spec/design 章节" [shape=box];
        "实现代码、编译、测试、自审" [shape=box];
        "标记完成（TodoWrite + task.md 复选框）" [shape=box];
    }

    "读取 task.md，提取所有任务，创建 TodoWrite" [shape=box];
    "还有剩余任务?" [shape=diamond];
    "分派 spec-reviewer 子代理审查规格合规性" [shape=box];
    "spec-reviewer 通过?" [shape=diamond];
    "主 Agent 修复规格差距" [shape=box];
    "分派 code-quality-reviewer 子代理审查代码质量" [shape=box];
    "code-quality-reviewer 通过?" [shape=diamond];
    "主 Agent 修复质量问题" [shape=box];

    "读取 task.md，提取所有任务，创建 TodoWrite" -> "读取任务目标和涉及文件";
    "读取任务目标和涉及文件" -> "读取关联 spec/design 章节";
    "读取关联 spec/design 章节" -> "实现代码、编译、测试、自审";
    "实现代码、编译、测试、自审" -> "标记完成（TodoWrite + task.md 复选框）";
    "标记完成（TodoWrite + task.md 复选框）" -> "还有剩余任务?";
    "还有剩余任务?" -> "读取任务目标和涉及文件" [label="是"];
    "还有剩余任务?" -> "分派 spec-reviewer 子代理审查规格合规性" [label="否"];
    "分派 spec-reviewer 子代理审查规格合规性" -> "spec-reviewer 通过?";
    "spec-reviewer 通过?" -> "主 Agent 修复规格差距" [label="否"];
    "主 Agent 修复规格差距" -> "分派 spec-reviewer 子代理审查规格合规性" [label="重新审查"];
    "spec-reviewer 通过?" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="是"];
    "分派 code-quality-reviewer 子代理审查代码质量" -> "code-quality-reviewer 通过?";
    "code-quality-reviewer 通过?" -> "主 Agent 修复质量问题" [label="否"];
    "主 Agent 修复质量问题" -> "分派 code-quality-reviewer 子代理审查代码质量" [label="重新审查"];
}
\`\`\`

## 逐任务执行

对每个未完成的任务，按以下步骤执行：

1. **读取任务目标**：从 task.md 中读取当前任务的「目标」和「涉及文件」
2. **读取关联上下文**：阅读 spec.md / design.md 中与本任务相关的章节
3. **实现代码**：直接修改涉及文件，遵循现有代码风格和职责边界
4. **验证**：运行项目构建和测试命令确认变更正确
5. **标记完成**：在 TodoWrite 中标记任务完成，更新 task.md 复选框

## 全部任务完成后的统一审查

所有任务完成后，委派子代理审查：

1. **spec-reviewer**：分派 spec-reviewer 子代理审查整体实现的规格合规性
2. **code-quality-reviewer**：分派 code-quality-reviewer 子代理审查代码质量（编译 + 测试）
3. 如审查发现问题，修复后重新审查直到通过

## 红线

**绝不：**
- 将任务合并执行（合并会导致完成质量不可控）
- 跳过审查（规格合规或代码质量）
- 带着未修复的问题继续
- 在审查未通过时报告完成
- 未经用户明确同意就在 main/master 分支上开始实现

**TodoWrite 纪律（关键）：**
- 在开始实现前，**必须**用 Todo 为所有未完成任务创建条目（只跟踪任务，不跟踪子步骤）
- 每完成一个任务后，**立即**将其标记为 completed
- 不要批量标记——完成一个标记一个

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
- 代码质量确保编译通过、测试通过

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

<!-- main-agent-development -->`;

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
