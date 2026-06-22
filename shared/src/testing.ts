import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

type EventHandler = (event: unknown, ctx?: unknown) => unknown;

export interface MockExtensionAPI {
  api: ExtensionAPI;
  tools: ToolDefinition[];
  commands: { name: string; options: unknown }[];
  shortcuts: { shortcut: string; options: unknown }[];
  flags: { name: string; options: unknown }[];
  handlers: { event: string; handler: EventHandler }[];
}

/** stub ExtensionAPI that records registrations */
export function createMockExtensionAPI(): MockExtensionAPI {
  const tools: ToolDefinition[] = [];
  const commands: { name: string; options: unknown }[] = [];
  const shortcuts: { shortcut: string; options: unknown }[] = [];
  const flags: { name: string; options: unknown }[] = [];
  const handlers: { event: string; handler: EventHandler }[] = [];

  const api = {
    on(event: string, handler: EventHandler) {
      handlers.push({ event, handler });
    },
    registerTool(tool: ToolDefinition) {
      tools.push(tool);
    },
    registerCommand(name: string, options: unknown) {
      commands.push({ name, options });
    },
    registerShortcut(shortcut: string, options: unknown) {
      shortcuts.push({ shortcut, options });
    },
    registerFlag(name: string, options: unknown) {
      flags.push({ name, options });
    },
    getFlag() {
      return undefined;
    },
    registerMessageRenderer() {},
    sendMessage() {},
    sendUserMessage() {},
  } as unknown as ExtensionAPI;

  return { api, tools, commands, shortcuts, flags, handlers };
}

/** minimal ExtensionContext for tool.execute */
export function createToolContext(): ExtensionContext {
  return {
    ui: {} as ExtensionContext["ui"],
    mode: "json",
    hasUI: false,
    cwd: process.cwd(),
    sessionManager: {} as ExtensionContext["sessionManager"],
    modelRegistry: {} as ExtensionContext["modelRegistry"],
    model: undefined,
    isIdle: () => true,
    isProjectTrusted: () => true,
    signal: undefined,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => "",
  };
}

/** run a tool definition with test defaults */
export async function runTool<TDetails = unknown>(
  tool: ToolDefinition,
  params: Record<string, unknown>,
  ctx = createToolContext(),
) {
  return tool.execute(
    "test-call-id",
    params as never,
    undefined,
    undefined,
    ctx,
  ) as Promise<{ content: unknown[]; details: TDetails }>;
}
