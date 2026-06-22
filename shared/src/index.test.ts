import { describe, expect, test } from "bun:test";
import { Value } from "typebox/value";
import { greet, nameParam } from "./index.js";

describe("greet", () => {
  test("formats a greeting", () => {
    expect(greet("world")).toBe("Hello, world!");
  });

  test("handles empty string", () => {
    expect(greet("")).toBe("Hello, !");
  });
});

describe("nameParam", () => {
  test("accepts strings", () => {
    expect(Value.Check(nameParam, "Ada")).toBe(true);
  });

  test("rejects non-strings", () => {
    expect(Value.Check(nameParam, 123)).toBe(false);
  });
});
