import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const AGENT_TOOLS = ["Agent", "Task"];
const EDIT_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
export const EMPTY_REPORT_CHARS = 200;
export const ERROR_RATE = 0.3;

const text = (content) =>
  typeof content === "string" ? content : (content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
const blocks = (content) => (Array.isArray(content) ? content : []);
const turns = (entries) => entries.filter((e) => (e.type === "user" || e.type === "assistant") && e.message);
const fileOf = (input) => input?.file_path || input?.notebook_path;
export const normalizeCommand = (cmd) => cmd.trim().replace(/\s+/g, " ");
const truncate = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

export function launches(main) {
  const inputs = new Map();
  const byAgent = new Map();
  const reads = [];
  for (const e of turns(main)) {
    for (const c of blocks(e.message.content)) {
      if (c.type === "tool_use" && AGENT_TOOLS.includes(c.name)) inputs.set(c.id, c.input || {});
      if (c.type === "tool_use" && c.name === "Read" && fileOf(c.input) && e.timestamp) reads.push({ file: fileOf(c.input), time: e.timestamp });
      const agentId = e.toolUseResult?.agentId;
      if (c.type === "tool_result" && agentId && inputs.has(c.tool_use_id)) byAgent.set(agentId, inputs.get(c.tool_use_id));
    }
  }
  return { byAgent, reads };
}

// USD per million tokens (input, output, cache read); cache writes are 1.25x input for 5m and 2x for 1h.
const PRICES = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-opus-5": [5, 25, 0.5],
  "claude-sonnet-5-5": [2, 10, 0.1],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
};

export function cost(u, model) {
  if (!(u.input_tokens || u.output_tokens || u.cache_read_input_tokens || u.cache_creation_input_tokens)) return 0;
  const p = PRICES[model?.replace(/\[[^\]]*\]$/, "")];
  if (!p) return null;
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens || 0;
  const write5m = (u.cache_creation_input_tokens || 0) - write1h;
  return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_read_input_tokens || 0) * p[2] + write5m * p[0] * 1.25 + write1h * p[0] * 2) / 1e6 * (u.speed === "fast" ? 2 : 1);
}

export function summarizeAgent(id, entries, input) {
  const tools = {};
  const read = new Set();
  const edited = new Set();
  const commands = new Set();
  const usage = new Map();
  let calls = 0;
  let failed = 0;
  let report = "";
  let first = "";
  const times = [];
  let active = 0;
  let waited = 0;
  let prev = null;
  const uses = new Map();
  const approvals = [];
  for (const e of turns(entries)) {
    const { role, content } = e.message;
    if (e.timestamp) {
      times.push(e.timestamp);
      const t = Date.parse(e.timestamp);
      // A new prompt after a pause is a later continuation, and a tool call a person approved waited on them, so both gaps are idle time.
      const prompt = role === "user" && text(content).trim() && !blocks(content).some((c) => c.type === "tool_result");
      const approved = role === "user" && e.permissionDecision?.source?.startsWith("user");
      if (prev !== null && !prompt && !approved) active += t - prev;
      if (prev !== null && approved) {
        waited += t - prev;
        const use = uses.get(blocks(content).find((c) => c.type === "tool_result")?.tool_use_id);
        const reasons = (e.permissionDecision.reasonCode || "prompt").split("+").map((r) => r.replace(/^(subcommands:)?(bashMiss:)?/, ""));
        approvals.push({ tool: use?.name || "?", target: use?.input?.command || fileOf(use?.input) || use?.input?.path || "", reasons: [...new Set(reasons)], waitMs: t - prev, cwd: e.cwd });
      }
      prev = t;
    }
    if (role === "user" && !first) first = text(content).trim();
    if (role === "assistant" && e.message.usage) usage.set(e.message.id || e.uuid, { ...e.message.usage, model: e.message.model });
    for (const c of blocks(content)) {
      if (c.type === "tool_result" && c.is_error) failed++;
      if (role !== "assistant") continue;
      if (c.type === "text") report += `${c.text}\n`;
      if (c.type !== "tool_use") continue;
      if (c.name === "SubagentHandback") {
        report = `${c.input?.message || ""}\n`;
        continue;
      }
      uses.set(c.id, c);
      report = "";
      calls++;
      tools[c.name] = (tools[c.name] || 0) + 1;
      const file = fileOf(c.input);
      if (file && c.name === "Read") read.add(file);
      if (file && EDIT_TOOLS.includes(c.name)) edited.add(file);
      if (c.name === "Bash" && c.input?.command) commands.add(normalizeCommand(c.input.command));
    }
  }
  times.sort();
  const start = times[0] || null;
  const end = times.at(-1) || null;
  let tokens = null;
  for (const u of usage.values()) {
    tokens ||= { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };
    tokens.input += u.input_tokens || 0;
    tokens.output += u.output_tokens || 0;
    tokens.cacheRead += u.cache_read_input_tokens || 0;
    tokens.cacheCreation += u.cache_creation_input_tokens || 0;
  }
  if (tokens) tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreation;
  const costs = [...usage.values()].map((u) => cost(u, u.model));
  const costUsd = costs.length && costs.every((c) => c !== null) ? costs.reduce((a, b) => a + b, 0) : null;
  return {
    id,
    description: truncate((input?.description || first || "").replace(/\s+/g, " ").trim()),
    start,
    end,
    durationMs: active,
    waitMs: waited,
    approvals,
    toolCalls: calls,
    tools,
    failed,
    read: [...read],
    edited: [...edited],
    commands: [...commands],
    reportChars: report.trim().length,
    tokens,
    costUsd,
  };
}

