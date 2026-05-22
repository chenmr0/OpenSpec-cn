面向 AI 编程助手的**规范驱动开发框架**。通过轻量的制品（artifact）机制，让人类与 AI 在写代码前先对齐要做什么，再通过子代理（subagent）和多层质量门禁确保实现质量。



## 工作流一览

```text
/codesepc/plan ──→ /codesepc/apply ──→ /codesepc/archive
  头脑风暴          子代理实现            归档变更
  spec.md          两阶段审查           
  design.md        上下文主动回收         
  task.md          无人值守强制完成
                   变更级验证
```

### 看看效果

```text
你：/codesepc/plan add-dark-mode
AI：已创建 codespec/changes/add-dark-mode/
     ✓ spec.md     — 需求和场景（WHEN/THEN）
     ✓ design.md   — 技术方案与权衡
     ✓ task.md     — 实现清单
     准备好开始实现了！

你：/codesepc/apply
AI：启动子代理实现任务...
    ✓ 1 添加主题上下文 Provider        [spec审查通过 ✓ | 代码质量 ✓]
    ✓ 2 创建切换组件                   [spec审查通过 ✓ | 代码质量 ✓]
    ✓ 3 添加 CSS 变量                  [spec审查通过 ✓ | 代码质量 ✓]
    ✓ 4 接入 localStorage              [spec审查通过 ✓ | 代码质量 ✓]
    变更级验证通过 ✓
    所有任务已完成！

你：/codesepc/archive
AI：已归档至 codespec/changes/archive/2025-01-23-add-dark-mode/
    可以开始下一个功能了。
```

## 快速开始

**需要 Node.js 18.0.0 或更高版本。**

```bash
npm install -g @studyzy/codespec@latest
cd your-project
codespec init
```

现在告诉你的 AI：`/codesepc/plan <你想要构建的内容>`

## 核心机制

### 制品驱动的三阶段流程

每个变更在 `codespec/changes/<name>/` 下创建三个制品，依次经过用户审查把关：

| 制品 | 回答的问题 | 内容                        |
|------|-----------|---------------------------|
| **spec.md** | 做什么（WHAT） | 需求、WHEN/THEN 场景、数据约束、术语变更 |
| **design.md** | 怎么做（HOW） | 设计决策与方案对比、接口变更、流程图、风险矩阵   |
| **task.md** | 执行步骤 | 分解为 2-5 分钟的增量任务，可选 TDD    |

### 子代理驱动实现（/codesepc/apply）

`/codesepc/apply` 不在主上下文中写代码，而是为每个任务启动**独立子代理**，并经过多层质量门禁：

```
任务 N → 实现子代理 → spec 合规审查 → 代码质量审查 → 通过 → 任务 N+1
                                                        ↘ 失败 → 修复（最多 3 轮）
全部完成 → 变更级验证子代理（change-verifier）→ 整体验证通过
```

**内置代理**：

| 代理 | 职责 |
|------|------|
| **code-generator** | 按计划增量生成代码，遵循项目约定 |
| **spec-reviewer** | 验证实现是否严格匹配 spec（不信任报告，直接读代码） |
| **code-quality-reviewer** | 编译检查 + 测试检查 |
| **change-verifier** | 变更级最终验证，独立上下文中运行 |

### 外部技能

`codespec init` 自动安装以下技能：

| 技能 | 作用 |
|------|------|
| **writing-plans** | 将设计拆解为可执行的小任务，不允许占位符代码 |
| **test-driven-development** | 红灯-绿灯-重构循环，无失败测试不写产品代码 |
| **subagent-driven-development** | 子代理执行 + spec/质量双审查 + 状态管理 |
| **verification-before-completion** | 必须提供新鲜的验证证据才能声明完成 |

### 上下文压缩

实现长任务列表时，已完成的任务上下文会自动压缩，保留最近 N 个任务的完整上下文。可在 `codespec/config.yaml` 中配置：

```yaml
compression:
  keepRecentTasks: 1  # 保留最近 1 个任务的完整上下文（默认值）
```

## 为什么选择 CodeSpec？

AI 编程助手很强大，但当需求只存在于聊天记录里时，结果往往难以预测。CodeSpec 增加了一层轻量的规范机制：

- **先对齐，再开工** —— 人类与 AI 在写代码前先在 spec、design 上达成一致
- **保持有序** —— 每个变更都有自己的目录：spec、design、task
- **质量内建** —— 子代理实现 + spec 合规审查 + 代码质量审查 + 变更级验证
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
