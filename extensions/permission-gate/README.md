# permission-gate

Interactive permission prompts for risky pi tool calls (bash, write, edit).

Read-only tools (read, grep, ls, find) pass through. Gated calls check layered allow/deny rules; unmatched calls show a popup with five outcomes.

## Install

```bash
./install.sh permission-gate
# or
pi install .
pi -e extensions/permission-gate
```

## Config

Layered (user + project; project gate overrides user gate):

- `<project>/.pi/permissions.json`
- `~/.pi/agent/permissions.json`

See [docs/permissions.example.json](../../docs/permissions.example.json).

### Rule match syntax

| Form | Meaning |
|------|---------|
| omitted | any call for that tool |
| `prog:git` | bash first token |
| `prefix:npm run ` | command/path starts with |
| `re:^ls\b` | regex |
| `src/**` | glob (write/edit paths) |
| plain string | exact command or path |

## Usage

| Control | Effect |
|---------|--------|
| `--no-permissions` | Disable prompts for this session |
| `/permissions` | Show active policy |
| `PI_PERMISSIONS_DISABLE=1` | Disable via environment |

### Popup choices

- **Allow once** — run this call only
- **Allow for session** — add in-memory rule for this session
- **Allow always** — append rule to project `.pi/permissions.json`
- **Skip** — block this call, agent continues
- **Stop** — block and abort the turn

Deny rules always block without prompting.
