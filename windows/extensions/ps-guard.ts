import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DESTRUCTIVE_RE =
  /Remove-Item.*-Recurse.*C:\\|Format-Volume|Clear-Disk|Invoke-Expression.*\(irm\s|iwr\s.*\|\s*iex|curl.*\|\s*(sh|bash)|git\s+push\s+--force|git\s+reset\s+--hard|git\s+clean\s+-fd|terraform\s+(destroy|apply\s+-auto-approve)|aws\s+.*--force|az\s+.*--force/i;

export default function (pi: ExtensionAPI) {
  let enabled = true;

  pi.registerCommand("ps-guard", {
    description: "Toggle PowerShell destructive-command guard (on/off/status)",
    handler: async (args, ctx) => {
      const a = (args || "").trim().toLowerCase();
      if (a === "on") enabled = true;
      else if (a === "off") enabled = false;
      ctx.ui.notify(`ps-guard ${enabled ? "ON" : "OFF"}`, "info");
    },
  });

  pi.on("tool_call", async (event) => {
    if (!enabled) return;
    const name = (event as { toolName?: string }).toolName ?? "";
    if (name !== "powershell" && name !== "bash") return;
    const input = (event as { input?: Record<string, unknown> }).input ?? {};
    const cmd = typeof input.command === "string" ? input.command : "";
    if (!cmd) return;
    if (DESTRUCTIVE_RE.test(cmd)) {
      return {
        block: true,
        reason:
          "ps-guard: comando destrutivo bloqueado. Rode manualmente no terminal se for intencional, ou /ps-guard off para a sessão.",
      };
    }
  });
}
