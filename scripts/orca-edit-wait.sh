#!/usr/bin/env bash
# Ctrl+G do Pi abrindo no editor do Orca (port bash de orca-edit-wait.ps1).
# Uso: externalEditor = <este script>
# O Pi chama: <script> <tmpfile>. Saída 0 = usa conteúdo de volta; != 0 = mantém texto.
set -u
file="${1:?usage: orca-edit-wait.sh <tmpfile>}"

timeout_sec="${ORCA_EDIT_TIMEOUT_SEC:-300}"
stable_need=6  # 6 x 500ms = ~3s estável após editar
orca="${ORCA_CLI_COMMAND:-orca}"

hash() { sha256sum "$1" 2>/dev/null | cut -d' ' -f1 || echo ""; }

fallback() {
  echo "orca-edit-wait: caindo para \${VISUAL:-\${EDITOR:-vi}}."
  "${VISUAL:-${EDITOR:-vi}}" "$file"
  exit $?
}

orig_hash="$(hash "$file")"
# `orca file open` exige path dentro de um worktree; o tmp do Pi não é.
# Espelha para o cwd da sessão (worktree Orca quando roda dentro do Orca).
stage="$PWD/.pi-editor-prompt.md"
trap 'rm -f "$stage"' EXIT

cp "$file" "$stage" || fallback

if [[ -z "${ORCA_EDIT_SKIP_OPEN:-}" ]]; then
  open_out="$("$orca" file open "$stage" --json 2>&1)" || {
    echo "orca-edit-wait: orca file open falhou: $open_out"
    fallback
  }
fi

echo "Editando no Orca. Salve o arquivo; fecha ~3s após estabilizar."
echo "Sem edição em ${timeout_sec}s cancela sozinho (Ctrl+C cancela já)."

last="$(hash "$stage")"
stable=0
changed=false
deadline=$(( SECONDS + timeout_sec ))
while (( SECONDS < deadline )); do
  sleep 0.5
  [[ -f "$stage" ]] || { echo "Arquivo sumiu, cancelando."; exit 1; }
  h="$(hash "$stage")"
  [[ "$h" != "$orig_hash" ]] && changed=true
  if [[ "$h" == "$last" ]]; then
    stable=$((stable + 1))
  else
    stable=0
    last="$h"
  fi
  if $changed && (( stable >= stable_need )); then break; fi
done

if ! $changed; then
  echo "Sem alterações, mantendo texto original."
  exit 1
fi
cp "$stage" "$file"
exit 0
