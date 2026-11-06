# Testing report

Run: `npm test` (unit/API/E2E, mocks + in-memory store) · `npm run test:integration` (live 0G / Arkiv, skipped without credentials) · `npm run typecheck`.

## Results (2026-11-06)

| Suite | Tests | Result |
|---|---|---|
| `tests/unit/tools-planner.test.ts` — static scanner, tool allowlist, planner routing, Polymarket market-plan routing, wallet transfer parsing, plan validation | 16 | ✅ pass |
| `tests/unit/adapters.test.ts` — 0G response parsing/headers/retryability, store claim semantics, localhost-only MetaMask CDP config, World ID verify/replay/expiry/dev-bypass labelling | 11 | ✅ pass |
| `tests/orchestrator.test.ts` — sequential, parallel, selective routing, Polymarket research→LP simulation, wallet routing/fail-closed behavior, retries, failure recovery, planner fallback, call budget | 13 | ✅ pass |
| `tests/api.e2e.test.ts` — health/modes, agent discovery, validation envelope, protected registration, human-gated workflows, external worker ownership, research/security and Polymarket simulation E2E | 8 | ✅ pass |
| `tests/ensv2.test.ts` — hierarchy construction, duplicate validation, per-agent text keys, transfer permissions | 4 | ✅ pass |
| `tests/integration/live.test.ts` — real 0G call, real Arkiv create/query/claim, full live workflow | 3 | ⏭ skipped (no credentials in this environment) |

`tsc` strict typecheck: frontend (`tsconfig.app.json`) and server/tests (`tsconfig.server.json`) clean. `vite build` succeeds.

## Coverage of required scenarios

| Requirement | Test |
|---|---|
| Agent registration / discovery | `MemoryCoordinationStore › registers and discovers…`, `API › lists the registered agents…`, `protects agent registration…` |
| Task creation / claiming | `MemoryCoordinationStore › creates, queries, claims once…`, `API › external worker…` |
| Agent routing / Supervisor planning | `supervisor planning › *`, `orchestrator › only invokes the agents the request needs` |
| Wallet transfers | `wallet transfer parsing` validates precision/address/network; `orchestrator` verifies Sepolia routing, MetaMask configuration failure, and incomplete-prompt handling |
| Prediction-market LP demo | `orchestrator` and `API` tests verify public Gamma market parsing, persisted research dependency, capped simulated quotes, and no wallet/order side effects |
| Sequential execution | `orchestrator › runs research → security sequentially…` |
| Parallel execution | `orchestrator › runs independent tasks in parallel` |
| Failed agent recovery | `orchestrator › recovers from a failed agent…`, `retries transient inference failures` |
| Inference metadata capture | `ZeroGInferenceAdapter › captures x_0g_trace…`, E2E trace assertions |
| Store persistence + retrieval | Sequential test reads results back from store; E2E `/executions/:id/arkiv` |
| Identity verification | `IdentityService › *` (mocked World API) |
| API validation | `API › validates input with a consistent error envelope` |
| End-to-end research + security | `API › E2E: full research + security workflow…` |

## What these tests do **not** prove

Mocked tests prove adapter logic and runtime behaviour only. Live connectivity is proven **only** by
`npm run test:integration` with real credentials. In this build environment:

- **Arkiv:** live **reads** were verified against Rabdi (`npm run arkiv:check`: chain 7794095, block height, query shapes accepted by the node). Live **writes** were not exercised because no funded key was available.
- **0G:** no API key was available; the adapter was verified against the documented response format only.
- **World ID:** no app/RP credentials were available; verification was tested against a mocked Developer Portal.
