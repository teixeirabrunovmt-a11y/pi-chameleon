/**
 * custom-footer (pi extension) — rodapé do chameleon.
 *
 * União do melhor de pi-open-tui (segmentos ligáveis + presets) e
 * @henryqw/pi-footer (badges de git só quando há ação, TPS, thinking
 * em gradiente ANSI, timer de trabalho com persistência).
 *
 * Presets (cicla com /footer, persiste em ~/.pi/agent/custom-footer.json):
 *   full    → tudo
 *   compact → sem sessionName, ⚡tps e ◷timer
 *   minimal → só ◔contexto% + modelo • thinking
 * Segmentos individuais: edite "segments" no JSON e rode /reload.
 * /builtin-footer restaura o rodapé nativo do Pi.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const CONFIG_PATH = join(process.env.HOME ?? "", ".pi", "agent", "custom-footer.json");
const THINKING_COLORS = { minimal: 46, low: 82, medium: 118, high: 220, xhigh: 208, max: 196 } as const;
const AGENT_TIME_ENTRY = "custom-footer:agent-work";
const SUBAGENT_BACKGROUND_RESULT = "subagent-background-result";

type Segments = {
  cwd: boolean; sessionName: boolean; gitBranch: boolean; gitStatus: boolean;
  tokens: boolean; tps: boolean; cost: boolean; context: boolean;
  extensionStatuses: boolean; timer: boolean;
};
const ALL_ON: Segments = { cwd: true, sessionName: true, gitBranch: true, gitStatus: true, tokens: true, tps: true, cost: true, context: true, extensionStatuses: true, timer: true };
const PRESETS: Record<string, Segments> = {
  full: { ...ALL_ON },
  compact: { ...ALL_ON, sessionName: false, tps: false, timer: false },
  minimal: { cwd: false, sessionName: false, gitBranch: false, gitStatus: false, tokens: false, tps: false, cost: false, context: true, extensionStatuses: false, timer: false },
};
const PRESET_ORDER = ["full", "compact", "minimal"] as const;

type CountedUsage = { input: number; output: number; cost: { total: number } };
type GitSummary = { badges: string; detachedOid?: string };
const EMPTY_GIT_SUMMARY: GitSummary = { badges: "" };

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function subagentBackgroundUsage(details: unknown): CountedUsage | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return;
  const usage = (details as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return;
  const record = usage as Record<string, unknown>;
  const cost = record.cost;
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) return;
  const total = (cost as Record<string, unknown>).total;
  if (!isNonNegativeNumber(record.input) || !isNonNegativeNumber(record.output) || !isNonNegativeNumber(total)) return;
  return { input: record.input, output: record.output, cost: { total } };
}

function formatTokens(count: number): string {
  if (count < 1_000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}h ${minutes}m ${seconds}s` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function sanitizeStatus(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

function summarizeGitStatus(output: string, operation?: string): GitSummary {
  let staged = 0, unstaged = 0, untracked = 0, conflicts = 0, ahead = 0, behind = 0;
  let detachedOid: string | undefined;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("# branch.oid ")) {
      const oid = line.slice(13).trim();
      if (oid !== "(initial)") detachedOid = oid.slice(0, 7);
    } else if (line.startsWith("# branch.ab ")) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line);
      if (match) { ahead = Number(match[1]); behind = Number(match[2]); }
    } else if (line.startsWith("? ")) untracked++;
    else if (line.startsWith("u ")) conflicts++;
    else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const xy = line.slice(2, 4);
      if (xy[0] !== ".") staged++;
      if (xy[1] !== ".") unstaged++;
    }
  }
  const badges = [
    operation,
    conflicts ? `!${conflicts}` : undefined,
    staged ? `+${staged}` : undefined,
    unstaged ? `~${unstaged}` : undefined,
    untracked ? `?${untracked}` : undefined,
    ahead ? `↑${ahead}` : undefined,
    behind ? `↓${behind}` : undefined,
  ].filter(Boolean).join(" ");
  return { badges: badges ? `[${badges}]` : "", detachedOid };
}

async function readOptional(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
}

function operationProgress(current: string | undefined, total: string | undefined): string {
  const currentStep = Number.parseInt(current ?? "", 10);
  const totalSteps = Number.parseInt(total ?? "", 10);
  return currentStep > 0 && totalSteps > 0 ? ` ${currentStep}/${totalSteps}` : "";
}

async function readGitOperation(gitDir: string): Promise<string | undefined> {
  const [rmC, rmT, raC, raT, applying, mergeHead, cherryPickHead, revertHead, bisectLog] = await Promise.all([
    readOptional(join(gitDir, "rebase-merge", "msgnum")),
    readOptional(join(gitDir, "rebase-merge", "end")),
    readOptional(join(gitDir, "rebase-apply", "next")),
    readOptional(join(gitDir, "rebase-apply", "last")),
    readOptional(join(gitDir, "rebase-apply", "applying")),
    readOptional(join(gitDir, "MERGE_HEAD")),
    readOptional(join(gitDir, "CHERRY_PICK_HEAD")),
    readOptional(join(gitDir, "REVERT_HEAD")),
    readOptional(join(gitDir, "BISECT_LOG")),
  ]);
  if (rmC !== undefined) return `REBASE${operationProgress(rmC, rmT)}`;
  if (raC !== undefined) return `${applying === undefined ? "REBASE" : "AM"}${operationProgress(raC, raT)}`;
  if (mergeHead !== undefined) return "MERGING";
  if (cherryPickHead !== undefined) return "CHERRY-PICKING";
  if (revertHead !== undefined) return "REVERTING";
  if (bisectLog !== undefined) return "BISECTING";
}

function align(left: string, right: string, width: number, ellipsis: string): string {
  const available = width - visibleWidth(left) - 2;
  if (available <= 0) return truncateToWidth(left, width, ellipsis);
  const clippedRight = truncateToWidth(right, available, "");
  return left + " ".repeat(width - visibleWidth(left) - visibleWidth(clippedRight)) + clippedRight;
}

// Alinha right na borda direita; se não couber, trunca LEFT (right nunca some).
function alignRightReserved(left: string, right: string, width: number, ellipsis: string): string {
  const available = Math.max(width - visibleWidth(right) - 2, 0);
  const clippedLeft = truncateToWidth(left, available, ellipsis);
  return clippedLeft + " ".repeat(Math.max(width - visibleWidth(clippedLeft) - visibleWidth(right), 0)) + truncateToWidth(right, width, "");
}

function color(text: string, ansi256: number): string {
  return `\x1b[38;5;${ansi256}m${text}\x1b[39m`;
}

function rainbow(text: string): string {
  const colors = [196, 220, 46, 39, 201];
  return [...text].map((character, index) => color(character, colors[index % colors.length]!)).join("");
}

async function loadConfig(): Promise<{ preset: string; rawSegments: Partial<Segments> }> {
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as { preset?: string; segments?: Partial<Segments> };
    const preset = raw.preset && raw.preset in PRESETS ? raw.preset : "full";
    return { preset, rawSegments: raw.segments ?? {} };
  } catch {
    return { preset: "full", rawSegments: {} };
  }
}

function applySegments(preset: string, rawSegments: Partial<Segments>): Segments {
  return { ...PRESETS[preset]!, ...rawSegments };
}

export default function customFooterExtension(pi: ExtensionAPI): void {
  let activeMilliseconds = 0;
  let activeStartedAt: number | undefined;
  let promptPaused = false;
  let runtimeTimer: ReturnType<typeof setInterval> | undefined;
  let requestRuntimeRender: (() => void) | undefined;
  let refreshGitStatus: (() => Promise<void>) | undefined;
  const stopRuntimeTimer = () => {
    if (runtimeTimer === undefined) return;
    clearInterval(runtimeTimer);
    runtimeTimer = undefined;
  };
  const activate = () => {
    activeStartedAt = performance.now();
    if (requestRuntimeRender) runtimeTimer = setInterval(requestRuntimeRender, 1_000);
    requestRuntimeRender?.();
  };
  const startActive = () => {
    if (activeStartedAt !== undefined || promptPaused) return;
    activate();
  };
  const pauseActive = () => {
    if (activeStartedAt === undefined) return;
    activeMilliseconds += performance.now() - activeStartedAt;
    activeStartedAt = undefined;
    promptPaused = true;
    stopRuntimeTimer();
    requestRuntimeRender?.();
  };
  const resumeActive = () => {
    if (!promptPaused) return;
    promptPaused = false;
    activate();
  };
  const finalizeActive = (): boolean => {
    if (activeStartedAt === undefined && !promptPaused) return false;
    if (activeStartedAt !== undefined) activeMilliseconds += performance.now() - activeStartedAt;
    activeStartedAt = undefined;
    promptPaused = false;
    stopRuntimeTimer();
    requestRuntimeRender?.();
    return true;
  };

  pi.on("agent_start", () => startActive());
  pi.on("ui_prompt_start", () => pauseActive());
  pi.on("ui_prompt_end", () => resumeActive());
  pi.on("agent_settled", async (_event, ctx) => {
    if (!ctx.isIdle()) return;
    if (finalizeActive()) pi.appendEntry(AGENT_TIME_ENTRY, activeMilliseconds);
    await refreshGitStatus?.();
  });
  pi.on("session_shutdown", () => {
    stopRuntimeTimer();
    activeStartedAt = undefined;
    promptPaused = false;
    refreshGitStatus = undefined;
  });

  pi.on("session_start", async (_event, ctx) => {
    stopRuntimeTimer();
    activeStartedAt = undefined;
    promptPaused = false;
    requestRuntimeRender = undefined;
    refreshGitStatus = undefined;
    // Última entrada válida vence; dado persistido não é confiável.
    activeMilliseconds = 0;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === AGENT_TIME_ENTRY && isNonNegativeNumber(entry.data)) {
        activeMilliseconds = entry.data;
      }
    }
    if (ctx.mode !== "tui") return;

    const { preset: initialPreset, rawSegments } = await loadConfig();
    let preset = initialPreset;
    let segments = applySegments(initialPreset, rawSegments);

    const git = await pi.exec(
      "git",
      ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir", "--git-dir"],
      { cwd: ctx.cwd },
    );
    const [, , gitDir] = git.stdout.trim().split(/\r?\n/);
    const pwd = ctx.cwd.startsWith(process.env.HOME ?? "\0")
      ? `~${ctx.cwd.slice((process.env.HOME ?? "").length)}`
      : ctx.cwd;
    let gitSummary = EMPTY_GIT_SUMMARY;
    let gitRefreshGeneration = 0;
    if (git.code === 0 && gitDir) {
      refreshGitStatus = async () => {
        const generation = ++gitRefreshGeneration;
        const [status, operation] = await Promise.all([
          pi.exec("git", ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"], { cwd: ctx.cwd }),
          readGitOperation(gitDir),
        ]);
        if (generation !== gitRefreshGeneration) return;
        gitSummary = status.code === 0 ? summarizeGitStatus(status.stdout, operation) : EMPTY_GIT_SUMMARY;
        requestRuntimeRender?.();
      };
      await refreshGitStatus();
    }

    let tps: number | undefined;
    let assistantStartedAt: number | undefined;
    pi.on("message_start", async (event) => {
      if (event.message.role === "assistant") assistantStartedAt = performance.now();
    });
    pi.on("message_end", async (event) => {
      if (event.message.role !== "assistant") return;
      const output = event.message.usage?.output ?? 0;
      const seconds = assistantStartedAt === undefined ? 0 : (performance.now() - assistantStartedAt) / 1000;
      assistantStartedAt = undefined;
      tps = seconds > 0 ? output / seconds : undefined;
    });

    // ponytail: keyed on length + last entry (sessions are append-only); revisit if entries ever mutate in place.
    let usageKey: string | undefined;
    let input = 0;
    let output = 0;
    let cost = 0;
    let cacheRate: number | undefined;
    const computeUsage = () => {
      input = 0; output = 0; cost = 0; cacheRate = undefined;
      const add = (usage: CountedUsage | undefined) => {
        if (!usage) return;
        input += usage.input ?? 0;
        output += usage.output ?? 0;
        cost += usage.cost?.total ?? 0;
      };
      for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type === "message" && entry.message.role === "assistant") {
          const usage = entry.message.usage;
          const cr = usage.cacheRead ?? 0;
          const cw = usage.cacheWrite ?? 0;
          const prompt = (usage.input ?? 0) + cr + cw;
          cacheRate = prompt ? (cr / prompt) * 100 : 0;
          add(usage);
        } else if (entry.type === "message" && entry.message.role === "toolResult") {
          add(entry.message.usage);
        } else if (entry.type === "custom_message" && entry.customType === SUBAGENT_BACKGROUND_RESULT) {
          add(subagentBackgroundUsage(entry.details));
        } else if (entry.type === "branch_summary" || entry.type === "compaction") {
          add(entry.usage);
        }
      }
    };

    ctx.ui.setFooter((tui, theme, data) => {
      requestRuntimeRender = () => tui.requestRender();
      const unsubscribe = data.onBranchChange(() => {
        void refreshGitStatus?.();
        requestRuntimeRender?.();
      });
      return {
        dispose() {
          unsubscribe();
          requestRuntimeRender = undefined;
          stopRuntimeTimer();
        },
        invalidate() {},
        render(width: number): string[] {
          const entries = ctx.sessionManager.getEntries();
          const key = `${entries.length}:${entries.at(-1)?.type}`;
          if (key !== usageKey) {
            usageKey = key;
            computeUsage();
          }
          const seg = segments;
          const ellipsis = theme.fg("dim", "…");

          const reportedBranch = data.getGitBranch()?.replace(/^worktree\//, "");
          const branch = reportedBranch === "detached" && gitSummary.detachedOid ? `@${gitSummary.detachedOid}` : reportedBranch;
          const usage2 = ctx.getContextUsage();
          const context = usage2?.percent;

          // Linha 1: pasta · branch [badges] · sessionName
          const parts1: string[] = [];
          if (seg.cwd) parts1.push(theme.fg("dim", pwd));
          if (seg.gitBranch && branch) {
            parts1.push(theme.fg("accent", branch) + (seg.gitStatus && gitSummary.badges ? theme.fg("dim", ` ${gitSummary.badges}`) : ""));
          } else if (seg.gitStatus && gitSummary.badges) {
            parts1.push(theme.fg("dim", gitSummary.badges));
          }
          if (seg.sessionName) {
            const sessionName = ctx.sessionManager.getSessionName?.();
            if (sessionName) parts1.push(theme.fg("dim", sessionName));
          }
          const firstLine = parts1.join(theme.fg("dim", " · "));

          // Linha 2: uso · modelo • thinking
          const usageParts: string[] = [];
          if (seg.tokens) {
            usageParts.push(
              `↑ ${formatTokens(input)}`,
              `↓ ${formatTokens(output)}`,
              `↺ ${cacheRate === undefined ? "—" : `${cacheRate.toFixed(1)}%`}`,
            );
          }
          if (seg.tps) usageParts.push(`⚡ ${tps === undefined ? "—" : `${tps.toFixed(1)} t/s`}`);
          // Custo só aparece quando o provider reporta preço (modelos com cost 0 no
          // models.json não produzem valor; igual ao rodapé nativo).
          if (seg.cost && cost > 0) usageParts.push(`$ ${cost.toFixed(3)}`);
          if (seg.context) {
            usageParts.push(
              usage2?.tokens != null
                ? `◔ ${formatTokens(usage2.tokens)}/${formatTokens(usage2.contextWindow ?? 0)} (${context!.toFixed(1)}%)`
                : `◔ —`,
            );
          }
          const usage = theme.fg("dim", usageParts.join(" · "));
          const thinking = String(ctx.thinkingLevel ?? "off");
          const thinkingColor = THINKING_COLORS[thinking as keyof typeof THINKING_COLORS];
          const thinkingText = thinking === "ultra"
            ? rainbow(thinking)
            : thinkingColor === undefined ? theme.fg("dim", thinking) : color(thinking, thinkingColor);
          const model = theme.fg("dim", `${ctx.model?.id ?? "no-model"} • `) + thinkingText;
          const secondLine = align(usage, model, width, ellipsis);

          // Linha 3: statuses de extensions · tempo de trabalho
          const statuses = [...data.getExtensionStatuses()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, text]) => sanitizeStatus(text))
            .filter(Boolean);
          const elapsed = activeMilliseconds + (activeStartedAt === undefined ? 0 : performance.now() - activeStartedAt);
          const thirdLine = alignRightReserved(
            seg.extensionStatuses ? statuses.join(" ") : "",
            seg.timer ? theme.fg("dim", `◷ ${formatDuration(elapsed)}`) : "",
            width,
            ellipsis,
          );

          return [firstLine, secondLine, thirdLine]
            .filter((line) => visibleWidth(line) > 0)
            .map((line) => truncateToWidth(line, width, ellipsis));
        },
      };
    });

    pi.registerCommand("footer", {
      description: "Cicla presets do rodapé: full → compact → minimal (persiste)",
      handler: async (args) => {
        const arg = (args || "").trim().toLowerCase();
        const next = arg && PRESET_ORDER.includes(arg as (typeof PRESET_ORDER)[number])
          ? arg
          : PRESET_ORDER[(PRESET_ORDER.indexOf(preset) + 1) % PRESET_ORDER.length];
        preset = next;
        segments = applySegments(next, rawSegments);
        try {
          // Preserva overrides manuais de segmentos do JSON do usuário.
          await writeFile(CONFIG_PATH, JSON.stringify({ preset: next, ...(Object.keys(rawSegments).length ? { segments: rawSegments } : {}) }, null, 2) + "\n");
        } catch {}
        ctx.ui.notify(`footer: preset ${next} — segmentos: ${Object.entries(segments).filter(([, v]) => v).map(([k]) => k).join(", ")}`, "info");
      },
    });

    pi.registerCommand("builtin-footer", {
      description: "Restaura o rodapé nativo do Pi",
      handler: async () => {
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("Rodapé nativo do Pi restaurado.", "info");
      },
    });
  });
}
