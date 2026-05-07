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
  modifiedFiles: string[];
  startMessageId: string;
  endMessageId: string;
  compressedAt: number;
  messageIds: string[];
}

/** 压缩状态（per-session） */
export interface CompressionState {
  taskBoundaries: Map<string, TaskBoundary>;
  compressionBlocks: Map<string, TaskCompressionBlock>;
  completedOrder: string[];
  /** Maps todo content hash → last known status */
  lastTodoSnapshot: Map<string, string>;
  nudgeInjectedForTask: string | null;
  /** Whether this session is a /codespec/apply session (detected via APPLY_MARKER) */
  isApplySession: boolean;
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