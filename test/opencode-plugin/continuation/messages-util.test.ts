import { describe, it, expect } from "vitest";

import {
  normalizeSDKResponse,
  isLastAssistantMessageAborted,
  findLastGenuineUserMessage,
  hasGenuineReengagement,
} from "../../../src/opencode-plugin/continuation/messages-util.js";
import { INJECTION_SIGNATURE } from "../../../src/opencode-plugin/continuation/constants.js";

function userMsg(text: string, created: number) {
  return { info: { role: "user", time: { created } }, parts: [{ type: "text", text }] };
}

function assistantMsg(aborted: boolean, created = 0, errorName?: string) {
  const name = errorName ?? (aborted ? "MessageAbortedError" : undefined);
  return {
    info: { role: "assistant", time: { created }, error: name ? { name } : undefined },
    parts: [{ type: "text", text: "ok" }],
  };
}

describe("messages-util: normalizeSDKResponse", () => {
  it("解包 { data: [...] }", () => {
    expect(normalizeSDKResponse({ data: [1, 2, 3] }, [])).toEqual([1, 2, 3]);
  });

  it("原样返回数组", () => {
    expect(normalizeSDKResponse([1, 2], [])).toEqual([1, 2]);
  });

  it("data 非数组时返回 fallback", () => {
    expect(normalizeSDKResponse({ data: "nope" }, "FB")).toBe("FB");
  });

  it("null/原始值返回 fallback", () => {
    expect(normalizeSDKResponse(null, "FB")).toBe("FB");
    expect(normalizeSDKResponse(undefined, "FB")).toBe("FB");
  });
});

describe("messages-util: isLastAssistantMessageAborted", () => {
  it("最后一条 assistant 带 MessageAbortedError → true", () => {
    expect(isLastAssistantMessageAborted([assistantMsg(false), assistantMsg(true, 2)])).toBe(true);
  });

  it("最后一条 assistant 不带 abort → false", () => {
    expect(isLastAssistantMessageAborted([assistantMsg(true, 1), assistantMsg(false, 2)])).toBe(false);
  });

  it("AbortError 也识别", () => {
    expect(
      isLastAssistantMessageAborted([assistantMsg(false, 0, "AbortError")]),
    ).toBe(true);
  });

  it("其他错误名不算 abort", () => {
    expect(
      isLastAssistantMessageAborted([assistantMsg(false, 0, "ApiError")]),
    ).toBe(false);
  });

  it("无 assistant → false", () => {
    expect(isLastAssistantMessageAborted([userMsg("hi", 1)])).toBe(false);
  });

  it("空列表 → false", () => {
    expect(isLastAssistantMessageAborted([])).toBe(false);
  });
});

describe("messages-util: findLastGenuineUserMessage", () => {
  it("跳过 [CodeSpec] 注入，返回最后一条真实 user", () => {
    const msgs = [
      userMsg("hello", 1),
      userMsg(`${INJECTION_SIGNATURE}\n续接提示`, 2),
      userMsg("继续", 3),
    ];
    const found = findLastGenuineUserMessage(msgs);
    expect((found as { info: { role: string } }).info.role).toBe("user");
    expect((found as { parts: Array<{ text: string }> }).parts[0].text).toBe("继续");
  });

  it("全是注入 → undefined", () => {
    expect(findLastGenuineUserMessage([userMsg(`${INJECTION_SIGNATURE} 续接`, 1)])).toBeUndefined();
  });

  it("无 user → undefined", () => {
    expect(findLastGenuineUserMessage([assistantMsg(false)])).toBeUndefined();
  });

  it("trimStart 后以签名开头仍视为注入", () => {
    expect(
      findLastGenuineUserMessage([userMsg(`  \n${INJECTION_SIGNATURE}续接`, 1)]),
    ).toBeUndefined();
  });
});

describe("messages-util: hasGenuineReengagement", () => {
  it("真实 user created > stoppedAt → true", () => {
    expect(hasGenuineReengagement([userMsg("继续", 5000)], 1000)).toBe(true);
  });

  it("真实 user created < stoppedAt → false（旧消息不算重入）", () => {
    expect(hasGenuineReengagement([userMsg("旧指令", 500)], 1000)).toBe(false);
  });

  it("stoppedAt 缺省 → false", () => {
    expect(hasGenuineReengagement([userMsg("继续", 5000)], undefined)).toBe(false);
  });

  it("仅注入消息 → false", () => {
    expect(
      hasGenuineReengagement([userMsg(`${INJECTION_SIGNATURE}续接`, 5000)], 1000),
    ).toBe(false);
  });

  it("无 user → false", () => {
    expect(hasGenuineReengagement([assistantMsg(false)], 1000)).toBe(false);
  });
});