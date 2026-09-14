#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AgentDir = Join-Path $env:USERPROFILE ".pi\agent"
New-Item -ItemType Directory -Path (Join-Path $AgentDir "extensions"), (Join-Path $AgentDir "skills"), (Join-Path $AgentDir "bin") -Force | Out-Null
Copy-Item (Join-Path $RepoRoot "common\extensions\*") (Join-Path $AgentDir "extensions\") -Recurse -Force
Copy-Item (Join-Path $RepoRoot "common\skills\*") (Join-Path $AgentDir "skills\") -Recurse -Force
Copy-Item (Join-Path $RepoRoot "windows\extensions\*") (Join-Path $AgentDir "extensions\") -Recurse -Force
Copy-Item (Join-Path $RepoRoot "scripts\orca-edit-wait.ps1") (Join-Path $AgentDir "bin\") -Force
if (-not (Test-Path (Join-Path $AgentDir "settings.json"))) { Copy-Item (Join-Path $RepoRoot "windows\settings.json") (Join-Path $AgentDir "settings.json") -Force } else { Write-Host "settings.json exists, skipping (compare with windows/settings.json manually)" }
if (-not (Test-Path (Join-Path $AgentDir "AGENTS.md"))) { Copy-Item (Join-Path $RepoRoot "windows\AGENTS.md") (Join-Path $AgentDir "AGENTS.md") -Force } else { Write-Host "AGENTS.md exists, skipping" }
Write-Host "Done. Next: npm installs (see README), then /reload in pi."
