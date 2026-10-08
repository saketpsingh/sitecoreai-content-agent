# CLAUDE.md

SitecoreAI Content Transfer Agent — AI-powered content migration tool for Sitecore XM Cloud (Next.js 14 + LangGraph + MCP).

## Architecture

```
src/
  agent/                   # LangGraph agent (state machine: callModel → shouldContinue → processTools)
  app/                     # Next.js App Router
    api/                   # 11 API route handlers (admin, content, transfer, traces)
    page.tsx               # Main UI — single-page app with sidebar, 4 tabs
  lib/                     # Core libraries
    tools/                 # Agent tool implementations (analyze, export, import, validate)
    agent.ts               # TransferAgent class (LLM loop via Portkey Gateway)
    human-gate.ts          # Human approval gate with audit logging
    memory.ts              # Tier 2 memory (session + persistent JSON file)
    observability.ts       # Trace events, Portkey export
    sitecore-api.ts        # OAuth tokens (cloud + local), fetchWithRetry
    sitecore-client.ts     # SitecoreClient (getItem, getChildren, exportItems, importItems)
  mcp/                     # MCP server — 7 tools exposed via stdio transport
  evaluation/              # LLM evaluation framework (metrics, test cases, runner)
  types/                   # TypeScript type definitions
tests/                     # Vitest test suite (46 tests across 3 files)
data/                      # Test fixtures (sample items, failure scenarios)
.agent-memory/             # Persistent agent memory (JSON file store)
```

## Commands

```bash
npm run dev                # Next.js dev server (localhost:3000)
npm run build              # Production build
npm run start              # Start production server
npm run lint               # ESLint (zero errors required)
npm run test               # Vitest test suite
npm run test:ui            # Vitest with browser UI
npm run demo               # Run agent demo script (src/demo.ts)
npm run mcp:server         # Start MCP server standalone
npm run eval               # Run LLM evaluation framework
npm run eval:report        # Generate evaluation report
```

## Core Rules

- **Minimal footprint** — Only change files the task requires. No drive-by refactors. Every extra file is a potential regression.
- **No `any` types** — Use proper TypeScript types everywhere. No exceptions.
- **Zod validation** — All API inputs/outputs must use Zod schemas. No unvalidated external data.
- **Human gate is sacred** — Never bypass or weaken the human approval gate for production transfers. It exists for safety.
- **MCP tools match agent tools** — The MCP server and agent framework expose the same transfer workflow. Keep them in sync.
- **OAuth token caching** — Cloud and local environments use different OAuth flows. Never hardcode tokens; use the caching layer in `sitecore-api.ts`.
- **fetchWithRetry for external calls** — All Sitecore API calls must use retry with exponential backoff for transient errors (502, 503, 504).
- **Agent iteration cap** — The agent loop is capped at 10 iterations with escalation after 3 failures. Do not raise these limits without discussion.
- **Prove it works** — lint + build + tests. All three, every time.

## Key Patterns

- **Transfer workflow (cloud-to-cloud)**: Initiate → Poll → Relay Chunks → Consume → Verify. Five steps, no shortcuts.
- **Local Sync (cloud-to-local)**: Direct Item Service API transfer. Does NOT preserve item IDs.
- **Environment configs**: DEV, QA, PROD (cloud via `auth.sitecorecloud.io`), LOCAL (Docker via Identity Server). Configured in `.env.local`.
- **LLM integration**: Portkey Gateway → AWS Bedrock → Claude. Model config in env vars.
- **Memory**: Session state resets per transfer; persistent memory lives in `.agent-memory/transfer-memory.json`.

## Workflow

- For 3+ step tasks: write plan to `tasks/todo.md`, get confirmation before implementing.
- Think through the minimal set of files that need to change before touching anything.
- Use subagents for research and exploration — one focused task per subagent.
- After any correction: log the pattern in `tasks/lessons.md`.
- Review `tasks/lessons.md` at session start.
- If something goes sideways: stop, re-plan, check in — don't push through.

## Environment Setup

Requires `.env.local` with:
- Portkey Gateway credentials (`PORTKEY_GATEWAY_URL`, `PORTKEY_API_KEY`)
- Sitecore environment configs (URL + Client ID + Secret for DEV/QA/PROD)
- Local Docker credentials (URL + Identity Server + username/password)
- `NODE_TLS_REJECT_UNAUTHORIZED=0` for local self-signed certs

## Before Finishing Any Task

Ask yourself:
- Did I modify files outside the direct scope?
- Did I refactor something "while I was in there"?
- Did I add imports, dependencies, or config changes that weren't strictly needed?
- Did I weaken any safety gates (human approval, iteration caps, retry logic)?

If yes to any — revert the extras.
