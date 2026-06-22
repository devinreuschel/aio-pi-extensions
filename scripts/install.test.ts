import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// filtered install path only; no-arg branch shells out to `pi install`
const REPO_ROOT = join(import.meta.dirname, "..");
const INSTALL_SH = join(REPO_ROOT, "install.sh");

let tempDir: string;
let settingsPath: string;

async function runInstall(...args: string[]) {
  const proc = Bun.spawn(["bash", INSTALL_SH, ...args], {
    env: { ...process.env, PI_SETTINGS: settingsPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

async function readSettings() {
  return JSON.parse(await readFile(settingsPath, "utf8")) as {
    packages?: { source: string; extensions: string[] }[];
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aio-pi-install-"));
  settingsPath = join(tempDir, "settings.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("install.sh filtered install", () => {
  test("creates settings with package entry on fresh file", async () => {
    const { exitCode, stdout } = await runInstall("hello");

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`installed hello -> ${settingsPath}`);

    const settings = await readSettings();
    expect(settings.packages).toEqual([
      {
        source: REPO_ROOT,
        extensions: ["extensions/hello/index.ts"],
      },
    ]);
  });

  test("replaces existing entry for same source", async () => {
    await mkdir(join(tempDir, "nested"), { recursive: true });
    settingsPath = join(tempDir, "nested", "settings.json");
    await writeFile(
      settingsPath,
      JSON.stringify({
        packages: [
          {
            source: REPO_ROOT,
            extensions: ["extensions/old/index.ts"],
          },
        ],
      }),
    );

    const { exitCode } = await runInstall("hello");
    expect(exitCode).toBe(0);

    const settings = await readSettings();
    expect(settings.packages).toHaveLength(1);
    expect(settings.packages?.[0]).toEqual({
      source: REPO_ROOT,
      extensions: ["extensions/hello/index.ts"],
    });
  });

  test("preserves unrelated packages", async () => {
    const other = { source: "/other/repo", extensions: ["extensions/foo/index.ts"] };
    await writeFile(
      settingsPath,
      JSON.stringify({ packages: [other] }),
    );

    const { exitCode } = await runInstall("hello");
    expect(exitCode).toBe(0);

    const settings = await readSettings();
    expect(settings.packages).toHaveLength(2);
    expect(settings.packages?.[0]).toEqual(other);
    expect(settings.packages?.[1]).toEqual({
      source: REPO_ROOT,
      extensions: ["extensions/hello/index.ts"],
    });
  });

  test("fails for unknown extension", async () => {
    const { exitCode, stderr } = await runInstall("missing-ext");

    expect(exitCode).toBe(1);
    expect(stderr).toContain("error: extension not found: extensions/missing-ext/index.ts");
  });
});
