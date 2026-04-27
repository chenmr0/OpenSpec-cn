/**
 * Test Driven Development External Skill Template
 *
 * Copied from superpowers-cn/skills/test-driven-development.
 * Includes testing-anti-patterns.md as an extra reference file.
 * This skill is always installed during init.
 */
import type { SkillTemplate } from '../types.js';

const tddInstructions = `# 测试驱动开发（TDD）

## 概述

先写测试。看它失败。写最少的代码让它通过。

**核心原则：** 如果你没有看到测试失败，你就不知道它是否测试了正确的东西。

**违反规则的字面意思就是违反规则的精神。**

## 何时使用

**始终使用：**
- 新功能
- Bug 修复
- 重构
- 行为变更

**例外（需询问你的人类伙伴）：**
- 一次性原型
- 生成的代码
- 配置文件

想着"就这一次跳过 TDD"？停下来。那是在给自己找借口。

## 铁律

\`\`\`
没有失败的测试，就不写生产代码
\`\`\`

先写了代码再写测试？删掉它。从头来过。

**没有例外：**
- 不要保留作为"参考"
- 不要在写测试时"改编"它
- 不要看它
- 删除就是删除

从测试出发，重新实现。句号。

## 红-绿-重构

### 红灯 - 编写失败的测试

写一个最小的测试来展示期望行为。

**要求：**
- 一个行为
- 清晰的名称
- 使用真实代码（除非不得已才用 mock）

### 验证红灯 - 看它失败

**必须执行。绝不跳过。**

确认：
- 测试失败（不是报错）
- 失败信息符合预期
- 失败原因是功能缺失（不是拼写错误）

**测试通过了？** 你在测试已有的行为。修改测试。

**测试报错了？** 修复错误，重新运行直到它正确地失败。

### 绿灯 - 最少代码

写最简单的代码让测试通过。

不要添加功能、重构其他代码或做超出测试要求的"改进"。

### 验证绿灯 - 看它通过

**必须执行。**

确认：
- 测试通过
- 其他测试仍然通过
- 输出干净（没有错误、警告）

**测试失败了？** 修改代码，不是测试。

**其他测试失败了？** 立即修复。

### 重构 - 清理代码

只有在绿灯之后才重构：
- 消除重复
- 改善命名
- 提取辅助函数

保持测试绿灯。不要添加行为。

### 重复

为下一个功能写下一个失败的测试。

## 好的测试

| 特质 | 好的 | 差的 |
|------|------|------|
| **最小化** | 只测一件事。名称中有"和"？拆分它。 | \`test('validates email and domain and whitespace')\` |
| **清晰** | 名称描述行为 | \`test('test1')\` |
| **展示意图** | 展示期望的 API | 掩盖了代码应该做什么 |

## 为什么顺序很重要

**"我先写完再补测试来验证"**

后写的测试立即通过。立即通过什么也证明不了：
- 可能测试了错误的东西
- 可能测试的是实现而非行为
- 可能遗漏了你忘掉的边界情况
- 你从未看到它捕获 bug

先写测试迫使你看到测试失败，证明它确实在测试某些东西。

## 常见借口

| 借口 | 现实 |
|------|------|
| "太简单了不用测" | 简单的代码也会出 bug。测试只需 30 秒。 |
| "我之后补测试" | 立即通过的测试什么也证明不了。 |
| "已经手动测试过了" | 临时测试 ≠ 系统测试。无记录，无法重现。 |
| "删除 X 小时的工作太浪费" | 沉没成本谬误。保留未验证的代码就是技术债。 |
| "TDD 会拖慢我" | TDD 比调试快。务实 = 先写测试。 |

## 危险信号 - 停下来，从头开始

- 先写了代码再写测试
- 实现完了才补测试
- 测试立即通过
- 无法解释测试为什么失败
- "之后再补"测试
- 说服自己"就这一次"
- "我已经手动测试过了"

**以上所有情况都意味着：删除代码。用 TDD 从头开始。**

## 测试反模式

添加 mock 或测试工具时，阅读 @testing-anti-patterns.md 以避免常见陷阱：
- 测试 mock 行为而非真实行为
- 在生产类中添加仅测试用的方法
- 在不理解依赖的情况下使用 mock

## 验证清单

在标记工作完成之前：

- [ ] 每个新函数/方法都有测试
- [ ] 在实现之前看到每个测试失败
- [ ] 每个测试因预期原因失败（功能缺失，不是拼写错误）
- [ ] 为每个测试编写了最少代码使其通过
- [ ] 所有测试通过
- [ ] 输出干净（没有错误、警告）
- [ ] 测试使用真实代码（只在不可避免时用 mock）
- [ ] 覆盖了边界情况和错误场景

不能全部勾选？你跳过了 TDD。从头开始。

## 遇到困难时

| 问题 | 解决方案 |
|------|----------|
| 不知道怎么测试 | 写出你期望的 API。先写断言。问你的人类伙伴。 |
| 测试太复杂 | 设计太复杂。简化接口。 |
| 必须 mock 所有东西 | 代码耦合太紧。使用依赖注入。 |
| 测试 setup 太庞大 | 提取辅助函数。还是复杂？简化设计。 |

## 最终规则

\`\`\`
生产代码 → 测试存在且先失败
否则 → 不是 TDD
\`\`\`

没有你的人类伙伴的许可，没有例外。`;

