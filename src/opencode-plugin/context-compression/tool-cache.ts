import type { CompressionState, ToolCallEntry, WithParts } from "./types.js";
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

/**
 * 归一化参数对象：过滤 undefined 值，按 key 排序。
 * 确保相同的参数语义产生相同的 JSON 字符串。
 */
function normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sortedKeys = Object.keys(params)
    .filter(k => params[k] !== undefined)
    .sort();
  const normalized: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    normalized[key] = params[key];
  }
  return normalized;
}

/** 计算工具调用的签名：toolName + 归一化参数的 JSON */
export function computeSignature(
  toolName: string,
  params: Record<string, unknown>,
): string {
  return `${toolName}:${JSON.stringify(normalizeParams(params))}`;
}

/** 估算文本的 token 数（粗略 4 字符/token） */
function estimateTokenCount(output?: string): number {
  if (!output) return 0;
  return Math.ceil(output.length / 4);
}

/**
 * 同步工具调用缓存 — 扫描所有 messages 建立 ToolCallEntry 索引。
 * 每次 messages.transform 触发时重新全量构建。
 */
export function syncToolCache(
  state: CompressionState,
  messages: WithParts[],
): void {
  state.toolCache.clear();

  let currentTurn = 0;

  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const msg = messages[msgIdx];

    // 遇到 assistant 消息 = 新的一轮 LLM 处理
    if (msg.info.role === "assistant") {
      currentTurn++;
    }

    for (const part of msg.parts) {
      if (part.type !== "tool") continue;
      if (!part.callID) continue;

      const toolName = part.tool ?? "unknown";
      const status = part.state?.status ?? "unknown";
      const parameters =
        (part.state?.input as Record<string, unknown>) ?? {};

      const entry: ToolCallEntry = {
        callID: part.callID,
        toolName,
        parameters,
        status,
        messageIndex: msgIdx,
        turnIndex: currentTurn,
        signature: computeSignature(toolName, parameters),
        outputTokenEstimate: estimateTokenCount(part.state?.output),
      };

      state.toolCache.set(part.callID, entry);
    }
  }

  state.messageTurnIndex = currentTurn;
  debugLog(
    `syncToolCache: ${state.toolCache.size} tool entries, turnIndex=${currentTurn}`,
  );
}
