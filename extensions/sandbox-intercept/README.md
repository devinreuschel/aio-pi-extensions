# sandbox-intercept

OS-level sandbox for pi: Seatbelt on macOS, Landlock+bubblewrap on Linux.

Wraps bash in `@carderne/sandbox-runtime` and gates read/write/edit tool calls. Toggle on/off per session — no launcher required.

## Install

```bash
./install.sh sandbox-intercept
# or
pi install .
pi -e extensions/sandbox-intercept
```

## Config

Layered (project overrides user):

- `<project>/.pi/sandbox.json`
- `~/.pi/agent/sandbox.json`

See [docs/sandbox.example.json](../../docs/sandbox.example.json).

## Usage

- `--no-sandbox` — disable for this session
- `/sandbox` — show active policy
- `SANDBOX_INTERCEPT_DISABLE=1` — disable via env
