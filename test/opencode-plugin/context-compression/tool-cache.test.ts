import { describe, it, expect } from 'vitest';
import { computeSignature, syncToolCache } from '../../../src/opencode-plugin/context-compression/tool-cache.js';
import type { CompressionState, WithParts } from '../../../src/opencode-plugin/context-compression/types.js';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    nudgeInjectedForTask: null,
    isApplySession: false,
    isPlanSession: false,
    applyCommand: null,
    keepRecentTasks: 1,
    keepRecentTasksByCommand: { apply: 1, 'apply-quick': 3 },
    toolCache: new Map(),
    prunedToolCallIds: new Set(),
    messageTurnIndex: 0,
  };
}

function makeToolPart(callID: string, tool: string, status: string, input?: Record<string, unknown>, output?: string) {
  return {
    type: 'tool' as const,
    callID,
    tool,
    state: { status, input: input ?? {}, output: output ?? '' },
  };
}

function makeTextPart(text: string) {
  return { type: 'text' as const, text };
}

function makeMsg(role: string, id: string, parts: WithParts['parts'], sessionID = 'sess-1'): WithParts {
  return {
    info: { id, sessionID, role, time: { created: Date.now() } },
    parts,
  };
}

describe('computeSignature', () => {
  it('creates basic signature from tool name and params', () => {
    const sig = computeSignature('grep', { pattern: 'foo' });
    expect(sig).toBe('grep:{"pattern":"foo"}');
  });

  it('sorts parameter keys alphabetically', () => {
    const sig1 = computeSignature('read', { b: 1, a: 2 });
    const sig2 = computeSignature('read', { a: 2, b: 1 });
    expect(sig1).toBe(sig2);
    expect(sig1).toBe('read:{"a":2,"b":1}');
  });

  it('filters out undefined parameter values', () => {
    const sig = computeSignature('grep', { pattern: 'foo', path: undefined });
    expect(sig).toBe('grep:{"pattern":"foo"}');
    expect(sig).not.toContain('path');
  });

  it('handles empty params', () => {
    const sig = computeSignature('glob', {});
    expect(sig).toBe('glob:{}');
  });
});

describe('syncToolCache', () => {
  it('builds empty cache for empty messages', () => {
    const state = makeState();
    syncToolCache(state, []);
    expect(state.toolCache.size).toBe(0);
    expect(state.messageTurnIndex).toBe(0);
  });

  it('indexes tool calls with correct metadata', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('user', 'm1', [makeTextPart('hello')]),
      makeMsg('assistant', 'm2', [makeTextPart('hi')]),
      makeMsg('user', 'm3', [
        makeToolPart('call-1', 'grep', 'completed', { pattern: 'foo' }, '3 matches'),
      ]),
    ];

    syncToolCache(state, messages);

    expect(state.toolCache.size).toBe(1);
    const entry = state.toolCache.get('call-1');
    expect(entry).toBeDefined();
    expect(entry!.callID).toBe('call-1');
    expect(entry!.toolName).toBe('grep');
    expect(entry!.status).toBe('completed');
    expect(entry!.parameters).toEqual({ pattern: 'foo' });
    expect(entry!.signature).toBe('grep:{"pattern":"foo"}');
    expect(entry!.messageIndex).toBe(2);
    expect(entry!.turnIndex).toBe(1);
  });

  it('counts turns based on assistant messages', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('user', 'm1', [makeTextPart('q1')]),
      makeMsg('assistant', 'm2', [makeTextPart('a1')]),
      makeMsg('user', 'm3', [
        makeToolPart('c1', 'grep', 'completed', { pattern: 'a' }, ''),
      ]),
      makeMsg('assistant', 'm4', [makeTextPart('a2')]),
      makeMsg('user', 'm5', [
        makeToolPart('c2', 'glob', 'completed', { pattern: '*.ts' }, ''),
      ]),
    ];

    syncToolCache(state, messages);

    expect(state.messageTurnIndex).toBe(2);
    expect(state.toolCache.get('c1')!.turnIndex).toBe(1);
    expect(state.toolCache.get('c2')!.turnIndex).toBe(2);
  });

  it('skips non-tool parts', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('user', 'm1', [makeTextPart('hello'), makeTextPart('world')]),
    ];

    syncToolCache(state, messages);

    expect(state.toolCache.size).toBe(0);
  });

  it('skips tool parts without callID', () => {
    const state = makeState();
    const parts: WithParts['parts'] = [
      { type: 'tool', tool: 'grep', state: { status: 'completed', input: {} } } as any,
    ];
    const messages: WithParts[] = [makeMsg('user', 'm1', parts)];

    syncToolCache(state, messages);

    expect(state.toolCache.size).toBe(0);
  });

  it('syncs messageTurnIndex to state', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('assistant', 'm1', [makeTextPart('turn-1')]),
      makeMsg('assistant', 'm2', [makeTextPart('turn-2')]),
      makeMsg('assistant', 'm3', [makeTextPart('turn-3')]),
    ];

    syncToolCache(state, messages);
    expect(state.messageTurnIndex).toBe(3);
  });

  it('clears and rebuilds cache on each call', () => {
    const state = makeState();
    state.toolCache.set('stale', {
      callID: 'stale',
      toolName: 'glob',
      parameters: {},
      status: 'completed',
      messageIndex: 0,
      turnIndex: 0,
      signature: 'glob:{}',
      outputTokenEstimate: 0,
    });

    syncToolCache(state, []);

    // 旧的 stale 条目已被清除
    expect(state.toolCache.has('stale')).toBe(false);
    expect(state.toolCache.size).toBe(0);
  });
});
