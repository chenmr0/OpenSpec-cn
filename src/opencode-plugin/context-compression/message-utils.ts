import { createHash } from "node:crypto";
import type { WithParts } from "./types.js";

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

export function appendToLastTextPart(message: WithParts, text: string): boolean {
  for (let i = message.parts.length - 1; i >= 0; i--) {
    if (message.parts[i].type === "text" && message.parts[i].text !== undefined) {
      message.parts[i].text = message.parts[i].text!.replace(/\n*$/, "") + "\n\n" + text;
      return true;
    }
  }
  return false;
}

export function findLastAssistantMessage(messages: WithParts[]): WithParts | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "assistant") return messages[i];
  }
  return null;
}