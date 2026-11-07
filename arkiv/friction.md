# Arkiv feedback

These notes come from building VoxMesh on `@arkiv-network/sdk` 1.0.1 against the Rabdi testnet. Each item says what we expected, what happened, how to reproduce it and what would help.

## 1. A concurrent write from the same signer fails with no useful error

- **Expected:** if two processes write with the same key at the same time, an error that names the cause, such as a nonce conflict or a replaced transaction.
- **Happened:** on startup the agent-registration batch failed with `Transaction failed: Execution error without revert data`. Nothing in the message pointed at a second process using the same signer.
- **Reproduce:** start two VoxMesh API processes with the same `ARKIV_PRIVATE_KEY` at the same moment (for example, two `npm run dev` sessions). Both upsert the six agent entities through `executeBatch` on boot, and one fails.
- **Would help:** surface the underlying RPC or nonce error. Better still, have the SDK manage nonces per account so concurrent `executeBatch` calls queue instead of colliding. We wrote our own serial write queue to avoid this ([`server/adapters/store/arkiv.ts`](../server/adapters/store/arkiv.ts)).

## 2. No conditional update, so claims are only exclusive within one runtime

- **Expected:** a way to patch an entity only if an attribute still has a value, for example "set `status = claimed` only if `status = open`". Agents claiming tasks need exactly that.
- **Happened:** a patch always applies. We do read-check-write inside one process's serial queue, so two independent runtimes could both claim the same task.
- **Would help:** a compare-and-set, or a patch precondition on indexed attributes. This is the missing primitive for the *agents: tasks, bids and claims* use case.

## 3. `str` attributes are capped at 128 bytes

- **Happened:** task descriptions, results and inference metadata do not fit, so each schema has a few indexed `str` columns plus a JSON `payload` stored as `bytes`. Nothing inside `payload` can be filtered on.
- **Would help:** a larger `str` limit for non-indexed attributes, or a documented recommended pattern for "small indexed columns plus a JSON blob" with a typed helper to encode and decode it.

## 4. Optional filters don't fit the schema-checked query builder

- **Happened:** our filters are optional (`status` only sometimes, `capability` only sometimes). The schema-typed builder made dynamic `and(...)` lists awkward. We fell back to raw `eq("arkiv.schema", "<name>")` plus a spread of conditions, and lost the type checking.
- **Would help:** builder support for optional conditions (for example, skip `undefined`), or an example of dynamic filters in the docs.

## 5. Results stop at 100, with no total count

- **Expected:** a way to know how many entities match.
- **Happened:** `.limit(500)` throws `limit 500 exceeds the node maximum of 100. Page through the results with an offset instead.` The error is clear. The result has no total, though, so the Explorer can only say "100 shown". Our message schema already has more than 100 live entities.
- **Would help:** a `count()` query, or a total in the result.

## 6. Expiry is in blocks, but users think in time

- **Happened:** `$expiresAt` is a block number. The Explorer turns it into an approximate time using the current block and the block duration, which needs an extra call for timing.
- **Would help:** return an approximate expiry timestamp alongside the block, or provide a helper in the SDK.

## 7. Shared testnet: isolation is up to the app

- **Happened:** queries match entities from every project on Rabdi. Every query therefore needs both `.ownedBy(signer)` and a `workspace` attribute we add ourselves, or a demo can read another team's `status = open` tasks.
- **Would help:** a recommended namespacing convention in the docs, or SDK support for a project-level namespace.

## What worked well

- `executeBatch` let one transaction carry every task in a workflow plus its delegation messages. That cut a 3-task delegation from 6 transactions to 1.
- `ExpirationTime.fromHours()` and `fromDays()` made per-kind lifetimes trivial. Coordination state disappears on its own after 24 hours.
- The public endpoint works without an access key for reads, so judges can run [`npm run arkiv:query`](../scripts/arkiv-query.ts) with no setup. The SDK's warning about rate limits is clear.
