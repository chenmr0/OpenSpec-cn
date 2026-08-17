import { describe, it, expect } from 'vitest';
import {
  detectApplySession,
  detectPlanSession,
  APPLY_MARKER,
  DESIGN_MARKER,
  PLAN_MARKER,
  SUBAGENT_DEV_SKILL_NAME,
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
    isSubagentMode: false,
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

/** A `skill` tool call message (assistant role), matching opencode's tool-part shape. */
function makeSkillToolMessage(skillName: string, id = 'msg-skill'): WithParts {
  return {
    info: { id, sessionID: 'test-session', role: 'assistant', time: { created: 3 } },
    parts: [
      {
        type: 'tool',
        tool: 'skill',
        state: { status: 'completed', input: { name: skillName } },
      } as any,
    ],
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
    // No subagent skill loaded → not subagent mode → keepRecentTasks forced to 0
    // (even though keepRecentTasksByCommand.apply is 1).
    expect(state.isSubagentMode).toBe(false);
    expect(state.keepRecentTasks).toBe(0);
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

describe('subagent mode detection (keepRecentTasks策略)', () => {
  it('subagent skill loaded + config keepRecentTasks=1 → uses config value 1', () => {
    const state = makeState(); // keepRecentTasksByCommand.apply = 1
    const messages = [
      makeUserMessage(`<!-- command: ${APPLY_MARKER} -->`),
      makeSkillToolMessage(SUBAGENT_DEV_SKILL_NAME),
    ];
    expect(detectApplySession(state, messages)).toBe(true);
    expect(state.isSubagentMode).toBe(true);
    expect(state.keepRecentTasks).toBe(1);
  });

  it('subagent skill loaded + no config (apply=0) → keepRecentTasks=0', () => {
    const state = makeState();
    state.keepRecentTasksByCommand = { apply: 0 };
    const messages = [
      makeUserMessage(`<!-- command: ${APPLY_MARKER} -->`),
      makeSkillToolMessage(SUBAGENT_DEV_SKILL_NAME),
    ];
    expect(detectApplySession(state, messages)).toBe(true);
    expect(state.isSubagentMode).toBe(true);
    expect(state.keepRecentTasks).toBe(0);
  });

  it('main-agent skill loaded (not subagent) + config=1 → keepRecentTasks=0, ignores config', () => {
    const state = makeState(); // apply = 1
    const messages = [
      makeUserMessage(`<!-- command: ${APPLY_MARKER} -->`),
      makeSkillToolMessage('main-agent-development'),
    ];
    expect(detectApplySession(state, messages)).toBe(true);
    expect(state.isSubagentMode).toBe(false);
    expect(state.keepRecentTasks).toBe(0);
  });

  it('no skill loaded + config=1 → keepRecentTasks=0 (unknown mode treated as non-subagent)', () => {
    const state = makeState(); // apply = 1
    const messages = [makeUserMessage(`<!-- command: ${APPLY_MARKER} -->`)];
    expect(detectApplySession(state, messages)).toBe(true);
    expect(state.isSubagentMode).toBe(false);
    expect(state.keepRecentTasks).toBe(0);
  });

  it('subagent skill detected after apply session already cached → recompute keepRecentTasks', () => {
    const state = makeState(); // apply = 1
    // Turn 1: only the apply command — apply session cached, keepRecentTasks=0 (not subagent yet)
    detectApplySession(state, [makeUserMessage(`<!-- command: ${APPLY_MARKER} -->`)]);
    expect(state.isApplySession).toBe(true);
    expect(state.isSubagentMode).toBe(false);
    expect(state.keepRecentTasks).toBe(0);

    // Turn 2: agent loads the subagent skill — mode flips, keepRecentTasks recomputed to config value
    detectApplySession(state, [
      makeUserMessage(`<!-- command: ${APPLY_MARKER} -->`),
      makeSkillToolMessage(SUBAGENT_DEV_SKILL_NAME),
    ]);
    expect(state.isSubagentMode).toBe(true);
    expect(state.keepRecentTasks).toBe(1);
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
