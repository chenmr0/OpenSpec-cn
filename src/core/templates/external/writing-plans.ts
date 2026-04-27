/**
 * Writing Plans External Skill Template
 *
 * Copied from superpowers-cn/skills/writing-plans.
 * This skill is always installed during init alongside command-only workflows.
 */
import type { SkillTemplate } from '../types.js';

const writingPlansInstructions = `# 编写计划

## 概述

编写全面的实现计划，假设工程师对我们的代码库零上下文，且品味存疑。记录他们需要知道的一切：每个任务要修改哪些文件、代码、测试、可能需要查阅的文档、如何测试。将整个计划拆成小步骤任务。DRY。YAGNI。TDD。频繁 commit。

假设他们是有经验的开发者，但对我们的工具链和问题领域几乎一无所知。假设他们不太擅长测试设计。

**开始时宣布：** "我正在使用 writing-plans 技能创建实现计划。"

**计划保存位置：** \`openspec/changes/<name>/plan.md\`
- （用户对计划位置的偏好优先于此默认值）

## 范围检查

如果规格涵盖了多个独立子系统，它应该在头脑风暴阶段就被拆分为子项目规格。如果没有，建议将其拆分为独立的计划——每个子系统一个。每个计划应该能独立产出可工作、可测试的软件。

## 输入文档

**优先读取顺序（新格式）：**
1. \`openspec/changes/<name>/spec.md\` — 需求规格（WHAT），包含 WHEN/THEN 场景
2. \`openspec/changes/<name>/design.md\` — 技术设计（HOW），包含架构和决策

**向后兼容：** 如果只有 \`*-design.md\`（旧格式，无对应的 \`*-spec.md\`），按原来的方式处理——将 design.md 同时作为需求和设计使用。

**规格对齐：** 计划中的每个任务都应能追溯到 SPEC.md 中的某个需求或场景。

## 文件结构

在定义任务之前，先列出将要创建或修改的文件以及每个文件的职责。这是锁定分解决策的地方。

- 设计边界清晰、接口定义良好的单元。每个文件应有一个明确的职责。
- 你对能一次放入上下文的代码推理得最好，文件越专注你的编辑越可靠。优先选择小而专注的文件，而非承担过多功能的大文件。
- 一起变更的文件应放在一起。按职责拆分，而非按技术层级拆分。
- 在现有代码库中，遵循已有模式。如果代码库使用大文件，不要单方面重构——但如果你正在修改的文件已经变得难以管理，在计划中包含拆分是合理的。

此结构决定了任务分解。每个任务应产出独立的、有意义的变更。

## 小步骤任务粒度

**每步是一个操作（2-5 分钟）：**

**选择 TDD 时（严格红-绿-重构，每个任务必须包含以下步骤）：**
- "编写失败的测试" - 一步
- "运行它确认失败" - 一步
- "实现最少代码让测试通过" - 一步
- "运行测试确认通过" - 一步
- "编译检查" - 一步
- "Commit" - 一步

**未选择 TDD 时（每个任务仍必须包含测试验证）：**
- "实现功能代码" - 一步
- "编译检查" - 一步
- "Commit" - 一步

## 计划文档头部

**每个计划必须以此头部开始：**

\`\`\`markdown
# [功能名称] 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development 逐任务实现此计划。步骤使用复选框（\`- [ ]\`）语法来跟踪进度。

**目标：** [一句话描述要构建什么]

**架构：** [2-3 句话描述方案]

**技术栈：** [关键技术/库]

**规格：** [spec.md 路径，如果有]
**设计：** [design.md 路径]

---
\`\`\`

## 任务结构

> **注意：** 以下模板展示了 TDD 格式的任务步骤。如果用户选择了 TDD，每个任务必须严格遵循此模板（先写失败测试，再写实现）。如果未选择 TDD，则跳过测试步骤。

\`\`\`\`markdown
### 任务 N：[组件名称]

**文件：**
- 创建：\`exact/path/to/file.py\`
- 修改：\`exact/path/to/existing.py:123-145\`
- 测试：\`tests/exact/path/to/test.py\`

- [ ] **步骤 1：编写失败的测试**

\`\`\`python
def test_specific_behavior():
    result = function(input)
    assert result == expected
\`\`\`

- [ ] **步骤 2：运行测试验证失败**

运行：\`pytest tests/path/test.py::test_name -v\`
预期：FAIL，报错 "function not defined"

- [ ] **步骤 3：编写最少实现代码**

\`\`\`python
def function(input):
    return expected
\`\`\`

- [ ] **步骤 4：运行测试验证通过**

运行：\`pytest tests/path/test.py::test_name -v\`
预期：PASS

- [ ] **步骤 5：Commit**

\`\`\`bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
\`\`\`
\`\`\`\`

## 禁止占位符

每个步骤都必须包含工程师需要的实际内容。以下是**计划缺陷**——绝不要写出来：
- "待定"、"TODO"、"后续实现"、"补充细节"
- "添加适当的错误处理" / "添加验证" / "处理边界情况"
- "为上述代码编写测试"（没有实际测试代码）
- "类似任务 N"（重复代码——工程师可能不按顺序阅读任务）
- 只描述做什么而不展示怎么做的步骤（代码步骤必须有代码块）
- 引用了未在任何任务中定义的类型、函数或方法

## 注意事项
- 始终使用精确的文件路径
- 每个步骤都包含完整代码——如果步骤涉及代码变更，就展示代码
- 精确的命令和预期输出
- DRY、YAGNI、TDD、频繁 commit

## 自检

编写完整计划后，以全新视角审视规格并对照检查计划。这是你自己执行的检查清单——不是子代理调度。

**1. 规格覆盖度：** 浏览 spec.md 中的每个需求和 WHEN/THEN 场景。你能指出实现它的任务吗？检查每个 WHEN/THEN 场景是否在计划中有对应的测试或验证步骤。列出所有遗漏。

**2. 占位符扫描：** 搜索计划中的红旗——上方"禁止占位符"章节中的任何模式。修复它们。

**3. 类型一致性：** 后续任务中使用的类型、方法签名和属性名是否与前面任务中定义的一致？任务 3 中叫 \`clearLayers()\` 但任务 7 中叫 \`clearFullLayers()\` 就是 bug。

**4. 测试步骤完整性：** 如果用户选择了 TDD，验证每个任务都包含"编写失败的测试"和"运行测试验证失败"步骤。如果未选择 TDD，则跳过。

如果发现问题，直接内联修复。无需重新审查——修好继续推进。如果发现规格中的需求没有对应任务，就添加任务。

## 执行交接

保存计划后，提供执行选项：

**"计划已完成并保存到 \`openspec/changes/<name>/plan.md\`。

**使用子代理驱动执行：**
- **必需子技能：** 使用 superpowers:subagent-driven-development
- 每个任务一个新子代理 + 两阶段审查`;

export function getWritingPlansSkillTemplate(): SkillTemplate {
  return {
    name: 'writing-plans',
    description: 'writing-plans',
    instructions: writingPlansInstructions,
    license: 'MIT',
    compatibility: '无特殊依赖。',
    metadata: { author: 'superpowers', version: '1.0' },
  };
}
