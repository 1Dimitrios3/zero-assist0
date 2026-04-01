# Zero Assist

AI assistant with Google Calendar, Gmail, and Docs integration. Next.js (App Router) + Vercel AI SDK + Google APIs. TypeScript throughout.

## Commands

- `pnpm dev` — start dev server (Next.js + Turbopack)
- `pnpm build` — production build
- `pnpm lint` — run eslint

## Architecture

User message → `POST /api/chat` → `orchestrate()` in `src/lib/agents/orchestrator.ts`
1. `classifyIntent()` → picks route (see `registry.ts` for current routes)
2. Single agent: `streamText()`. Chained: first agent runs headless via `generateText()`, output feeds into streaming agent.
3. Response streamed to frontend; write tools require user approval via `needsApproval`.

## Key conventions

- Agents implement `AgentConfig` (`getSystemPrompt`, `getTools`, optional `preProcess`) in `src/lib/agents/{calendar,email,docs}/`
- Google API wrappers live in `src/lib/google-{calendar,gmail,docs}.ts`
- OAuth: `src/lib/google-auth.ts` — per-service scope checks (`calendarConnected`, `gmailConnected`, `docsConnected`)
- Classifier + registry + utils in `src/lib/agents/`
- Tool approval UI in `src/components/ai-elements/tool-approval.tsx`

## Deep-dive docs

- `.claude/docs/architecture.md` — request flow, key files, agent design
- `.claude/docs/agent-reference.md` — per-agent tools, approval requirements
- `.claude/docs/setup-auth.md` — Google Cloud setup, env vars, OAuth flow