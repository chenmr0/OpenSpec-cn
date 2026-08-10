/**
 * 消息探测共享工具：abort 检测与用户重入判定。
 * 供 idle-event.ts 与 continuation-injection.ts 复用，确保两处判定一致。
 */

import { INJECTION_SIGNATURE } from "./constants.js";

/**
 * 将 SDK 响应规整为数组，兼容 `{ data: [] }` 与 `[]` 两种形态。
 */
export function normalizeSDKResponse<T>(response: unknown, fallback: T): T {
  if (response && typeof response === "object" && "data" in response) {
    const data = (response as { data?: unknown }).data;
    return Array.isArray(data) ? (data as T) : fallback;
  }
  if (Array.isArray(response)) return response as T;
  return fallback;
}

/**
 * 检查最后一条 assistant 消息是否带 abort 错误。
 * 这是兜底检测机制：即使 session.error 事件被漏掉、或 wasCancelled 被尾随事件清零，
 * 仍可通过实际消息内容探测到中止。
 */
export function isLastAssistantMessageAborted(
  messages: Array<Record<string, unknown>>,
): boolean {
  if (!messages || messages.length === 0) return false;

  const assistantMessages = messages.filter((msg) => {
    const info = msg.info as Record<string, unknown> | undefined;
    return info?.role === "assistant";
  });
  if (assistantMessages.length === 0) return false;

  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const info = lastAssistant.info as Record<string, unknown> | undefined;
  const error = info?.error as { name?: string } | undefined;
  if (!error?.name) return false;

  return error.name === "MessageAbortedError" || error.name === "AbortError";
}

/**
 * 取一条消息所有 text part 拼接的文本。
 */
function getMessageText(msg: Record<string, unknown>): string {
  const parts = (msg as { parts?: Array<{ type?: string; text?: string }> }).parts;
  if (!parts) return "";
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

/**
 * 从尾向前查找最后一条"非注入"的 user 消息。
 * 文本以 INJECTION_SIGNATURE（`[CodeSpec]`）开头的视为续接器注入，跳过。
 */
export function findLastGenuineUserMessage(
  messages: Array<Record<string, unknown>>,
  signature: string = INJECTION_SIGNATURE,
): Record<string, unknown> | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const info = msg.info as { role?: string } | undefined;
    if (info?.role !== "user") continue;
    const text = getMessageText(msg).trimStart();
    if (text.startsWith(signature)) continue;
    return msg;
  }
  return undefined;
}

/**
 * 判定是否存在 abort 之后的真实用户重入：
 * 最后一条真实（非注入）user 消息的 `info.time.created` 须严格大于 `stoppedAt`。
 *
 * 用 `created > stoppedAt` 而非"最后一条 user 消息"，以排除"用户中止自己刚发的消息"
 * ——该消息的 created 在 abort 之前，不会触发误解除。
 */
export function hasGenuineReengagement(
  messages: Array<Record<string, unknown>>,
  stoppedAt: number | undefined,
): boolean {
  if (stoppedAt === undefined) return false;
  const msg = findLastGenuineUserMessage(messages);
  if (!msg) return false;
  const created = (msg.info as { time?: { created?: number } } | undefined)?.time?.created;
  return typeof created === "number" && created > stoppedAt;
}