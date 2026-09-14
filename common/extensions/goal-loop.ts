import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_STEPS = 25;
const WIDGET_KEY = "goal-loop";
const ENTRY_TYPE = "goal-loop-state";

interface Goal {
  title: string;
  contract: string;
  step: number;
  active: boolean;
}

const goals = new Map<string, Goal>();

function sessionIdOf(ctx: unknown): string {
  try {
    const sm = (ctx as { sessionManager?: { getSessionId?: () => unknown } }).sessionManager;
    const id = sm?.getSessionId?.();
    return typeof id === "string" ? id : "unknown";
  } catch {
    return "unknown";
  }
}

function hasUI(ctx: unknown): boolean {
  try {
    const c = ctx as { hasUI?: boolean; mode?: string };
    return c.hasUI === true && c.mode === "tui";
  } catch {
    return false;
  }
}

function setWidget(ctx: unknown, goal: Goal | null) {
  try {
    if (!hasUI(ctx)) return;
    const ui = (ctx as { ui: { setWidget: (k: string, v: string[] | undefined) => void } }).ui;
    if (!goal || !goal.active) {
      ui.setWidget(WIDGET_KEY, undefined);
      return;
    }
    const short = goal.title.length > 60 ? goal.title.slice(0, 57) + "…" : goal.title;
    ui.setWidget(WIDGET_KEY, [`◎ goal (step ${goal.step}/${MAX_STEPS}): ${short}`]);
  } catch {}
}

function parseGoal(raw: string): { title: string; contract: string } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { title: "", contract: "" };
  const title = lines[0];
  const fields: string[] = [];
  for (const line of lines.slice(1)) {
    const m = line.match(
      /^(outcome|verify|verified by|constraints|preserve|boundaries|scope|stop when|blocked)\s*:\s*(.+)$/i,
    );
    if (m) fields.push(`${m[1].toLowerCase()}: ${m[2]}`);
  }
  return { title, contract: fields.join("\n") };
}

function reminder(goal: Goal): string {
  const parts = [
    `[Standing goal — step ${goal.step + 1}/${MAX_STEPS}: ${goal.title}`,
  ];
  if (goal.contract) parts.push(goal.contract);
  parts.push(
    "Protocol: one concrete step per turn, then self-evaluate (is the goal met?). Verify with evidence — run the verify command, don't claim done without it. Start continuations with 'Step N: ...'. When met, reply exactly 'Goal achieved: <reason>'. If blocked, reply 'Goal stalled: <reason>' and stop. User messages pause the loop; resume after answering.]",
  );
  return parts.join("\n");
}

