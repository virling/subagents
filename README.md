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

#1 a85240df5ea60a9fa  Draft the changelog from commits
   11-27 16:25 -> 11-27 16:44  2m 58s  report 4.0k chars  tokens 1.2M  ~$1.02  waited 16m 41s for approval
   tools  17 (Bash 15, Write 2)
   edited src/draft.js, test/draft.test.js

#2 a8e15fc2a8fa93605  Audit the config loader
   11-28 15:30 -> 11-28 15:33  2m 14s  report 6.6k chars  tokens 501.1k  ~$0.89  waited 29s for approval
   tools  9 (Bash 7, Read 2)
   read   src/config.js, src/cli.js

#3 a3cba4c459b909b40  Review the test suite
   11-28 15:30 -> 11-28 15:47  2m 28s  report 7.7k chars  tokens 761.8k  ~$1.05  waited 13m 58s for approval
   tools  11 (Bash 10, Skill 1)

Flags
   none

Approvals
   24 tool calls waited 31m 7s for you to approve them
   safetyCheck  13  16m 31s  e.g. git diff --stat && npm test 2>&1 | tail -20
   outsideReadsBlocked  11  14m 36s  e.g. cd /work/shared-lib && git status --short && ls -R src test
   folders outside the project (add to permissions.additionalDirectories or run /add-dir): /work/shared-lib (8), /work/docs (3)

Total: 3 subagents, 7m 39s, 37 tool calls, 2.5M tokens, ~$2.97 at API prices
```

## What is measured

Each subagent transcript lives at `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`. The description comes from the `Agent` (or older `Task`) tool call in the main session, or else the subagent's first message.

- **Time**: active time in the subagent transcript. When a subagent is continued later with a follow-up message, the idle gap before that message is not counted. Time spent waiting for a person to approve a tool call is not counted either. A long-running tool, such as a slow Bash command, still counts.
- **Tool calls**: every `tool_use` except `SubagentHandback`, grouped by tool name. **Failed** counts `tool_result` entries with `is_error`.
- **Read / edited**: file paths from `Read`, and from `Edit`, `Write`, `MultiEdit` and `NotebookEdit`.
- **Report**: characters of the message the subagent hands back with `SubagentHandback`, or else of its last text after its last tool call.
- **Tokens**: input, output and cache tokens from `message.usage`, counted once per API message.
- **Cost**: an estimate from those tokens at API list prices per model, including Haiku 5.5's higher price for prompts over 100K tokens; the total is left out when any subagent's model has no known price.

## Flags

- **overlap**: the same file read by 2+ subagents, or read by the main session after a subagent that read it had finished.
- **repeated-command**: the same Bash command (whitespace collapsed) run in 2+ subagents.
- **error-heavy**: more than 30% of a subagent's tool calls failed.
- **edit-collision**: the same file edited by 2+ subagents.
- **empty-result**: the final report is under 200 characters.

## Approvals

Tool calls that waited for you to approve a permission prompt, and how long they waited in total, grouped by the reason Claude Code recorded: `outsideReadsBlocked` (the call read outside the project's folders), `safetyCheck`, `no-rule-match` and others.

- **Folders outside the project**: the folders behind `outsideReadsBlocked` prompts. Add them to `permissions.additionalDirectories` in settings, or with `/add-dir`, to stop those prompts.
- **Allow rule candidates**: `Bash(<command>:*)` rules for `no-rule-match` prompts. Check that each one is safe before adding it to `permissions.allow`.

Flags are hints, not verdicts: two subagents reading the same file is often fine.

## More tools from Virling

- [agentmem](https://github.com/virling/agentmem): project memory for AI coding agents, shared across Claude Code, Cursor, Codex and other MCP clients.
- [ccdoctor](https://github.com/virling/ccdoctor): checks your Claude Code setup: hooks, MCP servers and plugins that are registered but not working.
- [ciwhy](https://github.com/virling/ciwhy): finds the real error in a failed GitHub Actions run and tells you if it is flaky.
- [npmship](https://github.com/virling/npmship): releases an npm package and verifies it landed on npm, in CI and on GitHub.

## License

[PolyForm Noncommercial 1.0.0](LICENSE)
