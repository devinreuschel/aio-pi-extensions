# aio-pi-extensions

Pi extension monorepo. Each extension is a self-contained directory under `extensions/` with its own `index.ts`.

## Layout

```
├── package.json          # pi manifest + workspaces
├── install.sh            # all / pick-some installer
├── shared/               # @aio-pi/shared workspace helpers
└── extensions/
    └── hello/            # sample extension
```

## Install modes

### All

```bash
./install.sh
# or
pi install git:github.com/skid/aio-pi-extensions
# or from a clone
pi install .
```

### Many (filtered)

```bash
./install.sh hello other
```

Writes a filtered package entry to `~/.pi/agent/settings.json`:

```json
{
  "source": "/path/to/aio-pi-extensions",
  "extensions": ["extensions/hello/index.ts", "extensions/other/index.ts"]
}
```

For remote installs, swap `source` to `git:github.com/skid/aio-pi-extensions`.

### One (copy a single dir)

```bash
cp -r extensions/hello ~/.pi/agent/extensions/
```

Extensions that import `@aio-pi/shared` are not copy-one-dir portable. Use whole-repo or filtered install for those.

## Development

```bash
bun install
bun run check
bun test
```

Pi loads `.ts` at runtime via jiti. Typecheck locally; no build step required.

### Testing

Tests are colocated as `*.test.ts` next to the code they cover. Run the full suite with `bun test`, watch mode with `bun run test:watch`, or coverage with `bun run test:coverage`.

Extension tests use `createMockExtensionAPI()` from `@aio-pi/shared/testing` to capture `registerTool` calls and `runTool()` to exercise tool `execute` handlers without a live Pi session. Add a matching `index.test.ts` when you add a new extension.

## Adding an extension

1. Create `extensions/<name>/index.ts` with a default export `(pi: ExtensionAPI) => {...}`
2. Add `package.json` only if the extension has its own deps
3. Extensions with deps can import from `@aio-pi/shared`
