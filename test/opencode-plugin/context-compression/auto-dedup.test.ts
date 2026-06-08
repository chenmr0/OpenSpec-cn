import { describe, it, expect } from 'vitest';
import { applyAutoDedup } from '../../../src/opencode-plugin/context-compression/auto-dedup.js';
import type { CompressionState, WithParts } from '../../../src/opencode-plugin/context-compression/types.js';

const DEDUP_MARKER = '[Output removed - duplicate of later call]';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    nudgeInjectedForTask: null,
    isApplySession: false,
    isPlanSession: true,
    applyCommand: null,
    keepRecentTasks: 1,
    keepRecentTasksByCommand: { apply: 1, 'apply-quick': 3 },
    toolCache: new Map(),
    prunedToolCallIds: new Set(),
    messageTurnIndex: 0,
  };
}

function makeToolPart(callID: string, tool: string, status: string, input?: Record<string, unknown>) {
  return {
    type: 'tool' as const,
    callID,
    tool,
    state: { status, input: input ?? {}, output: `output-of-${callID}` },
  };
}

function makeMsg(id: string, parts: WithParts['parts'], role = 'user'): WithParts {
  return {
    info: { id, sessionID: 'sess-1', role, time: { created: Date.now() } },
    parts,
  };
}

/** Helper: 在 toolCache 中注册一个 completed 工具调用 */
function cacheEntry(state: CompressionState, callID: string, toolName: string, params: Record<string, unknown> = {}, turnIdx = 0) {
  state.toolCache.set(callID, {
    callID,
    toolName,
    parameters: params,
    status: 'completed',
    messageIndex: 0,
    turnIndex: turnIdx,
    signature: `${toolName}:${JSON.stringify(params)}`,
    outputTokenEstimate: 10,
  });
}

