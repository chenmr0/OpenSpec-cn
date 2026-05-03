import type { CompressionState } from "./types.js";
import type { CompressionStateStore } from "./compression-state-store.js";

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

export function createTaskCompressTool(compressionStateStore: CompressionStateStore) {
  return {
    description:
      "为已完成的任务生成压缩摘要。当看到 <codespec-system-reminder> 中的压缩提示时使用此工具。" +
      "摘要将替换该任务的完整对话上下文，以节省 token 空间。",
    args: {
      taskId: { type: "string" as const, description: "要压缩的任务 ID" },
      summary: { type: "string" as const, description: "任务的简洁摘要，包含：做了什么、修改了哪些文件、审查结论" },
      modifiedFiles: { type: "array" as const, items: { type: "string" as const }, description: "该任务修改或创建的文件路径列表" },
    },
    async execute(args: { taskId: string; summary: string; modifiedFiles: string[] }) {
      const state = compressionStateStore.getState('default-session');
      return handleTaskCompress(state, args.taskId, args.summary, args.modifiedFiles);
    },
  };
}