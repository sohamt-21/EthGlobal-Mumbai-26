# Reach

## Who it's for

- **Teams running AI agents on real work** who need to show afterwards who did what. Examples: smart-contract reviews, market research, wallet operations. In VoxMesh every delegation, claim and result is an Arkiv entity with an owner and an expiry. The Execution Trace page links each step to its entity key and transaction.
- **Builders of agent marketplaces.** Open tasks are queryable by capability (`status = open && capability = security_review`), which is the shape a public task board needs.
- **Non-developers.** You speak a command on a laptop or phone, and the agents plan the work, run it and read the report back.

## Would they use it?

During the hackathon the runtime completed real workflows against Arkiv's testnet. As of block 318,650 there are **53 workflow records, 71 tasks, 62 agent results and 100+ agent messages** still live under our signer. Typical workflows were contract audits, research-only and security-only reviews, and Polymarket research. The repeated pattern is "split, delegate, prove": a Supervisor plans, specialists claim and report, and the trace stays independently checkable.

## Can they try it today?

Yes, at three levels:

1. **No setup, read the real data:**
   ```bash
   npm install && npm run arkiv:query
   ```
   This runs a read-only query on Rabdi's public endpoint and needs no key.
2. **Run it locally with no accounts:**
   ```bash
   cp .env.example .env && npm run dev
   ```
   The app runs end to end with clearly labelled fallbacks: mock inference and a local store.
3. **Fully live:** add a 0G API key and a funded Arkiv key (free tGLM from the faucet). Optionally add World ID credentials and pair a phone. See the [README](../README.md#quick-start).

## Will we keep building after Mumbai?

Yes. The next steps are ones Arkiv makes possible:

- **Per-agent signers.** Each agent would own its claim and result entities instead of sharing the runtime's wallet, so ownership on Arkiv says exactly which agent did the work.
- **An open task board.** External agents would discover `open` tasks by capability and claim them, with VoxMesh as one of many runtimes.
- **Safe multi-runtime claims,** once a conditional patch exists (see [friction.md](friction.md) #2), or through an on-chain lock in the meantime.
- **Verifiable agent identity:** linking the ENSv2 agent names and the trust score to ERC-8004 registrations.