function groupBy(agents, key) {
  const groups = new Map();
  for (const a of agents) for (const v of a[key]) groups.set(v, [...(groups.get(v) || []), a.n]);
  return [...groups].filter(([, ns]) => ns.length > 1);
}

export function findFlags(agents, mainReads = []) {
  const flags = [];
  const list = (ns) => ns.map((n) => `#${n}`).join(", ");
  for (const [file, ns] of groupBy(agents, "read")) flags.push({ type: "overlap", file, agents: ns, text: `${file} read by ${list(ns)}` });
  const reread = new Map();
  for (const r of mainReads) {
    for (const a of agents) if (a.end && r.time > a.end && a.read.includes(r.file)) reread.set(r.file, new Set([...(reread.get(r.file) || []), a.n]));
  }
  for (const [file, set] of reread) {
    const ns = [...set].sort((x, y) => x - y);
    flags.push({ type: "overlap", file, agents: ns, main: true, text: `${file} read again by the main session after ${list(ns)} finished` });
  }
  for (const [command, ns] of groupBy(agents, "commands"))
    flags.push({ type: "repeated-command", command, agents: ns, text: `\`${truncate(command)}\` run in ${list(ns)}` });
  for (const a of agents) {
    if (a.toolCalls && a.failed / a.toolCalls > ERROR_RATE)
      flags.push({ type: "error-heavy", agents: [a.n], text: `#${a.n} ${a.failed}/${a.toolCalls} tool calls failed (${Math.round((a.failed / a.toolCalls) * 100)}%)` });
  }
  for (const [file, ns] of groupBy(agents, "edited")) flags.push({ type: "edit-collision", file, agents: ns, text: `${file} edited by ${list(ns)}` });
  for (const a of agents) {
    if (a.reportChars < EMPTY_REPORT_CHARS)
      flags.push({ type: "empty-result", agents: [a.n], text: `#${a.n} final report is ${a.reportChars} chars (under ${EMPTY_REPORT_CHARS})` });
  }
  return flags;
}

const home = (p) => p.replace(/^~(?=\/|$)/, os.homedir());

function repoRoot(dir) {
  for (let d = dir; d !== path.dirname(d); d = path.dirname(d)) if (fs.existsSync(path.join(d, ".git"))) return d;
  return dir;
}

export function outsideFolders(a) {
  const dirs = [];
  const cds = new Set([...a.target.matchAll(/(?:^|[;&|]\s*)cd\s+(\S+)/g)].map((m) => m[1]));
  if (a.tool !== "Bash") return a.target.startsWith("/") ? [repoRoot(path.dirname(a.target))] : [];
  for (const m of a.target.matchAll(/(?:^|[\s=])(~?\/[^\s;&|'"`)]+)/g)) {
    const p = home(m[1]);
    const cd = cds.has(m[1]);
    dirs.push(repoRoot(cd || !path.extname(p) ? p : path.dirname(p)));
  }
  if (!dirs.length && a.cwd) dirs.push(repoRoot(a.cwd));
  return [...new Set(dirs)];
}

export function allowRule(a) {
  if (a.tool !== "Bash") return `${a.tool}`;
  const words = a.target.split(/&&|\|\||;|\|/).map((x) => x.trim().split(/\s+/).find((w) => !/^\w+=/.test(w))).filter((w) => w && w !== "cd");
  return words.length ? `Bash(${words[0]}:*)` : null;
}

const tally = (items) => [...items.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map())].sort((x, y) => y[1] - x[1]).map(([key, n]) => ({ key, count: n }));

export function approvalSummary(agents, project) {
  const all = agents.flatMap((a) => a.approvals);
  const reasons = new Map();
  for (const a of all) for (const r of a.reasons) {
    const cur = reasons.get(r) || { reason: r, count: 0, waitMs: 0, example: a.target };
    cur.count++;
    cur.waitMs += a.waitMs;
    reasons.set(r, cur);
  }
  return {
    count: all.length,
    waitMs: all.reduce((s, a) => s + a.waitMs, 0),
    reasons: [...reasons.values()].sort((x, y) => y.count - x.count),
    folders: tally(all.filter((a) => a.reasons.includes("outsideReadsBlocked")).flatMap(outsideFolders).filter((d) => d !== project)).map(({ key, count }) => ({ dir: key, count })),
    rules: tally(all.filter((a) => a.reasons.includes("no-rule-match")).map(allowRule).filter(Boolean)).map(({ key, count }) => ({ rule: key, count })),
  };
}

export function analyze({ main, agents }) {
  const { byAgent, reads } = launches(main);
  const summaries = agents
    .map((a) => summarizeAgent(a.id, a.entries, byAgent.get(a.id)))
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""))
    .map((a, i) => ({ n: i + 1, ...a }));
  const known = summaries.filter((a) => a.tokens);
  return {
    agents: summaries,
    flags: findFlags(summaries, reads),
    approvals: approvalSummary(summaries, main.find((e) => e.cwd) && repoRoot(main.find((e) => e.cwd).cwd)),
    totals: {
      subagents: summaries.length,
      durationMs: summaries.reduce((s, a) => s + a.durationMs, 0),
      waitMs: summaries.reduce((s, a) => s + a.waitMs, 0),
      toolCalls: summaries.reduce((s, a) => s + a.toolCalls, 0),
      tokens: known.length ? known.reduce((s, a) => s + a.tokens.total, 0) : null,
      costUsd: summaries.some((a) => a.costUsd !== null) ? summaries.reduce((s, a) => s + (a.costUsd || 0), 0) : null,
    },
  };
}
