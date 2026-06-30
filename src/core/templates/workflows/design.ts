/**
 * Design Workflow Template
 *
 * /opsx:design — 将原始架构需求（AR）转化为结构化成稿。
 * 两阶段流程：SubAgent 格式化扩写 + 主Agent 交互澄清。
 */
import type { SkillTemplate, CommandTemplate } from '../types.js';

// ---------------------------------------------------------------------------
// Extra file contents (written alongside SKILL.md in the skill directory)
// ---------------------------------------------------------------------------

export const arTemplateContent = `# Architecture Requirements: {{变更名称}}

## 1. 架构描述
<!-- 系统技术架构：模块划分、技术选型、数据流、接口关系等 -->

### 1.1 系统上下文
<!-- 系统与外部的交互关系、边界定义 -->
<!-- 待澄清 -->

### 1.2 模块/组件划分
<!-- 核心模块列表及其职责 -->
<!-- 待澄清 -->

### 1.3 数据流与接口
<!-- 模块间数据流、关键接口定义 -->
<!-- 待澄清 -->

### 1.4 技术选型与约束
<!-- 关键技术选型、约束条件 -->
<!-- 待澄清 -->

## 2. 需求场景
<!-- 复用 GIVEN/WHEN/THEN 格式，与现有 spec.md 场景格式一致 -->

### Requirement: {{需求标题}}
#### Scenario: {{场景名称}}
- **GIVEN** {{前置条件}}
- **WHEN** {{触发动作}}
- **THEN** {{预期结果}}

<!-- 待澄清 -->

## 3. 澄清记录与 delta-spec

### 3.1 需求澄清
<!-- SE 视角的问答记录 -->

### 3.2 实现澄清
<!-- 开发/MDE 视角的问答记录 -->

### 3.3 测试澄清
<!-- TSE 视角的问答记录 -->

### 3.4 delta-spec（待确认项）
<!-- 无法在澄清阶段解决的知识盲区，标注为待确认 -->
`;

export const expandSubagentContent = `# 格式化扩写规则

## 输入处理

1. **读取原始 AR**：用户输入的自由格式文本
2. **加载模板**：ar-template.md（同目录下）
3. **逐段解析**：识别原始 AR 中的以下内容类型：
   - **架构断言**：关于系统结构、模块、技术选型的描述 → 归入第 1 部分
   - **场景描述**：关于用户行为、业务规则的描述 → 归入第 2 部分，转为 GIVEN/WHEN/THEN

## 格式转换规则

### 架构描述 → 模板第 1 部分

- 分析原始 AR 中每个架构主张，匹配到 1.1～1.4 最合适的子章节
- 保持原始措辞，只调整组织结构
- 多条主张组合为自然段落

### 场景描述 → 模板第 2 部分

- 识别场景中的三个要素：
  - 前置条件 → GIVEN
  - 触发动作 → WHEN
  - 预期结果 → THEN
- 如果原始描述缺少某要素，保留空白
- 场景按需求主题分组

## 边界规则

- **不补充**：原始 AR 没有提到的不要推测（包括合理的技术细节）
- **不裁剪**：原始 AR 提到的所有内容都必须在模板中体现
- **不评价**：不添加"建议"、"应该"、"推荐"等主观判断
- **不删除**：保留原始 AR 中的疑问、不确定性措辞
`;

