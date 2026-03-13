# CLAUDE.md

## Overview

Zero Assist is a multi-agent AI assistant with Google Calendar, Gmail, and Google Docs integration. It uses an orchestrator/router pattern: user messages are classified by intent, then routed to the appropriate agent (or agent chain) for execution.

## Setup

### 1. Google Cloud Project

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

### 2. Environment Variables

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GMAIL_USER_ID=me
MODEL_ID=gpt-4o-mini
OPENAI_API_KEY=your-key
```

### 3. Connect Google Account

1. `pnpm dev`
2. Visit http://localhost:3000/api/auth/google
3. Grant calendar, Gmail, and Docs permissions
4. Redirected back with `?success=google_connected`

To re-authenticate: delete `token.json` and repeat step 2-3.

## Usage

**Calendar**: "What's on my calendar today?", "Schedule a meeting tomorrow at 2pm", "Delete my dentist appointment"

**Email**: "Show me my recent emails", "Send an email to john@example.com", "Reply to that email"

**Docs**: "Show me my recent documents", "Create a doc called Meeting Notes", "Read my project plan", "Add notes to my report doc", "Change 'draft' to 'final' in my proposal"

**Cross-agent**: "Check my emails from John and schedule any meetings he mentions", "Read my emails and compile a summary doc", "Read my project timeline doc and schedule the milestones"

**Voice**: Microphone input transcribed via OpenAI Whisper.

## Development

```bash
pnpm dev          # Dev server (Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
npx tsc --noEmit  # Type check
```

## Architecture

```
User Message → POST /api/chat → orchestrate(messages)
  │
  ├─ Phase 1: classifyIntent() → gpt-4o-mini determines route
  │    Routes: calendar_only | gmail_only | gmail_then_cal | docs_only | gmail_then_docs | docs_then_cal | general
  │    Uses last user message + recent conversation context
  │
  ├─ Phase 2: Execute pipeline
  │    Single agent:  streamText() with agent's prompt + tools
  │    Chained (gmail_then_cal, gmail_then_docs, docs_then_cal):
  │      first agent runs headlessly via generateText(),
  │      output passed as context to final agent
  │
  └─ Response streamed to frontend (tool approvals via needsApproval)
```

### Key Files

| Path | Purpose |
|------|---------|
| `src/lib/agents/orchestrator.ts` | Main orchestrate() — classify, chain, stream |
| `src/lib/agents/classifier.ts` | Intent classification (gpt-4o-mini) |
| `src/lib/agents/registry.ts` | Route → agent pipeline mapping |
| `src/lib/agents/types.ts` | AgentRoute, AgentConfig, AgentContext |
| `src/lib/agents/utils.ts` | Shared helpers (getCurrentDateInfo) |
| `src/lib/agents/calendar/` | Calendar agent: tools (6), prompt, conflict-detection |
| `src/lib/agents/email/` | Email agent: tools (5), prompt |
| `src/lib/agents/docs/` | Docs agent: tools (6), prompt |
| `src/lib/google-auth.ts` | Shared OAuth2 (scopes, tokens, per-service checks) |
| `src/lib/google-calendar.ts` | Calendar API wrapper |
| `src/lib/google-gmail.ts` | Gmail API wrapper |
| `src/lib/google-docs.ts` | Google Docs + Drive API wrapper |
| `src/app/api/chat/route.ts` | Chat endpoint — delegates to orchestrator |
| `src/app/chat.tsx` | Frontend chat UI |
| `src/components/ai-elements/tool-approval.tsx` | Approval dialogs (calendar + email + docs) |

### Agent Design

Each agent implements `AgentConfig`: `getSystemPrompt(context)`, `getTools(context)`, optional `preProcess()`.

- **Calendar**: 6 tools (list, create, update, delete, search, conflictWarning). Pre-processes for scheduling conflict detection. Tools needing approval: create, update, delete, conflictWarning.
- **Email**: 5 tools (listEmails, readEmail, searchEmails, sendEmail, replyToEmail). Tools needing approval: sendEmail, replyToEmail.
- **Docs**: 6 tools (listDocs, readDoc, searchDocs, createDoc, appendToDoc, editDoc). Tools needing approval: createDoc, appendToDoc, editDoc. Uses Google Docs API for content and Google Drive API for listing/searching.
- **General**: No tools, conversational fallback.

Auth is per-service: `calendarConnected`, `gmailConnected`, and `docsConnected` check actual token scopes, so an old token without Docs scopes won't enable docs tools.

## References

- [AI SDK Docs](https://ai-sdk.dev/docs)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [Gmail API](https://developers.google.com/gmail/api)
- [Google Docs API](https://developers.google.com/docs/api)
- [Google Drive API](https://developers.google.com/drive/api)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
