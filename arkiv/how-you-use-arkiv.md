# How VoxMesh uses Arkiv

Arkiv is the agents' **shared coordination memory**, not a log. Agents find work, claim it and read each other's results from Arkiv entities during a workflow. Full schemas are in [schema.md](schema.md).

## Do the filters, owners and expiry fit the app?

| Entity | What we filter on, and why | Who can edit | Expiry, and why it fits |
|---|---|---|---|
| Task | `workflowId` + `status` + `capability`: a worker asks "what open work in this workflow can I do?" `claimedBy` and `taskType` drive the trace views. | Runtime signer only. A claim patches `status` and `claimedBy`. | **24 h.** A task is coordination state for one workflow; once it is done, it should disappear. |
| Message | `correlationId` / `taskId` / `workflowId`: rebuild the conversation for one task. `sender` / `receiver` / `messageType`: show who delegated to whom. | Runtime signer; never edited after creation. | **24 h**, the same as its task. |
| Execution (result) | `workflowId` / `taskId` / `agentId`: a dependent agent loads its upstream result; the trace shows it. | Runtime signer; never edited. | **7 days.** Results are the evidence, so they outlive the tasks. |
| Workflow | `workflowId` / `status` / `intent`: the history of completed, partial and failed runs. | Runtime signer; never edited. | **7 days.** |
| Agent | `agentId` / `status` / `primaryCapability`: capability discovery at delegation time. | Runtime signer; re-upserted on start (registration requires World ID). | **7 days**, refreshed on every start, so an agent that stops running drops out of discovery on its own. |
| Identity | `subject` / `provider`: proof that a human verified before registering agents. | Runtime signer; never edited. | **7 days**, matching attestation freshness. |

**Known gap:** all entities are owned by the single runtime signer, so the owner field shows *which runtime* acted, not *which agent*. Per-agent signers are the first post-Mumbai step (see [reach.md](reach.md)).

## Does each feature change something users see?

| Arkiv feature | What the user sees |
|---|---|
| **Query with filters** (`eq` on indexed attributes, `.ownedBy`) | A worker agent only starts after it **finds** its task on Arkiv, shown as `arkiv.read` "queried open … tasks: 1 found" in the live trace. The **Dashboard** task counts come from an Arkiv query. |
| **Entity reads by key** | The Security agent **loads the Research result from Arkiv** before reviewing, shown as "Loaded research result for dependency …" with the entity key. |
| **`executeBatch`** | One transaction hash for "Task … persisted to Arkiv" covering every task and delegation message in a workflow. |
| **Patches** | Task status moves open → claimed → running → completed on the **Execution Trace**, each step with its transaction. |
| **Owner and expiry metadata** (`$owner`, `$expiresAt`) | The **Arkiv Explorer** page lists all six entity kinds with key, owner, expiry block and approximate expiry time, plus the decoded payload. |
| **Cross-entity verification** | Execution Trace → **"Verify against coordination store"** re-reads the workflow's tasks, results and messages from Arkiv, not from server memory. |
| **Workspace + owner scoping** | The Explorer header says "Live query against Rabdi · workspace … · owner-scoped", and never shows other teams' entities. |

## Try it

```bash
npm run arkiv:query                     # latest workflow records
npm run arkiv:query -- task open        # open tasks right now
npm run arkiv:query -- execution        # agent results
```

The writer wallet is `0x5c553e27e588b9dE72A76d521b17610A97d45143`. Browse its transactions on the [Rabdi explorer](https://rabdi.explorer.arkiv.network/address/0x5c553e27e588b9dE72A76d521b17610A97d45143).
