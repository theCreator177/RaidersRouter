#!/usr/bin/env bash
# Install the RaidersRouter Claude Code marketplace and its plugins.
#
# Usage:
#   ./scripts/install-claude-plugins.sh            # register marketplace + install all plugins
#   ./scripts/install-claude-plugins.sh --local    # use this checkout instead of GitHub (dev)
#   ./scripts/install-claude-plugins.sh --list     # show what would be installed, install nothing
#
# Everything is done through the official `claude plugin` CLI, which writes the
# marketplace/plugin config itself. This script never edits settings.json directly.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKETPLACE_NAME="raiders-router"
MARKETPLACE_REPO="theCreator177/RaidersRouter"

# Plugins are listed as "name:requirement" — requirement is a human note, not enforced.
PLUGINS=(
  "raiders-toolkit:no external deps"
  "watch:needs yt-dlp + ffmpeg on PATH"
  "mattpocock-skills:none"
  "codex:needs the Codex CLI installed"
  "omniroute-skills:none (MCP server optional)"
  "code-review-graph:python pkg optional for the MCP server"
  "ai-engineering-skills:none"
  "openship-config:none"
)

LOCAL_MODE=0
LIST_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL_MODE=1 ;;
    --list)  LIST_ONLY=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ "$LIST_ONLY" -eq 1 ]; then
  echo "Marketplace: ${MARKETPLACE_NAME} (${MARKETPLACE_REPO})"
  echo "Plugins:"
  for entry in "${PLUGINS[@]}"; do
    printf '  %-22s  %s\n' "${entry%%:*}" "${entry#*:}"
  done
  exit 0
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "error: the 'claude' CLI was not found on PATH." >&2
  echo "Install Claude Code first: https://code.claude.com/docs" >&2
  exit 1
fi

if [ "$LOCAL_MODE" -eq 1 ]; then
  SOURCE="$REPO_ROOT"
  echo "==> Registering marketplace from local checkout: $SOURCE"
else
  SOURCE="$MARKETPLACE_REPO"
  echo "==> Registering marketplace from GitHub: $SOURCE"
fi

claude plugin marketplace add "$SOURCE"

echo ""
echo "==> Installing plugins"
failed=()
for entry in "${PLUGINS[@]}"; do
  name="${entry%%:*}"
  note="${entry#*:}"
  printf -- '--> %s (%s)\n' "$name" "$note"
  if ! claude plugin install "${name}@${MARKETPLACE_NAME}"; then
    echo "    !! failed: $name" >&2
    failed+=("$name")
  fi
done

echo ""
if [ ${#failed[@]} -gt 0 ]; then
  echo "Completed with ${#failed[@]} failure(s): ${failed[*]}" >&2
  echo "Re-run individually with: claude plugin install <name>@${MARKETPLACE_NAME}" >&2
  exit 1
fi

echo "All plugins installed. Run '/plugin' inside Claude Code to review them."
echo "Note: newly added top-level skills require restarting Claude Code to appear."