export const clarifyPromptContent = `# 交互澄清规则

针对 AR 初稿中每个具体主张，按以下规则生成问题。

## 通用规则

- 必须针对 AR 中具体的一句话、一个主张提问
- 必须结合代码仓实际情况对照
- 禁止泛泛的问题（"这个需求完整吗？"、"还有什么需要补充的？"）
- 每次只问一个问题
- 不对用户说"现在我用 XX 视角提问" — 用户不感知视角切换

## 三种视角

### 需求澄清（SE 视角）

**触发条件**：AR 中的需求描述存在歧义、业务规则不明确、缺少异常场景

**问题特征**：
- "什么情况下会出现..."
- "如果...怎么办"
- "用户期望在 X 场景下看到什么行为"
- "这个规则在 Y 条件下是否仍然成立"

### 实现澄清（开发/MDE 视角）

**触发条件**：AR 中的架构主张在代码仓中找不到对应物、模块边界模糊、接口不具体

**问题特征**：
- "这个接口需要哪些参数/返回什么"
- "XX 模块和 YY 模块之间通过什么方式通信"
- "现有代码仓中 Z 模块已提供了类似能力，是否需要复用还是新建"
- "这个数据从哪里获取、写到哪里"

### 测试澄清（TSE 视角）

**触发条件**：场景缺少验收条件、不可测试、边界场景未覆盖

**问题特征**：
- "什么输出算成功、什么算失败"
- "边界情况 X 下预期行为是什么"
- "这个场景的可验证标准是什么"
- "并发/超时/异常情况下预期表现"

## 视角选择

1. 按 AR 初稿章节顺序逐段走查
2. 每读一段，检查是否有需要澄清的点
3. 根据内容自动匹配最适合的视角
4. 自然过渡到下一段，不强制按 SE→开发→TSE 顺序

## 问题优先级

- **优先**：影响后续设计决策的关键缺漏（如接口定义缺失）
- **次之**：影响验收标准的模糊需求（如边界行为未定义）
- **可跳过**：不影响实现的细节（如未来扩展猜想的讨论）

## 结束条件

- 三个视角下均无新的关键问题
- 或用户主动要求停止
- 结束后将问答整理到 AR 成稿第 3 部分

## delta-spec 规则

- 仅记录用户也无法当场确定的事项
- 不和问答记录重复
- 每条必须是一个具体的、可后续决策的点
`;

// ---------------------------------------------------------------------------
// Instructions (shared by skill and command)
// ---------------------------------------------------------------------------

const designInstructions = `# 架构需求设计（/opsx:design）

将原始架构需求（AR）转化为结构化成稿。两阶段流程：SubAgent 格式化扩写 + 主Agent 交互澄清。

## 流程

### 输入
用户提供：
- 变更名称（kebab-case）
- 原始 AR 描述（自由格式文本）

### Phase 1: SubAgent 格式化扩写

1. 读取 AR 模板：ar-template.md（skill 目录下）
2. 调用 \`design-expand\` Agent，传入原始 AR 文本
3. Agent 按模板重组后输出 AR 初稿
4. 主Agent 将 AR 初稿写入临时文件

确保变更目录存在：
\`\`\`bash
mkdir -p codespec/changes/<name>
\`\`\`

### Phase 2: 主Agent 交互澄清

1. 读取 AR 初稿
2. 加载澄清规则：clarify-prompt.md（skill 目录下）
3. 探索代码仓，逐章走查 AR 初稿
4. 每发现需澄清的点，使用 AskUserQuestion 提问
5. 收集问答记录
6. 将修正后的内容 + 问答记录 + delta-spec 合并写入最终 AR 成稿

### 输出

写入：\`codespec/changes/<name>/architecture-requirements.md\`

内容包含：
- 第 1 部分：架构描述（系统上下文、模块划分、数据流接口、技术选型）
- 第 2 部分：需求场景（GIVEN/WHEN/THEN 格式）
- 第 3 部分：澄清记录与 delta-spec

### 后续

AR 成稿完成后，提示用户：
> "AR 成稿已写入 \`architecture-requirements.md\`。请 review，确认后可继续 \`/opsx:plan\` 生成 design.md 和 task.md。"

## 参考文件

- AR 模板：ar-template.md（skill 目录下）
- 格式化规则：expand-subagent.md（skill 目录下）
- 澄清规则：clarify-prompt.md（skill 目录下）
- SubAgent 定义：design-expand Agent

<!-- command: codespec-design -->`;

// ---------------------------------------------------------------------------
// Template exports
// ---------------------------------------------------------------------------

export function getOpsxDesignSkillTemplate(): SkillTemplate {
  return {
    name: 'design',
    description: '将原始架构需求（AR）转化为结构化成稿。两阶段流程：SubAgent 格式化扩写 + 主Agent 交互澄清。由 /opsx:design 命令调用。',
    instructions: designInstructions,
    license: 'MIT',
    compatibility: '需要 codespec CLI。',
    metadata: { author: 'codespec', version: '1.0' },
  };
}

export function getOpsxDesignCommandTemplate(): CommandTemplate {
  return {
    name: 'OPSX: Design',
    description: '将原始架构需求转化为结构化成稿 — SubAgent 格式化扩写 + 交互澄清',
    category: 'Workflow',
    tags: ['workflow', 'design', 'architecture', 'requirements'],
    content: designInstructions,
  };
}
