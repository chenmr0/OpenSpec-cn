import { describe, it, expect, beforeEach, vi } from "vitest";

import { createSessionStateStore } from "../../../src/opencode-plugin/continuation/session-state.js";
import { handleSessionIdle } from "../../../src/opencode-plugin/continuation/idle-event.js";
import { handleNonIdleEvent } from "../../../src/opencode-plugin/continuation/handler.js";
import { injectContinuation } from "../../../src/opencode-plugin/continuation/continuation-injection.js";
import { APPLY_MARKER } from "../../../src/opencode-plugin/workflow-session.js";
import type { PluginInput } from "@opencode-ai/plugin";

const SESSION = "s1";

function userMsg(text: string, created: number) {
  return {
    info: { role: "user", sessionID: SESSION, time: { created } },
    parts: [{ type: "text", text }],
  };
}

function assistantMsg(aborted: boolean, created: number) {
  return {
    info: {
      role: "assistant",
      sessionID: SESSION,
      time: { created },
      error: aborted ? { name: "MessageAbortedError" } : undefined,
    },
    parts: [{ type: "text", text: "ok" }],
  };
}

function applyUserMsg(created: number) {
  return userMsg(`start\n<!-- command: ${APPLY_MARKER} -->`, created);
}

function todosIncomplete() {
  return [{ content: "t1", status: "pending", priority: "high" }];
}

interface MockOpts {
  messages?: unknown[];
  todos?: unknown[];
  messagesThrows?: boolean;
  promptAsyncImpl?: () => unknown;
}

function makeCtx(opts: MockOpts = {}): PluginInput {
  const messages = opts.messages ?? [applyUserMsg(1000), assistantMsg(false, 2000)];
  const todos = opts.todos ?? todosIncomplete();
  return {
    client: {
      session: {
        messages: vi.fn(async () => {
          if (opts.messagesThrows) throw new Error("boom");
          return { data: messages };
        }),
        todo: vi.fn(async () => ({ data: todos })),
        promptAsync: vi.fn(opts.promptAsyncImpl ?? (async () => ({}))),
      },
    },
    project: { id: "p1", worktree: "main" },
    directory: "/proj",
    worktree: "main",
  } as unknown as PluginInput;
}

/** 模拟用户双击 ESC = 一次 abort。 */
function abort(store: ReturnType<typeof createSessionStateStore>): void {
  handleNonIdleEvent({
    eventType: "session.error",
    properties: { sessionID: SESSION, error: { name: "MessageAbortedError" } },
    sessionStateStore: store,
  });
}

/** 模拟 abort 后的尾随 message.updated(assistant) 事件：清零 wasCancelled，但不应清除 stoppedByUser。 */
function simulateTrailingAssistantUpdate(store: ReturnType<typeof createSessionStateStore>): void {
  handleNonIdleEvent({
    eventType: "message.updated",
    properties: { info: { role: "assistant", sessionID: SESSION } },
    sessionStateStore: store,
  });
}

