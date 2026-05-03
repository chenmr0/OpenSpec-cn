import { describe, it, expect } from 'vitest';
import { injectNudge } from '../../../dist/opencode-plugin/context-compression/nudge.js';
import type { CompressionState, WithParts } from '../../../dist/opencode-plugin/context-compression/types.js';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    nudgeInjectedForTask: null,
  };
}

function makeMessage(role: string, text: string, id = 'msg-1'): WithParts {
  return {
    info: { id, sessionID: 'sess-1', role, time: { created: 1000 } },
    parts: [{ type: 'text', text, id: `prt-${id}`, sessionID: 'sess-1', messageID: id }],
  };
}

describe('injectNudge', () => {
  it('does nothing when completedOrder < 3', () => {
    const state = makeState();
    state.completedOrder = ['1', '2'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'T1', startMessageId: 'm1', endMessageId: 'm2', completedAt: 1, compressed: false });
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages[0].parts[0].text).toBe('hello');
  });

  it('injects nudge when completedOrder >= 3 and task not compressed', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'Task one', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: false });
    state.taskBoundaries.set('2', { taskId: '2', description: 'Task two', startMessageId: 'm1', endMessageId: 'm2', completedAt: 2, compressed: false });
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages[0].parts[0].text).toContain('task-compress');
    expect(messages[0].parts[0].text).toContain('Task one');
    expect(state.nudgeInjectedForTask).toBe('1');
  });

  it('does not inject when candidate is already compressed', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'T1', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: true });
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages[0].parts[0].text).toBe('hello');
  });

  it('does not inject when nudge already injected', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'T1', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: false });
    state.nudgeInjectedForTask = '1';
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages[0].parts[0].text).toBe('hello');
  });

  it('does nothing when no assistant message exists', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'T1', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: false });
    const messages = [makeMessage('user', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages[0].parts[0].text).toBe('hello');
  });

  it('injects nudge for multiple compressible tasks', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3', '4'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'Task 1', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: false });
    state.taskBoundaries.set('2', { taskId: '2', description: 'Task 2', startMessageId: 'm1', endMessageId: 'm2', completedAt: 2, compressed: false });
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages[0].parts[0].text).toContain('Task 1');
    expect(messages[0].parts[0].text).toContain('Task 2');
  });
});