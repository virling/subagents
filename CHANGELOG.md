# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/virling/subagents/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/virling/subagents/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/virling/subagents/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/virling/subagents/releases/tag/v0.1.0