describe('applyAutoDedup', () => {
  it('skips non-plan sessions', () => {
    const state = makeState();
    state.isPlanSession = false;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
      makeMsg('m2', [makeToolPart('c2', 'grep', 'completed', { pattern: 'foo' })]),
    ];
    cacheEntry(state, 'c1', 'grep', { pattern: 'foo' });
    cacheEntry(state, 'c2', 'grep', { pattern: 'foo' });

    applyAutoDedup(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
    expect(messages[1].parts[0].state!.output).toBe('output-of-c2');
  });

  it('does nothing when there are no duplicates', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
      makeMsg('m2', [makeToolPart('c2', 'glob', 'completed', { pattern: '*.ts' })]),
    ];
    cacheEntry(state, 'c1', 'grep', { pattern: 'foo' });
    cacheEntry(state, 'c2', 'glob', { pattern: '*.ts' });

    applyAutoDedup(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
    expect(messages[1].parts[0].state!.output).toBe('output-of-c2');
  });

  it('deduplicates consecutive identical calls, keeping only the last', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
      makeMsg('m2', [makeToolPart('c2', 'grep', 'completed', { pattern: 'foo' })]),
    ];
    cacheEntry(state, 'c1', 'grep', { pattern: 'foo' });
    cacheEntry(state, 'c2', 'grep', { pattern: 'foo' });

    applyAutoDedup(state, messages);

    expect(messages[0].parts[0].state!.output).toBe(DEDUP_MARKER);
    expect(messages[1].parts[0].state!.output).toBe('output-of-c2');
    expect(state.prunedToolCallIds.has('c1')).toBe(true);
    expect(state.prunedToolCallIds.has('c2')).toBe(false);
  });

  it('does not deduplicate non-consecutive identical calls (interrupted by different tool)', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
      makeMsg('m2', [makeToolPart('c2', 'glob', 'completed', { pattern: '*.ts' })]),
      makeMsg('m3', [makeToolPart('c3', 'grep', 'completed', { pattern: 'foo' })]),
    ];
    cacheEntry(state, 'c1', 'grep', { pattern: 'foo' });
    cacheEntry(state, 'c2', 'glob', { pattern: '*.ts' });
    cacheEntry(state, 'c3', 'grep', { pattern: 'foo' });

    applyAutoDedup(state, messages);

    // c1 and c3 have the same signature but are not consecutive
    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
    expect(messages[2].parts[0].state!.output).toBe('output-of-c3');
  });

  it('skips protected tools (question, task, skill, todowrite)', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'task', 'completed', { description: 'do X' })]),
      makeMsg('m2', [makeToolPart('c2', 'task', 'completed', { description: 'do X' })]),
    ];
    cacheEntry(state, 'c1', 'task', { description: 'do X' });
    cacheEntry(state, 'c2', 'task', { description: 'do X' });

    applyAutoDedup(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
    expect(messages[1].parts[0].state!.output).toBe('output-of-c2');
  });

  it('allows deduplication of read calls', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'read', 'completed', { filePath: '/src/utils.ts' })]),
      makeMsg('m2', [makeToolPart('c2', 'read', 'completed', { filePath: '/src/utils.ts' })]),
    ];
    cacheEntry(state, 'c1', 'read', { filePath: '/src/utils.ts' });
    cacheEntry(state, 'c2', 'read', { filePath: '/src/utils.ts' });

    applyAutoDedup(state, messages);

    expect(messages[0].parts[0].state!.output).toBe(DEDUP_MARKER);
    expect(messages[1].parts[0].state!.output).toBe('output-of-c2');
  });

  it('treats non-completed calls as continuity breakers', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
      makeMsg('m2', [makeToolPart('c2', 'grep', 'error', { pattern: 'foo' })]),
      makeMsg('m3', [makeToolPart('c3', 'grep', 'completed', { pattern: 'foo' })]),
    ];
    cacheEntry(state, 'c1', 'grep', { pattern: 'foo' });
    cacheEntry(state, 'c2', 'grep', { pattern: 'foo' });
    // c2 status in cache is error -> not completed
    state.toolCache.get('c2')!.status = 'error';
    cacheEntry(state, 'c3', 'grep', { pattern: 'foo' });

    applyAutoDedup(state, messages);

    // c1 and c3 are not consecutive because c2 has non-completed status
    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
    expect(messages[2].parts[0].state!.output).toBe('output-of-c3');
  });

  it('skips tool parts with no cache entry (breaks continuity)', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
      makeMsg('m2', [makeToolPart('c2', 'grep', 'completed', { pattern: 'foo' })]),
    ];
    cacheEntry(state, 'c1', 'grep', { pattern: 'foo' });
    // c2 not in cache

    applyAutoDedup(state, messages);

    // c2 has no cache entry so c1 can't be deduped against it
    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
    expect(messages[1].parts[0].state!.output).toBe('output-of-c2');
  });

  it('skips already-pruned callIDs', () => {
    const state = makeState();
    state.prunedToolCallIds.add('c1');
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
      makeMsg('m2', [makeToolPart('c2', 'grep', 'completed', { pattern: 'foo' })]),
    ];
    cacheEntry(state, 'c1', 'grep', { pattern: 'foo' });
    cacheEntry(state, 'c2', 'grep', { pattern: 'foo' });

    applyAutoDedup(state, messages);

    // c1 already pruned, 跳过; prevSignature 不会从 c1 设置
    // 但不影响 — c2 发现 prevSignature 为 null，不会去重
    expect(messages[1].parts[0].state!.output).toBe('output-of-c2');
  });

  it('handles multiple consecutive duplicate groups', () => {
    const state = makeState();
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'A' })]),
      makeMsg('m2', [makeToolPart('c2', 'grep', 'completed', { pattern: 'A' })]),
      makeMsg('m3', [makeToolPart('c3', 'grep', 'completed', { pattern: 'A' })]),
      makeMsg('m4', [makeToolPart('c4', 'glob', 'completed', { pattern: '*.ts' })]),
      makeMsg('m5', [makeToolPart('c5', 'glob', 'completed', { pattern: '*.ts' })]),
    ];
    cacheEntry(state, 'c1', 'grep', { pattern: 'A' });
    cacheEntry(state, 'c2', 'grep', { pattern: 'A' });
    cacheEntry(state, 'c3', 'grep', { pattern: 'A' });
    cacheEntry(state, 'c4', 'glob', { pattern: '*.ts' });
    cacheEntry(state, 'c5', 'glob', { pattern: '*.ts' });

    applyAutoDedup(state, messages);

    // grep group: c1, c2 deduped, c3 kept
    expect(messages[0].parts[0].state!.output).toBe(DEDUP_MARKER);
    expect(messages[1].parts[0].state!.output).toBe(DEDUP_MARKER);
    expect(messages[2].parts[0].state!.output).toBe('output-of-c3');
    // glob group: c4 deduped, c5 kept
    expect(messages[3].parts[0].state!.output).toBe(DEDUP_MARKER);
    expect(messages[4].parts[0].state!.output).toBe('output-of-c5');
    expect(state.prunedToolCallIds.size).toBe(3);
  });
});
