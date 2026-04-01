# CLAUDE.md

## Overview

Zero Assist is a multi-agent AI assistant with Google Calendar, Gmail, and Google Docs integration. It uses an orchestrator/router pattern: user messages are classified by intent, then routed to the appropriate agent (or agent chain) for execution.

## Development

```bash
pnpm dev          # Dev server (Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
npx tsc --noEmit  # Type check
```

## Detailed Docs

Read these on demand when the task requires it:

- [Setup & Auth](.claude/docs/setup-auth.md) — Google Cloud config, env vars, OAuth flow. Use when working on auth, tokens, or onboarding.
- [Architecture](.claude/docs/architecture.md) — Orchestrator flow, key files table, agent design patterns, references. Use when adding/modifying agents or routing.
- [Agent Reference](.claude/docs/agent-reference.md) — Per-agent tools, approval rules, API usage. Use when working on a specific agent.
- [Usage Examples](.claude/docs/usage-examples.md) — Sample queries per agent and cross-agent chains. Use when testing or writing classifier prompts.
