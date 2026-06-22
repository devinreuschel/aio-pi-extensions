import { describe, expect, test } from "bun:test";

import { createMockExtensionAPI } from "@aio-pi/shared/testing";

import register from "./index.js";

describe("sandbox-intercept", () => {
  test("registers sandbox flag and command", () => {
    const mock = createMockExtensionAPI();
    register(mock.api);
    expect(mock.flags.some((f) => f.name === "no-sandbox")).toBe(true);
    expect(mock.commands.some((c) => c.name === "sandbox")).toBe(true);
    expect(mock.handlers.some((h) => h.event === "session_start")).toBe(true);
    expect(mock.handlers.some((h) => h.event === "tool_call")).toBe(true);
  });
});
