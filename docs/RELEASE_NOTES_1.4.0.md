# CodeSpec 1.4.0 发布说明

> 规范驱动开发框架：写代码前先在 spec/design 上对齐，再通过子代理与多层质量门禁确保实现质量。

本次发布围绕"**降低返工成本**"与"**按需裁剪审查深度**"两条主线，新增了 **AR 前置澄清工作流**、**可配置裁剪的 apply 审查流程**、**一条命令归档**，并完善了 TDD 检测、CLI 根目录定位与上下文压缩。下面按"用户最可能关心的能力"展开，每项附痛点说明与实操示例；次要改进统一在文末列出，不遗漏。

---

## 重点新特性

### 1. `/codespec/design`：写代码前先把"做什么"问清楚

**解决的痛点**：过去从一句话想法直接进入 `/codespec/plan` 生成 design/task，需求背景、业务概念、测试边界常常没澄清清楚，导致 spec 反复返工，甚至实现后才发现方向偏差。

**新能力**：新增独立的 AR（架构需求）工作流，把粗略想法逐步精炼为结构化 `ar.md`。流程分四阶段填充——**需求背景 → 业务概念澄清 → 需求与测试澄清 → 实现澄清**，并强制 **WRITE-GATE**：每批用户澄清回复后必须先落盘再进入下一阶段，禁止攒到最后一次性总编辑。澄清问答集中归档至末尾"参考信息"章，为后续 `/codespec/plan` 提供高质量输入。

配套新增 `concept-clarify` 子代理，专门澄清业务术语，与实现澄清职责严格分离。该子代理借助**豆包 MCP** 对逐条术语查证后写入 Q&A；无豆包 MCP 时优雅降级，写入 `A：<!-- 待澄清 -->` 占位，不阻断流程。

**实操**：

```
你：/codespec/design 给支付模块加一个对账功能
AI：已创建 codespec/changes/payment-reconcile/
     1. 需求背景           — 业务痛点 / 业务目标
     2. 业务概念澄清       — 调用 concept-clarify 子代理澄清"对账""T+1"等术语
     3. 需求与测试澄清     — 功能清单 / Given-When-Then / 验收标准
     4. 实现澄清           — 定位现有模块、接口、约束
     AR 成稿已写入 ar.md，请审查……

你：批准
AI：AR 终稿已完成！可继续运行 /codespec/plan payment-reconcile 生成 design.md 和 task.md。
```

AR 文件脚手架可用命令生成：

```bash
codespec new change payment-reconcile
codespec create ar --change payment-reconcile --json   # 返回 ar.md 的绝对路径
```

---

### 2. `apply flow` + `skipReviewers`：小改动不再被三层审查拖慢（仅速度优先模式）

**解决的痛点**：`/codespec/apply` 在**速度优先（main）模式**下默认对每个变更跑 **spec 审查 → 代码质量审查 → 变更级验证**三层门禁。小修小补或基础设施变更也走全套审查，速度开销过大。

**适用范围（重要）**：CodeSpec 有两种执行模式，由 `task.md` 头部标记 `> **执行模式**: \`subagent\` | \`main\`` 决定，未找到标记时**默认 `subagent`**：

| 模式 | 别名 | 审查策略 | 是否读 `skipReviewers` |
|------|------|----------|------------------------|
| **subagent 模式** | 质量优先 | 固定全流程三层审查，每个任务分派隔离实现子智能体，审查不可裁剪 | 否 |
| **main 模式** | 速度优先 | 主 Agent 逐任务实现，完成后统一审查，审查深度可裁剪 | **是** |

本特性**仅在 main（速度优先）模式生效**。subagent 模式为质量优先，三层审查是硬性纪律，不读取 `skipReviewers`，因此质量敏感场景应保持 `subagent` 模式不动配置。

**新能力**：在 main 模式下，可在 `config.yaml` 声明跳过部分审查者，并由新命令 `codespec apply flow` 返回裁剪后的实际执行流程图（DOT 图 + 有向步骤）。三种审查者共 2³=8 种组合已预编排完毕，**结构上保证不会分派未列入的审查子代理**，无需动态拼接边。输出支持 `--json` 供 AI 代理直接消费。

