import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadConfig, projectConfigPath } from "./config.js";

describe("sandbox-intercept config", () => {
  test("defaults to deny-all network and standard filesystem policy", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sandbox-cfg-"));
    const config = loadConfig(cwd);
    expect(config.network.allowedDomains).toEqual([]);
    expect(config.filesystem.denyWrite).toContain(".env");
  });

  test("project config overrides user defaults", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sandbox-cfg-"));
    const piDir = join(cwd, ".pi");
    mkdirSync(piDir, { recursive: true });
    writeFileSync(
      projectConfigPath(cwd),
      JSON.stringify({
        network: { providers: ["anthropic"] },
        filesystem: { allowWrite: [".", "/tmp", "secrets/"] },
      }),
    );

    const config = loadConfig(cwd);
    expect(config.network.allowedDomains).toContain("api.anthropic.com");
    expect(config.filesystem.allowWrite).toContain("secrets/");
  });
});
