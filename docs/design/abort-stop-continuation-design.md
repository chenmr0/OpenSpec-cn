# CodeSpec 续接器：用户中止即叫停（abort-stop）机制设计

> 适用范围：`src/opencode-plugin/continuation/`（CodeSpec Continuation Enforcer 插件）
> 目标场景：opencode `/codespec/apply` 会话中，用户双击 ESC 中止后，不再自动续接；用户重新输入后恢复续接能力。

---

## 1. 背景与现象

在 opencode 的 `/codespec/apply` 阶段，续接器（continuation enforcer）会在会话空闲且仍有未完成 todo 时，自动注入一条 `[CodeSpec]` 续接提示词，驱动模型继续推进任务。

用户反馈：**手动中止（连按两次 ESC）后，续接器又自动重试注入了**，无法真正停下。

用户消息中可见的注入文本：

```
[CodeSpec]
你的任务列表中仍有未完成的任务。继续处理下一个待处理任务。
- 不要请求许可，直接继续执行
- 每完成一个任务就标记完成
- 所有任务完成前不要停止
...
```

该文本逐字对应 `src/opencode-plugin/continuation/constants.ts` 的 `CONTINUATION_PROMPT`。

---

## 2. 根因分析

### 2.1 续接器的工作机制

入口 `src/opencode-plugin/index.ts:28` 监听 `session.idle`：

1. `handleSessionIdle`（`idle-event.ts`）在空闲时触发。
2. 仅在 `/codespec/apply` 会话生效（通过用户消息中的 `APPLY_MARKER = "codespec-apply-change"` 判定）。
3. 依次检查：`wasCancelled`、`abortDetectedAt`（3 秒窗口）、API 兜底 `isLastAssistantMessageAborted`、未完成 todo、冷却期、停滞计数、连续失败。
4. 全部通过后启动 **2 秒倒计时**（`COUNTDOWN_SECONDS = 2`），到期由 `injectContinuation`（`continuation-injection.ts`）调用 `promptAsync` 注入 `[CodeSpec]` 提示词。

### 2.2 为什么 ESC 拦不住（三处叠加）

1. **`wasCancelled` 被尾随事件清零**：ESC 触发 `session.error`（`MessageAbortedError`），`handler.ts:22-30` 置 `wasCancelled=true`；但紧接着的 `message.updated`(assistant)、`message.part.delta`、`tool.execute.*` 又把它重置为 `false`（`handler.ts:56/68/103/117`）。等 `session.idle` 真正触发时，该轻量闸门已失效。代码注释（`idle-event.ts:25-27`）已承认此点。
2. **API 兜底只在 idle 入口跑一次**：`isLastAssistantMessageAborted`（`idle-event.ts:29`）是唯一可靠的中止探测，但它仅在 `handleSessionIdle` 执行；2 秒倒计时到期后的 `injectContinuation` **不复查**（`continuation-injection.ts:33/62` 只查 `wasCancelled`）。
3. **取消息失败被静默吞掉**：`idle-event.ts:139` 的 `catch { // continue with other checks }`——一旦 `session.messages()` 抛错，中止探测被跳过，直接进入 todo 检查并可能注入。

### 2.3 关键发现：opencode 的 ESC 语义

`opencode/.../tui/component/prompt/index.tsx:455-466`：

```js
setStore("interrupt", store.interrupt + 1)
setTimeout(() => setStore("interrupt", 0), 5000)   // 5 秒内累计
if (store.interrupt >= 2) {                         // 第 2 次才真正 abort
  void sdk.client.session.abort({ sessionID })
  setStore("interrupt", 0)
}
```

**opencode TUI 要求 5 秒内连按两次 ESC 才触发一次 `session.abort`**（第一次仅计数，第二次才中止）。

因此：

- 用户说的"两次 esc" = **一次 abort** = **一次 `session.error` `MessageAbortedError`**。
- "两次 esc 后停止" 对应的是 **一次 abort → 停止**，而非"累计两次 abort 才停"。
- opencode 已用"双击"做了防误触，续接器应将**任一 abort 视为明确叫停**。

### 2.4 上次修复 `fd31eaa` 为何不够

