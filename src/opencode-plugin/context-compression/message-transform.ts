import type { WithParts } from "./types.js";
import type { CompressionStateStore } from "./compression-state-store.js";
import { injectNudge } from "./nudge.js";
import { createSyntheticUserMessage } from "./message-utils.js";

export function createMessagesTransformHandler(
  compressionStateStore: CompressionStateStore,
) {
  return async (input: Record<string, unknown>, output: { messages: WithParts[] }) => {
    const messages = output.messages;

    if (!Array.isArray(messages) || messages.length === 0) return;

    // Extract sessionID from the first message
    const sessionID = messages[0]?.info?.sessionID || 'default-session';
    const state = compressionStateStore.getState(sessionID);

    injectNudge(state, messages);
    replaceCompressedMessages(state, messages);
  };
}

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