import { describe, expect, test } from "bun:test";
import {
  cleanStepText,
  extractDoneSteps,
  extractTodoItems,
  filterReadOnlyTools,
  isSafeCommand,
  markCompletedSteps,
  READ_ONLY_TOOLS,
  type TodoItem,
} from "./utils.js";

describe("isSafeCommand", () => {
  test("allows read-only commands", () => {
    expect(isSafeCommand("ls -la")).toBe(true);
    expect(isSafeCommand("cat file.txt")).toBe(true);
    expect(isSafeCommand("git status")).toBe(true);
    expect(isSafeCommand("rg pattern src/")).toBe(true);
  });

  test("blocks destructive commands", () => {
    expect(isSafeCommand("rm -rf /")).toBe(false);
    expect(isSafeCommand("git commit -m x")).toBe(false);
    expect(isSafeCommand("npm install foo")).toBe(false);
    expect(isSafeCommand("echo hi > out.txt")).toBe(false);
  });

  test("blocks unknown commands", () => {
    expect(isSafeCommand("make build")).toBe(false);
  });
});

describe("extractTodoItems", () => {
  test("parses numbered steps under Plan header", () => {
    const text = `Some intro

Plan:
1. Add the plan-mode extension
2. Write tests for utils
3. Run bun test`;

    const items = extractTodoItems(text);
    expect(items).toHaveLength(3);
    expect(items[0]?.text).toContain("Plan-mode extension");
    expect(items[1]?.step).toBe(2);
  });

  test("returns empty when no Plan header", () => {
    expect(extractTodoItems("just some text")).toEqual([]);
  });
});

describe("cleanStepText", () => {
  test("strips markdown and truncates long text", () => {
    const long = "a".repeat(60);
    expect(cleanStepText(`**Bold** \`code\` step`)).toBe("Bold code step");
    expect(cleanStepText(long).length).toBeLessThanOrEqual(50);
  });
});

describe("markCompletedSteps", () => {
  test("marks steps done from [DONE:n] tags", () => {
    const items: TodoItem[] = [
      { step: 1, text: "First", completed: false },
      { step: 2, text: "Second", completed: false },
    ];
    const count = markCompletedSteps("Finished step 1 [DONE:1] and step 2 [DONE:2]", items);
    expect(count).toBe(2);
    expect(items.every((i) => i.completed)).toBe(true);
  });
});

describe("extractDoneSteps", () => {
  test("extracts step numbers", () => {
    expect(extractDoneSteps("[DONE:1] done [DONE:3]")).toEqual([1, 3]);
  });
});

describe("filterReadOnlyTools", () => {
  test("filters active tools to read-only subset", () => {
    const filtered = filterReadOnlyTools(["read", "bash", "edit", "write", "grep"]);
    expect(filtered).toEqual(["read", "bash", "grep"]);
  });

  test("falls back to static list when no overlap", () => {
    expect(filterReadOnlyTools(["edit", "write"])).toEqual([...READ_ONLY_TOOLS]);
  });
});
