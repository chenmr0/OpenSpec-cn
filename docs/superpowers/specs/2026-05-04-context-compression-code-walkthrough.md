# CodeSpec 上下文压缩模块源码详解

## 1. 要解决的问题

在使用 `/apply` 执行 SubagentDD（子代理驱动开发）时，主 agent 需要协调 10+ 个任务。每个任务完成后，它的完整过程（子代理输出、审查结果、工具调用）会永久占据上下文窗口。到第 6 个任务时，上下文窗口已被大量不再需要的已完成任务历史占满，触发 OpenCode 自带的暴力压缩，导致后续任务执行紊乱。

**核心矛盾：** 已完成任务的详细执行过程（约 2000-6000 tokens/任务）在后续任务中不需要，但它们占据了宝贵的上下文空间。

**解决思路：** 在主 agent 仍然"清醒"时（即上下文还没爆掉之前），主动引导它为已完成的任务生成简洁摘要，然后用摘要替换原始对话历史，释放 token 空间。

## 2. 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    OpenCode Runtime                  │
│                                                     │
│  event hook  ──→  trackTaskBoundary()               │
│                     记录每个任务的消息边界             │
│                           │                         │
│  messages.transform  ──→  injectNudge()             │
│  (每次 LLM 调用前)        注入压缩提示给主 agent      │
│                           │                         │
│                     replaceCompressedMessages()      │
│                     用摘要替换已压缩的消息段           │
│                                                     │
│  system.transform  ──→  注入 task-compress 工具说明   │
│                                                     │
│  主 agent 调用 task-compress tool                    │
│  ──→  handleTaskCompress()  存储摘要，标记已压缩      │
└─────────────────────────────────────────────────────┘
```

**四个 OpenCode 插件 Hook 协同工作：**

| Hook | 触发时机 | 职责 |
|------|---------|------|
| `event` | 每个事件发生时 | 监听 TodoWrite/TaskUpdate 调用完成，记录任务消息边界 |
| `experimental.chat.messages.transform` | 每次 LLM 调用前 | 注入 nudge 提示 + 替换已压缩消息段 |
| `experimental.chat.system.transform` | 每次 LLM 调用前 | 向 system prompt 追加压缩工具使用说明 |
| `tool.task-compress` | 主 agent 主动调用时 | 接收摘要数据，存储到压缩状态 |

## 3. 文件结构

```
src/opencode-plugin/context-compression/
├── types.ts                    # 所有数据类型定义
├── compression-state-store.ts  # 会话级状态管理
├── task-boundary.ts            # 任务边界检测与记录
├── nudge.ts                    # 压缩提示（nudge）生成与注入
├── message-utils.ts            # 消息操作工具函数
├── message-transform.ts        # messages.transform hook
├── system-transform.ts         # system.transform hook
└── task-compress-tool.ts       # task-compress tool 处理逻辑
```

## 4. 逐文件详解

---

### 4.1 `types.ts` — 数据模型

这个文件定义了整个模块使用的数据结构，是理解后续所有代码的基础。

```typescript
/** 任务边界记录 */
export interface TaskBoundary {
  taskId: string;
  description: string;
  startMessageId: string;   // 任务对话开始的消息 ID
  endMessageId: string;     // 任务完成时（TodoWrite 标记 completed）的消息 ID
  completedAt: number;
  compressed: boolean;       // 是否已被压缩
}
```

**设计意图：** 每个 `TaskBoundary` 描述了消息流中一段连续区间的起止位置。`startMessageId` 和 `endMessageId` 界定了该任务的对话历史在消息数组中的范围——这段范围内的所有消息在压缩时会被替换为一条摘要。

```typescript
/** 压缩块 */
export interface TaskCompressionBlock {
  taskId: string;
  summary: string;            // 主 agent 生成的摘要文本
  modifiedFiles: string[];    // 该任务修改的文件列表
  startMessageId: string;
  endMessageId: string;
  compressedAt: number;
  messageIds: string[];       // 被替换掉的消息 ID 列表
}
```

**设计意图：** 当主 agent 调用 `task-compress` 工具时，它提供的摘要内容被存入 `TaskCompressionBlock`。后续 `messages.transform` 会根据 `startMessageId`/`endMessageId` 在消息数组中定位对应的消息段，用一条合成消息替换它们。`messageIds` 在替换时填充，记录被替换掉的具体消息 ID。

```typescript
/** 压缩状态（per-session） */
export interface CompressionState {
  taskBoundaries: Map<string, TaskBoundary>;       // taskId → 边界
  compressionBlocks: Map<string, TaskCompressionBlock>;  // taskId → 压缩块
  completedOrder: string[];                         // 按完成时间排列的 taskId
  lastTodoSnapshot: Map<string, string>;            // taskId → 上一次看到的状态
  nudgeInjectedForTask: string | null;              // 当前 nudge 针对的任务
}
```

**各字段的作用：**

- `taskBoundaries`：记录每个已完成任务在消息流中的位置。由 `trackTaskBoundary()` 填充。
- `compressionBlocks`：记录每个已压缩任务的摘要信息。由 `handleTaskCompress()` 填充。
- `completedOrder`：一个有序数组，记录任务完成的先后顺序。这是实现"渐进式压缩"的关键——我们总是压缩最早完成的任务，保留最近 2 个任务的原始上下文。
- `lastTodoSnapshot`：上一次处理 TodoWrite 输入时每个任务的状态快照。用于**增量检测**——通过对比当前状态和快照，识别哪些任务的状态发生了变化（例如从 `in_progress` 变为 `completed`）。
- `nudgeInjectedForTask`：防止重复注入 nudge。一旦为某个任务注入了 nudge，在主 agent 响应（调用 task-compress）之前，不会再次注入。

```typescript
/** WithParts — 消息结构，与 OpenCode SDK 对齐 */
export interface WithParts {
  info: {
    id: string;
    sessionID: string;
    role: string;              // "user" | "assistant" | "system"
    time: { created: number };
  };
  parts: Array<{
    type: string;              // "text" | "tool"
    text?: string;             // type === "text" 时存在
    callID?: string;
    tool?: string;             // type === "tool" 时存在，如 "TodoWrite"
    state?: {
      status: string;          // 工具调用状态，如 "completed"
      output?: string;
      input?: unknown;         // 工具调用参数
    };
    id?: string;
    sessionID?: string;
    messageID?: string;
  }>;
}
```

**设计意图：** 这是 OpenCode 内部的消息表示格式。每条消息（`WithParts`）由 `info`（元信息）和 `parts`（内容部分数组）组成。一个 `part` 可以是一段文本（`type: "text"`），也可以是一个工具调用（`type: "tool"`）。`messages.transform` hook 接收和操作的就是 `WithParts[]` 数组。

```typescript
export interface ParsedTodo {
  id: string;
  content: string;
  status: string;
}
```

这是从 TodoWrite/TaskUpdate 工具调用的 input 中解析出的任务条目。

---

### 4.2 `compression-state-store.ts` — 会话状态管理

```typescript
export interface CompressionStateStore {
  getState: (sessionID: string) => CompressionState;
  getExistingState: (sessionID: string) => CompressionState | undefined;
  cleanup: (sessionID: string) => void;
}

