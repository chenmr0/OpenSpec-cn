import { describe, it, expect } from 'vitest';
import { createMessagesTransformHandler } from '../../../src/opencode-plugin/context-compression/message-transform.js';
import type { CompressionState, WithParts } from '../../../src/opencode-plugin/context-compression/types.js';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    nudgeInjectedForTask: null,
  };
}

function makeMessage(role: string, text: string, id: string): WithParts {
  return {
    info: { id, sessionID: 'sess-1', role, time: { created: 1000 } },
    parts: [{ type: 'text', text, id: `prt-${id}`, sessionID: 'sess-1', messageID: id }],
  };
}

describe('createMessagesTransformHandler', () => {
  it('does nothing when no compression blocks and no nudge needed', async () => {
    const state = makeState();
    const store = { getState: () => state, getExistingState: () => state, cleanup: () => {} };
    const handler = createMessagesTransformHandler(store);
    const messages = [makeMessage('user', 'hello', 'm1')];
    await handler({}, { messages });
    expect(messages.length).toBe(1);
    expect(messages[0].parts[0].text).toBe('hello');
  });

  it('replaces compressed messages with summary', async () => {
    const state = makeState();
    state.compressionBlocks.set('1', {
      taskId: '1',
      summary: '实现了用户登录功能',
      modifiedFiles: ['src/auth.ts'],
      startMessageId: 'm2',
      endMessageId: 'm3',
      compressedAt: Date.now(),
      messageIds: [],
    });
    const store = { getState: () => state, getExistingState: () => state, cleanup: () => {} };
    const handler = createMessagesTransformHandler(store);
    const messages = [
      makeMessage('user', 'start', 'm1'),
      makeMessage('assistant', 'doing task 1', 'm2'),
      makeMessage('user', '[CodeSpec] continue', 'm3'),
      makeMessage('assistant', 'doing task 2', 'm4'),
    ];
    await handler({}, { messages });
    // m2 and m3 should be replaced by one summary message
    expect(messages.length).toBe(3);
    expect(messages[1].parts[0].text).toContain('实现了用户登录功能');
    expect(messages[1].parts[0].text).toContain('src/auth.ts');
    expect(messages[1].info.role).toBe('user');
  });

  it('handles multiple compression blocks (descending order)', async () => {
    const state = makeState();
    state.compressionBlocks.set('1', {
      taskId: '1', summary: 'Task 1 summary', modifiedFiles: [],
      startMessageId: 'm2', endMessageId: 'm2', compressedAt: 1, messageIds: [],
    });
    state.compressionBlocks.set('2', {
      taskId: '2', summary: 'Task 2 summary', modifiedFiles: [],
      startMessageId: 'm4', endMessageId: 'm4', compressedAt: 2, messageIds: [],
    });
    const store = { getState: () => state, getExistingState: () => state, cleanup: () => {} };
    const handler = createMessagesTransformHandler(store);
    const messages = [
      makeMessage('user', 'u1', 'm1'),
      makeMessage('assistant', 'a1', 'm2'),
      makeMessage('user', 'u2', 'm3'),
      makeMessage('assistant', 'a2', 'm4'),
      makeMessage('user', 'u3', 'm5'),
    ];
    await handler({}, { messages });
    // After: m1, [summary for m2], m3, [summary for m4], m5
    expect(messages.length).toBe(5);
  });
});