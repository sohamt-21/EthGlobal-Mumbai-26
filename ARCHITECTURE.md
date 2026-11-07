# VoxMesh — Architecture

> Every agent has an identity. Every task has a trace. Every delegation has context. Every execution has an auditable outcome.

## Overview

```
 Browser (React 19 · Vite · Tailwind · shadcn)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ Voice (Web Speech STT/TTS) ─┐                                             │
 │ Text composer ──────────────┼─► POST /api/orchestrator/execute            │
 │ Dashboard · Registry · Trace · Arkiv Explorer · Identity ◄── SSE /api/events
 │ World ID IDKit widget ──► /api/identity/rp-context → /api/identity/verify │
 └───────────────────────────────────────────────────────────────────────────┘
                                   │ REST + SSE
 Node 22+ API (Express 5, TypeScript strict, Zod)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  Orchestrator (bounded DAG executor)                                       │
 │    ├─ SupervisorAgent  plan() ── LLM proposes ─► validatePlan() decides    │
 │    │                   execute(aggregate)                                  │
 │    ├─ ResearchAgent    Solidity tools + public Polymarket Gamma reads      │
 │    ├─ SecurityAgent    tools: solidity.static_scan (independent re-check)  │
 │    ├─ LiquidityAgent   deterministic quotes; simulation only                │
 │    ├─ MetaMaskAgent    Playwright → visible Chrome → user-approved send    │
 │    └─ MinaraAgent      API-key research / unsigned suggestions              │
 │    └─ MinaraAgent      API-key research/suggestions; no execution          │
 │  AgentMessageBus (Supervisor–Worker topology, correlation ids)             │
 │  AgentRegistry (metadata in store, runtime status in memory)               │
 │  ToolRegistry (per-agent allowlist, deterministic tools only)              │
 │  IdentityService (RP signing, proof forwarding, sessions, permissions)     │
 │                                                                            │
 │  Adapters (isolated):                                                      │
 │    InferenceAdapter ── ZeroGInferenceAdapter │ MockInferenceAdapter (DEV)  │
 │    CoordinationStore ─ ArkivCoordinationStore │ MemoryCoordinationStore (DEV)
 └───────────────────────────────────────────────────────────────────────────┘
          │                         │                              │
   0G Router (OpenAI-compatible)   Arkiv Rabdi testnet          World Developer Portal
   x_0g_trace.request_id           entities + queries           /api/v4/verify/{rp_id}
```

## Repository layout

| Path | Purpose |
|---|---|
| `shared/schemas.ts` | Zod schemas + types shared by server and client (Agent, Task, AgentMessage, ExecutionTrace, Identity, Workflow, …) |
| `server/config.ts` | Zod-validated environment |
| `server/adapters/inference/` | `InferenceAdapter`, 0G implementation, labelled mock |
| `server/adapters/store/` | `CoordinationStore`, Arkiv implementation + schemas, labelled in-memory store |
| `server/adapters/identity/` | World ID IDKit v4 verification, sessions, permissions |
| `server/agents/` | Supervisor, Research, Security agents + deterministic heuristics (mock/fallback) |
| `server/runtime/` | Agent interface, orchestrator, planner validation, message bus, registry, DI container |
| `server/tools/` | Allowlisted static-analysis tools and sample contracts |
| `server/api/` | Express routes, SSE, rate limiting, error envelope |
| `src/` | Frontend (pages, components, API client, SSE runtime context, speech hook) |
| `tests/` | Unit, orchestrator, API + E2E tests; `tests/integration/` live tests |

## Agent contract

```ts
interface Agent {
   id: AgentId; name: string; description: string; capabilities: Capability[]
  execute(task: Task, context: AgentContext): Promise<AgentOutput>
}
```

The orchestrator wraps every `execute` call and produces an `AgentResult`:
`requestId, taskId, agentId, status, result (structured), inference[] (0G metadata), durationMs, attempts, error`.

`AgentContext` gives the agent its inference adapter, its allowlisted tools, the coordination store, its
dependency outputs **as read back from the store**, an abort signal, and trace hooks. Agents cannot delegate
or message each other; only the Supervisor delegates.

## Workflow lifecycle

1. **Intake** — command (voice transcript or text) + contract source (sample, pasted, or inline in the command).
2. **Plan** — Supervisor calls 0G for a JSON plan → Zod parse → `validatePlan()` (capabilities must be offered by
   agents discovered from the store, capability↔type match, no delegated aggregation, deps reference earlier steps,
   ≤ call budget, source required for contract analysis). Explicit Sepolia transfers and Polymarket simulations use
   deterministic plans; market simulation does not require contract source.
