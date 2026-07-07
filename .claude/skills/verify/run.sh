#!/usr/bin/env bash
# Invariant suite runner — drives index.html in headless Chromium and asserts
# the repo's documented invariants (CLAUDE.md). Usage:
#   .claude/skills/verify/run.sh            # run everything
#   .claude/skills/verify/run.sh 05         # run scenarios matching "05"
# Deps live OUTSIDE the repo (playwright-core in ~/.cache) — the repo's
# package.json must stay dependency-free.
set -u
cd "$(dirname "$0")"

DEPS="${WT_VERIFY_DEPS:-$HOME/.cache/wt-verify-deps}"
if [ ! -d "$DEPS/node_modules/playwright-core" ]; then
  echo "Installing playwright-core into $DEPS (one-time)…"
  mkdir -p "$DEPS"
  (cd "$DEPS" && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund playwright-core >/dev/null) || { echo "npm install failed"; exit 2; }
fi
export NODE_PATH="$DEPS/node_modules"

if [ -z "${WT_CHROME:-}" ]; then
  WT_CHROME="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)"
  if [ -z "$WT_CHROME" ]; then
    for c in chromium chromium-browser google-chrome-stable google-chrome; do
      WT_CHROME="$(command -v "$c" 2>/dev/null)" && [ -n "$WT_CHROME" ] && break
    done
  fi
  export WT_CHROME
fi
[ -z "${WT_CHROME:-}" ] && { echo "No Chromium found — set WT_CHROME=/path/to/chrome"; exit 2; }

filter="${1:-}"
fail=0; ran=0
for f in suite/[0-9]*.js; do
  [ -n "$filter" ] && case "$f" in *"$filter"*) ;; *) continue;; esac
  ran=$((ran+1))
  echo "▶ $f"
  node "$f" || fail=1
done
[ $ran -eq 0 ] && { echo "No scenarios matched '$filter'"; exit 2; }
echo
[ $fail -eq 0 ] && echo "✅ ALL SCENARIOS PASSED ($ran)" || echo "❌ SUITE FAILED"
exit $fail
