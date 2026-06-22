# aio-pi-extensions

Pi extension monorepo. Each extension is a self-contained directory under `extensions/` with its own `index.ts`.

## Layout

```
├── package.json          # pi manifest + workspaces
├── install.sh            # all / pick-some installer
├── shared/               # @aio-pi/shared workspace helpers
├── docs/
│   ├── sandbox.example.json
│   └── permissions.example.json
└── extensions/
    ├── sandbox-intercept/  # OS-level sandbox extension
    ├── permission-gate/    # interactive tool permission prompts
    └── plan-mode/          # read-only plan + tracked execution
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
./install.sh sandbox-intercept
```

Writes a filtered package entry to `~/.pi/agent/settings.json`:

```json
{
  "source": "/path/to/aio-pi-extensions",
  "extensions": ["extensions/sandbox-intercept/index.ts"]
}
```

For remote installs, swap `source` to `git:github.com/skid/aio-pi-extensions`.

### One (copy a single dir)

```bash
cp -r extensions/sandbox-intercept ~/.pi/agent/extensions/
```

Extensions that import `@aio-pi/shared` are not copy-one-dir portable. Use whole-repo or filtered install for those.

## sandbox-intercept

OS-level sandbox for pi (Seatbelt on macOS, Landlock+bubblewrap on Linux). Wraps bash and gates read/write/edit tool calls. Toggle on/off per session — standalone extension, no launcher required.

```bash
./install.sh sandbox-intercept
pi -e extensions/sandbox-intercept
```

| Control | Effect |
|---------|--------|
| `--no-sandbox` | Disable sandboxing for this session |
| `/sandbox` | Show active filesystem and network policy |
| `SANDBOX_INTERCEPT_DISABLE=1` | Disable via environment |

### Config

Layered (project overrides user):

- `<project>/.pi/sandbox.json`
- `~/.pi/agent/sandbox.json`

See [docs/sandbox.example.json](docs/sandbox.example.json). Provider presets (`anthropic`, `openai`, `llama.cpp`, etc.) expand to allowed domains for bash network policy.

### Security (honest)

Mistake-resistance, not adversarial containment. See [SECURITY.md](SECURITY.md).

## permission-gate

Interactive permission prompts for bash, write, and edit tool calls. Read-only tools pass through. Unmatched gated calls show a popup: allow once, allow for session, allow always, skip, or stop.

```bash
./install.sh permission-gate
pi -e extensions/permission-gate
```

| Control | Effect |
|---------|--------|
| `--no-permissions` | Disable prompts for this session |
| `/permissions` | Show active allow/deny policy |
| `PI_PERMISSIONS_DISABLE=1` | Disable via environment |

### Config

Layered (user + project):

- `<project>/.pi/permissions.json`
- `~/.pi/agent/permissions.json`

See [docs/permissions.example.json](docs/permissions.example.json).

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
