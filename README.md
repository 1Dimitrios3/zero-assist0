# Zero Assist

Multi-agent AI assistant with Google Calendar and Gmail integration. Uses an orchestrator/router pattern to classify user intent and route to the right agent (or agent chain).

## Features

- **Calendar**: View, create, update, delete, and search events. Automatic scheduling conflict detection. Recurring events with reminders and guest invitations.
- **Email**: List, read, search, send, and reply to emails. Rich context extraction for cross-agent chaining.
- **Cross-agent**: "Check my emails from John and schedule any meetings he mentioned" — email agent runs first, output feeds into calendar agent.
- **Voice input**: Microphone recording transcribed via OpenAI Whisper.
- **Tool approvals**: Destructive actions (send email, create event) show an approval dialog before executing.

## Setup

1. Create a Google Cloud project, enable Calendar API + Gmail API, configure OAuth consent with scopes (`calendar`, `gmail.readonly`, `gmail.compose`), and create OAuth credentials. See [CLAUDE.md](./CLAUDE.md) for detailed steps.

2. Configure environment:
   ```bash
   cp .env.example .env
   ```
   ```env
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   GMAIL_USER_ID=your_email_address
   MODEL_ID=gpt-4o-mini
   OPENAI_API_KEY=your-key
   ```

3. Install and run:
   ```bash
   pnpm install && pnpm dev
   ```

## Google Authentication

The app uses OAuth 2.0 to connect to your Google Calendar and Gmail. Follow these steps to authenticate:

1. **Start the dev server** (`pnpm dev`) and visit:
   ```
   http://localhost:3000/api/auth/google
   ```

2. **Sign in** with the Google account you added as a test user in the Cloud Console.

3. **Grant permissions** — you'll be asked to allow access to:
   - Google Calendar (read/write)
   - Gmail (read + compose)
   - Your profile name (used to sign off emails)

4. **Redirect** — after granting permissions you'll be redirected back to the app with `?success=google_connected`. A `token.json` file is saved in the project root with your OAuth tokens.

5. **Start chatting** — the assistant will now have access to your calendar and email.

### Re-authenticating

If you need to re-authenticate (e.g., token expired, changed scopes, switched accounts):

1. Delete the `token.json` file from the project root
2. Visit `http://localhost:3000/api/auth/google` again
3. Complete the OAuth flow

### Troubleshooting

- **"Access blocked" error** — make sure your email is listed as a test user in the Google Cloud Console under OAuth consent screen.
- **Calendar or email tools not appearing** — the app checks the granted scopes in `token.json`. If you authenticated before Gmail or Calendar API was enabled, delete `token.json` and re-authenticate.
- **"Google account not connected" message in chat** — the `token.json` file is missing or corrupted. Re-authenticate using the steps above.

## Development

```bash
pnpm dev          # Dev server (Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
npx tsc --noEmit  # Type check
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
User Message → POST /api/chat → orchestrate(messages)
  ├─ classifyIntent() → route (calendar_only | gmail_only | gmail_then_cal | general)
  ├─ Execute agent pipeline (single or chained)
  └─ Stream response with tool approval support
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture, key files, and agent design.