提交 `fd31eaa 修复两次esc无法退出的问题` 仅在 `idle-event.ts` 增加了 API 兜底 `isLastAssistantMessageAborted`。它不够，因为：

- 只在 idle 入口跑一次，倒计时后注入不复查；
- 取消息失败被吞，探测失效即续接；
- 没有粘性的"用户已叫停"状态，abort 信号被尾随事件冲掉后，下一次 idle 又从头判断。

### 2.5 排除 opencode 自身的续接/重试来源

- **SessionRetry**（`opencode/.../session/retry.ts:54` `retryable()`）：仅对 `APIError`（5xx、限流、Overloaded）重试；`MessageAbortedError` 非 `APIError`，不重试。
- **`experimental.compaction.autocontinue`**（`opencode/.../session/compaction.ts:511`）：仅在上下文溢出/压缩时触发，与 ESC 无关。

结论：现象 100% 来自 CodeSpec 续接器，与 opencode 本体无关。

---

## 3. 方案总览

**核心思想**：把唯一可靠的 abort 信号（`session.error` → `MessageAbortedError`）固化为一个**粘性**状态 `stoppedByUser`，尾随清理事件**无权**清除它；续接器在 `stoppedByUser` 期间一律不注入；仅当用户**在 abort 之后真正重新输入**一条非注入的 user 消息时，才解除并恢复续接能力。

**不做**：abort 计数器、阈值常量、时间窗启发式。一次 abort 即叫停（理由见 2.3）。

---

## 4. 详细改动

### 4.1 新增状态（`continuation/types.ts`）

`SessionState` 增加两个字段：

```ts
/** 用户已中止（双击 ESC = 一次 abort），续接器应停止注入，直到用户重新输入。 */
stoppedByUser?: boolean;
/** 设置 stoppedByUser 的时间戳（同进程 Date.now()），用于判定"abort 之后"的重入。 */
stoppedAt?: number;
```

### 4.2 注入签名常量（`continuation/constants.ts`）

```ts
export const INJECTION_SIGNATURE = `[${HOOK_NAME}]`; // "[CodeSpec]"
```

用于区分"我们注入的续接消息"与"用户真实输入"。

### 4.3 共享消息工具（新增 `continuation/messages-util.ts`）

从 `idle-event.ts` 抽出 `isLastAssistantMessageAborted`、`normalizeSDKResponse`，并新增重入检测函数，供 `idle-event.ts` 与 `continuation-injection.ts` 复用：

```ts
import { INJECTION_SIGNATURE } from "./constants.js";

/** 将 SDK 响应规整为数组（兼容 { data: [] } 与 [] 两种形态）。 */
export function normalizeSDKResponse<T>(response: unknown, fallback: T): T { /* 原实现 */ }

/** 最后一条 assistant 消息是否带 abort 错误。 */
export function isLastAssistantMessageAborted(messages: Array<Record<string, unknown>>): boolean { /* 原实现 */ }

/** 取一条消息所有 text part 拼接文本。 */
function getMessageText(msg: Record<string, unknown>): string { /* 遍历 msg.parts */ }

/** 最后一条"非注入"的 user 消息（文本不以 [CodeSpec] 开头）。 */
export function findLastGenuineUserMessage(
  messages: Array<Record<string, unknown>>,
  signature = INJECTION_SIGNATURE,
): Record<string, unknown> | undefined { /* 从尾向前找 */ }

/** 是否存在 abort 之后的真实用户重入：最后一条真实 user 消息的 created > stoppedAt。 */
export function hasGenuineReengagement(
  messages: Array<Record<string, unknown>>,
  stoppedAt: number | undefined,
): boolean {
  if (stoppedAt === undefined) return false;
  const msg = findLastGenuineUserMessage(messages);
  if (!msg) return false;
  const created = (msg.info as { time?: { created?: number } })?.time?.created;
  return typeof created === "number" && created > stoppedAt;
}
```

> 关键：用 `created > stoppedAt` 而非"最后一条 user 消息"，以排除"用户中止自己刚发的消息"——那条消息的 `created` 在 abort 之前，不会触发误解除。`INJECTION_SIGNATURE` 过滤掉我们自己注入的 `[CodeSpec]` 消息。`stoppedAt` 与 `message.created` 同进程同时钟（插件运行在 opencode 进程内），无漂移。

