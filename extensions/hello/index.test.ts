import { describe, expect, test } from "bun:test";
import { Value } from "typebox/value";
import {
  createMockExtensionAPI,
  runTool,
} from "@aio-pi/shared/testing";
import helloExtension from "./index.js";

describe("hello extension", () => {
  test("registers the hello tool", () => {
    const { api, tools } = createMockExtensionAPI();
    helloExtension(api);

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("hello");
    expect(tools[0]?.label).toBe("Hello");
    expect(tools[0]?.description).toBe("A simple greeting tool");
  });

  test("execute returns greeting content and details", async () => {
    const { api, tools } = createMockExtensionAPI();
    helloExtension(api);
    const tool = tools[0]!;

    const result = await runTool(tool, { name: "Ada" });

    expect(result.content).toEqual([{ type: "text", text: "Hello, Ada!" }]);
    expect(result.details).toEqual({ greeted: "Ada" });
  });

  test("parameters schema validates input", () => {
    const { api, tools } = createMockExtensionAPI();
    helloExtension(api);
    const { parameters } = tools[0]!;

    expect(Value.Check(parameters, { name: "Ada" })).toBe(true);
    expect(Value.Check(parameters, {})).toBe(false);
    expect(Value.Check(parameters, { name: 123 })).toBe(false);
  });
});
