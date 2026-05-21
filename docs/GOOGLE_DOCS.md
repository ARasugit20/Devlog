# Google Docs Sync

Google Docs sync is advanced and optional. DevLog's core sidebar flow does not require Google Docs, OAuth, or Google Cloud setup.

## What sync does

When enabled, DevLog appends each lesson to a configured Google Doc. It does not append raw diffs. The appended text includes:

- Timestamp
- File label or batch label
- Concept
- Beginner-friendly explanation

## Recommended OAuth setup

1. In Google Cloud Console, create or select a project.
2. Enable the Google Docs API.
3. Configure an OAuth consent screen.
4. Create OAuth credentials for a desktop application.
5. Download the client JSON file.
6. In VS Code or Cursor settings, configure:

```json
{
  "devlog.docsSyncEnabled": true,
  "devlog.googleDocId": "your-google-doc-id",
  "devlog.googleOAuthCredentialsPath": "/absolute/path/to/oauth-client.json"
}
```

7. Run **DevLog: Connect Google Docs (OAuth)**.
8. Complete the browser flow and paste the authorization code.
9. Run **DevLog: Test Google Docs Sync**.

## Token safety

DevLog stores OAuth tokens in `.devlog/google-oauth-token.json` under the active workspace and writes `.devlog/.gitignore` with `*`.

Add this to your project `.gitignore` too:

```gitignore
.devlog/
```

Never commit OAuth client secrets, service-account keys, `.env` files, or `.devlog/` tokens.

## ADC fallback

If OAuth credentials are not configured, DevLog can fall back to Google Application Default Credentials. This is intended for advanced developer or enterprise setups only.

Common ADC setup uses:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

Share the target Google Doc with the service account email. Keep service-account JSON files out of source control.