### 4.4 设置叫停（`continuation/handler.ts`，`session.error` 的 AbortError 分支）

在现有 `wasCancelled/abortDetectedAt` 逻辑旁新增：

```ts
if (error?.name === "MessageAbortedError" || error?.name === "AbortError") {
  const state = sessionStateStore.getState(sessionID);
  state.wasCancelled = true;
  state.abortDetectedAt = Date.now();
  state.stoppedByUser = true;      // 新增：粘性叫停
  state.stoppedAt = Date.now();    // 新增：重入判定基准
  state.lastIncompleteCount = undefined;
  state.lastInjectedAt = undefined;
  state.awaitingPostInjectionProgressCheck = false;
  state.stagnationCount = 0;
  state.consecutiveFailures = 0;
}
```

尾随事件（`message.updated` / `message.part.delta` / `tool.execute.*`）**保持原样**，继续只清 `wasCancelled`/`abortDetectedAt`，**不触碰** `stoppedByUser`。

### 4.5 闸门 + 重入检测 + 保守 catch（`continuation/idle-event.ts`）

把现有"取消息 → 探测 abort"块改造为：

```ts
let messages: Record<string, unknown>[] = [];
let fetchOK = false;
try {
  const messagesResp = await ctx.client.session.messages({ path: { id: sessionID } });
  messages = normalizeSDKResponse<Record<string, unknown>[]>(messagesResp, []);
  fetchOK = true;
} catch {
  // ④ 保守策略：取消息失败时无法验证 abort/重入，一律不续接。
  return;
}

// 仅在 /codespec/apply 会话中生效
if (!detectApplySessionFromMessages(state, messages)) return;

// abort 是最近事件 → 保持叫停（也补设 stoppedByUser，覆盖 session.error 被漏掉的情况）
if (isLastAssistantMessageAborted(messages)) {
  state.stoppedByUser = true;
  state.stoppedAt = Date.now();
  return;
}

// 已叫停：只有"abort 之后真实重入"才解除
if (state.stoppedByUser) {
  if (hasGenuineReengagement(messages, state.stoppedAt)) {
    state.stoppedByUser = false; // 用户重新输入 → 恢复续接
  } else {
    return; // 仍处于叫停
  }
}

// ...原有 todo / 冷却 / 停滞 / 倒计时逻辑不变
```

`isLastAssistantMessageAborted`、`normalizeSDKResponse`、`hasGenuineReengagement` 改从 `messages-util.js` 导入；本文件内删除原局部实现。

### 4.6 关闭倒计时竞态（`continuation/continuation-injection.ts`）

入口与注入前增加两道检查：

```ts
export async function injectContinuation(args: { /* ... */ }): Promise<void> {
  const state = sessionStateStore.getExistingState(sessionID);
  if (state?.isRecovering) return;
  if (state?.wasCancelled) return;
  if (state?.stoppedByUser) return;            // 新增：叫停闸门

  // 取 todo（原逻辑）...

  // 注入前复查 API 兜底：覆盖 session.error 被漏掉 + idle 瞬间错误未落库、
  // 倒计时 2 秒后才落库的竞态。
  try {
    const resp = await ctx.client.session.messages({ path: { id: sessionID } });
    const messages = normalizeSDKResponse<Record<string, unknown>[]>(resp, []);
    if (isLastAssistantMessageAborted(messages)) {
      if (state) { state.stoppedByUser = true; state.stoppedAt = Date.now(); }
      return;
    }
  } catch {
    // 复查失败：保守不注入（与 idle 的保守策略一致）。
    return;
  }

  // 二次确认 wasCancelled / stoppedByUser（原 wasCancelled 检查保留并补 stoppedByUser）...
  if (injectionState?.wasCancelled) return;
  if (injectionState?.stoppedByUser) return;   // 新增

  // promptAsync（原逻辑）...
}
```

`isLastAssistantMessageAborted`、`normalizeSDKResponse` 改从 `messages-util.js` 导入。

---

## 5. 竞态/缺陷覆盖矩阵

