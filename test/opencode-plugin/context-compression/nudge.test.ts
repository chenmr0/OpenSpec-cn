import { describe, it, expect } from 'vitest';
import { injectNudge, removePreviousNudgeMessages, NUDGE_MSG_ID_PREFIX } from '../../../dist/opencode-plugin/context-compression/nudge.js';
import type { CompressionState, WithParts } from '../../../dist/opencode-plugin/context-compression/types.js';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    nudgeInjectedForTask: null,
    isApplySession: false,
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
    expect(messages.length).toBe(1);
    expect(messages[0].parts[0].text).toBe('hello');
  });

  it('injects nudge as a new user message when completedOrder >= 3 and task not compressed', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'Task one', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: false });
    state.taskBoundaries.set('2', { taskId: '2', description: 'Task two', startMessageId: 'm1', endMessageId: 'm2', completedAt: 2, compressed: false });
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages.length).toBe(2);
    const nudgeMsg = messages[1];
    expect(nudgeMsg.info.role).toBe('user');
    expect(nudgeMsg.info.id.startsWith(NUDGE_MSG_ID_PREFIX)).toBe(true);
    expect(nudgeMsg.parts[0].text).toContain('task-compress');
    expect(nudgeMsg.parts[0].text).toContain('Task one');
    expect(state.nudgeInjectedForTask).toBe('1');
  });

  it('does not inject when candidate is already compressed', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'T1', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: true });
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages.length).toBe(1);
  });

  it('does not inject when nudge already injected', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'T1', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: false });
    state.nudgeInjectedForTask = '1';
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages.length).toBe(1);
  });

  it('does nothing when messages array is empty', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'T1', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: false });
    const messages: WithParts[] = [];
    injectNudge(state, messages);
    expect(messages.length).toBe(0);
  });

  it('injects nudge for multiple compressible tasks', () => {
    const state = makeState();
    state.completedOrder = ['1', '2', '3', '4'];
    state.taskBoundaries.set('1', { taskId: '1', description: 'Task 1', startMessageId: 'm0', endMessageId: 'm1', completedAt: 1, compressed: false });
    state.taskBoundaries.set('2', { taskId: '2', description: 'Task 2', startMessageId: 'm1', endMessageId: 'm2', completedAt: 2, compressed: false });
    const messages = [makeMessage('assistant', 'hello', 'm3')];
    injectNudge(state, messages);
    expect(messages.length).toBe(2);
    const nudgeMsg = messages[1];
    expect(nudgeMsg.parts[0].text).toContain('Task 1');
    expect(nudgeMsg.parts[0].text).toContain('Task 2');
  });
});

describe('removePreviousNudgeMessages', () => {
  it('removes messages with nudge ID prefix', () => {
    const messages: WithParts[] = [
      makeMessage('user', 'hello', 'msg-1'),
      makeMessage('assistant', 'world', 'msg-2'),
      makeMessage('user', 'nudge text', `${NUDGE_MSG_ID_PREFIX}123`),
      makeMessage('assistant', 'response', 'msg-4'),
    ];
    removePreviousNudgeMessages(messages);
    expect(messages.length).toBe(3);
    expect(messages.map(m => m.info.id)).toEqual(['msg-1', 'msg-2', 'msg-4']);
  });

  it('removes multiple nudge messages', () => {
    const messages: WithParts[] = [
      makeMessage('user', 'hello', 'msg-1'),
      makeMessage('user', 'nudge 1', `${NUDGE_MSG_ID_PREFIX}111`),
      makeMessage('assistant', 'response', 'msg-3'),
      makeMessage('user', 'nudge 2', `${NUDGE_MSG_ID_PREFIX}222`),
    ];
    removePreviousNudgeMessages(messages);
    expect(messages.length).toBe(2);
    expect(messages.map(m => m.info.id)).toEqual(['msg-1', 'msg-3']);
  });

  it('does not affect regular messages', () => {
    const messages: WithParts[] = [
      makeMessage('user', 'hello', 'msg-1'),
      makeMessage('assistant', 'world', 'msg-2'),
    ];
    removePreviousNudgeMessages(messages);
    expect(messages.length).toBe(2);
  });
});
