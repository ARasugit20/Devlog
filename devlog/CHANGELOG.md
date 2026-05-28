# Changelog

## 0.1.1

- No more confusing lessons about Python cache files or build folders
- Lessons now have a concept label, plain-English explanation, and a "why it matters" line
- New: loading indicator while DevLog is thinking
- New: open the changed file or copy a lesson with one click
- Fresh installs show a demo lesson immediately — no API key needed to see how it works
- UI now follows your editor's color theme automatically

## Unreleased

- Added README demo screenshot placeholder and recording instructions.
- Added standalone Privacy and Google Docs setup docs.
- Expanded mocked unit coverage across translator, watcher, doc sync, storage, settings, status, privacy, logger, and diffing.
- Removed the unused single-file translator path; DevLog now uses the batched translation path only.
- Added first-run demo/privacy prompt and OAuth token gitignore guidance.
- Added CI audit gate and VSIX artifact upload.
- Cleaned packaging docs and distribution metadata for 0.1.1.

## 0.1.0

- Added the DevLog activity bar view for beginner-friendly code change lessons.
- Added Gemini-powered explanations with API keys stored in VS Code Secret Storage.
- Added a 2 second debounce buffer so related file edits become one batched lesson.
- Added optional Google Docs sync for saving lessons outside the editor.
- Added VSIX packaging support for local installs in VS Code and Cursor.