`main-agent-development` 技能已重写：删除静态流程图与 config 层描述，改为在需求理解阶段第一步运行 `codespec apply flow`，并以返回的执行步骤为审查执行的唯一依据——只执行返回的步骤中列出的审查，不为未列出的审查创建 TodoWrite 条目、不分派对应子代理。

**配置（`codespec/config.yaml`）**：

```yaml
apply:
  skipReviewers:
    - spec-reviewer
    # 可选值：spec-reviewer / code-quality-reviewer / change-verifier
    # 可填一个或多个，顺序无关；未知值会被过滤并告警
    # 仅当 task.md 执行模式为 main 时生效
```

**查看生效后的流程**：

```bash
codespec apply flow --change add-dark-mode        # 文本流程图 + 有序步骤
codespec apply flow --change add-dark-mode --json # 供 Agent 解析
```

**切换模式**：在 `task.md` 头部填写执行模式标记（`/codespec/plan` 生成时由 `writing-plans-main` / `writing-plans-subagent` 技能写入）：

```markdown
# [功能名称] 实现计划
> **执行模式**: `main`        # 速度优先，受 skipReviewers 裁剪
> **TDD**: `未启用`
```

效果：把"速度优先"做成可配置项而非另起一条命令——`apply` 仍是统一入口，main 模式按项目实际情况裁剪审查深度，subagent 模式始终全审查兜底质量。

---

### 3. `codespec archive auto`：归档目录不再放错位置

**解决的痛点**：AI 代理用裸 `mkdir + mv` 归档时，常因当前工作目录不在项目根而把变更移动到错误层级的 archive 目录，归档结构错乱。

**新能力**：一条命令完成自动归档，等价于 `codespec archive <name> --yes --skip-specs --no-validate`，但更短、更易被 AI 稳定遵守。命令逐级向上解析 `.git` 作为项目根，归档目录始终落在正确的项目级 `codespec/changes/archive/YYYY-MM-DD-<name>/`；Windows 上 `rename` 失败自动回退 `copy + remove`，跨平台稳定。成功输出绝对路径便于核对。

`archive-change` 与 `bulk-archive-change` 技能模板已改写为统一使用 `codespec archive auto "<name>"`，并在防护措施中明确**禁止裸 `mv`**，根治归档落错层级的问题。

**实操**：

```bash
codespec archive auto payment-reconcile
# 输出：变更 'payment-reconcile' 已归档至 /path/to/codespec/changes/archive/2026-07-16-payment-reconcile
```

适用场景：AI 代理在 `/codespec/archive` 技能里完成产出物检查与增量规范同步后，用这一条命令完成最终移动。

---

### 4. TDD 选择标识：未选 TDD 不再被强制带 UT 步骤

**解决的痛点**：此前 `task.md` 不区分是否走 TDD，非 TDD 流程也会被生成"先写失败测试"之类的 UT 步骤，徒增无关工作量。

**新能力**：`task.md` 头部新增 TDD 选择标识（`> **TDD**: \`启用\` | \`未启用\``），`/codespec/apply` 阶段会读取该标识动态调整执行行为——未找到标记时默认视为**未启用**，禁止生成单元测试相关步骤；选择 TDD 时按红-绿-重构循环执行。

---

### 5. CLI 统一向上查找 `.git`：在子目录也能直接跑命令

**解决的痛点**：此前部分命令要求在项目根执行，在 `src/components/` 等子目录里调用会找不到 `codespec/` 目录，甚至在 git 仓库多层级子目录启动时各自创建 codespec 目录。

**新能力**：所有自带 CLI 命令（`new change`/`list`/`view`/`validate`/`archive`/`show`/`spec`/`schema`/`config`/`status`/`templates`/`schemas`/`instructions`/`create ar`/`uninit` 及补全）统一改用 `resolveCodespecRoot`，从启动目录逐级向上查找 `.git`（文件或目录均算，兼容 worktree 指针），找到即作为根目录，未找到则回退启动目录。`init` 保持显式 `targetPath` 行为不变。

