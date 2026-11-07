# VoxMesh API

Base: `http://localhost:8787` (proxied as `/api` by Vite in development).

Every JSON response uses one envelope:

```json
{ "ok": true, "data": … }
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] } }
```

Auth: `Authorization: Bearer <session token>` (from World ID verification) and/or `x-agent-key: <AGENT_API_KEY>` for worker agents.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Liveness + active adapter modes |
| GET | `/api/integrations/status[?refresh=1]` | — | 0G / Arkiv / World ID / ENSv2 / Hedera status with `mode` = `live` \| `mock` \| `memory` \| `dev-bypass` \| `disabled` |
| GET | `/api/runtime/stats` | — | Agents, active/completed/failed tasks, inference count |
| GET | `/api/inference/recent` | — | Recent inference metadata (request IDs, provider, latency, cost, TEE) |
| GET | `/api/samples` | — | Built-in sample contracts |
| GET | `/api/agents` | — | Registered agents with registry entity keys, status, activity |
| GET | `/api/agents/:id` | — | One agent |
| GET | `/api/agents/:id/trust` | — | AgentRank-style report with score, decision, four trust axes, evidence, and risk flags |
| POST | `/api/agents/register` | **verified human** | `{ id, ensName?, endpoint? }` — bind runtime ownership to the caller; metadata is written to the store. ENSv2 names are separately created and verified on-chain by the Agents page wallet flow. |
| GET | `/api/tasks?workflowId&status&capability&limit` | — | Query task entities from the coordination store |
| GET | `/api/tasks/:key` | — | Read one task entity |
| POST | `/api/tasks` | agent key or human | `{ type, description, requiredCapability, priority?, input?, workflowId? }` → creates an open task entity |
| POST | `/api/tasks/:key/claim` | agent key or human | `{ agentId }` — trust- and capability-checked, exclusive (409 if not open); returns the trust report |
| POST | `/api/tasks/:key/complete` | agent key or human | `{ agentId, status, output, inferenceRequestId?, durationMs? }` — only the claiming agent |
| POST | `/api/orchestrator/execute[?wait=true]` | optional / human if `WORKFLOW_REQUIRES_HUMAN` | `{ command, sampleContractId? \| contractSource?, channel: "voice"\|"text" }` → 202 with workflow (or 201 completed with `wait=true`) |
| GET | `/api/executions` | — | Workflows (most recent first) |
| GET | `/api/executions/:id` | — | Workflow: plan, tasks (+entity keys), results, messages, trace, inference, final report |
| GET | `/api/executions/:id/trace` | — | Trace entries only |
| GET | `/api/executions/:id/arkiv` | — | Tasks, execution records and messages for the workflow **as queried from the store** |
| GET | `/api/events[?workflowId=]` | — | Server-Sent Events: `trace`, `workflow`, `message` |
| GET | `/api/identity/config` | — | Public IDKit config (app id, rp id, action, environment, mode) |
| POST | `/api/identity/rp-context` | — | Server-signed `rp_context` for IDKit |
| POST | `/api/identity/verify` | — | IDKit result (unchanged) → `{ token, identity }` |
| POST | `/api/identity/dev-bypass` | — | Only when `WORLD_ID_DEV_BYPASS=true` and World ID is not configured; labelled `dev-bypass` |
| GET | `/api/identity/status` | bearer | Current identity (401 if token expired) |
| POST | `/api/identity/logout` | bearer | Revoke session |
| GET | `/api/identity/events` | — | Identity event log (verify success/failure, denials, expiries) |
| GET | `/api/arkiv/explore?kind=&limit=` | — | Raw entities (`agent`, `task`, `execution`, `message`, `workflow`, `identity`) with attributes, owner, expiry block + approx time, decoded payload |

Error codes include `VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`,
`INFERENCE_*`, `ARKIV_*`, `WORLD_ID_*`, `INVALID_PROOF`, `INVALID_NONCE`, `PROOF_EXPIRED`, `VERIFICATION_REJECTED`.

### Agent trust reports

The trust report is currently runtime-scoped. It scores local registry presence, observed task outcomes, ENS linkage, and World ID owner verification. It does not claim ERC-8004 registration, reputation feedback, BigQuery Sybil analysis, AgentKit/AgentBook backing, or x402 support: those fields remain unknown until their data providers are integrated. Owner World ID is reported only as a weaker accountability signal. A `review_before_call` result is included with local workflow delegations and task claims; `do_not_call` agents are rejected. x402 transactability is separate from trust and is not inferred from the score.

### Example

```bash
curl -s -X POST 'http://localhost:8787/api/orchestrator/execute?wait=true' \
  -H 'content-type: application/json' \
  -d '{"command":"Ask the research agent to analyse this smart contract and the security agent to review the findings.","sampleContractId":"mesh-vault"}'
```
