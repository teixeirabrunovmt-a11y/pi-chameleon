#Requires -Version 5.1
# Ctrl+G do Pi abrindo no editor do Orca (com --wait improvisado).
# Uso: externalEditor = powershell -NoProfile -ExecutionPolicy Bypass -File <este script>
# O Pi chama: <script> <tmpfile>. Saida 0 = usa conteúdo de volta; != 0 = mantém texto.
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = "Stop"

$timeoutSec = [int]$env:ORCA_EDIT_TIMEOUT_SEC
if ($timeoutSec -le 0) { $timeoutSec = 300 }
$stableNeedTicks = 6 # 6 x 500ms = ~3s sem mudança após editar
$orca = if ($env:ORCA_CLI_COMMAND) { $env:ORCA_CLI_COMMAND } else { "orca" }

function Get-Hash($p) {
  try { (Get-FileHash -Path $p -Algorithm SHA256).Hash } catch { "" }
}

function Open-NotepadFallback($f) {
  Write-Host "orca-edit-wait: caindo para Notepad."
  $np = Join-Path $env:SystemRoot "system32\notepad.exe"
  $p = Start-Process -FilePath $np -ArgumentList "`"$f`"" -PassThru -Wait
  exit $p.ExitCode
}

$origHash = Get-Hash $File
# `orca file open` exige path dentro de um worktree; o tmp do Pi (%TEMP%) não é.
# Espelha para o cwd da sessão (worktree Orca quando roda dentro do Orca).
$stage = Join-Path (Get-Location) ".pi-editor-prompt.md"
try {
  Copy-Item $File $stage -Force
  if (-not $env:ORCA_EDIT_SKIP_OPEN) {
    $openOut = & $orca file open $stage --json 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "orca file open falhou: $openOut" }
  }
  Write-Host "Editando no Orca. Salve o arquivo; fecha ~3s após estabilizar."
  Write-Host "Sem edição em ${timeoutSec}s cancela sozinho (Ctrl+C cancela já)."
  $last = Get-Hash $stage
  $stable = 0
  $changed = $false
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (-not (Test-Path $stage)) { Write-Host "Arquivo sumiu, cancelando."; exit 1 }
    $h = Get-Hash $stage
    if ($h -ne $origHash) { $changed = $true }
    if ($h -eq $last) { $stable++ } else { $stable = 0; $last = $h }
    if ($changed -and $stable -ge $stableNeedTicks) { break }
  }
  if (-not $changed) { Write-Host "Sem alterações, mantendo texto original."; exit 1 }
  Copy-Item $stage $File -Force
  exit 0
}
catch {
  Write-Host "orca-edit-wait: $($_.Exception.Message)"
  Open-NotepadFallback $File
}
finally {
  Remove-Item $stage -Force -ErrorAction SilentlyContinue
}
