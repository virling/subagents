import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const defaultBase = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "projects");

export const projectDir = (base, project) => path.join(base, path.resolve(project).replace(/[^a-zA-Z0-9]/g, "-"));

export function readEntries(file) {
  const entries = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return entries;
}

export function subagentFiles(sessionFile) {
  const dir = path.join(sessionFile.replace(/\.jsonl$/, ""), "subagents");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^agent-.+\.jsonl$/.test(f)).sort().map((f) => path.join(dir, f));
}

export function listSessions(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const file = path.join(dir, f);
      return { id: f.slice(0, -6), file, mtime: fs.statSync(file).mtime, subagents: subagentFiles(file).length };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function loadSession(file) {
  return {
    id: path.basename(file, ".jsonl"),
    file,
    main: readEntries(file),
    agents: subagentFiles(file).map((f) => ({ id: path.basename(f, ".jsonl").slice(6), entries: readEntries(f) })),
  };
}
