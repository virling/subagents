# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Time no longer includes waiting for a person to approve a tool call, which could inflate a subagent from minutes to hours.

## [0.1.0] - 2026-11-27

### Added

- `subagents` summarizes each subagent of a Claude Code session: description, active time, tool calls, files read and edited, failed calls, report length and tokens.
- Flags overlapping reads, repeated commands, error-heavy subagents, edit collisions and empty results.
- Pick a session with `--session`, a file path or `--project`; `--list` shows recent sessions; `--json` output.

[Unreleased]: https://github.com/virling/subagents/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/virling/subagents/releases/tag/v0.1.0
