# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- A subagent's final report delivered with SubagentHandback counts as its report, so subagents are no longer all flagged as empty, and the handback is not counted as a tool call.
- Cost covers `[1m]` model ids, ignores empty synthetic messages, charges fast mode at 2x, and the total shows no cost when any subagent could not be priced.
- No allow rule is suggested for wrapper commands such as `sudo`, `env` or `time`.
- Suggested folders are checked on disk, so files and `/dev/` paths are not suggested.
- Inline secrets (`NAME=value`, Authorization and Bearer values) are masked in commands and approval examples.
- Unknown flags, missing flag values and a folder as the session argument exit 2 with usage.
- Token counts switch to M at 999950.

## [0.3.0] - 2026-11-28

### Added

- Estimated cost at API prices for each subagent and in the total (`costUsd` in `--json`), from per-model prices for Opus 5.5, Opus 5, Sonnet 5.5 and Haiku 5.5, with 1-hour cache writes at 2x input and 5-minute writes at 1.25x. Subagents on other models show no cost.

## [0.2.0] - 2026-11-28

### Added

- Approvals section: tool calls that waited for you to approve them, grouped by reason, with folders to add to `permissions.additionalDirectories` and `Bash(...)` allow rule candidates. Each subagent shows how long it waited. `--json` includes `approvals` and `waitMs`.

## [0.1.1] - 2026-11-28

### Fixed

- Time no longer includes waiting for a person to approve a tool call, which could inflate a subagent from minutes to hours.

## [0.1.0] - 2026-11-27

### Added

- `subagents` summarizes each subagent of a Claude Code session: description, active time, tool calls, files read and edited, failed calls, report length and tokens.
- Flags overlapping reads, repeated commands, error-heavy subagents, edit collisions and empty results.
- Pick a session with `--session`, a file path or `--project`; `--list` shows recent sessions; `--json` output.

[Unreleased]: https://github.com/virling/subagents/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/virling/subagents/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/virling/subagents/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/virling/subagents/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/virling/subagents/releases/tag/v0.1.0
