/** 任务边界记录 */
export interface TaskBoundary {
  taskId: string;
  description: string;
  startMessageId: string;
  endMessageId: string;
  completedAt: number;
  compressed: boolean;
}

/** 压缩块 */
export interface TaskCompressionBlock {
  taskId: string;
  summary: string;
  startMessageId: string;
  endMessageId: string;
  compressedAt: number;
  messageIds: string[];
}

export type ApplyCommand = "apply";

/** 压缩状态（per-session） */
export interface CompressionState {
  taskBoundaries: Map<string, TaskBoundary>;
  compressionBlocks: Map<string, TaskCompressionBlock>;
  completedOrder: string[];
  /** Maps todo content hash → last known status */
  lastTodoSnapshot: Map<string, string>;
  /** Maps todo content hash → messageId where it first became in_progress */
  inProgressStart: Map<string, string>;
  nudgeInjectedForTask: string | null;
  /** Whether this session is a /codespec/apply session (detected via APPLY_MARKER) */
  isApplySession: boolean;
  /** Whether this apply session uses main-agent-development (speed-first mode) */
  isMainAgentMode: boolean;
  /** Apply command detected for this session, if any */
  applyCommand: ApplyCommand | null;
  /** Number of recently completed tasks to keep uncompressed (default: 1) */
  keepRecentTasks: number;
  /** Per-command keepRecentTasks settings captured when the session state is created */
  keepRecentTasksByCommand: Record<ApplyCommand, number>;
  /** Whether this session is a /codespec/plan session (detected via PLAN_MARKER) */
  isPlanSession: boolean;
  /** Cache of all tool call metadata keyed by callID */
  toolCache: Map<string, ToolCallEntry>;
  /** Set of callIDs that have been pruned (dedup or age) */
  prunedToolCallIds: Set<string>;
  /** Current message turn index (incremented per user-assistant exchange) */
  messageTurnIndex: number;
}

/** WithParts — 消息结构，与 OpenCode SDK 对齐 */
export interface WithParts {
  info: {
    id: string;
    sessionID: string;
    role: string;
    time: { created: number };
  };
  parts: Array<{
    type: string;
    text?: string;
    callID?: string;
    tool?: string;
    state?: {
      status: string;
      output?: string;
      input?: unknown;
    };
    id?: string;
    sessionID?: string;
    messageID?: string;
  }>;
}

/** parseTodosFromInput 的输出 */
export interface ParsedTodo {
  id: string;
  content: string;
  status: string;
}

/** 单个工具调用的元数据，以 callID 为 key */
export interface ToolCallEntry {
  callID: string;
  toolName: string;
  parameters: Record<string, unknown>;
  status: string;
  messageIndex: number;
  turnIndex: number;
  signature: string;
  outputTokenEstimate: number;
}
