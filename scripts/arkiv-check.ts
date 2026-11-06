/**
 * Connectivity check for the Arkiv adapter: prints the signer, chain status and (if funded)
 * performs a real create → query → patch → read round-trip.
 *   npx tsx --env-file-if-exists=.env scripts/arkiv-check.ts
 */
import { ArkivCoordinationStore } from "../server/adapters/store/arkiv"
import { generatePrivateKey } from "viem/accounts"

const key = process.env.ARKIV_PRIVATE_KEY ?? generatePrivateKey()
const store = new ArkivCoordinationStore({
  privateKey: key,
  accessKey: process.env.ARKIV_ACCESS_KEY ?? "",
  workspace: process.env.ARKIV_WORKSPACE ?? "voxmesh-ethglobal-mumbai",
  taskTtlHours: 1,
  agentTtlDays: 1,
})
const status = await store.status()
console.log(JSON.stringify(status, null, 2))
if (!process.env.ARKIV_PRIVATE_KEY) {
  console.log("\nNo ARKIV_PRIVATE_KEY set — generated an ephemeral key for the read check only.")
  process.exit(0)
}
if (status.meta.balanceWei === "0") process.exit(0)
const now = new Date().toISOString()
const created = await store.createTasks(
  [{ id: `task_check_${Date.now()}`, workflowId: "wf_connectivity_check", type: "research", description: "connectivity check", requiredCapability: "contract_research", createdBy: "script", assignedAgent: null, claimedBy: null, status: "open", priority: 1, dependsOn: [], input: {}, resultEntityKey: null, createdAt: now, updatedAt: now, expiresAt: now }],
  [],
)
console.log("created", created)
const found = await store.queryTasks({ workflowId: "wf_connectivity_check", status: "open" })
console.log("query open →", found.map((t) => t.key))
const key0 = Object.values(created.taskKeys)[0]
console.log("claim", await store.claimTask(key0, "research", null))
console.log("read back", (await store.getTask(key0))?.data.status)