export function createCompressionStateStore(): CompressionStateStore {
  const sessions = new Map<string, CompressionState>();

  return {
    getState(sessionID: string): CompressionState {
      let state = sessions.get(sessionID);
      if (!state) {
        state = {
          taskBoundaries: new Map(),
          compressionBlocks: new Map(),
          completedOrder: [],
          lastTodoSnapshot: new Map(),
          nudgeInjectedForTask: null,
        };
        sessions.set(sessionID, state);
      }
      return state;
    },
    // ...
  };
}
```

**为什么需要 Store？** OpenCode 支持多个并发会话（session），每个会话有独立的任务列表和压缩状态。`CompressionStateStore` 用一个 `Map<sessionID, CompressionState>` 管理 per-session 状态，与项目中已有的 `SessionStateStore`（续命 enforcer 使用）保持一致的设计模式。

**懒初始化：** `getState()` 首次为某个 sessionID 调用时自动创建空状态，调用方不需要关心初始化逻辑。

**`getExistingState()`** 返回 `undefined` 而非自动创建，用于需要判断"该会话是否已有状态"的场景。

**`cleanup()`** 在会话结束时调用，释放内存。

---

### 4.3 `task-boundary.ts` — 任务边界检测

这个文件负责从 OpenCode 事件流中识别"任务完成"这一关键时刻，并记录它在消息流中的位置。

#### `parseTodosFromInput(input)` — 解析 TodoWrite 输入

```typescript
export function parseTodosFromInput(input: unknown): ParsedTodo[] {
  let parsed = input;
  if (typeof input === "string") {
    try { parsed = JSON.parse(input); } catch { return []; }
  }

  const todos = Array.isArray(parsed) ? parsed : (parsed as any)?.todos;
  if (!Array.isArray(todos)) {
    // 处理 TaskUpdate 的单对象格式
    if (parsed && typeof parsed === 'object' && typeof (parsed as any).id === 'string') {
      return [{
        id: (parsed as any).id,
        content: (parsed as any).content ?? (parsed as any).subject ?? '',
        status: (parsed as any).status,
      }];
    }
    return [];
  }

  return todos
    .filter((t: any) => t && typeof t.id === "string" && typeof t.status === "string")
    .map((t: any) => ({
      id: t.id,
      content: t.content ?? t.subject ?? "",
      status: t.status,
    }));
}
```

**输入格式的多样性：** TodoWrite 和 TaskUpdate 是两个不同的工具，它们的 input 格式不同：

- **TodoWrite** 的 input 通常是一个对象 `{ todos: [{ id, content, status }, ...] }`，其中 `todos` 是任务数组。但也可能是 JSON 字符串。
- **TaskUpdate** 的 input 是单个对象 `{ id, status }`，不含 `todos` 数组。

**防御性解析策略：**
1. 如果 input 是字符串，尝试 JSON.parse
2. 如果解析结果是数组，直接使用
3. 如果解析结果是对象且有 `todos` 属性，使用 `todos` 数组（TodoWrite 格式）
4. 如果都没有但对象本身有 `id` 和 `status`，当作单条任务处理（TaskUpdate 格式）
5. 过滤掉缺少必要字段（`id`, `status`）的条目
6. 兼容 `content` 和 `subject` 两种命名（Claude Code 用 `content`，OpenCode SDK 用 `subject`）

#### `trackTaskBoundary(args)` — 检测任务完成并记录边界

```typescript
export function trackTaskBoundary(args: {
  eventType: string;
  properties: Record<string, unknown> | undefined;
  compressionState: CompressionState;
}): void {
  if (args.eventType !== "message.part.updated") return;

  const part = args.properties?.part as Record<string, unknown> | undefined;
  if (!part || part.type !== "tool") return;
  if (part.tool !== "TodoWrite" && part.tool !== "TaskUpdate") return;

  const state = (part as any).state;
  if (!state || state.status !== "completed") return;

  const input = state.input;
  if (!input) return;

  const messageId = (part as any).messageID as string;
  if (typeof messageId !== "string") return;

  const todos = parseTodosFromInput(input);

  for (const todo of todos) {
    const previousStatus = args.compressionState.lastTodoSnapshot.get(todo.id);
    if (previousStatus === todo.status) continue;

    if (todo.status === "completed" && previousStatus !== "completed") {
      const previousCompleted = args.compressionState.completedOrder;
      const startMessageId = previousCompleted.length > 0
        ? args.compressionState.taskBoundaries.get(
            previousCompleted[previousCompleted.length - 1]
          )!.endMessageId
        : messageId;

      args.compressionState.taskBoundaries.set(todo.id, {
        taskId: todo.id,
        description: todo.content,
        startMessageId,
        endMessageId: messageId,
        completedAt: Date.now(),
        compressed: false,
      });
      args.compressionState.completedOrder.push(todo.id);
    }

    args.compressionState.lastTodoSnapshot.set(todo.id, todo.status);
  }
}
```

**事件过滤链（四层过滤）：**

```
message.part.updated          ← 只要工具调用更新事件
  → part.type === "tool"     ← 只要工具类型的 part
    → part.tool 是 TodoWrite 或 TaskUpdate  ← 只关心任务状态变更
      → state.status === "completed"        ← 只要调用完成时
