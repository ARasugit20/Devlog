# Changelog

## 0.1.0

- Added the DevLog activity bar view for beginner-friendly code change lessons.
- Added Gemini-powered explanations with API keys stored in VS Code Secret Storage.
- Added a 2 second debounce buffer so related file edits become one batched lesson.
- Added optional Google Docs sync for saving lessons outside the editor.
- Added VSIX packaging support for local installs in VS Code and Cursor.

## Unreleased

- Hardened watcher and diffing pipeline with baseline seeding, binary/large-file skipping, truncation limits, and configurable exclude globs.
- Added privacy controls: redaction, include-file-path toggle, prompt limits, and privacy info command.
- Added translator reliability improvements: retry/backoff, rate-limit status handling, and local fallback lessons instead of silent drops.
- Added persisted lesson history with configurable retention.
- Added sidebar status banner, pause/resume controls, and richer UX states.
- Added Docs sync controls and test command, with OAuth credentials path support and non-blocking status reporting.
- Added initial automated tests and CI workflow for compile/test/package.
