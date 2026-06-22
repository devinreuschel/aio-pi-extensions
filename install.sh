#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SETTINGS="${PI_SETTINGS:-$HOME/.pi/agent/settings.json}"

if [ $# -eq 0 ]; then
  pi install "$REPO_ROOT"
  exit 0
fi

for name in "$@"; do
  ext_path="$REPO_ROOT/extensions/$name/index.ts"
  if [ ! -f "$ext_path" ]; then
    echo "error: extension not found: extensions/$name/index.ts" >&2
    exit 1
  fi
done

node - "$REPO_ROOT" "$SETTINGS" "$@" <<'EOF'
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [repoRoot, settingsPath, ...names] = process.argv.slice(2);
const extPaths = names.map((n) => `extensions/${n}/index.ts`);
const entry = { source: repoRoot, extensions: extPaths };

let settings = {};
try {
  settings = JSON.parse(readFileSync(settingsPath, "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

const packages = settings.packages ?? [];
const idx = packages.findIndex(
  (p) => typeof p === "object" && p !== null && p.source === repoRoot,
);
if (idx >= 0) packages[idx] = entry;
else packages.push(entry);
settings.packages = packages;

mkdirSync(dirname(settingsPath), { recursive: true });
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log(`installed ${names.join(", ")} -> ${settingsPath}`);
EOF
