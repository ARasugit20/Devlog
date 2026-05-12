# DevLog

DevLog is a VS Code extension that watches file changes made by AI coding agents (Cursor, Claude Code, GitHub Copilot, and similar tools), turns each change into a short plain-English lesson, streams those lessons into a sidebar panel, and syncs them to a Google Doc in real time.

## What it does

- Watches the open workspace for file create, modify, and delete events.
- Builds a simple line diff for each change.
- Sends the diff to Gemini and asks for a beginner-friendly explanation plus one concept label.
- Appends each lesson to the DevLog sidebar (newest first).
- Appends the same lesson to a configured Google Doc when sync is available.

## Install in VS Code or Cursor

DevLog works in both VS Code and Cursor because both use the same extension host.

### Option A: Install from a VSIX file

1. Build a VSIX from the `devlog` folder:

```bash
npm install
npm run package
```

2. In VS Code or Cursor, open the Command Palette and run **Extensions: Install from VSIX...**.
3. Select the generated `devlog-0.1.0.vsix` file.
4. Reload the editor when prompted.
5. Open the DevLog activity bar icon on the left and choose **Lessons**.

### Option B: Run from source during development

1. Open the `devlog` folder in VS Code or Cursor.
2. Install dependencies and compile:

```bash
npm install
npm run compile
```

3. Press `F5` to launch an Extension Development Host.
4. Open a workspace folder in the Extension Development Host and make file changes to see DevLog entries appear under the DevLog activity bar.

## Gemini API key

DevLog needs a Google Gemini API key for long-running translation.

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In VS Code or Cursor, run **DevLog: Set Gemini API Key** from the Command Palette.
3. Paste the key. DevLog stores it in VS Code Secret Storage instead of plain `settings.json`.

`devlog.geminiApiKey` still works as a fallback, but the command is the recommended setup for everyday use.

After changing configuration, run **DevLog: Start DevLog** to restart watching.

## Google Docs sync

- `devlog.googleDocId` — Google Doc ID to receive synced entries. If it is missing, DevLog skips Google Doc sync and logs a warning.

For Google Docs sync, authenticate with a Google service account using Application Default Credentials. A common setup is to set `GOOGLE_APPLICATION_CREDENTIALS` to the path of your service account JSON file and share the target Google Doc with that service account email.

## Share DevLog with other users

- Send them the built `.vsix` file and the install steps above.
- For wider distribution, publish the extension to the Visual Studio Marketplace with `npx vsce publish` after creating a publisher account.