| 已识别的竞态或缺陷 | 本方案如何覆盖 |
|---|---|
| `wasCancelled` 被尾随事件清零 | 新增粘性 `stoppedByUser`，尾随事件不清；`wasCancelled` 退为冗余软闸门 |
| abort 错误在 idle 瞬间未落库 | `stoppedAt`（来自 `session.error`）使"无重入"判断成立，不误判为重入 |
| 2 秒倒计时后错误才落库 | `injectContinuation` 注入前复查 `isLastAssistantMessageAborted` |
| `session.error` 事件被漏掉 | API 兜底（idle 与 inject 两处）补设 `stoppedByUser` |
| 取消息失败被吞 → 误续接 | `catch → return`，保守不注入 |
| 注入消息自身把"取消"标志擦掉 | `stoppedByUser` 不由 user 消息事件清除，只在 idle 重入检测里解除 |
| 用户中止自己刚发的消息被误判为重入 | 重入要求 `created > stoppedAt`，该消息 `created` 在 abort 之前 |

---

## 6. 关键决策点

### ④ 取消息失败时的策略：保守不续接

`idle-event.ts` 与 `continuation-injection.ts` 的 `session.messages()` 失败时，均 `return`（不注入）。

- 理由：续接器在无法验证 abort/重入时注入，正是当前 bug 的成因；保守不注入更安全。
- 代价：偶发取消息失败会暂停当次续接，下次 idle（用户输入或自然空闲）恢复。
- 现实评估：插件与 opencode 同进程，`session.messages()` 为本地调用，失败极罕见。

> 备选（未采用）：仅当 `stoppedByUser` 已为真时 `return`，否则维持原 `continue`。未采用是因为非 abort 场景下取消息失败仍可能注入一条本应被 abort 拦截的续接，收益不抵一致性。

### 重入解除条件

解除 `stoppedByUser` 的唯一条件：idle 时探测到"abort 之后存在一条非注入的真实 user 消息"（`hasGenuineReengagement`）。这保证：

- 用户中止后不续接；
- 用户重新输入新指令后，续接能力自动恢复；
- 我们自己注入的 `[CodeScript]` 不被误判为重入。

---

## 7. 测试计划

新增 `test/opencode-plugin/continuation/`：

1. **`messages-util.test.ts`**（纯函数，无需 mock）：
   - `isLastAssistantMessageAborted`：最后一条 assistant 带/不带 `MessageAbortedError`、空列表、无 assistant。
   - `normalizeSDKResponse`：`{data:[]}`、`[]`、异常输入。
   - `findLastGenuineUserMessage`：跳过 `[CodeSpec]` 注入、返回最后一条真实 user。
   - `hasGenuineReengagement`：`created > stoppedAt` 成立/不成立、无真实 user、`stoppedAt` 缺省。
2. **`abort-stop.test.ts`**（用 mock `ctx.client` 覆盖状态机）：
   - abort 后 `stoppedByUser=true`，idle 不注入；
   - abort 后用户重入（新 user 消息 `created > stoppedAt`），`stoppedByUser` 解除，idle 恢复注入；
   - abort 后无重入（仅旧 user 消息），保持叫停；
   - idle 瞬间错误未落库但 `session.error` 已设 `stoppedByUser`：不误判为重入；
   - `injectContinuation` 注入前复查命中 abort：置 `stoppedByUser` 且不注入；
   - 取消息失败：idle 与 inject 均 `return` 不注入。

> 注意：仓库存在预存在失败 `test/core/init.test.ts(34)` 与 `skill-generation`，跑测试时勿误判为本次引入。

---

## 8. 风险与回滚

- **风险**：重入判定依赖 `info.time.created` 与 `[CodeSpec]` 文本签名。`CONTINUATION_PROMPT` 已以 `INJECTION_SIGNATURE` 拼接（按构造一致），二者不会漂移；若改 `HOOK_NAME`，签名与提示词前缀同步变化。
- **风险**：极少数非用户发起的 assistant 消息（如 compaction autocontinue）可能被视作"重入"而解除叫停——可接受（系统主动续接时解除叫停符合预期）。
- **回滚**：改动集中在 `continuation/` 模块内，回滚该模块至本次提交前即可恢复原行为。