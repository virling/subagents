#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { analyze } from "../src/analyze.js";
import { formatReport } from "../src/format.js";
import { defaultBase, listSessions, loadSession, projectDir } from "../src/sessions.js";

const HELP = `subagents: review what Claude Code subagents did in a session

  subagents                       latest session with subagents for the project in this folder
  subagents <session.jsonl>       a specific transcript file
  subagents --session <id>        a session of the project by id
  subagents --project <path>      use another project folder instead of this one
  subagents --list                recent sessions with subagent counts
  subagents --json                print the report as JSON
  subagents --help

Transcripts are read from $CLAUDE_CONFIG_DIR/projects or ~/.claude/projects.`;

const BOOLEAN_FLAGS = ["list", "json", "help"];

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) positional.push(argv[i]);
    else if (BOOLEAN_FLAGS.includes(argv[i].slice(2))) flags[argv[i].slice(2)] = true;
    else flags[argv[i].slice(2)] = argv[++i];
  }
  return { positional, flags };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) return console.log(HELP);
  const dir = projectDir(defaultBase(), flags.project || process.cwd());
  const sessions = listSessions(dir);
  if (flags.list) {
    if (!sessions.length) return console.log(`No sessions in ${dir}`);
    const rows = sessions.slice(0, 20).map((s) => `${s.mtime.toLocaleString("sv").slice(0, 16)}  ${String(s.subagents).padStart(3)} subagents  ${s.id}`);
    return console.log(rows.join("\n"));
  }
  let file = positional[0] && path.resolve(positional[0]);
  if (!file && flags.session) file = path.join(dir, `${flags.session}.jsonl`);
  if (!file) file = sessions.find((s) => s.subagents)?.file;
  if (!file || !fs.existsSync(file)) {
    console.error(file ? `No such session: ${file}` : `No session with subagents in ${dir}`);
    process.exitCode = 1;
    return;
  }
  const session = loadSession(file);
  const report = analyze(session);
  if (flags.json) return console.log(JSON.stringify({ session: session.id, file, ...report }, null, 2));
  if (!report.agents.length) return console.log(`Session ${session.id} has no subagents.`);
  const cwd = session.main.find((e) => e.cwd)?.cwd;
  console.log(`Session ${session.id}\n`);
  console.log(formatReport(report, cwd));
}

main();
