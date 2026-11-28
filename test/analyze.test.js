import assert from "node:assert/strict";
import { test } from "node:test";
import { allowRule, analyze, cost, approvalSummary, findFlags, launches, normalizeCommand, outsideFolders, summarizeAgent } from "../src/analyze.js";
import { at, result, say, use } from "./helpers.js";

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 };

test("summarizeAgent counts tools, files, failures, report and tokens", () => {
  const long = "Found it. ".repeat(30);
  const entries = [
    say(0, "user", "Look into the parser"),
    use(1, "t1", "Read", { file_path: "/p/a.js" }, usage),
    { ...use(1, "t1", "Read", { file_path: "/p/a.js" }, usage), message: { id: "msg-t1", role: "assistant", content: [{ type: "text", text: "same message, second block" }], usage } },
    result(2, "t1"),
    use(3, "t2", "Bash", { command: "  npm   test " }, usage),
    result(4, "t2", true),
    use(5, "t3", "Edit", { file_path: "/p/b.js" }),
    result(6, "t3"),
    use(6, "t4", "NotebookEdit", { notebook_path: "/p/n.ipynb" }),
    result(7, "t4"),
    say(9, "assistant", long),
    { type: "api-request", timestamp: at(30), message: { role: "assistant", content: [] } },
  ];
  const a = summarizeAgent("x1", entries);
  assert.equal(a.description, "Look into the parser");
  assert.equal(a.toolCalls, 4);
  assert.deepEqual(a.tools, { Read: 1, Bash: 1, Edit: 1, NotebookEdit: 1 });
  assert.deepEqual(a.read, ["/p/a.js"]);
  assert.deepEqual(a.edited, ["/p/b.js", "/p/n.ipynb"]);
  assert.deepEqual(a.commands, ["npm test"]);
  assert.equal(a.failed, 1);
  assert.equal(a.durationMs, 9 * 60000);
  assert.equal(a.reportChars, long.trim().length);
  assert.deepEqual(a.tokens, { input: 20, output: 10, cacheRead: 200, cacheCreation: 2, total: 232 });
});

test("summarizeAgent leaves out the idle gap before a follow-up message", () => {
  const a = summarizeAgent("x2", [say(0, "user", "First task"), say(2, "assistant", "Done."), say(120, "user", "One more thing"), say(125, "assistant", "Done too.")]);
  assert.equal(a.durationMs, 7 * 60000);
});

test("summarizeAgent leaves out time spent waiting for a person to approve a tool call", () => {
  const a = summarizeAgent("x3", [
    say(0, "user", "go"),
    use(1, "t1", "Bash", { command: "npm test" }),
    result(9, "t1", false, { permissionDecision: { decision: "accept", source: "config" } }),
    use(10, "t2", "Bash", { command: "ls" }),
    result(40, "t2", false, { permissionDecision: { decision: "accept", source: "user_temporary" } }),
    say(41, "assistant", "Done."),
  ]);
  assert.equal(a.durationMs, 11 * 60000);
  assert.equal(a.waitMs, 30 * 60000);
  assert.deepEqual(a.approvals, [{ tool: "Bash", target: "ls", reasons: ["prompt"], waitMs: 30 * 60000, cwd: undefined }]);
});

test("approvalSummary groups prompts by reason and suggests folders and allow rules", () => {
  const agent = (approvals) => ({ approvals });
  const s = approvalSummary(
    [
      agent([
        { tool: "Bash", target: "cd /elsewhere/app && sed -n 1,5p src/a.js", reasons: ["outsideReadsBlocked"], waitMs: 60000 },
        { tool: "Bash", target: "wc -l src/b.js", reasons: ["outsideReadsBlocked"], waitMs: 60000, cwd: "/elsewhere/app" },
        { tool: "Bash", target: "grep -n x /proj/src/a.js", reasons: ["outsideReadsBlocked"], waitMs: 1000 },
      ]),
      agent([{ tool: "Bash", target: "TOKEN=1 gh run list | head", reasons: ["no-rule-match", "safetyCheck"], waitMs: 5000 }]),
    ],
    "/proj/src"
  );
  assert.equal(s.count, 4);
  assert.equal(s.waitMs, 126000);
  assert.deepEqual(s.reasons.map((r) => [r.reason, r.count]), [["outsideReadsBlocked", 3], ["no-rule-match", 1], ["safetyCheck", 1]]);
  assert.deepEqual(s.folders, [{ dir: "/elsewhere/app", count: 2 }]);
  assert.deepEqual(s.rules, [{ rule: "Bash(gh:*)", count: 1 }]);
  assert.deepEqual(outsideFolders({ tool: "Read", target: "/x/y/z.md" }), ["/x/y"]);
  assert.equal(allowRule({ tool: "Bash", target: "cd /a && npm test" }), "Bash(npm:*)");
});