```

**增量检测：** 通过 `lastTodoSnapshot` 对比，只处理状态**发生变化**的任务。`previousStatus === todo.status` 表示该任务的状态没变，跳过。只有当 `todo.status === "completed"` 且之前不是 completed 时，才记录新边界。

**边界的起止计算：**

```
任务1: startMessageId = endMessageId（第一个任务，起始 = 终止）
任务2: startMessageId = 任务1的 endMessageId
任务3: startMessageId = 任务2的 endMessageId
...
```

每个任务的 `startMessageId` = 前一个已完成任务的 `endMessageId`。这样，所有任务的区间首尾相接，覆盖了从第一个任务到最后一个任务的完整消息流。在压缩时，`[startMessageId, endMessageId]` 之间的所有消息会被替换。

**时序示意：**

```
消息流: [msg_0, msg_1, msg_2, msg_3, msg_4, msg_5, msg_6, ...]
                  ↑               ↑               ↑
               任务1完成        任务2完成        任务3完成
           end=t1_msg        end=t2_msg        end=t3_msg

任务1边界: [t1_msg, t1_msg]
任务2边界: [t1_msg, t2_msg]    ← 起始 = 任务1的终止
任务3边界: [t2_msg, t3_msg]    ← 起始 = 任务2的终止

压缩任务1时，消息流中从 t1_msg 到 t1_msg 的消息被摘要替换
压缩任务2时，消息流中从 t1_msg 到 t2_msg 的消息被摘要替换
```

---

### 4.4 `message-utils.ts` — 消息操作工具

三个纯函数，供 `nudge.ts` 和 `message-transform.ts` 调用。

#### `createSyntheticUserMessage(baseMessage, content, seed)` — 创建合成消息

```typescript
export function createSyntheticUserMessage(
  baseMessage: WithParts,
  content: string,
  seed: string,
): WithParts {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  const messageId = `msg_codespec_${hash}`;
  const partId = `prt_codespec_${hash}`;
  const sessionId = baseMessage.info.sessionID;

  return {
    info: {
      id: messageId,
      sessionID: sessionId,
      role: "user",
      time: { created: Date.now() },
    },
    parts: [{
      id: partId,
      sessionID: sessionId,
      messageID: messageId,
      type: "text",
      text: content,
    }],
  };
}
```

**为什么需要合成消息？** 压缩发生时，`messages.transform` 需要用一条消息替换一整段消息（可能 10-20 条）。这条替换消息必须是合法的 `WithParts` 结构，这样 OpenCode 的消息处理管线才能正常工作。

**确定性 ID 生成：** 使用 `SHA256(seed)` 生成消息和 part 的 ID。seed 是 `"codespec_compress_${taskId}"`，这保证了：
- 同一个任务总是生成相同的 ID
- 不同任务生成不同的 ID
- 即使 OpenCode 重新处理消息，ID 也不会变化

**从 baseMessage 继承 sessionID：** 合成消息必须属于同一个会话，所以从被替换区域附近的消息复制 `sessionID`。

**角色设为 "user"：** 摘要以用户消息的形式出现，这样 LLM 会把它当作既定事实来接受，而不是系统指令。

#### `appendToLastTextPart(message, text)` — 向消息追加文本

```typescript
export function appendToLastTextPart(message: WithParts, text: string): boolean {
  for (let i = message.parts.length - 1; i >= 0; i--) {
    if (message.parts[i].type === "text" && message.parts[i].text !== undefined) {
      message.parts[i].text = message.parts[i].text!.replace(/\n*$/, "") + "\n\n" + text;
      return true;
    }
  }
  return false;
}
```

**用途：** 将 nudge 文本注入到 assistant 消息的最后一个 text part 末尾。从后往前遍历，找到第一个有 `text` 内容的 part，先去掉末尾换行，再加两个换行和 nudge 文本。返回 `false` 表示没有找到合适的 text part（理论上不应该发生）。

#### `findLastAssistantMessage(messages)` — 找到最后一条 assistant 消息

```typescript
export function findLastAssistantMessage(messages: WithParts[]): WithParts | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "assistant") return messages[i];
  }
  return null;
}
```

**用途：** nudge 注入的目标。nudge 被追加到最后一条 assistant 消息末尾，这样它看起来像是 assistant 之前输出的一部分（但被 `<codespec-system-reminder>` 标签包裹），引导主 agent 在继续工作之前先处理压缩请求。

---

### 4.5 `nudge.ts` — 压缩提示注入

nudge 机制是整个压缩系统的"驱动力"——它让主 agent 意识到需要压缩，并引导它调用 `task-compress` 工具。

```typescript
const TASK_COMPRESS_NUDGE = `<codespec-system-reminder>
上下文管理：已完成任务的对话历史可以压缩以节省上下文空间。

请使用 \`task-compress\` tool 为以下已完成的任务生成摘要：
{taskList}

摘要要求：
- 一句话描述任务做了什么
- 列出修改的文件
- 包含审查结论

在继续下一个任务之前完成压缩。
</codespec-system-reminder>`;
```

**nudge 文本模板：** 使用 `<codespec-system-reminder>` 标签包裹，这个标签与 DCP（Dynamic Context Pruning）的 `<dcp-system-reminder>` 不冲突。`{taskList}` 是占位符，运行时被替换为具体任务列表。

#### `injectNudge(compressionState, messages)` — 核心注入逻辑

```typescript
export function injectNudge(
  compressionState: CompressionState,
  messages: WithParts[],
): void {
  if (compressionState.nudgeInjectedForTask) return;  // ① 防重复

  const candidate = getCompressibleTask(compressionState);
  if (!candidate) return;                              // ② 没有可压缩的任务

  const compressibleTasks = getAllCompressibleTasks(compressionState);
  if (compressibleTasks.length === 0) return;

  const taskList = compressibleTasks
    .map(t => `- 任务 ${t.taskId}: ${t.description}`)
    .join("\n");
  const nudgeText = TASK_COMPRESS_NUDGE.replace("{taskList}", taskList);

  const lastAssistant = findLastAssistantMessage(messages);
  if (!lastAssistant) return;

  appendToLastTextPart(lastAssistant, nudgeText);      // ③ 注入到最后一条 assistant 消息
  compressionState.nudgeInjectedForTask = candidate.taskId;  // ④ 标记已注入
}
```

**执行流程：**

1. **防重复** — 如果 `nudgeInjectedForTask` 非空，说明已经注入了 nudge 但主 agent 还没响应。不重复注入，避免干扰。
2. **检查可压缩任务** — 调用 `getCompressibleTask()` 判断是否有需要压缩的任务。
3. **注入** — 将 nudge 文本追加到最后一条 assistant 消息的末尾。
4. **标记** — 记录当前 nudge 针对的任务 ID。直到主 agent 调用 `task-compress` 后才清除。

#### `getCompressibleTask(state)` — 渐进式压缩的滑动窗口

```typescript
function getCompressibleTask(state: CompressionState): TaskBoundary | null {
  const { completedOrder, taskBoundaries } = state;
  const compressibleIndex = completedOrder.length - 3;
  if (compressibleIndex < 0) return null;

  const candidateId = completedOrder[compressibleIndex];
  const boundary = taskBoundaries.get(candidateId);
  if (!boundary || boundary.compressed) return null;

  return boundary;
}
```

**"保留最近 2 个"的滑动窗口策略：**

```
completedOrder: [t1, t2, t3, t4, t5, t6]

