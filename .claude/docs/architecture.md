# Architecture

## Request Flow

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

## Key Files

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

## Agent Design

Each agent implements `AgentConfig`: `getSystemPrompt(context)`, `getTools(context)`, optional `preProcess()`.

## References

- [AI SDK Docs](https://ai-sdk.dev/docs)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [Gmail API](https://developers.google.com/gmail/api)
- [Google Docs API](https://developers.google.com/docs/api)
- [Google Drive API](https://developers.google.com/drive/api)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
