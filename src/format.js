import path from "node:path";

export function duration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export function count(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}

const time = (iso) => (iso ? new Date(iso).toLocaleString("sv").slice(5, 16) : "?");

export function formatReport(report, cwd = "") {
  const rel = (f) => (cwd && f.startsWith(`${cwd}/`) ? path.relative(cwd, f) : f);
  const lines = [];
  for (const a of report.agents) {
    const tools = Object.entries(a.tools)
      .sort((x, y) => y[1] - x[1])
      .map(([name, n]) => `${name} ${n}`)
      .join(", ");
    lines.push(`#${a.n} ${a.id}  ${a.description || "(no description)"}`);
    lines.push(`   ${time(a.start)} -> ${time(a.end)}  ${duration(a.durationMs)}  report ${count(a.reportChars)} chars${a.tokens ? `  tokens ${count(a.tokens.total)}` : ""}`);
    lines.push(`   tools  ${a.toolCalls}${tools ? ` (${tools})` : ""}${a.failed ? `  failed ${a.failed}` : ""}`);
    if (a.read.length) lines.push(`   read   ${a.read.map(rel).join(", ")}`);
    if (a.edited.length) lines.push(`   edited ${a.edited.map(rel).join(", ")}`);
    lines.push("");
  }
  lines.push("Flags");
  if (!report.flags.length) lines.push("   none");
  for (const f of report.flags) lines.push(`   ${f.type}: ${f.file ? f.text.replace(f.file, rel(f.file)) : f.text}`);
  const t = report.totals;
  lines.push("");
  lines.push(
    `Total: ${t.subagents} subagents, ${duration(t.durationMs)}, ${t.toolCalls} tool calls${t.tokens === null ? "" : `, ${count(t.tokens)} tokens`}`
  );
  return lines.join("\n");
}
