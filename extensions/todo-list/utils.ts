/** Pure helpers for todo-list extension. */

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
}

let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

export function createTodo(content: string, status: TodoStatus = "pending", id?: string): Todo {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("todo content required");
  return {
    id: id ?? `todo-${++idCounter}-${Math.random().toString(36).slice(2, 7)}`,
    content: trimmed,
    status,
  };
}

export function mergeTodos(list: Todo[], incoming: Todo[], merge = true): Todo[] {
  if (!merge) return incoming.map((t) => ({ ...t }));

  const byId = new Map(list.map((t) => [t.id, { ...t }]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (existing) {
      existing.content = item.content.trim() || existing.content;
      existing.status = item.status;
    } else {
      byId.set(item.id, { ...item, content: item.content.trim() });
    }
  }
  return [...byId.values()];
}

export function setStatus(list: Todo[], id: string, status: TodoStatus): Todo[] {
  return list.map((t) => (t.id === id ? { ...t, status } : t));
}

export function removeTodo(list: Todo[], id: string): Todo[] {
  return list.filter((t) => t.id !== id);
}

export function resolveRef(list: Todo[], ref: string): Todo | undefined {
  const trimmed = ref.trim();
  if (!trimmed) return undefined;

  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 1 && index <= list.length) {
    return list[index - 1];
  }

  const matches = list.filter((t) => t.id.startsWith(trimmed) || t.id === trimmed);
  if (matches.length === 1) return matches[0];
  return undefined;
}

export function parseStatusArg(word: string): TodoStatus | undefined {
  switch (word.toLowerCase()) {
    case "start":
      return "in_progress";
    case "done":
      return "completed";
    case "cancel":
      return "cancelled";
    default:
      return undefined;
  }
}

export function statusSymbol(status: TodoStatus): string {
  switch (status) {
    case "pending":
      return "☐";
    case "in_progress":
      return "◐";
    case "completed":
      return "☑";
    case "cancelled":
      return "✗";
  }
}

export function formatTodoList(list: Todo[]): string {
  if (list.length === 0) return "(empty)";
  return list
    .map((t, i) => `${i + 1}. ${statusSymbol(t.status)} ${t.content}`)
    .join("\n");
}

export interface TodoCounts {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

export function countByStatus(list: Todo[]): TodoCounts {
  const counts: TodoCounts = {
    total: list.length,
    pending: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const t of list) {
    switch (t.status) {
      case "pending":
        counts.pending++;
        break;
      case "in_progress":
        counts.inProgress++;
        break;
      case "completed":
        counts.completed++;
        break;
      case "cancelled":
        counts.cancelled++;
        break;
    }
  }
  return counts;
}

export function summarizeTodos(list: Todo[]): string {
  const c = countByStatus(list);
  if (c.total === 0) return "Todo list cleared.";
  return `${c.completed}/${c.total} done${c.inProgress > 0 ? `, ${c.inProgress} in progress` : ""}`;
}
