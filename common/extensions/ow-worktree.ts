import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function orcaBin(): { cmd: string; argsPrefix: string[] } {
  if (process.env.ORCA_CLI_COMMAND) return { cmd: process.env.ORCA_CLI_COMMAND, argsPrefix: [] };
  return { cmd: "orca", argsPrefix: [] };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("ow", {
    description: "Cria Orca worktree + terminal com pi dentro (/ow nome-da-tarefa)",
    handler: async (args, ctx) => {
      const name = (args || "").trim().split(/\s+/)[0];
      if (!name) {
        ctx.ui.notify("Uso: /ow nome-da-tarefa (ex: /ow refactor-auth)", "warning");
        return;
      }
      const { cmd } = orcaBin();

      // 1. Cria worktree. Flags exatas variam por versão do Orca; parseia defensivo.
      let wtPath = "";
      try {
        const r = await pi.exec(cmd, ["worktree", "create", name, "--json"]);
        const out = `${r.stdout}\n${r.stderr}`;
        const m = out.match(/[A-Z]:\\[^\s"']+/) ?? out.match(/"path"\s*:\s*"([^"]+)"/);
        if (m) wtPath = m[1] ?? m[0];
        if (r.code !== 0 && !wtPath) {
          ctx.ui.notify(`ow: falhou criar worktree (code ${r.code}). Saída: ${out.slice(0, 800)}`, "error");
          return;
        }
      } catch (err) {
        ctx.ui.notify(`ow: orca CLI não encontrado (${String(err).slice(0, 200)}). Crie manual: orca worktree create ${name}`, "error");
        return;
      }

      // 2. Abre terminal Orca com pi dentro. Se a flag exata mudar, avisa o path.
      try {
        const r2 = await pi.exec(cmd, ["terminal", "create", "--worktree", wtPath || name, "--command", "pi"]);
        if (r2.code !== 0) {
          ctx.ui.notify(
            `Worktree pronto em: ${wtPath || name}. Abra manual: orca terminal create --worktree ${wtPath || name} --command pi. Detalhe: ${`${r2.stdout}\n${r2.stderr}`.slice(0, 400)}`,
            "warning",
          );
          return;
        }
      } catch {
        ctx.ui.notify(`Worktree pronto em: ${wtPath || name}. Abra manual com orca terminal create.`, "warning");
        return;
      }
      ctx.ui.notify(`ow: worktree ${name} pronto em ${wtPath || name}, terminal Orca com pi aberto.`, "info");
    },
  });
}
