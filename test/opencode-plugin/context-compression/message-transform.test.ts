import { describe, it, expect } from 'vitest';
import { createMessagesTransformHandler } from '../../../dist/opencode-plugin/context-compression/message-transform.js';
import { createCompressionStateStore } from '../../../dist/opencode-plugin/context-compression/compression-state-store.js';
import type { WithParts } from '../../../dist/opencode-plugin/context-compression/types.js';

const APPLY_MARKER = 'codespec-apply-change';

function makeMessagesWithTodoWrite(
  sessionId: string,
  todos: Array<{ content: string; status: string; priority?: string }>,
  toolStatus = 'completed',
  includeMarker = true,
): WithParts[] {
  const userText = includeMarker
    ? `do the tasks\n<!-- command: ${APPLY_MARKER} -->`
    : 'do the tasks';
  return [
    {
      info: { id: 'msg-user-1', sessionID: sessionId, role: 'user', time: { created: 1 } },
      parts: [{ type: 'text', text: userText }],
    },
    {
      info: { id: 'msg-assistant-1', sessionID: sessionId, role: 'assistant', time: { created: 2 } },
      parts: [
        { type: 'text', text: 'I will plan the tasks.' },
        {
          type: 'tool',
          tool: 'todowrite',
          callID: 'call-1',
          state: {
            status: toolStatus,
            input: { todos },
          },
        } as any,
      ],
    },
  ];
}

describe('createMessagesTransformHandler', () => {
  it('detects completed tasks from todowrite parts', async () => {
    const store = createCompressionStateStore();
    const handler = createMessagesTransformHandler(store);
    const state = store.getState('ses-1');

    const messages = makeMessagesWithTodoWrite('ses-1', [
      { content: 'Task A', status: 'completed', priority: 'high' },
      { content: 'Task B', status: 'pending', priority: 'high' },
    ]);

    await handler({}, { messages });

    expect(state.completedOrder.length).toBe(1);
    expect(state.taskBoundaries.size).toBe(1);
    const boundary = Array.from(state.taskBoundaries.values())[0];
    expect(boundary.description).toBe('Task A');
    expect(boundary.compressed).toBe(false);
  });

  it('detects multiple completed tasks in one todowrite call', async () => {
    const store = createCompressionStateStore();
    const handler = createMessagesTransformHandler(store);
    const state = store.getState('ses-2');

    const messages = makeMessagesWithTodoWrite('ses-2', [
      { content: 'Task 1', status: 'completed', priority: 'high' },
      { content: 'Task 2', status: 'completed', priority: 'high' },
      { content: 'Task 3', status: 'pending', priority: 'medium' },
    ]);

    await handler({}, { messages });

    expect(state.completedOrder.length).toBe(2);
  });

  it('does not re-record already completed tasks on subsequent calls', async () => {
    const store = createCompressionStateStore();
    const handler = createMessagesTransformHandler(store);
    const state = store.getState('ses-3');

    const messages1 = makeMessagesWithTodoWrite('ses-3', [
      { content: 'Task X', status: 'completed', priority: 'high' },
    ]);
    await handler({}, { messages: messages1 });
    expect(state.completedOrder.length).toBe(1);

    const messages2 = makeMessagesWithTodoWrite('ses-3', [
      { content: 'Task X', status: 'completed', priority: 'high' },
      { content: 'Task Y', status: 'completed', priority: 'high' },
    ]);
    await handler({}, { messages: messages2 });
    expect(state.completedOrder.length).toBe(2);
  });

  it('skips messages with no todowrite parts', async () => {
    const store = createCompressionStateStore();
    const handler = createMessagesTransformHandler(store);
    const state = store.getState('ses-4');

    const messages: WithParts[] = [
      {
        info: { id: 'msg-1', sessionID: 'ses-4', role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', text: `hello\n<!-- command: ${APPLY_MARKER} -->` }],
      },
    ];

    await handler({}, { messages });
    expect(state.completedOrder.length).toBe(0);
  });

  it('works when todowrite has running status', async () => {
    const store = createCompressionStateStore();
    const handler = createMessagesTransformHandler(store);
    const state = store.getState('ses-5');

    const messages = makeMessagesWithTodoWrite('ses-5', [
      { content: 'Done task', status: 'completed', priority: 'high' },
      { content: 'Next task', status: 'in_progress', priority: 'high' },
    ], 'running');

    await handler({}, { messages });
    expect(state.completedOrder.length).toBe(1);
  });

  it('replaces compressed messages with summary', async () => {
    const store = createCompressionStateStore();
    const handler = createMessagesTransformHandler(store);
    const state = store.getState('ses-6');

    // First detect a completed task
    const messages = makeMessagesWithTodoWrite('ses-6', [
      { content: 'Auth task', status: 'completed', priority: 'high' },
    ]);
    await handler({}, { messages });

    // Simulate compression happening (task-compress tool was called)
    const taskId = state.completedOrder[0];
    const boundary = state.taskBoundaries.get(taskId)!;
    boundary.compressed = true;
    state.compressionBlocks.set(taskId, {
      taskId,
      summary: '实现了用户登录功能',
      modifiedFiles: ['src/auth.ts'],
      startMessageId: boundary.startMessageId,
      endMessageId: boundary.endMessageId,
      compressedAt: Date.now(),
      messageIds: [],
    });

    // Next transform should replace the compressed range
    const messages2: WithParts[] = [
      {
        info: { id: 'msg-before', sessionID: 'ses-6', role: 'user', time: { created: 0 } },
        parts: [{ type: 'text', text: 'before' }],
      },
      {
        info: { id: 'msg-user-1', sessionID: 'ses-6', role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', text: `do the tasks\n<!-- command: ${APPLY_MARKER} -->` }],
      },
      {
        info: { id: 'msg-assistant-1', sessionID: 'ses-6', role: 'assistant', time: { created: 2 } },
        parts: [
          { type: 'text', text: 'I will plan the tasks.' },
          {
            type: 'tool',
            tool: 'todowrite',
            callID: 'call-1',
            state: {
              status: 'completed',
              input: { todos: [{ content: 'Auth task', status: 'completed', priority: 'high' }] },
            },
          } as any,
        ],
      },
      {
        info: { id: 'msg-after', sessionID: 'ses-6', role: 'user', time: { created: 3 } },
        parts: [{ type: 'text', text: 'continue' }],
      },
    ];

    await handler({}, { messages: messages2 });
    // The compressed range (msg-user-1 .. msg-assistant-1) should be replaced
    expect(messages2.some(m => m.parts.some(p => p.text?.includes('实现了用户登录功能')))).toBe(true);
  });

  it('does not trigger compression in non-apply sessions', async () => {
    const store = createCompressionStateStore();
    const handler = createMessagesTransformHandler(store);
    const state = store.getState('ses-non-apply');

    // Use includeMarker=false to simulate a non-apply session
    const messages = makeMessagesWithTodoWrite('ses-non-apply', [
      { content: 'Task A', status: 'completed', priority: 'high' },
      { content: 'Task B', status: 'completed', priority: 'high' },
      { content: 'Task C', status: 'completed', priority: 'high' },
    ], 'completed', false);

    await handler({}, { messages });

    // No tasks should be detected — compression is skipped entirely
    expect(state.completedOrder.length).toBe(0);
    expect(state.taskBoundaries.size).toBe(0);
    expect(state.isApplySession).toBe(false);
  });
});
