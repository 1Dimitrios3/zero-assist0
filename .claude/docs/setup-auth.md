# Setup & Auth

## 1. Google Cloud Project

1. [Google Cloud Console](https://console.cloud.google.com/) → **New Project**
2. **APIs & Services** → **Library** → Enable **Google Calendar API**, **Gmail API**, **Google Docs API**, and **Google Drive API**
3. **OAuth consent screen** → External → Add scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive.readonly`
4. Add your email as a test user
5. **Credentials** → **OAuth client ID** (Web application) → Redirect URI: `http://localhost:3000/api/auth/google/callback`

## 2. Environment Variables

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GMAIL_USER_ID=me
MODEL_ID=gpt-4o-mini
OPENAI_API_KEY=your-key
```

## 3. Connect Google Account

1. `pnpm dev`
2. Visit http://localhost:3000/api/auth/google
3. Grant calendar, Gmail, and Docs permissions
4. Redirected back with `?success=google_connected`

To re-authenticate: delete `token.json` and repeat step 2-3.

## Auth Design

Auth is per-service: `calendarConnected`, `gmailConnected`, and `docsConnected` check actual token scopes, so an old token without Docs scopes won't enable docs tools.