```bash
# 在任意子目录均可直接执行
cd src/components
codespec status --change add-dark-mode
```

---

### 6. apply 命令统一：`apply-quick` 已退役

**解决的痛点**：过去 `apply`（子代理 + 全审查）与 `apply-quick`（主上下文 + 跳审查）两条命令并存，用户需自行判断何时用哪个，且废弃 skill 残留在旧项目里。

**新能力**：`writing-plans` 拆分为 subagent / main 双 skill，`apply` 成为统一入口；速度优先通过第 2 项的 `skipReviewers` 配置实现，不再需要第二条命令。启动时自动移除废弃的 `/apply-quick` 与 `quick-driven-development` skill，旧项目升级后无残留。

---

## 质量与体验增强

### main 模式 apply：先建立全局需求理解，再逐任务实现

主代理执行模式新增"需求理解阶段"——在开始任何任务前一次性读取 `spec.md`、`design.md`、`task.md` 三件套建立全局理解，再逐任务实现。此前逐任务孤立读取上下文，容易出现"只见树木不见森林"的局部偏差。

### OpenCode：纯子代理不再污染切换列表

为 `change-verifier` / `code-quality-reviewer` / `concept-clarify` / `spec-reviewer` 四个设计上只应被 Task 工具调用的子代理注入 `mode: subagent`。注入后这些代理**不会出现在 Tab 主代理切换列表、不能被设为 `default_agent`、不暴露给 ACP**——用户切换 agent 时不再被这些"幕后"代理干扰。注入仅在 `tool=opencode` 时发生，cc 路径保持纯净；`code-generator` 保持默认（all）。

### 审查门禁职责清晰化

- **强化 `/codespec/plan` 审查关卡**：审查通过后若再修改，必须重新审查，杜绝"改完不复查"。
- **代码质量审查器聚焦代码质量本身**，编译与 UT 通过率验证交由 `change-verifier` 负责，职责不再重叠。
- **子代理提示词改为中文**，提升中文用户阅读与排查体验。

### 上下文压缩增强

- **main 模式每完成一个 task 即压缩**，主动回收上下文窗口（此前仅 subagent 模式按批压缩）。
- **subagent 模式支持自定义压缩配置**，可按命令分别设定保留任务数：

```yaml
compression:
  apply:
    keepRecentTasks: 1   # 子代理模式保留最近 1 个任务完整上下文
  apply-quick:
    keepRecentTasks: 3
```

- `task-compress` 摘要指令由"保持简洁"改为"提供详细丰富的摘要"，并移除 `modifiedFiles` 参数，压缩后保留信息更充分；修复了压缩异常问题。

---

## 其他改进与修复

- **`/design` 工具召回**：支持工具年龄剪裁与结果去重，降低噪声上下文。
- **`/plan` 续接 `/design`**：可直接消费 `/codespec/design` 产出的 `ar.md`，无需复制粘贴。
- **OpenCode 集成**：启动时自动清理废弃 skill；对旧 `opencode.json` 自动备份；改用与 opencode 同源的 `jsonc-parser`，兼容 JSONC 注释与尾逗号。
- **任务跟踪**：`main-agent-development` 中 task 与三个审查 subagent 步骤全部纳入 TodoWrite 跟踪。
- **`new change` 输出绝对路径**，避免多 codespec 目录歧义。
- **大文件限制放宽**至 50KB。
- 重命名冲突的 external skill，避免与 superpowers 同名；移除 `subagent-driven-development` 的自动提交。

---

## 升级

```bash
npm install -g @studyzy/codespec@latest
codespec init        # 同步新增的 /codespec/design、create ar、skipReviewers 等模板与配置
```

升级后建议在 `codespec/config.yaml` 中按需配置 `apply.skipReviewers`，并执行 `codespec apply flow` 查看裁剪后的流程图。