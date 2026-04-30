/**
 * Todo utility for counting incomplete tasks.
 */

import type { Todo } from "./types.js";

export function getIncompleteCount(todos: Todo[]): number {
  return todos.filter(
    (todo) =>
      todo.status !== "completed"
      && todo.status !== "cancelled"
      && todo.status !== "blocked"
      && todo.status !== "deleted",
  ).length;
}
