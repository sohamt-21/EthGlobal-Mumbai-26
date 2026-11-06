# VoxMesh — Decentralised Multi-Agent Runtime

Voice-driven, identity-aware multi-agent runtime. A **Supervisor** plans with **0G** inference, delegates tasks
through **Arkiv** entities, and **Research** + **Security** agents discover, claim, execute and persist auditable
results. Privileged operations are gated by **World ID**.

> Every agent has an identity. Every task has a trace. Every delegation has context. Every execution has an auditable outcome.

- [ARCHITECTURE.md](ARCHITECTURE.md) — design, lifecycle, Arkiv schemas, security
- [docs/API.md](docs/API.md) — REST + SSE reference
- [docs/TESTING.md](docs/TESTING.md) — testing report
- [PLAN.md](PLAN.md) — implementation plan

## Status — what is live

| Component | State |
|---|---|
| Supervisor / Research / Security agents, DAG orchestrator (sequential, parallel, conditional skip, retries, timeouts, call budget, depth limit) | ✅ implemented + tested |
| Message bus (Supervisor–Worker topology, correlation IDs), allowlisted tools, task ownership | ✅ implemented + tested |
| **0G** inference adapter (`x_0g_trace` request IDs, provider, billing, TEE verification) | ✅ implemented against documented API · ⚠️ **not exercised live** (no API key here) |
| **Arkiv** coordination store (6 entity schemas, batch writes, owner-scoped queries, expiry) | ✅ implemented · ✅ live **reads** verified on Rabdi · ⚠️ live **writes** need a funded key |
| **World ID** IDKit v4 (server RP signing, proof forwarding, nonce replay protection, sessions, protected ops) | ✅ implemented + tested against a mocked portal · ⚠️ needs app/RP credentials for live use |
| Voice (Web Speech STT + TTS), text chat, conversation history | ✅ (STT needs Chrome/Edge/Safari; text always works) |
| Frontend: Dashboard, Agent Registry, Command, Execution Trace, Arkiv Explorer, Identity & Trust | ✅ |
| ENS | ⏸ names are labels only — no on-chain resolution |
| Hedera x402 | ⏸ not implemented (P2) |

Without credentials the app runs end-to-end on **clearly labelled** fallbacks: `DEV MOCK` inference (request IDs
prefixed `mock_`) and a `LOCAL STORE` (keys prefixed `local:`). Fallbacks are shown as such in every API payload
and in the UI; nothing is presented as a real 0G call, Arkiv transaction or World ID verification.

## Quick start

Requires Node ≥ 22.10.

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

- Web: http://localhost:5173 (Vite proxies `/api` → `http://localhost:8787`)
- API: http://localhost:8787 (`API_PORT`)

### Enabling the live integrations

| Integration | Set in `.env` | Get it |
|---|---|---|
| 0G | `ZG_API_KEY` (+ `ZG_BASE_URL` for testnet, `ZG_MODEL`) | https://pc.0g.ai/dashboard/api-keys |
| Arkiv | `ARKIV_PRIVATE_KEY` (funded with tGLM), `ARKIV_ACCESS_KEY` | key: `node --input-type=module -e "import{generatePrivateKey,privateKeyToAccount}from'viem/accounts';const k=generatePrivateKey();console.log(k,privateKeyToAccount(k).address)"` · faucet: https://hub.arkiv.network/faucet · access key: https://hub.arkiv.network/access-keys |
| World ID | `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION` | https://developer.world.org (create app + RP; `WORLD_ENVIRONMENT=staging` to use the simulator) |

Check connectivity:

```bash
npm run arkiv:check
```

```bash
npm run test:integration
```

`GET /api/integrations/status` (and the sidebar) show `LIVE` only when the real service is configured and reachable.

## Demo script (≈3 minutes)

1. **Runtime** page — show the three integrations and their modes; agents registered in the coordination store.
2. **Command** page — keep `MeshVault.sol` selected, press the mic and say (or just click **Run workflow**):
   > "Start a multi-agent workflow. Ask the research agent to analyse this smart contract and ask the security agent to review the findings. Return a combined report."
3. Watch the right rail: Supervisor plan (`research → security`), task entity keys appear, Research Agent claims → runs tools → 0G inference → persists; Security Agent claims, **loads the research result from Arkiv**, re-scans independently, runs inference; Supervisor aggregates. The report is spoken back.
4. **Execution Trace** — open the workflow: tasks with Arkiv task/result entity keys + tx hashes, 0G request IDs (provider, TEE, cost), agent messages. Click **Query** under *Verify against coordination store* to re-read the tasks/results from Arkiv.
5. **Arkiv Explorer** — browse `Tasks`, `Executions`, `Messages`, `Workflows`: attributes, owner, expiry block, decoded payload.
6. **Identity & Trust** — try *Register agent* on the Agent Registry without verifying (denied, logged), verify with World ID, retry (ownership bound to your nullifier-derived subject, attestation entity written).
7. Variations: "Explain what this contract does" (research only), "Is this a rug pull? Only a security review" (security only), "Run research and security review in parallel" (parallel layer), paste your own Solidity.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API (tsx watch) + web (Vite) |
| `npm test` | Unit, orchestrator, API and E2E tests (mocks) |
| `npm run test:integration` | Live 0G / Arkiv tests (skip without credentials) |
| `npm run typecheck` | Strict TS for frontend and server |
| `npm run build` | Typecheck + production frontend build |
| `npm run arkiv:check` | Arkiv connectivity / round-trip check |

## Bounty implementation notes

**0G** — All Supervisor and specialist reasoning goes through `ZeroGInferenceAdapter` (`server/adapters/inference/zerog.ts`) on the OpenAI-compatible router. Each call records `x_0g_trace.request_id`, provider address, billing and `tee_verified` (requests set `verify_tee: true`; optional private trust mode). Request IDs are attached to trace entries, agent results, Arkiv execution records and the workflow record, and shown in the Dashboard and Trace pages.

**Arkiv** — Arkiv is the coordination layer, not a log sink: the Supervisor creates task + delegation-message entities in one batch; workers *discover* tasks by querying `status=open, capability=…`, *claim* them by patching status/claimedBy, and dependent agents *read upstream results from Arkiv entities*. Six typed schemas (`server/adapters/store/arkiv.ts`) with indexed attributes, owner scoping, workspace isolation and per-kind expiry. The Explorer renders live query results with entity keys and expiry.

**World ID** — IDKit v4: server-side RP signature (`@worldcoin/idkit/signing`), `IDKitRequestWidget` on the client, backend forwards the proof unchanged to `/api/v4/verify/{rp_id}`, nonce issuance/replay/expiry checks, hashed nullifier subject, session permissions. Agent registration/ownership is always human-gated; workflows optionally (`WORKFLOW_REQUIRES_HUMAN=true`). A dev bypass exists only behind `WORLD_ID_DEV_BYPASS=true`, is disabled when World ID is configured, and is labelled `dev-bypass` everywhere.

## Limitations

- Contract analysis is static, text-based pattern matching + LLM review of supplied source. It is **not an audit**; reports say so. No on-chain fetching of verified source.
- Runtime execution state and identity sessions are in memory (lost on restart); task/result/workflow records persist on Arkiv (when live).
- Claims are exclusive within one runtime (single signer, serialized read-check-write). Multiple independent runtimes would need an on-chain lock or per-agent signers.
- Arkiv writes take a block (~2 s) each; a full live workflow adds ~15 s of chain latency.
- Voice input uses the browser Web Speech API (not available in Firefox); text input is always available.
- ENS names are display labels; Hedera x402 is not implemented.
