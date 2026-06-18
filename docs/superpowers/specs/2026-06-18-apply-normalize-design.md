# apply / apply-quick 归一化设计

> **日期**: 2026-06-18
> **状态**: 已确认
> **范围**: CodeSpec propose → apply 流程

---

## 1. 问题

当前 `/apply` 和 `/apply-quick` 有两个问题：

1. **每个 task 都走 subagent，成本高但收益有限。** 简单变更（少量文件、逻辑直白）不需要子代理的隔离上下文。每次委派都重新构建上下文，大量 token 和时间浪费在不需要隔离的任务上。

2. **两个命令的差异仅在于是否审查**，却维护了两套技能（subagent-driven-development / quick-driven-development）和两套命令，增加了维护负担和用户选择成本。

核心矛盾：**所有 task 一律走 subagent 的模式，对简单变更来说是 over-engineering。**

---

## 2. 设计方案

### 2.1 执行模式由用户在 plan 阶段决定

在 `writing-plans` 技能中，任务粒度确认之后新增一个问题：

> 这个 change 你希望用哪种方式执行？
>
> - **A) Subagent 驱动**（推荐复杂变更）：每个 task 委派给独立子代理，逐 task 两阶段审查。子代理有全新上下文，task.md 需要写得很详细。适合多文件、高复杂度变更。
> - **B) 主 Agent 直接执行**：主 agent 一口气执行所有 task，全部完成后统一两阶段审查。速度快、token 省。适合简单变更。

用户选择后写入 task.md 头部执行模式标记。

### 2.2 task.md 新增执行模式标记

task.md 头部新增一行：

```markdown
> **执行模式**: `subagent` | `main`
```

**subagent 模式** — 维持当前详细 task.md 格式。每个 task 包含涉及文件、修改入口、具体执行步骤、命令及预期输出。子代理需要这些信息因为它没有对话上下文。

**main 模式** — 简化为目标导向格式。去掉步骤级细节和命令（主 agent 有完整对话上下文），每个 task 保留：

```markdown
# 功能名称 实现计划

> **执行模式**: `main`

**目标:** 一句话描述

---

## 职责边界
- 约束 1
- 约束 2

---

### [ ] 任务 1：任务名称

**目标:** 做什么（不涉及如何做）

**涉及文件:**
- `path/to/file.ts` — 职责说明

**验收:** 可验证的验收条件

---
```

### 2.3 apply 命令归一

合并 `/apply` 和 `/apply-quick` 为统一的 `/opsx:apply`。

apply 启动时读取 task.md 头部的执行模式标记，分发执行路径：

```
读取 task.md
  │
  ├── subagent 模式 → 加载 subagent-driven-development 技能
  │   └── 逐 task: 委派 code-generator → spec-reviewer → code-quality-reviewer
  │
  └── main 模式 → 主 agent 直接执行
      ├── 逐 task 执行并标记 done（continuation enforcer 驱动，不中断）
      └── 全部完成后 → change-verifier 统一两阶段审查
```

### 2.4 清理

- 删除 `/apply-quick` 命令
- 删除 `quick-driven-development` 技能
- `profiles.ts` 从核心工作流中移除 `apply-quick`
- `init.ts` 不再安装 quick-driven-development

---

## 3. 改动文件

| 文件 | 改动 |
|------|------|
| `writing-plans` 技能模板 | 新增执行模式询问步骤；main 模式使用简化 task.md 模板 |
| `/apply` 命令模板 | 合并两套逻辑；读取执行模式标记并分发 |
| `/apply-quick` 命令模板 | 删除 |
| `quick-driven-development` 技能模板 | 删除 |
| `subagent-driven-development` 技能模板 | 不变 |
| `profiles.ts` | 从 CORE_WORKFLOWS 移除 `apply-quick` |
| `init.ts` | 不再安装 apply-quick 和 quick-driven-development |

---

## 4. 风险

| 风险 | 缓解 |
|------|------|
| main 模式下主 agent 上下文窗口压力大 | main 模式仅推荐简单变更（≤3 文件）；用户选择前明确告知权衡 |
| continuation enforcer 可能在 main 模式下提前中断 | 复用现有 stop enforcer 机制，main 模式下同样强制继续直到 task 耗尽 |
| 用户选择了 subagent 但变更是简单的（或反之） | task.md 写完后用户还有一次 review 机会，可回退调整 |
