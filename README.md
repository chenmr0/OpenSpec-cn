面向 AI 编程助手的**规范驱动开发框架**。通过轻量的制品（artifact）机制，让人类与 AI 在写代码前先对齐要做什么，再通过子代理（subagent）和多层质量门禁确保实现质量。



## 工作流一览

```text
/codespec/design ──→ /codespec/plan ──→ /codespec/apply ──→ /codespec/archive
   AR 前置澄清         spec/design/task     逐任务实现+审查       归档变更
   ar.md               两阶段审查           无人值守强制完成
   分阶段澄清           变更级验证           上下文主动回收
   （可选）
```

`/codespec/design` 是**可选**的 AR 前置澄清步骤：对复杂或模糊需求，先产出 `ar.md` 把"为什么做"问清楚再进入 plan；对简单变更可直接 `/codespec/plan` 跳过。

`/codespec/apply` 是唯一实现入口，提供两种执行模式（由 `task.md` 头部标记决定，缺失时默认质量优先）：

- **subagent 模式（质量优先）**：每个任务分派隔离实现子代理，固定三层审查（spec → 代码质量 → change-verifier）。
- **main 模式（速度优先）**：主代理逐任务实现，审查深度可经 `apply.skipReviewers` 裁剪。

### 看看效果

```text
你：/codespec/design 给支付模块加一个对账功能
AI：已创建 codespec/changes/payment-reconcile/
     分阶段澄清需求背景 / 业务概念 / 需求与测试 / 实现，逐批落盘 ar.md
     AR 终稿已完成！可继续 /codespec/plan payment-reconcile

你：/codespec/plan payment-reconcile
AI：已生成 spec.md / design.md / task.md，准备好开始实现了！

你：/codespec/apply
AI：执行模式：subagent
    ✓ 1 添加对账任务调度        [spec审查 ✓ | 代码质量 ✓]
    ✓ 2 实现差异比对逻辑        [spec审查 ✓ | 代码质量 ✓]
    变更级验证通过 ✓
    所有任务已完成！

你：/codespec/archive
AI：变更 'payment-reconcile' 已归档至 .../changes/archive/2026-07-19-payment-reconcile
```

## 快速开始

**需要 Node.js 18.0.0 或更高版本。**

```bash
npm install -g @studyzy/codespec@latest
cd your-project
codespec init
```

现在告诉你的 AI：`/codespec/design <你想要构建的内容>`（也可直接 `/codespec/plan` 跳过 AR 澄清）。

## 核心机制

### 制品驱动的流程

每个变更在 `codespec/changes/<name>/` 下创建制品，依次经用户审查把关：

| 制品 | 回答的问题 | 内容                        |
|------|-----------|---------------------------|
| **ar.md** | 为什么做（WHY） | 业务痛点/目标、功能清单、Given-When-Then、实现约束与线索、澄清问答 |
| **spec.md** | 做什么（WHAT） | 需求、WHEN/THEN 场景、数据约束、术语变更 |
| **design.md** | 怎么做（HOW） | 设计决策与方案对比、接口变更、流程图、风险矩阵 |
| **task.md** | 执行步骤 | 增量任务清单，头部标注执行模式与 TDD 选择 |

`ar.md` 由 `/codespec/design` 产出（可选）；`/codespec/plan` 可续接其内容生成 spec/design/task。

### 统一的 apply：两种执行模式

`/codespec/apply` 不再区分 `apply` 与 `apply-quick`。执行模式由 `task.md` 头部标记决定，缺失时默认 `subagent`：

**subagent 模式（质量优先）** —— 为每个任务启动独立子代理，固定多层质量门禁：

```
任务 N → 实现子代理 → spec 合规审查 → 代码质量审查 → 通过 → 任务 N+1
                                                        ↘ 失败 → 修复（最多 3 轮）
全部完成 → change-verifier 变更级验证 → 整体验证通过
```

**main 模式（速度优先）** —— 主代理逐任务实现，全部完成后统一审查；审查深度可裁剪：

```yaml
# codespec/config.yaml
apply:
  skipReviewers:
    - spec-reviewer          # 可选：spec-reviewer / code-quality-reviewer / change-verifier
```

```bash
codespec apply flow --change <name>        # 查看裁剪后的实际执行流程（DOT 图 + 步骤）
codespec apply flow --change <name> --json # 供 Agent 解析
```

`apply flow` 返回的执行步骤是审查执行纪律的唯一依据，结构上保证不会分派未列入的审查子代理。

**内置代理**：

| 代理 | 职责 |
|------|------|
| **code-generator** | 按计划增量生成代码，遵循项目约定 |
| **spec-reviewer** | 验证实现是否严格匹配 spec（不信任报告，直接读代码） |
| **code-quality-reviewer** | 聚焦代码质量本身 |
| **change-verifier** | 变更级最终验证（编译 + 测试通过率），独立上下文中运行 |
| **concept-clarify** | 澄清 AR 中的业务术语，仅填写 ar.md 第 4.1 节 |

### 外部技能

`codespec init` 自动安装以下技能：

| 技能 | 作用 |
|------|------|
| **writing-plans-subagent** | 质量优先计划：拆解为可执行小任务，写入 subagent 执行模式标记 |
| **writing-plans-main** | 速度优先计划：同上，写入 main 执行模式标记 |
| **codespec-test-driven-development** | 红灯-绿灯-重构循环，无失败测试不写产品代码 |
| **codespec-subagent-driven-development** | 子代理执行 + spec/质量双审查 + 状态管理 |
| **main-agent-development** | 主代理执行 + 统一审查，审查步骤以 `apply flow` 返回为准 |
| **codespec-verification-before-completion** | 必须提供新鲜的验证证据才能声明完成 |

### 上下文压缩

实现长任务列表时，已完成任务上下文自动压缩，保留最近 N 个任务的完整上下文。可在 `codespec/config.yaml` 配置：

```yaml
compression:
  apply:
    keepRecentTasks: 1   # subagent 模式保留最近 1 个任务完整上下文
  apply-quick:
    keepRecentTasks: 3   # 兼容旧配置键
```

- **main 模式**每完成一个 task 即压缩；**subagent 模式**按批压缩。
- 摘要指令已改为"提供详细丰富的摘要"，压缩后保留信息更充分。

### 顺手能力

- **`codespec archive auto <name>`**：一条命令自动归档，逐级向上解析 `.git` 作为项目根，归档目录不再落错层级。
- **CLI 在任意子目录可用**：所有命令统一向上查找 `.git` 定位 codespec 根，无需回到项目根。
- **TDD 选择标识**：`task.md` 头部标注是否启用 TDD，未启用时 apply 不再生成单元测试步骤。

## 为什么选择 CodeSpec？

AI 编程助手很强大，但当需求只存在于聊天记录里时，结果往往难以预测。CodeSpec 增加了一层轻量的规范机制：

- **先对齐，再开工** —— 人类与 AI 在写代码前先在 ar、spec、design 上达成一致
- **保持有序** —— 每个变更都有自己的目录：ar、spec、design、task
- **质量内建** —— 子代理实现 + spec 合规审查 + 代码质量审查 + 变更级验证
- **按需裁剪** —— 速度优先模式可跳过部分审查者，质量优先模式始终全审查兜底
- **流式协作** —— 任意制品都可以随时更新，不设僵硬的阶段门槛

## 更新

```bash
npm install -g @studyzy/codespec@latest
codespec update   # 刷新代理指令，确保最新斜杠命令可用
```

### 开发

- 安装依赖：`pnpm install`
- 构建：`pnpm run build`
- 测试：`pnpm test`
- 打包：`pnpm pack`