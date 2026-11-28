import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { listSessions, loadSession, projectDir, readEntries } from "../src/sessions.js";
import { jsonl, result, say, tmp, use } from "./helpers.js";

const bin = path.join(import.meta.dirname, "..", "bin", "subagents.js");

function fixture() {
  const config = tmp();
  const project = "/work/my.app";
  const dir = projectDir(path.join(config, "projects"), project);
  fs.mkdirSync(path.join(dir, "s2", "subagents"), { recursive: true });
  fs.writeFileSync(path.join(dir, "s1.jsonl"), jsonl([say(0, "user", "hi")]));
  fs.writeFileSync(
    path.join(dir, "s2.jsonl"),
    jsonl([
      { ...say(0, "user", "split the work"), cwd: project },
      use(1, "a1", "Agent", { description: "Check the config loader" }),
      result(1, "a1", false, { toolUseResult: { agentId: "abc" } }),
      use(9, "r1", "Read", { file_path: "/work/my.app/src/config.js" }),
    ]) + "\n{not json\n"
  );
  fs.writeFileSync(
    path.join(dir, "s2", "subagents", "agent-abc.jsonl"),
    jsonl([say(1, "user", "prompt"), use(2, "t1", "Read", { file_path: "/work/my.app/src/config.js" }), result(3, "t1"), say(4, "assistant", "Short.")])
  );
  fs.writeFileSync(path.join(dir, "s2", "subagents", "journal.jsonl"), "");
  fs.utimesSync(path.join(dir, "s1.jsonl"), new Date(), new Date(Date.now() + 1000));
  return { config, project, dir };
}

const run = (config, args) => execFileSync("node", [bin, ...args], { encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: config } });

test("projectDir encodes the path like Claude Code", () => {
  assert.equal(projectDir("/b", "/Users/me/projects/mypage.cc"), "/b/-Users-me-projects-mypage-cc");
});

test("sessions are listed newest first with subagent counts and bad lines skipped", () => {
  const { dir } = fixture();
  assert.deepEqual(listSessions(dir).map((s) => [s.id, s.subagents]), [["s1", 0], ["s2", 1]]);
  assert.equal(readEntries(path.join(dir, "s2.jsonl")).length, 4);
  assert.deepEqual(loadSession(path.join(dir, "s2.jsonl")).agents.map((a) => a.id), ["abc"]);
});

test("cli reports the latest session that has subagents", () => {
  const { config, project } = fixture();
  const out = run(config, ["--project", project]);
  assert.match(out, /Session s2/);
  assert.match(out, /#1 abc {2}Check the config loader/);
  assert.match(out, /tools {2}1 \(Read 1\)/);
  assert.match(out, /read {3}src\/config\.js/);
  assert.match(out, /overlap: src\/config\.js read again by the main session after #1 finished/);
  assert.match(out, /empty-result: #1 final report is 6 chars/);
  assert.match(out, /Total: 1 subagents, 3m 0s, 1 tool calls$/m);
});

test("cli supports --list, --session, a file path, --json and --help", () => {
  const { config, project, dir } = fixture();
  assert.match(run(config, ["--list", "--project", project]), /0 subagents {2}s1\n.* 1 subagents {2}s2/);
  assert.match(run(config, ["--project", project, "--session", "s1"]), /has no subagents/);
  const json = JSON.parse(run(config, [path.join(dir, "s2.jsonl"), "--json"]));
  assert.equal(json.session, "s2");
  assert.deepEqual(json.flags.map((f) => f.type), ["overlap", "empty-result"]);
  assert.match(run(config, ["--help"]), /--session <id>/);
});

test("cli rejects unknown flags and missing values with usage and exit code 2", () => {
  const { config, project } = fixture();
  for (const args of [["--sesion", "foo"], ["--project", project, "--session"]]) {
    const r = spawnSync("node", [bin, ...args], { encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: config } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--session <id>/);
    assert.equal(r.stdout, "");
  }
});
