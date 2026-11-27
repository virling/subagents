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
  let prev = null;
  for (const e of turns(entries)) {
    const { role, content } = e.message;
    if (e.timestamp) {
      times.push(e.timestamp);
      const t = Date.parse(e.timestamp);
      // A new prompt after a pause is a later continuation, so the gap before it is idle time.
      const prompt = role === "user" && text(content).trim() && !blocks(content).some((c) => c.type === "tool_result");
      if (prev !== null && !prompt) active += t - prev;
      prev = t;
    }
    if (role === "user" && !first) first = text(content).trim();
    if (role === "assistant" && e.message.usage) usage.set(e.message.id || e.uuid, e.message.usage);
    for (const c of blocks(content)) {
      if (c.type === "tool_result" && c.is_error) failed++;
      if (role !== "assistant") continue;
      if (c.type === "text") report += `${c.text}\n`;
      if (c.type !== "tool_use") continue;
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
  return {
    id,
    description: truncate((input?.description || first || "").replace(/\s+/g, " ").trim()),
    start,
    end,
    durationMs: active,
    toolCalls: calls,
    tools,
    failed,
    read: [...read],
    edited: [...edited],
    commands: [...commands],
    reportChars: report.trim().length,
    tokens,
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
    totals: {
      subagents: summaries.length,
      durationMs: summaries.reduce((s, a) => s + a.durationMs, 0),
      toolCalls: summaries.reduce((s, a) => s + a.toolCalls, 0),
      tokens: known.length ? known.reduce((s, a) => s + a.tokens.total, 0) : null,
    },
  };
}
