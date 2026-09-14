import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const RATIO = 0.7;
const HANDOFF_INSTRUCTIONS =
  "Gere o resumo no formato: ## Goal / ## Constraints & Preferences / ## Progress (Done|In Progress|Blocked) / ## Key Decisions / ## Next Steps / ## Critical Context + listas <read-files> e <modified-files>. Seja denso, sem enrolação.";

const handedOff = new Set<string>();
let compactInFlight = false;
let overStreak = 0;

function usageTokens(ctx: unknown): { tokens: number; window: number } | null {
  try {
    const u = (ctx as { getContextUsage?: () => unknown }).getContextUsage?.() as
      | { tokens?: number | null; contextWindow?: number | null; percent?: number | null }
      | undefined;
    if (!u || u.tokens == null) return null;
    const win =
      typeof u.contextWindow === "number" && u.contextWindow > 0 ? u.contextWindow : 200000;
    return { tokens: u.tokens, window: win };
  } catch {
    return null;
  }
}

function sessionIdOf(ctx: unknown): string {
  try {
    const sm = (ctx as { sessionManager?: { getSessionId?: () => unknown } }).sessionManager;
    const id = sm?.getSessionId?.();
    return typeof id === "string" ? id : "unknown";
  } catch {
    return "unknown";
  }
}

function handoffPath(sessionId: string): string {
  const dir = join(tmpdir(), "pi-handoffs");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {}
  const day = new Date().toISOString().slice(0, 10);
  return join(dir, `${day}-${sessionId.slice(0, 8)}.md`);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("handoff-off", {
    description: "Desliga o auto handoff-compact desta sessão",
    handler: async (_args, ctx) => {
      handedOff.add(sessionIdOf(ctx));
      ctx.ui.notify("handoff-compact desligado nesta sessão.", "info");
    },
  });

  // Trigger: 2 turn_end seguidos acima de 70%, só em turno terminal (sem toolResults).
  pi.on("turn_end", (event, ctx) => {
    try {
      const sid = sessionIdOf(ctx);
      if (handedOff.has(sid) || compactInFlight) return;
      if (existsSync(handoffPath(sid))) {
        handedOff.add(sid);
        return;
      }

      const ev = event as { toolResults?: unknown[] };
      const terminalTurn = !Array.isArray(ev.toolResults) || ev.toolResults.length === 0;
      const u = usageTokens(ctx);
      if (!u) {
        overStreak = 0;
        return;
      }
      const over = u.tokens >= u.window * RATIO;
      if (!over || !terminalTurn) {
        if (!over) overStreak = 0;
        return;
      }
      overStreak += 1;
      if (overStreak < 2) return;

      compactInFlight = true;
      (ctx as { ui: { notify: (m: string, t: string) => void } }).ui.notify(
        `handoff-compact: contexto em ${Math.round((u.tokens / u.window) * 100)}% — gerando resumo + handoff…`,
        "info",
      );
      (ctx as { compact: (o: Record<string, unknown>) => void }).compact({
        customInstructions: HANDOFF_INSTRUCTIONS,
        onComplete: () => {
          compactInFlight = false;
        },
        onError: (err: { message?: string }) => {
          compactInFlight = false;
          overStreak = 0;
          if (String(err?.message ?? "").includes("cancel")) return;
        },
      });
    } catch {
      compactInFlight = false;
    }
  });

  // O resumo nativo vira as duas coisas: CompactionEntry dentro + handoff.md fora.
  pi.on("session_compact", async (event, ctx) => {
    try {
      const sid = sessionIdOf(ctx);
      if (handedOff.has(sid)) return;
      const e = event as { compactionEntry?: { summary?: string } };
      const summary = e.compactionEntry?.summary ?? "";
      if (!summary) return;

      const path = handoffPath(sid);
      const doc = `---\nsuggested-skills: []\nsession: ${sid}\ndate: ${new Date().toISOString()}\nsource: pi handoff-compact (70%)\n---\n\n${summary}\n`;
      try {
        writeFileSync(path, doc, "utf8");
      } catch {
        return;
      }
      handedOff.add(sid);
      overStreak = 0;

      const c = ctx as {
        ui: { notify: (m: string, t: string) => void };
        sessionManager?: { getSessionFile?: () => unknown };
      };
      c.ui.notify(`handoff salvo em: ${path}`, "info");

      // Abre terminal Orca novo continuando da sessão compactada. Falha = só avisa o path.
      try {
        const sf = c.sessionManager?.getSessionFile?.();
        const orca = process.env.ORCA_CLI_COMMAND ?? "orca";
        if (typeof sf === "string" && sf) {
          const r = await pi.exec(orca, ["terminal", "create", "--worktree", "active", "--title", "pi handoff", "--command", `pi --session "${sf}"`, "--json"]);
          if (r.code === 0) {
            c.ui.notify("Continuação aberta em novo terminal Orca.", "info");
          } else {
            c.ui.notify(`Terminal de continuação falhou (code ${r.code}); handoff salvo em: ${path}`, "warning");
          }
        }
      } catch {
        c.ui.notify(`Terminal de continuação não abriu; handoff salvo em: ${path}`, "warning");
      }
    } catch {}
  });

  pi.on("session_compact_failed", () => {
    compactInFlight = false;
    overStreak = 0;
  });
}
