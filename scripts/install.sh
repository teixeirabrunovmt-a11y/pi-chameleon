#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${HOME}/.pi/agent"
mkdir -p "${AGENT_DIR}/extensions" "${AGENT_DIR}/skills"
cp -r "${REPO_ROOT}/common/extensions/." "${AGENT_DIR}/extensions/"
cp -r "${REPO_ROOT}/common/skills/." "${AGENT_DIR}/skills/"
cp -r "${REPO_ROOT}/unix/extensions/." "${AGENT_DIR}/extensions/"
if [ -f "${AGENT_DIR}/settings.json" ]; then
  echo "settings.json exists, skipping (compare with unix/settings.json manually)"
else
  cp "${REPO_ROOT}/unix/settings.json" "${AGENT_DIR}/settings.json"
fi
if [ -f "${AGENT_DIR}/AGENTS.md" ]; then
  echo "AGENTS.md exists, skipping"
else
  cp "${REPO_ROOT}/unix/AGENTS.md" "${AGENT_DIR}/AGENTS.md"
fi
echo "Done. Next: npm installs (see README), then /reload in pi."