length = 6
compressibleIndex = 6 - 3 = 3  →  completedOrder[3] = t4

这意味着 t1, t2, t3, t4 都在"可压缩窗口"内
t5, t6 是最近 2 个，保留不动
```

当 `completedOrder.length` 为 0、1、2 时不触发任何压缩（`compressibleIndex < 0`）。当 length 为 3 时开始压缩第 0 个任务，当 length 为 4 时开始压缩第 1 个任务，以此类推。**始终保留最近 2 个已完成任务的完整上下文。**

#### `getAllCompressibleTasks(state)` — 批量获取可压缩任务

```typescript
function getAllCompressibleTasks(state: CompressionState): TaskBoundary[] {
  const { completedOrder, taskBoundaries } = state;
  const threshold = completedOrder.length - 2;
  return completedOrder
    .slice(0, threshold)
    .map(id => taskBoundaries.get(id)!)
    .filter(b => b && !b.compressed);
}
```

如果之前的主 agent 没有响应 nudge（可能跳过了压缩步骤），多个任务可能积压未压缩。这个函数返回**所有**在可压缩窗口内且未压缩的任务，一次性在 nudge 中列出，让主 agent 批量处理。

---

### 4.6 `message-transform.ts` — messages.transform Hook

这是整个压缩系统的"执行引擎"，在每次 LLM 调用之前被 OpenCode 调用。

```typescript
export function createMessagesTransformHandler(
  compressionStateStore: CompressionStateStore,
) {
  return async (input: Record<string, unknown>, output: { messages: WithParts[] }) => {
    const messages = output.messages;

    if (!Array.isArray(messages) || messages.length === 0) return;

    const sessionID = messages[0]?.info?.sessionID || 'default-session';
    const state = compressionStateStore.getState(sessionID);

    injectNudge(state, messages);                    // ① 注入 nudge
    replaceCompressedMessages(state, messages);      // ② 替换已压缩消息
  };
}
```

**两个职责，一次处理：**

1. **注入 nudge** — 检查是否需要引导主 agent 压缩。如果有可压缩的任务且还没注入过 nudge，就在消息中追加提示。
2. **替换已压缩消息** — 检查是否有已存储的压缩块（`compressionBlocks`），如果有，在消息数组中定位对应的消息段并替换为摘要。

**sessionID 的获取：** `messages.transform` hook 的 `input` 参数不包含 sessionID，所以从消息数组的第一条消息的 `info.sessionID` 提取。如果消息为空或缺少 sessionID，使用 `'default-session'` 作为后备。

#### `replaceCompressedMessages(state, messages)` — 核心替换逻辑

```typescript
function replaceCompressedMessages(
  state: { compressionBlocks: Map<string, any> },
  messages: WithParts[],
): void {
  const blocks = Array.from(state.compressionBlocks.values())
    .map(block => ({
      block,
      startIndex: messages.findIndex(m => m.info.id === block.startMessageId),
      endIndex: messages.findIndex(m => m.info.id === block.endMessageId),
    }))
    .filter(({ startIndex, endIndex }) => startIndex !== -1 && endIndex !== -1)
    .sort((a, b) => b.startIndex - a.startIndex);

  for (const { block, startIndex, endIndex } of blocks) {
    block.messageIds = messages
      .slice(startIndex, endIndex + 1)
      .map(m => m.info.id);

    const summaryText = `[已完成任务摘要 - 上下文已压缩]\n${block.summary}\n修改文件：${block.modifiedFiles.length > 0 ? block.modifiedFiles.join(", ") : "无"}`;
    const summaryMessage = createSyntheticUserMessage(
      messages[Math.max(0, startIndex - 1)],
      summaryText,
      `codespec_compress_${block.taskId}`,
    );

    messages.splice(startIndex, endIndex - startIndex + 1, summaryMessage);
  }
}
```

**关键步骤：**

1. **定位压缩块** — 对每个压缩块，用 `findIndex` 在消息数组中找到 `startMessageId` 和 `endMessageId` 的位置。过滤掉找不到的（可能该段消息已经被其他 hook 移除）。

2. **按 startIndex 降序排列** — **这是防止索引偏移的关键。** 如果有多个压缩块需要替换，从后往前处理，这样前面的替换不会影响后面的索引。例如：

   ```
   消息数组: [A, B, C, D, E, F, G]
   压缩块1: 替换 B~C（index 1~2）
   压缩块2: 替换 E~F（index 4~5）

   从后往前：先替换 E~F → [A, B, C, D, SUMMARY2, G]
   再替换 B~C → [A, SUMMARY1, D, SUMMARY2, G]  ← 索引 1~2 没变

   如果从前往后：先替换 B~C → [A, SUMMARY1, D, E, F, G]
   原本 E 在 index 4，现在变成了 index 3 → 偏移了！
   ```

3. **记录被替换的消息 ID** — `block.messageIds` 记录了哪些消息被替换。这主要用于调试和审计。

4. **生成合成摘要消息** — 用 `createSyntheticUserMessage()` 创建一条 user 角色的合成消息，内容包含摘要文本和修改文件列表。`baseMessage` 取被替换段的前一条消息（`startIndex - 1`），确保 sessionID 正确。

5. **执行替换** — `messages.splice(startIndex, count, replacement)` 是原地操作，直接修改传入的 `messages` 数组。OpenCode 会使用修改后的消息数组进行 LLM 调用。

---

### 4.7 `system-transform.ts` — system.transform Hook

```typescript
export function createSystemTransformHandler(
  compressionStateStore: CompressionStateStore,
) {
  return async (
    input: { sessionID?: string },
    output: { system: string[] },
  ) => {
    const state = compressionStateStore.getState(input.sessionID || 'default');

    if (state.compressionBlocks.size === 0 && state.completedOrder.length < 3) return;

    const prompt = `[CodeSpec 上下文管理]
部分已完成任务的上下文会被压缩为摘要以节省 token。
当看到 <codespec-system-reminder> 中的压缩提示时，使用 task-compress tool 为指定任务生成摘要。
摘要应包含：任务描述、修改文件、审查结论。保持简洁。`;

    if (output.system.length > 0) {
      output.system[output.system.length - 1] += "\n\n" + prompt;
    } else {
      output.system.push(prompt);
    }
  };
}
```

**作用：** 向 LLM 的 system prompt 追加压缩工具的使用说明。这样主 agent 在看到 nudge 时知道 `task-compress` 工具的存在和用法。

**注入条件：** 只有当"已有压缩块"或"已完成任务数 ≥ 3"时才注入。避免在不需要压缩的场景（比如只有 1-2 个任务的短会话）中污染 system prompt。

**注入位置：** 追加到 `output.system` 数组的最后一个元素末尾。如果数组为空（理论上不应该），则新增一个元素。

---

### 4.8 `task-compress-tool.ts` — task-compress 工具

#### `handleTaskCompress(state, taskId, summary, modifiedFiles)` — 核心逻辑

```typescript
export function handleTaskCompress(
  state: CompressionState,
  taskId: string,
  summary: string,
  modifiedFiles: string[],
): string {
  const boundary = state.taskBoundaries.get(taskId);
  if (!boundary) {
    throw new Error(`任务 ${taskId} 不存在或未记录边界`);
  }
  if (boundary.compressed) {
    throw new Error(`任务 ${taskId} 已被压缩`);
  }

  boundary.compressed = true;

  state.compressionBlocks.set(taskId, {
    taskId,
    summary,
    modifiedFiles,
    startMessageId: boundary.startMessageId,
    endMessageId: boundary.endMessageId,
    compressedAt: Date.now(),
    messageIds: [],
  });

  state.nudgeInjectedForTask = null;

  return `已压缩任务 ${taskId}。摘要：${summary}`;
}
```

**执行流程：**

1. **验证** — 检查任务是否存在、是否已压缩。防止重复压缩和无效操作。
2. **标记边界为已压缩** — `boundary.compressed = true` 确保后续 `getCompressibleTask()` 不会再次返回此任务。
3. **创建压缩块** — 从边界复制 `startMessageId`/`endMessageId`，存入主 agent 提供的摘要和文件列表。`messageIds` 设为空数组，在 `replaceCompressedMessages()` 中填充。
4. **清除 nudge 标记** — `nudgeInjectedForTask = null` 允许为下一个待压缩任务注入新的 nudge。

#### `createTaskCompressTool(compressionStateStore)` — 工具注册

```typescript
export function createTaskCompressTool(compressionStateStore: CompressionStateStore) {
  return {
    description:
      "为已完成的任务生成压缩摘要。当看到 <codespec-system-reminder> 中的压缩提示时使用此工具。" +
      "摘要将替换该任务的完整对话上下文，以节省 token 空间。",
    args: {
      taskId: { type: "string" as const, description: "要压缩的任务 ID" },
      summary: { type: "string" as const, description: "..." },
      modifiedFiles: { type: "array" as const, items: { type: "string" as const }, description: "..." },
    },
    async execute(args: { taskId: string; summary: string; modifiedFiles: string[] }) {
      const state = compressionStateStore.getState('default-session');
      return handleTaskCompress(state, args.taskId, args.summary, args.modifiedFiles);
    },
  };
}
```

**工具注册为普通对象：** 没有使用 `@opencode-ai/plugin` 的 `tool()` 函数，而是返回一个符合 OpenCode 工具接口的普通对象。这样做的目的是方便测试——`handleTaskCompress()` 可以独立于工具注册框架进行单元测试。

**三个参数：**
- `taskId`：要压缩的任务 ID（从 nudge 文本中获取）
- `summary`：主 agent 生成的摘要文本
- `modifiedFiles`：该任务修改或创建的文件路径列表

---

### 4.9 `index.ts` 的变更 — 插件入口集成

```typescript
import { createCompressionStateStore } from ".../compression-state-store.js";
import { trackTaskBoundary } from ".../task-boundary.js";
import { createMessagesTransformHandler } from ".../message-transform.js";
import { createSystemTransformHandler } from ".../system-transform.js";
import { createTaskCompressTool } from ".../task-compress-tool.js";
```

**`createEventHandler` 的变更：**

```typescript
function createEventHandler(
  ctx: PluginInput,
  sessionStateStore: SessionStateStore,
  compressionStateStore: CompressionStateStore,    // 新增参数
) {
  return async ({ event }) => {
    const props = event.properties as Record<string, unknown> | undefined;

    // 新增：从事件中提取 sessionID 并追踪任务边界
    const sessionID = (props?.sessionID as string | undefined)
      ?? ((props?.info as Record<string, unknown>)?.sessionID as string | undefined);
    if (sessionID) {
      trackTaskBoundary({
        eventType: event.type,
        properties: props,
        compressionState: compressionStateStore.getState(sessionID),
      });
    }

    // 原有逻辑不变...
    if (event.type === "session.idle") { ... }
    handleNonIdleEvent({ ... });
  };
}
```

**sessionID 提取策略：** 不同的 OpenCode 事件把 sessionID 放在不同的位置。有些事件在 `props.sessionID`，有些在 `props.info.sessionID`。用 `??` 两种都尝试，确保不遗漏。

**重要设计决策：** `trackTaskBoundary` 在所有事件上运行（不只是 `session.idle`），因为任务完成事件发生在 agent 活跃期间。`session.idle` 只在 agent 变空闲时才触发，那时候任务边界已经确立了。

**`CodeSpecPlugin` 的变更：**

```typescript
const CodeSpecPlugin: Plugin = async (ctx) => {
  const sessionStateStore = createSessionStateStore();
  const compressionStateStore = createCompressionStateStore();   // 新增

  return {
    event: createEventHandler(ctx, sessionStateStore, compressionStateStore),

    // 新增：三个 compression hooks
    "experimental.chat.messages.transform":
      createMessagesTransformHandler(compressionStateStore) as any,
    "experimental.chat.system.transform":
      createSystemTransformHandler(compressionStateStore) as as any,

    tool: {
      "task-compress": createTaskCompressTool(compressionStateStore) as any,
    },
  };
};
```

**`as any` 类型断言：** OpenCode 的 `Hooks` 接口中 `experimental.chat.messages.transform` 和 `tool` 的类型声明是简化版，不完全匹配实际函数签名。用 `as any` 绕过 TypeScript 检查，运行时由 OpenCode 的 hook 系统保证类型安全。

---

## 5. 完整时序流程

以一个 5 个任务的 `/apply` 执行为例，展示整个压缩系统的工作时序：

```
时间轴 →

