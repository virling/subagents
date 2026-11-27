# subagents

Review what Claude Code subagents actually did in a session: what each one ran, read and edited, how long it took, and where work was repeated or wasted. Zero dependencies, reads your local transcripts, sends nothing anywhere.

## Requirements

- Node.js 20 or newer
- Claude Code sessions on this machine (`~/.claude/projects`, or `$CLAUDE_CONFIG_DIR/projects`)

## Usage

```bash
npx -y @virling/subagents
```

```
subagents                       latest session with subagents for the project in this folder
subagents <session.jsonl>       a specific transcript file
subagents --session <id>        a session of the project by id
subagents --project <path>      use another project folder instead of this one
subagents --list                recent sessions with subagent counts
subagents --json                print the report as JSON
subagents --help
```

## Example

```
Session 3f1c9a2e-0b7d-4c55-9e61-2a8d4f6b1c07

#1 a91f0c2d7e3b4a5c6  Map the billing module
   11-26 14:02 -> 11-26 14:06  4m 12s  report 2.1k chars  tokens 412.5k
   tools  18 (Read 11, Grep 5, Bash 2)
   read   src/billing/invoice.js, src/billing/tax.js, src/db.js

#2 b27d4e8a1c9f0b3d2  Find why invoice totals are off
   11-26 14:02 -> 11-26 14:09  7m 40s  report 140 chars  tokens 655.0k
   tools  26 (Bash 12, Read 9, Edit 5)  failed 9
   read   src/billing/invoice.js, src/billing/round.js
   edited src/billing/round.js

#3 c5e0a3f9b2d7c1e84  Add tests for rounding
   11-26 14:10 -> 11-26 14:13  3m 5s  report 820 chars  tokens 301.2k
   tools  12 (Bash 6, Edit 4, Read 2)
   read   src/billing/round.js
   edited src/billing/round.js, test/round.test.js

Flags
   overlap: src/billing/invoice.js read by #1, #2
   overlap: src/billing/round.js read by #2, #3
   overlap: src/db.js read again by the main session after #1 finished
   repeated-command: `npm test -- billing` run in #2, #3
   error-heavy: #2 9/26 tool calls failed (35%)
   edit-collision: src/billing/round.js edited by #2, #3
   empty-result: #2 final report is 140 chars (under 200)

Total: 3 subagents, 14m 57s, 56 tool calls, 1.4M tokens
```

## What is measured

Each subagent transcript lives at `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`. The description comes from the `Agent` (or older `Task`) tool call in the main session, or else the subagent's first message.

- **Time**: active time in the subagent transcript. When a subagent is continued later with a follow-up message, the idle gap before that message is not counted. Time spent waiting for a person to approve a tool call is not counted either. A long-running tool, such as a slow Bash command, still counts.
- **Tool calls**: every `tool_use`, grouped by tool name. **Failed** counts `tool_result` entries with `is_error`.
- **Read / edited**: file paths from `Read`, and from `Edit`, `Write`, `MultiEdit` and `NotebookEdit`.
- **Report**: characters of the subagent's last text after its last tool call.
- **Tokens**: input, output and cache tokens from `message.usage`, counted once per API message.

## Flags

- **overlap**: the same file read by 2+ subagents, or read by the main session after a subagent that read it had finished.
- **repeated-command**: the same Bash command (whitespace collapsed) run in 2+ subagents.
- **error-heavy**: more than 30% of a subagent's tool calls failed.
- **edit-collision**: the same file edited by 2+ subagents.
- **empty-result**: the final report is under 200 characters.

Flags are hints, not verdicts: two subagents reading the same file is often fine.

## More tools from Virling

- [agentmem](https://github.com/virling/agentmem): project memory for AI coding agents, shared across Claude Code, Cursor, Codex and other MCP clients.
- [ccdoctor](https://github.com/virling/ccdoctor): checks your Claude Code setup: hooks, MCP servers and plugins that are registered but not working.
- [ciwhy](https://github.com/virling/ciwhy): finds the real error in a failed GitHub Actions run and tells you if it is flaky.
- [npmship](https://github.com/virling/npmship): releases an npm package and verifies it landed on npm, in CI and on GitHub.

## License

[PolyForm Noncommercial 1.0.0](LICENSE)