describe("abort-stop: 用户中止即叫停", () => {
  let store: ReturnType<typeof createSessionStateStore>;
  beforeEach(() => {
    store = createSessionStateStore();
  });

  it("session.error abort 设置 stoppedByUser / stoppedAt", () => {
    abort(store);
    const st = store.getState(SESSION);
    expect(st.stoppedByUser).toBe(true);
    expect(st.stoppedAt).toBeTypeOf("number");
  });

  it("尾随事件清零 wasCancelled 但保留 stoppedByUser", () => {
    abort(store);
    expect(store.getState(SESSION).wasCancelled).toBe(true);
    simulateTrailingAssistantUpdate(store);
    const st = store.getState(SESSION);
    expect(st.wasCancelled).toBe(false);
    expect(st.stoppedByUser).toBe(true);
  });

  it("race：abort 错误未落库 + wasCancelled 已被清零时，stoppedByUser 仍阻止续接", async () => {
    abort(store);
    simulateTrailingAssistantUpdate(store); // wasCancelled → false（模拟尾随事件）
    // last assistant 未带 abort 错误（模拟错误未及时落库的竞态）
    const ctx = makeCtx({ messages: [applyUserMsg(1000), assistantMsg(false, 2000)] });
    await handleSessionIdle({ ctx, sessionID: SESSION, sessionStateStore: store });
    const st = store.getState(SESSION);
    expect(st.stoppedByUser).toBe(true);
    expect(st.countdownTimer).toBeUndefined();
    expect(ctx.client.session.promptAsync).not.toHaveBeenCalled();
  });

  it("abort 后用户重入（新 user created > stoppedAt）解除叫停并续接", async () => {
    abort(store);
    simulateTrailingAssistantUpdate(store);
    const stoppedAt = store.getState(SESSION).stoppedAt as number;
    const ctx = makeCtx({
      messages: [
        applyUserMsg(1000),
        assistantMsg(false, 2000),
        userMsg("继续吧", stoppedAt + 5000),
        assistantMsg(false, stoppedAt + 6000),
      ],
    });
    await handleSessionIdle({ ctx, sessionID: SESSION, sessionStateStore: store });
    const st = store.getState(SESSION);
    expect(st.stoppedByUser).toBe(false);
    expect(st.countdownTimer).toBeDefined();
    store.cancelCountdown(SESSION);
  });

  it("abort 后无重入（仅旧 user 消息 created < stoppedAt）保持叫停", async () => {
    abort(store);
    simulateTrailingAssistantUpdate(store);
    const ctx = makeCtx({
      messages: [
        applyUserMsg(1000),
        assistantMsg(false, 2000), // last assistant 未中止；唯一 user 消息 created=1000 < stoppedAt
      ],
    });
    await handleSessionIdle({ ctx, sessionID: SESSION, sessionStateStore: store });
    const st = store.getState(SESSION);
    expect(st.stoppedByUser).toBe(true);
    expect(st.countdownTimer).toBeUndefined();
  });

  it("abort 错误已落库（last assistant 中止）保持叫停", async () => {
    abort(store);
    simulateTrailingAssistantUpdate(store);
    const stoppedAt = store.getState(SESSION).stoppedAt as number;
    const ctx = makeCtx({
      messages: [applyUserMsg(1000), assistantMsg(true, stoppedAt - 100)],
    });
    await handleSessionIdle({ ctx, sessionID: SESSION, sessionStateStore: store });
    const st = store.getState(SESSION);
    expect(st.stoppedByUser).toBe(true);
    expect(st.countdownTimer).toBeUndefined();
  });

  it("取消息失败：idle 保守不续接", async () => {
    const ctx = makeCtx({ messagesThrows: true });
    await handleSessionIdle({ ctx, sessionID: SESSION, sessionStateStore: store });
    expect(store.getState(SESSION).countdownTimer).toBeUndefined();
    expect(ctx.client.session.promptAsync).not.toHaveBeenCalled();
  });
});

describe("abort-stop: injectContinuation 注入前复查", () => {
  let store: ReturnType<typeof createSessionStateStore>;
  beforeEach(() => {
    store = createSessionStateStore();
    store.getState(SESSION); // 预建会话状态，贴近真实调用链
  });

  it("stoppedByUser 时不注入（wasCancelled 已被尾随事件清零）", async () => {
    const st = store.getState(SESSION);
    st.stoppedByUser = true;
    st.stoppedAt = Date.now();
    st.wasCancelled = false;
    const ctx = makeCtx();
    await injectContinuation({ ctx, sessionID: SESSION, sessionStateStore: store });
    expect(ctx.client.session.promptAsync).not.toHaveBeenCalled();
  });

  it("注入前复查命中 abort → 置 stoppedByUser 且不注入", async () => {
    const ctx = makeCtx({ messages: [applyUserMsg(1000), assistantMsg(true, 2000)] });
    await injectContinuation({ ctx, sessionID: SESSION, sessionStateStore: store });
    expect(ctx.client.session.promptAsync).not.toHaveBeenCalled();
    expect(store.getState(SESSION).stoppedByUser).toBe(true);
  });

  it("正常情况完成注入", async () => {
    const ctx = makeCtx();
    await injectContinuation({ ctx, sessionID: SESSION, sessionStateStore: store });
    expect(ctx.client.session.promptAsync).toHaveBeenCalledTimes(1);
  });

  it("取消息失败：保守不注入", async () => {
    const ctx = makeCtx({ messagesThrows: true });
    await injectContinuation({ ctx, sessionID: SESSION, sessionStateStore: store });
    expect(ctx.client.session.promptAsync).not.toHaveBeenCalled();
  });
});