# Arkiv schema

VoxMesh stores its agent coordination state on **Arkiv's Rabdi testnet** (chain id `7794095`) through `@arkiv-network/sdk`. Schemas are defined in [`server/adapters/store/arkiv.ts`](../server/adapters/store/arkiv.ts).

- **Owner (writer) wallet:** `0x5c553e27e588b9dE72A76d521b17610A97d45143`, the VoxMesh runtime signer.
- **Workspace:** every entity carries `workspace = "voxmesh-ethglobal-mumbai"`. Every read filters on it and on `.ownedBy(<signer>)`, so other projects' entities on the shared testnet are never mixed in.
- **Layout:** Arkiv `str` attributes are capped at 128 bytes. Each entity therefore has a few small **indexed** attributes to filter on, plus a `payload` **bytes** attribute holding the full JSON record.

## Entities

| Schema (`arkiv.schema`) | One per… | Indexed fields (what we filter on) | Owner / who edits | Expires |
|---|---|---|---|---|
| `voxmesh.agent.v1` | registered agent | `workspace`, `agentId`, `status`, `primaryCapability` (+ `ensName`, not indexed) | runtime signer; re-upserted on every start | `ARKIV_AGENT_TTL_DAYS` (default 7 days) |
| `voxmesh.task.v1` | delegated task | `workspace`, `taskId`, `workflowId`, `taskType`, `status`, `capability`, `claimedBy`, `priority` (`i32`) | runtime signer; patched on claim → running → completed / failed / cancelled | `ARKIV_TASK_TTL_HOURS` (default 24 h) |
| `voxmesh.message.v1` | agent message (`task.delegate`, `task.claimed`, `task.result`) | `workspace`, `messageId`, `correlationId`, `workflowId`, `taskId`, `sender`, `receiver`, `messageType` | runtime signer; never edited | same as tasks (24 h) |
| `voxmesh.execution.v1` | agent result | `workspace`, `executionId`, `workflowId`, `taskId`, `agentId`, `status` (+ `inferenceRequestId`) | runtime signer; never edited | 7 days |
| `voxmesh.workflow.v1` | finished workflow | `workspace`, `workflowId`, `status`, `intent` | runtime signer; never edited | 7 days |
| `voxmesh.identity.v1` | World ID verification | `workspace`, `subject` (SHA-256 of action + nullifier), `provider` | runtime signer; never edited | 7 days |

## Queries the app runs

| Query | Used for |
|---|---|
| `workspace = W && arkiv.schema = "voxmesh.task.v1" && workflowId = X && status = "open" && capability = C` | A worker agent **discovers** open tasks it can do |
| `… voxmesh.task.v1 && workflowId = X` → task → `resultEntityKey` → `voxmesh.execution.v1` | A dependent agent **reads the upstream result** before running (for example, Security reads Research's result) |
| `… voxmesh.agent.v1` | Agent registry and **capability discovery** when the Supervisor delegates |
| `… arkiv.schema = <kind>` (all six kinds) | **Arkiv Explorer** page in the UI |
| `… workflowId = X` across task, execution and message | **Execution Trace → "Verify against coordination store"** |

## Writes

Each workflow writes about 7 transactions. All writes go through one serial queue, so the single signer never races its own nonce, and batches use `executeBatch`:

1. **Delegate:** every task entity plus its `task.delegate` message entity in **one batch transaction**.
2. **Claim:** patch the task (`status = claimed`, `claimedBy`) and create a `task.claimed` message in one batch.
3. **Complete:** create the execution entity and a `task.result` message, then patch the task with `resultEntityKey`.
4. **Record:** one workflow entity holding the task keys, 0G inference request IDs and the risk score.

## What a payload contains

- **Task:** id, type, description, capability, assigned and claiming agent, dependencies and the task input. For contract tasks the input includes the Solidity source being analysed.
- **Execution:** the agent's structured result, 0G inference metadata (request ID, provider, TEE flag, cost), duration and attempts.
- **Workflow:** the command (first 500 characters), status, intent, task IDs and keys, risk, and inference request IDs.
- **Identity:** the hashed subject, provider, verification time, environment and granted permissions. No raw nullifier.

## Live data (block 318,650 · 7 Nov 2026)

Unexpired entities owned by the signer in this workspace: **6 agents, 71 tasks, 62 executions, 100+ messages, 53 workflows and 4 identity attestations.** To reproduce:

```bash
npm run arkiv:query            # latest workflow records
npm run arkiv:query -- task    # tasks (also: agent, execution, message, identity)
```