3. **Delegate** — for each step: discover an agent by capability (registry read from the store), build a `Task`,
   and create all task entities + `task.delegate` message entities in **one Arkiv batch transaction**.
4. **Execute DAG** — `executionLayers()` groups steps; steps in a layer run in parallel (`Promise.all`).
   For each task the worker:
   - **queries** the store for open tasks with its capability in this workflow (`arkiv.read`),
   - **claims** it (status `open → claimed`, `claimedBy`) — read-check-write inside the signer's serial queue; a
     second claim gets `409 CONFLICT`,
   - **loads dependency results** by reading the dependency task entity → `resultEntityKey` → execution entity,
   - runs with timeout + retry on transient errors, within the per-workflow call budget and delegation depth,
   - **persists** an execution record entity + `task.result` message (one batch tx), then patches the task to
     `completed`/`failed` with the result key.
   Dependents of failed tasks are marked `cancelled` (`task.skipped`).
5. **Aggregate** — Supervisor 0G call → `FinalReport`; risk level/score are overwritten from the Security Agent's
   validated output and the static-analysis disclaimer is mandatory.
6. **Record** — workflow summary entity (task keys, inference request IDs, risk) written to the store.
7. **Respond** — SSE pushes trace + workflow snapshots; the UI renders the report and speaks `spokenSummary`.

Wallet transfers use one `wallet_transfer` task and skip analysis aggregation. In preferred CDP mode, the MetaMask
agent attaches to a user-started local Chrome session that already has MetaMask installed, opens a temporary transfer
tab, verifies the active Sepolia chain, and requests `eth_sendTransaction` through the injected provider. It closes
only its tab and leaves Chrome/profile state intact. The CDP endpoint is restricted to localhost. A Playwright-managed
Chromium profile with an unpacked extension remains available as fallback. The agent may accept the Connect/review-
permissions prompt only for that exact localhost origin while `eth_requestAccounts` is pending; it never enters wallet
passwords. The user must approve network changes and the final transaction in MetaMask. Wallet tasks have no automatic
retries, and a returned hash records submission only, not on-chain confirmation. The server never receives a seed phrase or signing key.

Prediction-market prompts create dependent `market_research → liquidity_simulation` tasks and skip LLM aggregation.
The Research Agent queries Polymarket's public Gamma API and persists an open market snapshot; the Liquidity Simulation
Agent consumes that stored result and computes fixed-cap two-sided quotes. It has no order-placement adapter, no
wallet access, and always returns `simulationOnly: true`. Sepolia test transfers are separate and never interpreted
as Polymarket collateral.

Explicit `Minara:` commands call one documented Minara API-key endpoint per workflow. The API key is server-side and
requests consume Minara account credits; the agent does not retry paid calls. Prediction and DeFi responses are
analysis only. Swap-intent and perpetual responses are suggestions only and are never passed to MetaMask or submitted.

Prediction-market demo prompts use a deterministic two-step plan: the Research Agent reads a matching open market
from Polymarket's public Gamma search API; the Liquidity Simulation Agent consumes the persisted research result and
calculates capped two-sided quotes. It never calls an order endpoint. The workflow reports the source URL, snapshot
prices, quote caps and risks without an LLM-generated probability. Sepolia test transfers are separate and are not
Polymarket collateral. The 8004scan agents supplied for this demo had no active callable service, so no external
trading agent is invoked.

Statuses: workflow `planning → running → completed | partial | failed`; task `open → claimed → running → completed | failed | cancelled`.

## State separation

| State | Where | Lifetime |
|---|---|---|
| Runtime execution state (workflow object, trace, agent busy/idle) | Orchestrator memory | process |
| Decentralised task state (tasks, results, messages, workflow records) | Arkiv entities | `ARKIV_TASK_TTL_HOURS` / 7 days |
| Persistent agent metadata (registrations, ownership, ENS name mirror) | Arkiv entities | `ARKIV_AGENT_TTL_DAYS` |
| Agent names, resolver records, and delegated record roles | ENSv2 Permissioned Registries + Permissioned Resolver | chosen name expiry / chain state |
| Conversation history | Workflows (command + final report) | process; summaries on Arkiv |
| Identity sessions | IdentityService memory (opaque bearer tokens) | `IDENTITY_SESSION_TTL_MINUTES` |
| Identity attestations | Arkiv `voxmesh.identity.v1` (hashed subject only) | 7 days |

## ENSv2 agent namespace

