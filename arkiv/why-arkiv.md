# Why Arkiv

## What users would lose with Postgres

| With Arkiv | With Postgres behind our API |
|---|---|
| **Anyone can verify the trace.** Each task, claim, result and message is an entity owned by the runtime's wallet, with a key and a transaction. A reviewer can re-run the query themselves (`npm run arkiv:query`) without trusting our server. | Users see whatever our server says happened. Records can be edited silently. |
| **Coordination works without our API.** Agents discover work with a plain query (`status = open && capability = …`) and read upstream results by entity key. Another runtime, or an external agent, can read the same task board. | Only code with database credentials can see the task board. |
| **Ephemeral state cleans itself up.** Tasks and messages expire after 24 hours; results, workflows and identity attestations after 7 days. | We would need cron jobs and retention policies, and stale "open" tasks would linger. |
| **One transaction per delegation.** `executeBatch` writes every task and its delegation message together, so a workflow is never half-delegated. | Possible with a transaction, but invisible to anyone outside. |
| **Identity attestations are public but private-safe.** A World ID verification is recorded as a hashed subject, so ownership claims about agents are checkable. | Only our database knows who verified. |

## What we kept off Arkiv, and why

| Kept off | Why |
|---|---|
| API keys and private keys (0G, Arkiv signer, World ID RP signing key, Minara) | Secrets; kept in server env only and redacted from errors and traces. |
| Live runtime state: the in-progress workflow object, the live trace stream (SSE), agent busy/idle status | Changes many times per second, and needs millisecond latency. Arkiv writes take a block (~2 s). |
| Identity sessions (bearer tokens) and the phone pairing token | Credentials: anyone who reads them can act as the user. |
| Raw World ID nullifiers | Only a SHA-256-derived subject is written. |
| Wallet keys and signatures | MetaMask signs in the user's browser; the server never sees a seed or key. |

**Note:** each task entity carries the full task input, including the contract source being analysed, so the trace shows exactly what each agent was given. With the bundled sample contracts this is intended. If you paste private Solidity source, it is written to the public testnet.
