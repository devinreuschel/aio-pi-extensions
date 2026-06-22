# Security model — sandbox-intercept

OS-level intercept sandbox for pi (Seatbelt on macOS, Landlock+bubblewrap on Linux).

## What it protects against

- Casual mistakes: broad filesystem reads/writes outside allowed paths
- Many network calls (OS sandbox policy on bash)
- Ungated read/write/edit tool calls outside configured paths

## What it does not protect against

- Adversarial code running inside the host `pi` Node process
- Subprocess or shell escape from the OS sandbox
- `.git/hooks`, post-install scripts, or other host-side execution outside pi tools
- Gaps in Seatbelt/Landlock/bubblewrap coverage

## Credentials

API keys in the host environment are readable by the host `pi` process. This extension does not broker or hide secrets.

## Honest scope

Mistake-resistance, not adversarial containment. Toggle off with `--no-sandbox` or `SANDBOX_INTERCEPT_DISABLE=1`.