export const testingAntiPatternsContent = `# 测试反模式

**在以下情况加载此参考：** 编写或修改测试、添加 mock、或想在生产代码中添加仅测试用方法时。

## 概述

测试必须验证真实行为，而非 mock 行为。Mock 是隔离的手段，不是被测试的对象。

**核心原则：** 测试代码做了什么，而非 mock 做了什么。

**严格遵循 TDD 可以防止这些反模式。**

## 铁律

\`\`\`
1. 绝不测试 mock 行为
2. 绝不在生产类中添加仅测试用的方法
3. 绝不在不理解依赖的情况下使用 mock
\`\`\`

## 反模式 1：测试 Mock 行为

**违规做法：**
\`\`\`typescript
// ❌ 差：测试 mock 是否存在
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
\`\`\`

**为什么这是错误的：**
- 你在验证 mock 能工作，而非组件能工作
- mock 存在时测试通过，不存在时失败
- 对真实行为一无所知

**正确做法：**
\`\`\`typescript
// ✅ 好：测试真实组件或不要 mock 它
test('renders sidebar', () => {
  render(<Page />);  // 不要 mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
\`\`\`

### 门控函数

\`\`\`
在对任何 mock 元素做断言之前：
  问："我是在测试真实组件行为还是仅仅测试 mock 的存在？"

  如果是测试 mock 的存在：
    停下——删除断言或取消 mock

  改为测试真实行为
\`\`\`

## 反模式 2：在生产代码中添加仅测试用方法

**违规做法：**
\`\`\`typescript
// ❌ 差：destroy() 仅在测试中使用
class Session {
  async destroy() {  // 看起来像生产 API！
    await this._workspaceManager?.destroyWorkspace(this.id);
  }
}

// 在测试中
afterEach(() => session.destroy());
\`\`\`

**正确做法：**
\`\`\`typescript
// ✅ 好：测试工具处理测试清理
// Session 没有 destroy()——它在生产中是无状态的

// 在 test-utils/ 中
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}

// 在测试中
afterEach(() => cleanupSession(session));
\`\`\`

## 反模式 3：不理解依赖就使用 Mock

**违规做法：**
\`\`\`typescript
// ❌ 差：Mock 破坏了测试逻辑
test('detects duplicate server', () => {
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));

  await addServer(config);
  await addServer(config);  // 应该抛异常——但不会！
});
\`\`\`

**正确做法：**
\`\`\`typescript
// ✅ 好：在正确的层级 mock
test('detects duplicate server', () => {
  vi.mock('MCPServerManager'); // 只 mock 慢的服务器启动

  await addServer(config);  // 配置被写入
  await addServer(config);  // 检测到重复 ✓
});
\`\`\`

## 反模式 4：不完整的 Mock

**铁律：** Mock 真实存在的完整数据结构，而非只包含你当前测试用到的字段。

**正确做法：**
\`\`\`typescript
// ✅ 好：镜像真实 API 的完整性
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
  // 真实 API 返回的所有字段
};
\`\`\`

## 反模式 5：集成测试作为事后补充

**正确做法：**
\`\`\`
TDD 循环：
1. 编写失败的测试
2. 实现使其通过
3. 重构
4. 然后才声称完成
\`\`\`

## 快速参考

| 反模式 | 修复方式 |
|--------|----------|
| 对 mock 元素做断言 | 测试真实组件或取消 mock |
| 生产代码中的仅测试用方法 | 移到测试工具中 |
| 不理解就 mock | 先理解依赖，最少 mock |
| 不完整的 mock | 完整镜像真实 API |
| 测试作为事后补充 | TDD——先写测试 |
| 过于复杂的 mock | 考虑集成测试 |

## 危险信号

- 断言检查 \`*-mock\` test ID
- 方法仅在测试文件中被调用
- Mock setup 占测试的 >50%
- 移除 mock 测试就失败
- 无法解释为什么需要 mock
- "保险起见" mock 掉

## 底线

**Mock 是隔离的工具，不是被测试的对象。**

如果 TDD 揭示你在测试 mock 行为，你已经走偏了。

修复方法：测试真实行为，或质疑为什么要 mock。`;

export function getTestDrivenDevelopmentSkillTemplate(): SkillTemplate {
  return {
    name: 'test-driven-development',
    description: 'test-driven-development',
    instructions: tddInstructions,
    license: 'MIT',
    compatibility: '无特殊依赖。',
    metadata: { author: 'superpowers', version: '1.0' },
  };
}
