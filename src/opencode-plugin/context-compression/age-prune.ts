import type { CompressionState, WithParts } from "./types.js";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

const DEBUG_LOG = join(tmpdir(), "codespec-debug.log");
function debugLog(msg: string): void {
  try {
    const ts = new Date().toISOString();
    writeFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`, { flag: "a" });
  } catch {
    // file logging failed, silently ignore
  }
}

const ACTIVE_WINDOW_TURNS = 8;

/** 受保护工具 — 永不裁剪 */
const PROTECTED_TOOLS = new Set([
  "question",
  "task",
  "skill",
  "todowrite",
  "read",
]);

/** 受保护文件 — 对这些文件的 Read 永不裁剪 */
const PROTECTED_FILES = new Set([
  "spec.md",
  "design.md",
  "task.md",
]);

/**
 * 年龄裁剪：超过活跃窗口（8 turns）的已完成工具调用，输出替换为简短标记。
 *
 * 规则：
 * - turnIndex <= (messageTurnIndex - 8) 的调用被裁剪
 * - errored 状态保留
 * - 受保护工具不裁剪
 * - 受保护文件的 Read 不裁剪
 */
export function applyAgePrune(
  state: CompressionState,
  messages: WithParts[],
): void {
  if (!state.isPlanSession) return;

  // 会话不足 8 轮则跳过
  if (state.messageTurnIndex <= ACTIVE_WINDOW_TURNS) {
    debugLog(
      `age-prune: skipping (turnIndex=${state.messageTurnIndex} <= ${ACTIVE_WINDOW_TURNS})`,
    );
    return;
  }

  const ageThreshold = state.messageTurnIndex - ACTIVE_WINDOW_TURNS;
  let prunedCount = 0;

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type !== "tool") continue;
      if (!part.callID) continue;
      if (state.prunedToolCallIds.has(part.callID)) continue;

      const toolName = part.tool ?? "";
      if (PROTECTED_TOOLS.has(toolName)) continue;

      const status = part.state?.status ?? "";
      if (status === "error" || status === "errored") continue;
      if (status !== "completed") continue;

      const entry = state.toolCache.get(part.callID);
      if (!entry) continue;
      if (entry.turnIndex > ageThreshold) continue;

      // 受保护文件检查 (仅对 Read 工具)
      if (toolName === "read") {
        const filePath = getFilePath(part.state?.input);
        if (filePath && isProtectedFile(filePath)) {
          debugLog(
            `age-prune: skipping protected file ${filePath}`,
          );
          continue;
        }
      }

      // 生成标记文本
      const marker = buildAgeMarker(toolName, part.state?.input, part.state?.output);
      if (part.state) {
        part.state.output = marker;
      }
      state.prunedToolCallIds.add(part.callID);
      prunedCount++;
    }
  }

  debugLog(
    `age-prune: pruned ${prunedCount} old tool outputs (threshold=${ageThreshold})`,
  );
}

function getFilePath(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.filePath === "string") return obj.filePath;
  if (typeof obj.file_path === "string") return obj.file_path;
  return null;
}

function isProtectedFile(filePath: string): boolean {
  const name = basename(filePath).toLowerCase();
  return PROTECTED_FILES.has(name);
}

function buildAgeMarker(
  toolName: string,
  input: unknown,
  output?: string,
): string {
  const inputObj = (input as Record<string, unknown>) ?? {};

  switch (toolName) {
    case "read": {
      const fp = getFilePath(inputObj) ?? "unknown";
      return `[Read: ${fp} — output pruned (age > 8 turns)]`;
    }
    case "grep": {
      const pattern = String(inputObj.pattern ?? "");
      const matchCount = countNonEmptyLines(output);
      return `[Grep: "${pattern}" — found ${matchCount} matches — output pruned]`;
    }
    case "glob": {
      const pattern = String(inputObj.pattern ?? "");
      const fileCount = countNonEmptyLines(output);
      return `[Glob: "${pattern}" — found ${fileCount} files — output pruned]`;
    }
    case "bash": {
      const cmd = String(inputObj.command ?? "");
      const truncated = cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
      return `[Bash: ${truncated} — output pruned]`;
    }
    default:
      return `[${toolName}: output pruned]`;
  }
}

function countNonEmptyLines(text?: string): number {
  if (!text) return 0;
  return text.split("\n").filter(line => line.trim().length > 0).length;
}
