import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function orcaBin(): string {
  return process.env.ORCA_CLI_COMMAND ?? "orca";
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
      const cmd = orcaBin();

      // 1. Cria worktree. Sintaxe atual do CLI: worktree create --name <n> --json.
      let wtId = "";
      let wtPath = "";
      try {
        const r = await pi.exec(cmd, ["worktree", "create", "--name", name, "--json"]);
        const out = `${r.stdout}\n${r.stderr}`;
        try {
          const j = JSON.parse(out.trim());
          const w = j?.result?.worktree ?? j?.worktree ?? null;
          wtId = typeof w?.id === "string" ? w.id : "";
          wtPath = typeof w?.path === "string" ? w.path : "";
        } catch {}
        if (!wtId) {
          const m = out.match(/"id"\s*:\s*"([^"]*::[^"]*)"/);
          if (m) wtId = m[1];
        }
        if (r.code !== 0 && !wtId) {
          ctx.ui.notify(`ow: falhou criar worktree (code ${r.code}). Saída: ${out.slice(0, 800)}`, "error");
          return;
        }
      } catch (err) {
        ctx.ui.notify(`ow: orca CLI não encontrado (${String(err).slice(0, 200)}). Crie manual: orca worktree create --name ${name}`, "error");
        return;
      }

      // 2. Terminal com pi. Selector: id:<worktree.id> — o id já traz repoId::path.
      if (!wtId) {
        ctx.ui.notify(`ow: worktree criado (${wtPath || name}), mas o id não veio na saída. Ache o id com "orca worktree list --json" e abra: orca terminal create --worktree id:<id> --command pi`, "warning");
        return;
      }
      const wtSelector = `id:${wtId}`;
      const manualTerminal = `orca terminal create --worktree ${wtSelector} --title ${name} --command pi`;
      try {
        const r2 = await pi.exec(cmd, ["terminal", "create", "--worktree", wtSelector, "--title", name, "--command", "pi", "--json"]);
        if (r2.code !== 0) {
          ctx.ui.notify(
            `Worktree pronto (${wtPath || wtId}). Terminal manual: ${manualTerminal}. Detalhe: ${`${r2.stdout}\n${r2.stderr}`.slice(0, 400)}`,
            "warning",
          );
          return;
        }
      } catch {
        ctx.ui.notify(`Worktree pronto em: ${wtPath || wtId}. Abra manual: ${manualTerminal}`, "warning");
        return;
      }
      ctx.ui.notify(`ow: worktree ${name} pronto, terminal Orca com pi aberto.`, "info");
    },
  });
}
