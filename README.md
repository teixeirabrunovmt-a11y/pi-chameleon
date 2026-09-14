# pi-chameleon

Personal [Pi coding agent](https://pi.dev) harness that adapts to the OS. Copy-paste setup, not a package — take what you need.

Based on [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config), plus Orca ADE integration and an auto handoff-compact.

## Layout

```text
common/                    shared by all OSes
  extensions/              custom-header, custom-footer, prompt-snippets,
                           web-fetch, browser, mini-hooks, handoff-compact,
                           ow-worktree, goal-loop
  skills/                  analyze-sessions, web-debug, youtube-transcript,
                           pdf-reader, goal-loop
windows/                   Windows profile (PowerShell)
  extensions/ps-guard.ts   destructive-command guard for powershell/bash tools
  settings.json            defaultTools with powershell + Ctrl+G in Orca editor
  AGENTS.md                Windows + PowerShell + PT-BR (3 lines)
unix/                      Linux/macOS profile (bash)
  extensions/bash-guard/   destructive-command guard (from pi-config, needs shell-quote)
  settings.json            defaultTools with bash
  AGENTS.md                Linux/macOS + bash, no Windows specifics
scripts/
  install.ps1              Windows installer (copies common + windows + bin wrapper)
  install.sh               Linux/macOS installer (copies common + unix)
  orca-edit-wait.ps1       Ctrl+G wrapper: opens Pi prompt in Orca editor, waits for save
docs/
  MANUAL.md                slash commands + keybinds cheat sheet (this setup)
```

## What each piece does

| Piece | What | Deps |
|---|---|---|
| `custom-header` | `Π` header | none |
| `custom-footer` | 3-line footer: git badges only when needed, usage/cache-hit/tps/context, thinking ANSI gradient, work timer; `/footer` cycles presets, `/builtin-footer` restores | none |
| `ask-user-question` | moved to npm — install `@juicesharp/rpiv-ask-user-question` (tabbed questionnaire, notes, collapse) | npm |
| `prompt-snippets` | `Alt+S` per-message prompt rules, reset after send | none |
| `web-fetch` | `web_fetch` via Readability+Turndown, Jina fallback, small PDFs | `npm install` |
| `browser` | Playwright headless Chromium, 8 `browser_*` tools, off until `/browser on` | `npm install` + `npx playwright install chromium` |
| `mini-hooks` | truncates tool outputs >8000 chars (tail + full in temp) + 1-line live Orca context | none |
| `handoff-compact` | at 70% context on 2 straight terminal turns: native compaction + handoff file in temp dir + opens follow-up Orca terminal. Once per session (`/handoff-off` disables) | Orca CLI (optional) |
| `ow-worktree` | `/ow name` creates Orca worktree + terminal running pi | Orca CLI |
| `goal-loop` | `/goal <text>` standing goal, one step per turn (Ralph loop) | none |
| `goal-loop` skill | protocol doc for `/goal` (`/goal draft|status|clear`) | needs `goal-loop` extension |
| `ps-guard` (windows) | blocks `Remove-Item -Recurse C:\`, `Format-Volume`, `irm|iex`, `push --force`, `reset --hard` | none |
| `bash-guard` (unix) | parses bash via `shell-quote`; prompts only on destructive ops (rm, sudo, dd, disk, power, infra deletes) and risky git; dialog with `ctrl+]` collapse + desktop notification | `npm install` (`shell-quote`) |
| `analyze-sessions` | `cost.py/prompts.py/search.py/show_session.py` over `~/.pi/agent/sessions/*.jsonl` | `python3` stdlib (Windows: `python`) |
| `pdf-reader` | `pdf_info/extract/render/search` triage for papers | venv + `pip install -r requirements.txt` (Windows: `.venv\Scripts\python.exe`) |
| `web-debug` | playbook pairing user phrases to `browser_*` sequences | needs `browser` |
| `youtube-transcript` | `yt-dlp` subs to transcript JSON | `yt-dlp` in PATH (`winget install yt-dlp` on Windows) |

## Install — Windows (PowerShell)

```powershell
git clone https://github.com/teixeirabrunovmt-a11y/pi-chameleon $env:TEMP\pi-chameleon
& "$env:TEMP\pi-chameleon\scripts\install.ps1"
# deps
npm --prefix "$env:USERPROFILE\.pi\agent\extensions\web-fetch" install
npm --prefix "$env:USERPROFILE\.pi\agent\extensions\browser" install
# when you need the browser: npx playwright install chromium (in browser dir)
# yt-dlp: winget install yt-dlp
# pdf-reader venv: python -m venv $env:USERPROFILE\.pi\agent\skills\pdf-reader\.venv
#   $env:USERPROFILE\.pi\agent\skills\pdf-reader\.venv\Scripts\pip install -r $env:USERPROFILE\.pi\agent\skills\pdf-reader\requirements.txt
```

Then open pi and run `/reload`.

## Install — Linux/macOS

```bash
git clone https://github.com/teixeirabrunovmt-a11y/pi-chameleon /tmp/pi-chameleon
/tmp/pi-chameleon/scripts/install.sh
# deps
npm --prefix ~/.pi/agent/extensions/web-fetch install
npm --prefix ~/.pi/agent/extensions/browser install
npm --prefix ~/.pi/agent/extensions/bash-guard install
npx --prefix ~/.pi/agent/extensions/browser playwright install chromium  # when needed
# yt-dlp + ffmpeg: brew install yt-dlp ffmpeg  (or apt)
python3 -m venv ~/.pi/agent/skills/pdf-reader/.venv
~/.pi/agent/skills/pdf-reader/.venv/bin/pip install -r ~/.pi/agent/skills/pdf-reader/requirements.txt
```

Then open pi and run `/reload`.

## Manual copy (alternative to scripts)

```bash
# common always
cp common/extensions/* ~/.pi/agent/extensions/ -r
cp common/skills/* ~/.pi/agent/skills/ -r
# then ONE profile
cp windows/extensions/* ~/.pi/agent/extensions/ -r   # Windows
cp windows/settings.json windows/AGENTS.md ~/.pi/agent/  # Windows
cp unix/extensions/* ~/.pi/agent/extensions/ -r       # Linux/macOS
cp unix/settings.json unix/AGENTS.md ~/.pi/agent/     # Linux/macOS
```

Do not clone over `~/.pi/agent` — copy pieces so you never wipe existing config or Orca-managed extensions.

## Settings notes

* `settings.json` sets `defaultTools` per OS, `compaction.reserveTokens: 60000` (~70% trigger on 200k models) with a `modelOverrides` example (`reserveTokens: 300000` ≈ 70% on 1M). Adjust model IDs to your exact `provider/model`.
* `AGENTS.md` files are intentionally 3 lines. Stack instructions belong in each project's `AGENTS.md`.
* `externalEditor` (windows) points at `~/.pi/agent/bin/orca-edit-wait.ps1`, so `Ctrl+G` opens the prompt in the Orca editor and returns on save (~3s after stable, cancels with no edit or `Ctrl+C`, falls back to Notepad outside a worktree).
* `externalEditor` (unix) same behavior with `scripts/orca-edit-wait.sh` (copy to `~/.pi/agent/bin/` and set `externalEditor` to it); falls back to `$VISUAL`/`$EDITOR` instead of Notepad.
* `ow-worktree` uses the current orca CLI syntax (`worktree create --name <n> --json` → `terminal create --worktree id:<id>`); `handoff-compact` opens its continuation terminal in the active worktree.

## Full cheat sheet

See [docs/MANUAL.md](docs/MANUAL.md) for all slash commands and keybinds.
