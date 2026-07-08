import { describe, it, expect } from 'vitest';
import {
  detectApplySession,
  detectPlanSession,
  APPLY_MARKER,
  DESIGN_MARKER,
  PLAN_MARKER,
} from '../../../src/opencode-plugin/context-compression/session-detection.js';
import type { CompressionState, WithParts } from '../../../src/opencode-plugin/context-compression/types.js';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    inProgressStart: new Map(),
    nudgeInjectedForTask: null,
    isApplySession: false,
    isMainAgentMode: false,
    applyCommand: null,
    keepRecentTasks: 1,
    keepRecentTasksByCommand: { apply: 1 },
    isPlanSession: false,
    toolCache: new Map(),
    prunedToolCallIds: new Set(),
    messageTurnIndex: 0,
  };
}

function makeUserMessage(text: string, sessionId = 'test-session'): WithParts {
  return {
    info: { id: 'msg-1', sessionID: sessionId, role: 'user', time: { created: 1 } },
    parts: [{ type: 'text', text }],
  };
}

function makeAssistantMessage(text: string, sessionId = 'test-session'): WithParts {
  return {
    info: { id: 'msg-2', sessionID: sessionId, role: 'assistant', time: { created: 2 } },
    parts: [{ type: 'text', text }],
  };
}

describe('detectApplySession', () => {
  it('returns false for empty messages', () => {
    const state = makeState();
    expect(detectApplySession(state, [])).toBe(false);
    expect(state.isApplySession).toBe(false);
  });

  it('returns false when no user message contains the marker', () => {
    const state = makeState();
    const messages = [
      makeUserMessage('hello world'),
      makeAssistantMessage('hi there'),
      makeUserMessage('do some tasks'),
    ];
    expect(detectApplySession(state, messages)).toBe(false);
    expect(state.isApplySession).toBe(false);
  });

  it('returns true when a user message contains the apply marker', () => {
    const state = makeState();
    const messages = [
      makeUserMessage('starting work'),
      makeUserMessage(`some template content\n<!-- command: ${APPLY_MARKER} -->\nmore content`),
    ];
    expect(detectApplySession(state, messages)).toBe(true);
    expect(state.isApplySession).toBe(true);
    expect(state.applyCommand).toBe('apply');
    expect(state.keepRecentTasks).toBe(1);
  });

  it('caches result and returns true on subsequent calls without scanning', () => {
    const state = makeState();
    state.isApplySession = true;

    const messages: WithParts[] = []; // no messages to scan
    expect(detectApplySession(state, messages)).toBe(true);
  });

  it('ignores marker in assistant messages', () => {
    const state = makeState();
    const messages = [
      makeUserMessage('hello'),
      makeAssistantMessage(`<!-- command: ${APPLY_MARKER} -->`),
    ];
    expect(detectApplySession(state, messages)).toBe(false);
    expect(state.isApplySession).toBe(false);
  });

  it('ignores marker in non-text parts', () => {
    const state = makeState();
    const messages: WithParts[] = [
      {
        info: { id: 'msg-1', sessionID: 'test', role: 'user', time: { created: 1 } },
        parts: [{ type: 'tool', tool: 'todowrite', state: { status: 'completed', input: APPLY_MARKER } } as any],
      },
    ];
    expect(detectApplySession(state, messages)).toBe(false);
    expect(state.isApplySession).toBe(false);
  });
});

describe('detectPlanSession', () => {
  it('returns true when a user message contains the plan marker', () => {
    const state = makeState();
    const messages = [
      makeUserMessage(`some template content\n<!-- command: ${PLAN_MARKER} -->\nmore content`),
    ];

    expect(detectPlanSession(state, messages)).toBe(true);
    expect(state.isPlanSession).toBe(true);
  });

  it('returns true when a user message contains the design marker', () => {
    const state = makeState();
    const messages = [
      makeUserMessage(`some template content\n<!-- command: ${DESIGN_MARKER} -->\nmore content`),
    ];

    expect(detectPlanSession(state, messages)).toBe(true);
    expect(state.isPlanSession).toBe(true);
  });

  it('caches result and returns true on subsequent calls without scanning', () => {
    const state = makeState();
    state.isPlanSession = true;

    const messages: WithParts[] = [];
    expect(detectPlanSession(state, messages)).toBe(true);
  });

  it('ignores design marker in assistant messages', () => {
    const state = makeState();
    const messages = [
      makeAssistantMessage(`<!-- command: ${DESIGN_MARKER} -->`),
    ];

    expect(detectPlanSession(state, messages)).toBe(false);
    expect(state.isPlanSession).toBe(false);
  });
});