test("text before a tool call is not the final report, and no usage means no tokens", () => {
  const a = summarizeAgent("x", [say(0, "user", "go"), say(1, "assistant", "x".repeat(300)), use(2, "t", "Bash", { command: "ls" })]);
  assert.equal(a.reportChars, 0);
  assert.equal(a.tokens, null);
});

test("launches maps agent ids to the agent tool input and collects main reads", () => {
  const main = [
    use(0, "a1", "Agent", { description: "Audit the routes", prompt: "long prompt" }),
    result(1, "a1", false, { toolUseResult: { agentId: "abc", status: "async_launched" } }),
    use(2, "a2", "Task", { description: "Old style" }),
    result(3, "a2", false, { toolUseResult: { agentId: "def" } }),
    use(4, "r1", "Read", { file_path: "/p/a.js" }),
  ];
  const { byAgent, reads } = launches(main);
  assert.equal(byAgent.get("abc").description, "Audit the routes");
  assert.equal(byAgent.get("def").description, "Old style");
  assert.deepEqual(reads, [{ file: "/p/a.js", time: at(4) }]);
});

test("flags fire for each heuristic with evidence", () => {
  const base = { toolCalls: 10, failed: 0, read: [], edited: [], commands: [], reportChars: 500, end: at(10) };
  const agents = [
    { ...base, n: 1, read: ["/p/a.js", "/p/c.js"], edited: ["/p/e.js"], commands: ["npm test"] },
    { ...base, n: 2, read: ["/p/a.js"], edited: ["/p/e.js"], commands: ["npm test"], failed: 4, reportChars: 50 },
    { ...base, n: 3, failed: 3, end: at(30), read: ["/p/d.js"] },
  ];
  const flags = findFlags(agents, [
    { file: "/p/c.js", time: at(20) },
    { file: "/p/d.js", time: at(20) },
  ]);
  const types = flags.map((f) => `${f.type} ${f.agents.join(",")}`);
  assert.deepEqual(types, [
    "overlap 1,2",
    "overlap 1",
    "repeated-command 1,2",
    "error-heavy 2",
    "edit-collision 1,2",
    "empty-result 2",
  ]);
  assert.match(flags[1].text, /read again by the main session after #1 finished/);
  assert.match(flags[3].text, /4\/10 tool calls failed \(40%\)/);
});

test("analyze orders subagents by start and totals them", () => {
  const report = analyze({
    main: [use(0, "a1", "Agent", { description: "Second" }), result(0, "a1", false, { toolUseResult: { agentId: "late" } })],
    agents: [
      { id: "late", entries: [say(5, "user", "b"), use(6, "t", "Bash", { command: "ls" }, usage), result(7, "t")] },
      { id: "early", entries: [say(1, "user", "First task"), say(2, "assistant", "done")] },
    ],
  });
  assert.deepEqual(report.agents.map((a) => [a.n, a.id, a.description]), [[1, "early", "First task"], [2, "late", "Second"]]);
  assert.deepEqual(report.totals, { subagents: 2, durationMs: 3 * 60000, toolCalls: 1, tokens: 116, waitMs: 0, costUsd: null });
});

test("normalizeCommand collapses whitespace", () => {
  assert.equal(normalizeCommand("  git   status\n"), "git status");
});

test("cost uses per-model prices and charges 1h cache writes at 2x", () => {
  const u = { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 2e6, cache_creation: { ephemeral_1h_input_tokens: 1e6 } };
  assert.equal(cost(u, "claude-opus-5-5"), 4 + 20 + 0.2 + 5 + 8);
  assert.equal(cost({ cache_creation_input_tokens: 1e6 }, "claude-sonnet-5-5"), 2.5);
  assert.equal(cost(u, "some-other-model"), null);
});