function messageText(message: unknown): string {
  try {
    const m = message as { content?: Array<{ type?: string; text?: string }> };
    if (!Array.isArray(m.content)) return "";
    return m.content
      .filter((p) => p && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n");
  } catch {
    return "";
  }
}

function persist(pi: ExtensionAPI, sid: string, goal: Goal | null) {
  try {
    pi.appendEntry(ENTRY_TYPE, { sessionId: sid, goal });
  } catch {}
}

export default function (pi: ExtensionAPI) {
  // Rehydrate after resume/reload.
  pi.on("session_start", async (_event, ctx) => {
    try {
      const sid = sessionIdOf(ctx);
      if (goals.has(sid)) {
        setWidget(ctx, goals.get(sid) ?? null);
        return;
      }
      const sm = (ctx as { sessionManager?: { getEntries?: () => unknown[] } }).sessionManager;
      const entries = sm?.getEntries?.() ?? [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i] as {
          customType?: string;
          type?: string;
          data?: { sessionId?: string; goal?: Goal };
        };
        if (e && (e.customType === ENTRY_TYPE || e.type === ENTRY_TYPE) && e.data) {
          if (e.data.sessionId === sid && e.data.goal && e.data.goal.active) {
            goals.set(sid, e.data.goal);
            setWidget(ctx, e.data.goal);
          }
          break;
        }
      }
    } catch {}
  });

  // Standing reminder every turn while active.
  pi.on("before_agent_start", async (event, ctx) => {
    const goal = goals.get(sessionIdOf(ctx));
    if (!goal || !goal.active) return;
    const ev = event as { systemPrompt?: string };
    return { systemPrompt: `${ev.systemPrompt ?? ""}\n\n${reminder(goal)}` };
  });

  // Step counting + completion/stall detection + budget guard.
  pi.on("turn_end", async (event, ctx) => {
    const sid = sessionIdOf(ctx);
    const goal = goals.get(sid);
    if (!goal || !goal.active) return;
    goal.step += 1;
    setWidget(ctx, goal);

    const text = messageText((event as { message?: unknown }).message);
    const ui = (ctx as { ui: { notify: (m: string, t: string) => void } }).ui;
    if (/goal achieved\s*:/i.test(text)) {
      goal.active = false;
      persist(pi, sid, goal);
      setWidget(ctx, goal);
      try {
        ui.notify(`Goal achieved em ${goal.step} steps: ${goal.title}`, "info");
      } catch {}
      return;
    }
    if (/goal stalled\s*:/i.test(text)) {
      try {
        ui.notify(`Goal travado (step ${goal.step}): veja a resposta do agente.`, "warning");
      } catch {}
      return;
    }
    if (goal.step >= MAX_STEPS) {
      goal.active = false;
      persist(pi, sid, goal);
      setWidget(ctx, goal);
      try {
        ui.notify(
          `Goal pausado: orçamento de ${MAX_STEPS} steps esgotado. Rode /goal status para revisar ou /goal <novo texto> para continuar.`,
          "warning",
        );
      } catch {}
    }
  });

  pi.registerCommand("goal", {
    description: "Set a standing goal the agent pursues one step per turn (/goal status|clear|draft)",
    handler: async (args, ctx) => {
      const sid = sessionIdOf(ctx);
      const raw = (args || "").trim();

      if (!raw || raw.toLowerCase() === "status") {
        const g = goals.get(sid);
        if (g && g.active) {
          ctx.ui.notify(`◎ goal ativo (step ${g.step}/${MAX_STEPS}): ${g.title}${g.contract ? `\n${g.contract}` : ""}`, "info");
        } else {
          ctx.ui.notify("Nenhum goal ativo. Uso: /goal <texto> [linhas outcome:/verify:/constraints:/boundaries:/stop when:]", "info");
        }
        return;
      }

      const sub = raw.toLowerCase();
      if (["clear", "off", "stop", "done", "cancel"].includes(sub)) {
        const g = goals.get(sid);
        if (g) {
          g.active = false;
          persist(pi, sid, g);
        } else {
          goals.set(sid, { title: "", contract: "", step: 0, active: false });
        }
        setWidget(ctx, null);
        ctx.ui.notify("Goal desativado.", "info");
        return;
      }

      let body = raw;
      let isDraft = false;
      if (/^draft\s+/i.test(raw)) {
        isDraft = true;
        body = raw.replace(/^draft\s+/i, "");
      }
      const { title, contract } = parseGoal(body);
      if (!title) {
        ctx.ui.notify("Uso: /goal <texto> ou /goal draft <one-liner>", "warning");
        return;
      }

      const goal: Goal = { title, contract, step: 0, active: true };
      goals.set(sid, goal);
      persist(pi, sid, goal);
      setWidget(ctx, goal);
      ctx.ui.notify(`◎ goal ativo: ${title}${contract ? " (com contrato)" : ""}`, "info");

      const kickoff = isDraft
        ? `Standing goal (DRAFT — first expand the contract: fill outcome, verify, constraints, boundaries from the one-liner below, then begin step 1): ${title}${contract ? `\n${contract}` : ""}\nWork one step per turn. Self-evaluate after each step. Verify with evidence.`
        : `Standing goal: ${title}${contract ? `\n${contract}` : ""}\nWork one step per turn. After each step, self-evaluate: is the goal met? Verify with evidence before claiming done.`;
      try {
        pi.sendUserMessage(kickoff);
      } catch {
        try {
          pi.sendUserMessage(kickoff, { deliverAs: "followUp" });
        } catch {
          ctx.ui.notify("Não consegui iniciar o primeiro passo sozinho (agente ocupado). Pressione Enter para começar.", "warning");
        }
      }
    },
  });
}
