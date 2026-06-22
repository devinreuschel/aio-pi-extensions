import { describe, expect, test, beforeEach } from "bun:test";
import {
  countByStatus,
  createTodo,
  formatTodoList,
  mergeTodos,
  parseStatusArg,
  removeTodo,
  resetIdCounter,
  resolveRef,
  setStatus,
  statusSymbol,
  summarizeTodos,
  type Todo,
} from "./utils.js";

beforeEach(() => resetIdCounter());

describe("createTodo", () => {
  test("creates with default pending status", () => {
    const t = createTodo("Write tests", undefined, "t1");
    expect(t).toEqual({ id: "t1", content: "Write tests", status: "pending" });
  });

  test("generates unique ids", () => {
    const a = createTodo("a");
    const b = createTodo("b");
    expect(a.id).not.toBe(b.id);
  });

  test("rejects empty content", () => {
    expect(() => createTodo("  ")).toThrow("todo content required");
  });
});

describe("mergeTodos", () => {
  const base: Todo[] = [
    { id: "a", content: "First", status: "pending" },
    { id: "b", content: "Second", status: "pending" },
  ];

  test("replaces list when merge=false", () => {
    const incoming: Todo[] = [{ id: "c", content: "New", status: "pending" }];
    expect(mergeTodos(base, incoming, false)).toEqual(incoming);
  });

  test("updates existing by id and appends new", () => {
    const incoming: Todo[] = [
      { id: "a", content: "First done", status: "completed" },
      { id: "c", content: "Third", status: "pending" },
    ];
    const result = mergeTodos(base, incoming, true);
    expect(result).toHaveLength(3);
    expect(result.find((t) => t.id === "a")?.status).toBe("completed");
    expect(result.find((t) => t.id === "c")?.content).toBe("Third");
  });
});

describe("setStatus / removeTodo", () => {
  const list: Todo[] = [{ id: "x", content: "Task", status: "pending" }];

  test("setStatus updates matching id", () => {
    expect(setStatus(list, "x", "completed")[0]?.status).toBe("completed");
  });

  test("removeTodo drops matching id", () => {
    expect(removeTodo(list, "x")).toEqual([]);
  });
});

describe("resolveRef", () => {
  const list: Todo[] = [
    { id: "abc123", content: "One", status: "pending" },
    { id: "def456", content: "Two", status: "pending" },
  ];

  test("resolves 1-based index", () => {
    expect(resolveRef(list, "2")?.content).toBe("Two");
  });

  test("resolves id prefix", () => {
    expect(resolveRef(list, "abc")?.content).toBe("One");
  });

  test("returns undefined for ambiguous prefix", () => {
    const dupes: Todo[] = [
      { id: "abc1", content: "A", status: "pending" },
      { id: "abc2", content: "B", status: "pending" },
    ];
    expect(resolveRef(dupes, "abc")).toBeUndefined();
  });
});

describe("parseStatusArg", () => {
  test("maps command verbs", () => {
    expect(parseStatusArg("start")).toBe("in_progress");
    expect(parseStatusArg("done")).toBe("completed");
    expect(parseStatusArg("cancel")).toBe("cancelled");
  });
});

describe("statusSymbol / formatTodoList", () => {
  test("symbols for each status", () => {
    expect(statusSymbol("pending")).toBe("☐");
    expect(statusSymbol("in_progress")).toBe("◐");
    expect(statusSymbol("completed")).toBe("☑");
    expect(statusSymbol("cancelled")).toBe("✗");
  });

  test("formats numbered list", () => {
    const list: Todo[] = [{ id: "1", content: "Ship it", status: "pending" }];
    expect(formatTodoList(list)).toBe("1. ☐ Ship it");
    expect(formatTodoList([])).toBe("(empty)");
  });
});

describe("countByStatus / summarizeTodos", () => {
  test("counts by status", () => {
    const list: Todo[] = [
      { id: "1", content: "a", status: "completed" },
      { id: "2", content: "b", status: "in_progress" },
      { id: "3", content: "c", status: "pending" },
    ];
    expect(countByStatus(list)).toEqual({
      total: 3,
      completed: 1,
      inProgress: 1,
      pending: 1,
      cancelled: 0,
    });
  });

  test("summarizes progress", () => {
    const list: Todo[] = [
      { id: "1", content: "a", status: "completed" },
      { id: "2", content: "b", status: "in_progress" },
    ];
    expect(summarizeTodos(list)).toBe("1/2 done, 1 in progress");
    expect(summarizeTodos([])).toBe("Todo list cleared.");
  });
});
