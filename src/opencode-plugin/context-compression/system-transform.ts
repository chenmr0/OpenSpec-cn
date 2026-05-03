import type { CompressionStateStore } from "./compression-state-store.js";

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