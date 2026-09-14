import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const MAX_CHARS = 8000;

type TextPart = { type: "text"; text: string };
type AnyPart = TextPart | { type: string; [k: string]: unknown };

function totalText(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const p of content as AnyPart[]) {
    if (p && p.type === "text" && typeof (p as TextPart).text === "string")
      n += (p as TextPart).text.length;
  }
  return n;
}

export default function (pi: ExtensionAPI) {
  // 1. Trunca outputs gigantes (tail) + salva full em %TEMP%, sem perder nada.
  pi.on("tool_result", async (event) => {
    const e = event as {
      toolName?: string;
      toolCallId?: string;
      content?: AnyPart[];
    };
    if (!Array.isArray(e.content)) return;
    if (totalText(e.content) <= MAX_CHARS) return;

    const dir = join(tmpdir(), "pi-tools");
    try {
      mkdirSync(dir, { recursive: true });
    } catch {}
    const file = join(dir, `${e.toolName ?? "tool"}-${e.toolCallId ?? Date.now()}.log`);
    try {
      writeFileSync(
        file,
        (e.content as AnyPart[])
          .map((p) => (p.type === "text" ? (p as TextPart).text : JSON.stringify(p)))
          .join("\n"),
        "utf8",
      );
    } catch {
      return;
    }

    // Mantém o TAIL (erro de log está no fim), descarta o meio.
    let budget = MAX_CHARS;
    const kept: AnyPart[] = [];
    for (let i = (e.content as AnyPart[]).length - 1; i >= 0; i--) {
      const p = (e.content as AnyPart[])[i];
      if (p.type !== "text" || typeof (p as TextPart).text !== "string") {
        kept.unshift(p);
        continue;
      }
      const t = (p as TextPart).text;
      if (t.length <= budget) {
        kept.unshift(p);
        budget -= t.length;
      } else {
        kept.unshift({ type: "text", text: `…[${t.length - budget} chars omitidos no início]…\n` + t.slice(t.length - budget) });
        budget = 0;
        break;
      }
      if (budget <= 0) break;
    }
    kept.push({
      type: "text",
      text: `\n[ps-mini-hooks: output truncado para ${MAX_CHARS} chars (tail). Full em: ${file}]`,
    });
    return { content: kept };
  });

  // 2. Injeta 1 linha de contexto Orca vivo, só quando roda dentro do Orca.
  pi.on("before_agent_start", async (event) => {
    const ev = event as { systemPrompt?: string; prompt?: string };
    if (!process.env.ORCA_PANE_KEY && !process.env.ORCA_WORKTREE) return;
    const wt = process.env.ORCA_WORKTREE ?? process.env.ORCA_PANE_KEY ?? "orca";
    return {
      systemPrompt: `${ev.systemPrompt ?? ""}\n\n[Contexto vivo: rodando dentro do Orca (${wt}). Prefira 'orca worktree/terminal' para paralelizar; não use tmux.]`,
    };
  });
}
