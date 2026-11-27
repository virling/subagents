import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "subagents-"));

export const at = (min) => new Date(Date.UTC(2026, 0, 1, 10, min)).toISOString();

export const use = (min, id, name, input, usage) => ({
  type: "assistant",
  timestamp: at(min),
  message: { id: `msg-${id}`, role: "assistant", content: [{ type: "tool_use", id, name, input }], ...(usage && { usage }) },
});

export const result = (min, id, isError = false, extra = {}) => ({
  type: "user",
  timestamp: at(min),
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok", is_error: isError }] },
  ...extra,
});

export const say = (min, role, text) => ({ type: role, timestamp: at(min), message: { role, content: role === "user" ? text : [{ type: "text", text }] } });

export const jsonl = (entries) => entries.map((e) => JSON.stringify(e)).join("\n");