[T1 开始]
  主 agent 执行任务 1...
  TodoWrite 标记 T1 完成 → event hook 记录:
    taskBoundaries: { t1: { start: msg_5, end: msg_20 } }
    completedOrder: [t1]

[T2 开始]
  主 agent 执行任务 2...
  TodoWrite 标记 T2 完成 → event hook 记录:
    taskBoundaries: { t1: ..., t2: { start: msg_20, end: msg_35 } }
    completedOrder: [t1, t2]

[T3 开始]
  TodoWrite 标记 T3 完成 → event hook 记录:
    completedOrder: [t1, t2, t3]
    → compressibleIndex = 3 - 3 = 0 → t1 可压缩

  下次 messages.transform:
    ① injectNudge() → 在最后一条 assistant 消息末尾追加 nudge，列出 t1
    ② replaceCompressedMessages() → 无压缩块，跳过

  system.transform → 追加 "使用 task-compress tool" 说明

  主 agent 看到 nudge → 调用 task-compress(taskId="t1", summary="...", modifiedFiles=[...])
    → handleTaskCompress():
      t1.compressed = true
      compressionBlocks.set("t1", { start: msg_5, end: msg_20, summary: "..." })

  下次 messages.transform:
    ① injectNudge() → nudgeInjectedForTask 被清空，但 completedOrder.length - 3 = 0
       → t1 已 compressed，无可压缩任务 → 不注入
    ② replaceCompressedMessages() → 找到 t1 的压缩块
       → 消息 [msg_5 ... msg_20] 被替换为一条摘要消息
       → 释放约 15 条消息的空间

[T4 开始]
  TodoWrite 标记 T4 完成:
    completedOrder: [t1, t2, t3, t4]
    → compressibleIndex = 4 - 3 = 1 → t2 可压缩

  messages.transform:
    ① injectNudge() → 注入 nudge，列出 t2
    ② replaceCompressedMessages() → t1 的摘要已在消息中，无新压缩块

  主 agent 调用 task-compress(taskId="t2", ...)
    → t2 被压缩

  下次 messages.transform:
    → [msg_20 ... msg_35] 被替换为 t2 的摘要

[T5 开始]
  ... 依此类推
```

**关键特性：**

- **渐进式：** 始终保留最近 2 个任务的完整上下文，给主 agent 足够的工作空间
- **增量式：** 每完成一个新任务，检查是否有旧任务需要压缩
- **积压处理：** 如果主 agent 跳过了压缩步骤，积压的可压缩任务会在下次 nudge 中一并列出
- **非侵入式：** 所有操作通过 OpenCode 的 hook 系统实现，不修改 OpenCode 本身的代码
