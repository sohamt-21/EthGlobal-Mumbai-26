# VoxMesh — Implementation Plan (24h hackathon)

## Starting point (inspected)
- Vite 7 + React 19 + Tailwind 4 + shadcn (base-nova) scaffold with a **simulated** single-page demo (`src/App.tsx`, timers only, no backend).
- No backend, no integrations, no tests, no env config.
- Node 24, npm 11.

Decision: keep the existing frontend toolchain and UI primitives, replace the simulated demo with a real
client, and add a TypeScript Node backend in the same package (`server/`) with shared Zod contracts (`shared/`).

## Verified integration facts (from official docs / installed SDK sources, Nov 2026)
| Integration | What we use | Source |
|---|---|---|
| 0G Private Computer / Router | OpenAI-compatible `POST {base}/chat/completions`, `Authorization: Bearer`, mainnet `https://router-api.0g.ai/v1`, testnet `https://router-api-testnet.integratenetwork.work/v1`; every response carries `x_0g_trace { request_id, provider, billing }`; optional `verify_tee: true` → `tee_verified`; optional header `X-0G-Provider-Trust-Mode: private` | docs.0g.ai router docs, 0g.ai/pc |
| Arkiv | `@arkiv-network/sdk@1.0.1` + viem: `defineSchema`, `createWalletClient().createEntity / patchEntity / executeBatch`, `createPublicClient().select().from(schema).where(eq(...)).ownedBy().fetch()`, `getEntity`, `ExpirationTime`, Rabdi testnet chain (`rabdi({ accessKey })`) | SDK README + `src/` in node_modules |
| World ID | `@worldcoin/idkit` (React widget `IDKitRequestWidget`) + `@worldcoin/idkit/signing` `signRequest({ signingKeyHex, action })` for `rp_context`; backend forwards the proof unchanged to `POST https://developer.worldcoin.org/api/v4/verify/{rp_id}`; store nullifier to prevent replay | idkit / idkit-core README + dist |

## Phases
1. **Foundation** — shared Zod schemas, server config (zod-validated env), Express app, health + integration status, consistent API envelope, error middleware, rate limiting.
2. **Agent runtime** — `Agent` interface, Supervisor / Research / Security agents, allowlisted tool registry, message bus with correlation IDs, bounded DAG executor (sequential + parallel layers, retries, timeouts, max depth, max calls), runtime execution state + SSE.
3. **Integrations** — `InferenceAdapter` (0G live, labelled mock), `CoordinationStore` (Arkiv live, labelled in-memory dev store), `IdentityVerifier` (World ID live, labelled dev bypass, off by default).
4. **Frontend** — six pages: Dashboard, Agent Registry, Command (voice + text), Execution Trace, Arkiv Explorer, Identity & Trust. Live updates via SSE.
5. **E2E** — command → plan → Arkiv tasks → Research claims from Arkiv → 0G → result to Arkiv → Security reads research result *from Arkiv* → 0G → result → Supervisor aggregate → trace → TTS.
6. **Testing & delivery** — vitest unit/integration/e2e, typecheck, build, docs.

## Scope guardrails
- P0 first; ENS / Hedera x402 only if P0+P1 are stable (they are documented as not implemented otherwise).
- No fake chain transactions, no fake verification: every fallback is labelled `mock` / `memory` / `dev-bypass` in API payloads and the UI.
- Static analysis only: reports say so; we never claim an audit.

## Status
See README "Status / what is live" for the final state of every item above.
