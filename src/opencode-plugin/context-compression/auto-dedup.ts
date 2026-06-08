import type { CompressionState, WithParts } from "./types.js";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEBUG_LOG = join(tmpdir(), "codespec-debug.log");
function debugLog(msg: string): void {
  try {
    const ts = new Date().toISOString();
    writeFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`, { flag: "a" });
  } catch {
    // file logging failed, silently ignore
  }
}

/** 受保护工具 — 不去重（read 允许去重，连续读取同一文件是冗余的） */
const PROTECTED_TOOLS = new Set([
  "question",
  "task",
  "skill",
  "todowrite",
]);

const DEDUP_MARKER = "[Output removed - duplicate of later call]";

/**
 * 自动去重：连续相同的工具调用仅保留最后一次，之前的输出替换为标记。
 *
 * 规则：
 * - 签名 = toolName + 归一化参数 JSON
 * - 仅去重"连续"的相同调用（中间有其他工具调用则不去重）
 * - 仅处理 status === "completed" 的调用
 * - 受保护工具（question/task/skill/todowrite）不去重；read 允许去重
 */
export function applyAutoDedup(
  state: CompressionState,
  messages: WithParts[],
): void {
  if (!state.isPlanSession) return;

  let prevSignature: string | null = null;
  let prevCallID: string | null = null;
  const dupCallIDs = new Set<string>();

  // 第一遍：找出连续的重复调用
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type !== "tool") continue;
      if (!part.callID) continue;
      if (state.prunedToolCallIds.has(part.callID)) continue;

      const toolName = part.tool ?? "";
      if (PROTECTED_TOOLS.has(toolName)) {
        // 受保护工具打断连续性
        prevSignature = null;
        prevCallID = null;
        continue;
      }

      if (part.state?.status !== "completed") {
        // 非完成状态打断连续性
        prevSignature = null;
        prevCallID = null;
        continue;
      }

      const entry = state.toolCache.get(part.callID);
      if (!entry) {
        prevSignature = null;
        prevCallID = null;
        continue;
      }

      if (prevSignature !== null && entry.signature === prevSignature) {
        // 连续重复：标记前一个为重复
        dupCallIDs.add(prevCallID!);
        debugLog(
          `auto-dedup: duplicate callID=${prevCallID} (sig=${prevSignature.slice(0, 60)})`,
        );
      }

      prevSignature = entry.signature;
      prevCallID = entry.callID;
    }
  }

  // 第二遍：替换被标记的调用的输出
  if (dupCallIDs.size === 0) {
    debugLog("auto-dedup: no duplicates found");
    return;
  }

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type !== "tool") continue;
      if (!part.callID) continue;
      if (!dupCallIDs.has(part.callID)) continue;

      if (part.state?.status === "completed") {
        part.state.output = DEDUP_MARKER;
        state.prunedToolCallIds.add(part.callID);
      }
    }
  }

  debugLog(`auto-dedup: pruned ${dupCallIDs.size} duplicate calls`);
}
