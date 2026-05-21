# DevLog Privacy

DevLog is a bring-your-own-key extension. It does not include a Gemini API key, Google OAuth client secret, or hosted backend.

## What may leave your machine

When demo mode is off and a Gemini key is configured, DevLog can send this data to Gemini:

- Batched diffs from changed text files
- Change type such as created, modified, or deleted
- Relative file paths if `devlog.includeFilePaths` is true
- Truncation or skipped-file context when a file is too large or binary

When Google Docs sync is enabled, DevLog appends lesson text to the configured Google Doc. The synced text includes timestamp, file label, concept, and explanation. Raw diffs are not appended to the document.

## Privacy controls

- `devlog.demoMode`: uses local demo summaries and makes no Gemini call.
- `devlog.redactSecrets`: redacts common key/token/password patterns before Gemini prompts.
- `devlog.includeFilePaths`: controls whether relative file paths are included in prompts.
- `devlog.maxFileSizeKb`: skips files above the configured size.
- `devlog.maxDiffChars`: caps stored/generated diff size.
- `devlog.maxPromptChars`: caps prompt length sent to Gemini.
- `devlog.excludeGlobs`: excludes folders and file types from watching and translation.

## Secrets and tokens

Gemini API keys entered with **DevLog: Set Gemini API Key** are stored in VS Code Secret Storage.

Google OAuth tokens are stored under `.devlog/` in the active workspace. DevLog writes `.devlog/.gitignore` with `*` when creating that token directory. You should still add `.devlog/` to your project `.gitignore`.

## Recommended private defaults

For sensitive projects, use:

```json
{
  "devlog.demoMode": false,
  "devlog.redactSecrets": true,
  "devlog.includeFilePaths": false,
  "devlog.maxFileSizeKb": 256,
  "devlog.maxPromptChars": 8000
}
```

Do not use DevLog on repositories that prohibit sending code snippets to third-party AI APIs.
