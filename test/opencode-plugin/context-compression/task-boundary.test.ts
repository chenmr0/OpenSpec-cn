import { describe, it, expect } from 'vitest';
import { trackTaskBoundary } from '../../../dist/opencode-plugin/context-compression/task-boundary.js';
import type { CompressionState } from '../../../dist/opencode-plugin/context-compression/types.js';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    nudgeInjectedForTask: null,
  };
}

describe('trackTaskBoundary', () => {
  it('ignores non message.part.updated events', () => {
    const state = makeState();
    trackTaskBoundary({ eventType: 'session.idle', properties: undefined, compressionState: state });
    expect(state.completedOrder).toEqual([]);
  });

  it('ignores non-TodoWrite tools', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: { type: 'tool', tool: 'edit', state: { status: 'completed' }, messageID: 'msg-1' },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual([]);
  });

  it('ignores non-completed tool status', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool',
          tool: 'TodoWrite',
          state: { status: 'running', input: { todos: [] } },
          messageID: 'msg-1',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual([]);
  });

  it('records first task completion', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool',
          tool: 'TodoWrite',
          state: {
            status: 'completed',
            input: {
              todos: [
                { id: '1', content: 'Task 1', status: 'completed' },
                { id: '2', content: 'Task 2', status: 'pending' },
              ],
            },
          },
          messageID: 'msg-1',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual(['1']);
    expect(state.taskBoundaries.get('1')!.description).toBe('Task 1');
    expect(state.taskBoundaries.get('1')!.compressed).toBe(false);
    expect(state.taskBoundaries.get('1')!.endMessageId).toBe('msg-1');
  });

  it('records multiple task completions in one TodoWrite call', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool',
          tool: 'TodoWrite',
          state: {
            status: 'completed',
            input: {
              todos: [
                { id: '1', content: 'Task 1', status: 'completed' },
                { id: '2', content: 'Task 2', status: 'completed' },
              ],
            },
          },
          messageID: 'msg-1',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual(['1', '2']);
  });

  it('sets startMessageId to previous task endMessageId', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TodoWrite',
          state: { status: 'completed', input: { todos: [{ id: '1', content: 'T1', status: 'completed' }] } },
          messageID: 'msg-10',
        },
      },
      compressionState: state,
    });
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TodoWrite',
          state: { status: 'completed', input: { todos: [{ id: '1', content: 'T1', status: 'completed' }, { id: '2', content: 'T2', status: 'completed' }] } },
          messageID: 'msg-20',
        },
      },
      compressionState: state,
    });
    expect(state.taskBoundaries.get('2')!.startMessageId).toBe('msg-10');
    expect(state.taskBoundaries.get('2')!.endMessageId).toBe('msg-20');
  });

  it('handles JSON string input', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TodoWrite',
          state: {
            status: 'completed',
            input: JSON.stringify({ todos: [{ id: '1', content: 'T1', status: 'completed' }] }),
          },
          messageID: 'msg-1',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual(['1']);
  });

  it('handles array input directly', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TodoWrite',
          state: {
            status: 'completed',
            input: [{ id: '1', content: 'T1', status: 'completed' }],
          },
          messageID: 'msg-1',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual(['1']);
  });

  it('skips malformed input silently', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TodoWrite',
          state: { status: 'completed', input: 'not-json' },
          messageID: 'msg-1',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual([]);
  });

  it('does not re-record already completed tasks', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TodoWrite',
          state: { status: 'completed', input: { todos: [{ id: '1', content: 'T1', status: 'completed' }] } },
          messageID: 'msg-10',
        },
      },
      compressionState: state,
    });
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TodoWrite',
          state: { status: 'completed', input: { todos: [{ id: '1', content: 'T1', status: 'completed' }] } },
          messageID: 'msg-20',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual(['1']);
  });

  it('also tracks TaskUpdate tool', () => {
    const state = makeState();
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TodoWrite',
          state: { status: 'completed', input: { todos: [{ id: '1', content: 'T1', status: 'pending' }] } },
          messageID: 'msg-1',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual([]);
    trackTaskBoundary({
      eventType: 'message.part.updated',
      properties: {
        part: {
          type: 'tool', tool: 'TaskUpdate',
          state: { status: 'completed', input: { id: '1', content: 'T1', status: 'completed' } },
          messageID: 'msg-2',
        },
      },
      compressionState: state,
    });
    expect(state.completedOrder).toEqual(['1']);
  });
});