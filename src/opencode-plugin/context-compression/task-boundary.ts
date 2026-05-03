import type { CompressionState, ParsedTodo } from './types.js';

export function parseTodosFromInput(input: unknown): ParsedTodo[] {
  let parsed = input;
  if (typeof input === "string") {
    try { parsed = JSON.parse(input); } catch { return []; }
  }

  const todos = Array.isArray(parsed) ? parsed : (parsed as any)?.todos;
  if (!Array.isArray(todos)) {
    if (parsed && typeof parsed === 'object' && typeof (parsed as any).id === 'string') {
      return [{
        id: (parsed as any).id,
        content: (parsed as any).content ?? (parsed as any).subject ?? '',
        status: (parsed as any).status,
      }];
    }
    return [];
  }

  return todos
    .filter((t: any) => t && typeof t.id === "string" && typeof t.status === "string")
    .map((t: any) => ({
      id: t.id,
      content: t.content ?? t.subject ?? "",
      status: t.status,
    }));
}

export function trackTaskBoundary(args: {
  eventType: string;
  properties: Record<string, unknown> | undefined;
  compressionState: CompressionState;
}): void {
  if (args.eventType !== "message.part.updated") return;

  const part = args.properties?.part as Record<string, unknown> | undefined;
  if (!part || part.type !== "tool") return;
  if (part.tool !== "TodoWrite" && part.tool !== "TaskUpdate") return;

  const state = (part as any).state;
  if (!state || state.status !== "completed") return;

  const input = state.input;
  if (!input) return;

  const messageId = (part as any).messageID as string;
  if (typeof messageId !== "string") return;

  const todos = parseTodosFromInput(input);

  for (const todo of todos) {
    const previousStatus = args.compressionState.lastTodoSnapshot.get(todo.id);
    if (previousStatus === todo.status) continue;

    if (todo.status === "completed" && previousStatus !== "completed") {
      const previousCompleted = args.compressionState.completedOrder;
      const startMessageId = previousCompleted.length > 0
        ? args.compressionState.taskBoundaries.get(previousCompleted[previousCompleted.length - 1])!.endMessageId
        : messageId;

      args.compressionState.taskBoundaries.set(todo.id, {
        taskId: todo.id,
        description: todo.content,
        startMessageId,
        endMessageId: messageId,
        completedAt: Date.now(),
        compressed: false,
      });
      args.compressionState.completedOrder.push(todo.id);
    }

    args.compressionState.lastTodoSnapshot.set(todo.id, todo.status);
  }
}