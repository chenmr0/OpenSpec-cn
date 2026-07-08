import { describe, expect, it } from "vitest";

import {
  APPLY_MARKER,
  DESIGN_MARKER,
  PLAN_MARKER,
  createWorkflowSessionStore,
  detectProtectedWorkflowFromMessages,
  recordProtectedWorkflowSessionFromMessages,
} from "../../src/opencode-plugin/workflow-session.js";

function userMessage(text: string, sessionID = "test-session") {
  return {
    info: { role: "user", sessionID },
    parts: [{ type: "text", text }],
  };
}

function assistantMessage(text: string) {
  return {
    info: { role: "assistant", sessionID: "test-session" },
    parts: [{ type: "text", text }],
  };
}

describe("workflow-session", () => {
  it("detects protected CodeSpec workflow markers in user text messages", () => {
    expect(detectProtectedWorkflowFromMessages([
      userMessage(`start\n<!-- command: ${PLAN_MARKER} -->`),
    ])).toBe("plan");

    expect(detectProtectedWorkflowFromMessages([
      userMessage(`start\n<!-- command: ${DESIGN_MARKER} -->`),
    ])).toBe("design");

    expect(detectProtectedWorkflowFromMessages([
      userMessage(`start\n<!-- command: ${APPLY_MARKER} -->`),
    ])).toBe("apply");
  });

  it("ignores markers outside user text messages", () => {
    expect(detectProtectedWorkflowFromMessages([
      assistantMessage(`<!-- command: ${PLAN_MARKER} -->`),
    ])).toBeNull();

    expect(detectProtectedWorkflowFromMessages([
      assistantMessage(`<!-- command: ${DESIGN_MARKER} -->`),
    ])).toBeNull();

    expect(detectProtectedWorkflowFromMessages([
      {
        info: { role: "user", sessionID: "test-session" },
        parts: [{ type: "tool", text: `<!-- command: ${DESIGN_MARKER} -->` }],
      },
    ])).toBeNull();
  });

  it("records and cleans protected workflow sessions", () => {
    const store = createWorkflowSessionStore();

    const workflow = recordProtectedWorkflowSessionFromMessages(store, [
      userMessage(`plan\n<!-- command: ${PLAN_MARKER} -->`, "session-1"),
    ]);

    expect(workflow).toBe("plan");
    expect(store.isProtectedSession("session-1")).toBe(true);
    expect(store.getProtectedSession("session-1")?.workflow).toBe("plan");

    store.cleanup("session-1");
    expect(store.isProtectedSession("session-1")).toBe(false);
  });
});
