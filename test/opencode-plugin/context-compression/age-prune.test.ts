import { describe, it, expect } from 'vitest';
import { applyAgePrune } from '../../../src/opencode-plugin/context-compression/age-prune.js';
import type { CompressionState, WithParts } from '../../../src/opencode-plugin/context-compression/types.js';

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
    messageTurnIndex: 10, // enough to enable pruning ( > 8)
  };
}

function makeToolPart(
  callID: string,
  tool: string,
  status: string,
  input?: Record<string, unknown>,
  output?: string,
) {
  return {
    type: 'tool' as const,
    callID,
    tool,
    state: { status, input: input ?? {}, output: output ?? `output-of-${callID}` },
  };
}

function makeMsg(id: string, parts: WithParts['parts'], role = 'user'): WithParts {
  return {
    info: { id, sessionID: 'sess-1', role, time: { created: Date.now() } },
    parts,
  };
}

/** Helper: 在 toolCache 中注册一个 completed 工具调用 */
function cacheEntry(
  state: CompressionState,
  callID: string,
  toolName: string,
  turnIdx: number,
  params: Record<string, unknown> = {},
) {
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

describe('applyAgePrune', () => {
  it('skips non-plan sessions', () => {
    const state = makeState();
    state.isPlanSession = false;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
    ];
    cacheEntry(state, 'c1', 'grep', 1, { pattern: 'foo' });

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
  });

  it('skips when turn count is insufficient (<= 8)', () => {
    const state = makeState();
    state.messageTurnIndex = 5;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'foo' })]),
    ];
    cacheEntry(state, 'c1', 'grep', 0, { pattern: 'foo' });

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
  });

  it('prunes old grep output with marker', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'TODO' }, 'line1\nline2\n')]),
    ];
    cacheEntry(state, 'c1', 'grep', 1, { pattern: 'TODO' }); // turnIndex=1 <= 10-8=2

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toContain('[Grep: "TODO"');
    expect(messages[0].parts[0].state!.output).toContain('found 2 matches');
    expect(messages[0].parts[0].state!.output).toContain('output pruned');
    expect(state.prunedToolCallIds.has('c1')).toBe(true);
  });

  it('prunes old glob output with marker', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'glob', 'completed', { pattern: '*.ts' }, 'a.ts\nb.ts\nc.ts\n')]),
    ];
    cacheEntry(state, 'c1', 'glob', 2, { pattern: '*.ts' }); // turnIndex=2 <= 2

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toContain('[Glob: "*.ts"');
    expect(messages[0].parts[0].state!.output).toContain('found 3 files');
    expect(messages[0].parts[0].state!.output).toContain('output pruned');
  });

  it('prunes old bash output with marker (short command)', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'bash', 'completed', { command: 'npm test' })]),
    ];
    cacheEntry(state, 'c1', 'bash', 1, { command: 'npm test' });

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toContain('[Bash: npm test');
    expect(messages[0].parts[0].state!.output).toContain('output pruned');
  });

  it('truncates long bash commands in marker', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const longCmd = 'echo "this is a very long command that exceeds eighty characters in total length"';
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'bash', 'completed', { command: longCmd })]),
    ];
    cacheEntry(state, 'c1', 'bash', 1, { command: longCmd });

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toContain('[Bash:');
    expect(messages[0].parts[0].state!.output).toContain('...');
    expect(messages[0].parts[0].state!.output).toContain('output pruned');
  });

  it('does not prune recent tool calls within the active window', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'recent' })]),
      makeMsg('m2', [makeToolPart('c2', 'grep', 'completed', { pattern: 'old' })]),
    ];
    cacheEntry(state, 'c1', 'grep', 9, { pattern: 'recent' }); // turnIndex=9 > 2 -> recent
    cacheEntry(state, 'c2', 'grep', 2, { pattern: 'old' });    // turnIndex=2 <= 2 -> old

    applyAgePrune(state, messages);

    // recent call preserved
    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
    // old call pruned
    expect(messages[1].parts[0].state!.output).toContain('[Grep: "old"');
  });

  it('does not prune protected tools (question, task, skill, todowrite, read)', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('q1', 'question', 'completed', {}, 'question-output')]),
      makeMsg('m2', [makeToolPart('t1', 'task', 'completed', {}, 'task-output')]),
      makeMsg('m3', [makeToolPart('s1', 'skill', 'completed', {}, 'skill-output')]),
      makeMsg('m4', [makeToolPart('tw1', 'todowrite', 'completed', {}, 'todo-output')]),
      makeMsg('m5', [makeToolPart('r1', 'read', 'completed', { filePath: '/src/utils.ts' }, 'read-output')]),
    ];
    cacheEntry(state, 'q1', 'question', 1);
    cacheEntry(state, 't1', 'task', 1);
    cacheEntry(state, 's1', 'skill', 1);
    cacheEntry(state, 'tw1', 'todowrite', 1);
    cacheEntry(state, 'r1', 'read', 1, { filePath: '/src/utils.ts' });

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('question-output');
    expect(messages[1].parts[0].state!.output).toBe('task-output');
    expect(messages[2].parts[0].state!.output).toBe('skill-output');
    expect(messages[3].parts[0].state!.output).toBe('todo-output');
    expect(messages[4].parts[0].state!.output).toBe('read-output');
  });

  it('does not prune errored tool calls', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'bash', 'error', { command: 'bad' }, 'error output')]),
    ];
    cacheEntry(state, 'c1', 'bash', 1, { command: 'bad' });
    state.toolCache.get('c1')!.status = 'error';

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('error output');
  });

  it('does not prune non-completed calls', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'pending', { pattern: 'x' })]),
    ];
    cacheEntry(state, 'c1', 'grep', 1, { pattern: 'x' });
    state.toolCache.get('c1')!.status = 'pending';

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
  });

  it('skips calls not found in toolCache', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'x' })]),
    ];
    // c1 NOT in toolCache

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
  });

  it('preserves read output for protected files (spec.md, design.md, task.md)', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('r1', 'read', 'completed', { filePath: '/project/spec.md' }, 'spec content')]),
      makeMsg('m2', [makeToolPart('r2', 'read', 'completed', { filePath: '/project/design.md' }, 'design content')]),
      makeMsg('m3', [makeToolPart('r3', 'read', 'completed', { filePath: '/project/task.md' }, 'task content')]),
    ];
    cacheEntry(state, 'r1', 'read', 1, { filePath: '/project/spec.md' });
    cacheEntry(state, 'r2', 'read', 1, { filePath: '/project/design.md' });
    cacheEntry(state, 'r3', 'read', 1, { filePath: '/project/task.md' });

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('spec content');
    expect(messages[1].parts[0].state!.output).toBe('design content');
    expect(messages[2].parts[0].state!.output).toBe('task content');
  });

  it('protects all read calls regardless of file (read is in PROTECTED_TOOLS)', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('r1', 'read', 'completed', { filePath: '/project/utils.ts' }, 'code here')]),
      makeMsg('m2', [makeToolPart('r2', 'read', 'completed', { filePath: '/project/random.txt' }, 'txt content')]),
    ];
    cacheEntry(state, 'r1', 'read', 1, { filePath: '/project/utils.ts' });
    cacheEntry(state, 'r2', 'read', 1, { filePath: '/project/random.txt' });

    applyAgePrune(state, messages);

    // read is in PROTECTED_TOOLS, so ALL read calls preserved regardless of file name
    expect(messages[0].parts[0].state!.output).toBe('code here');
    expect(messages[1].parts[0].state!.output).toBe('txt content');
  });

  it('skips already-pruned callIDs', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    state.prunedToolCallIds.add('c1');
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'grep', 'completed', { pattern: 'x' })]),
    ];
    cacheEntry(state, 'c1', 'grep', 1, { pattern: 'x' });

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('output-of-c1');
  });

  it('generates default marker for unknown tool types', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('c1', 'unknownTool', 'completed', {})]),
    ];
    cacheEntry(state, 'c1', 'unknownTool', 1, {});

    applyAgePrune(state, messages);

    expect(messages[0].parts[0].state!.output).toBe('[unknownTool: output pruned]');
  });

  it('handles file_path as well as filePath for read protection', () => {
    const state = makeState();
    state.messageTurnIndex = 10;
    const messages: WithParts[] = [
      makeMsg('m1', [makeToolPart('r1', 'read', 'completed', { file_path: '/app/spec.md' }, 'spec v2')]),
    ];
    cacheEntry(state, 'r1', 'read', 1, { file_path: '/app/spec.md' });

    applyAgePrune(state, messages);

    // spec.md is a protected file, even via file_path key
    expect(messages[0].parts[0].state!.output).toBe('spec v2');
  });
});