ENS names are created from the Agent Registry page using the user's injected wallet; no server-held signing key is used. The connected account must own an active ENSv2 `.eth` parent on Ethereum Mainnet or Sepolia, or hold the ENSv2 registry role required to attach/register subnames. The integration creates and links UserRegistry proxies as needed, then registers:

```text
<parent>.eth
└── voxmesh.<parent>.eth
   └── supervisor.voxmesh.<parent>.eth
      ├── research.supervisor.voxmesh.<parent>.eth
      └── security.supervisor.voxmesh.<parent>.eth
```

Each agent gets its own ENS registry entry and text-record bundle. The account's Permissioned Resolver is deployed through the official Verifiable Factory; endpoint editor rights are delegated with `grantSetterRoles` to the agent-specific text key. This is key-scoped resolver permissioning, not name-scoped permissioning. Names default to one-year expiry and non-transferability; both can be selected at creation. ENSv2 remains the source of truth; the verified agent registry may mirror names to Arkiv.

## Arkiv entity schemas

Arkiv `str` attributes are limited to 128 bytes, so each entity has small **indexed** columns for querying and a
`payload` **bytes** column with the full JSON record. Every entity carries `workspace` (deployment isolation on
the shared testnet) and the SDK's `arkiv.schema` tag; every query is additionally scoped with `.ownedBy(signer)`.

| Schema | Indexed columns | Expiry |
|---|---|---|
| `voxmesh.agent.v1` | workspace, agentId, status, primaryCapability | 7 days (configurable) |
| `voxmesh.task.v1` | workspace, taskId, workflowId, taskType, status, capability, claimedBy, priority (i32) | 24 h (configurable) |
| `voxmesh.execution.v1` | workspace, executionId, workflowId, taskId, agentId, status | 7 days |
| `voxmesh.message.v1` | workspace, messageId, correlationId, workflowId, taskId, sender, receiver, messageType | task TTL |
| `voxmesh.workflow.v1` | workspace, workflowId, status, intent | 7 days |
| `voxmesh.identity.v1` | workspace, subject, provider | 7 days |

Writes use `executeBatch` (creates + patches in one transaction) through a single serial queue so the signer
never races its own nonce. A full sequential workflow costs ~7 transactions.

## 0G inference

`POST {ZG_BASE_URL}/chat/completions` with `Authorization: Bearer`, `verify_tee: true` (configurable),
`chat_template_kwargs.enable_thinking=false` for GLM, and optional `X-0G-Provider-Trust-Mode: private`.
The adapter captures `x_0g_trace.request_id`, `provider`, `billing`, `tee_verified`, usage and latency into
`InferenceMetadata`, which is attached to the agent result, the trace entry, the execution record entity and the
workflow record. A response without `x_0g_trace.request_id` is rejected — IDs are never fabricated.

## World ID

1. Client asks the server for `rp_context` → server `signRequest({ signingKeyHex, action })` (key never leaves the server) and remembers the nonce.
2. Client opens `IDKitRequestWidget` with `app_id`, `action`, `rp_context`, preset `deviceLegacy`.
3. `handleVerify` posts the IDKit result to `/api/identity/verify`; server checks nonce issued/unused/unexpired and action, then forwards the payload **unchanged** to `POST {WORLD_VERIFY_BASE_URL}/{rp_id}`.
4. On `success: true` the server opens a session (opaque 256-bit token), subject = `sha256(action:nullifier)`, writes an identity attestation entity, and grants `workflow:execute, agent:register, agent:delegate, task:write`.
5. Failures (`INVALID_PROOF`, `INVALID_NONCE`, `PROOF_EXPIRED`, `VERIFICATION_REJECTED`, unreachable) are surfaced and logged as identity events.

**Privileged operations:** agent registration/ownership (always), workflow execution (when `WORKFLOW_REQUIRES_HUMAN=true`), and task writes via API (verified human or agent key).

## Security controls

- Secrets (0G key, Arkiv private key, World RP signing key, agent key) are server-side env only; `redact()` scrubs keys from errors/traces.
- Zod validation of every request body/query and of every LLM output before use.
- The LLM only proposes plans/reports; deterministic code validates plans, chooses tools, enforces budgets, and recomputes risk.
- Security findings are cross-checked against an independent deterministic scan (`corroborated` flag).
- Tool allowlist per agent; no LLM-generated code is executed.
- Supervisor–Worker message topology enforced by the bus.
- Task ownership: only the claiming agent may complete a task; claims are exclusive.
- Rate limits per IP and route; request timeouts on all external calls; bounded retries; per-workflow agent-call budget and delegation depth.
- Contract source and model output never include private keys; the Arkiv signer key is never passed to agents.
