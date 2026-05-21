# Contributing to DevLog

DevLog is a VS Code/Cursor extension in `devlog/`.

## Local setup

```bash
cd devlog
npm ci
npm test
npm run compile
npm run package
```

## Run the extension

1. Open the `devlog` folder in VS Code or Cursor.
2. Press F5 to launch an Extension Development Host.
3. Open a sample project in the new window.
4. Turn on `devlog.demoMode` to test without Gemini.

## Test rules

- CI must not call Gemini or Google APIs.
- Mock external APIs in tests.
- Do not commit API keys, OAuth tokens, service-account JSON, `.env`, or `.devlog/`.
- Add tests for privacy, diffing, batching, storage, and sync behavior when changing those areas.

## Packaging

```bash
cd devlog
npm run package
```

The generated VSIX is ignored by git. GitHub Actions uploads build artifacts from CI.
