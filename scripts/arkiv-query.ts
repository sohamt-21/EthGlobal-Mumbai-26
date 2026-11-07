/**
 * Read-only query judges can run against Arkiv's Rabdi testnet: no key or .env needed.
 *   npm run arkiv:query                     # latest VoxMesh workflow records
 *   npm run arkiv:query -- task open        # open tasks (any entity kind + optional status)
 */
import { createPublicClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, eq } from "@arkiv-network/sdk/query"
import { hexToString, http } from "viem"

const OWNER = "0x5c553e27e588b9dE72A76d521b17610A97d45143" // VoxMesh runtime signer
const WORKSPACE = "voxmesh-ethglobal-mumbai"
const kind = process.argv[2] ?? "workflow" // agent | task | execution | message | workflow | identity
const status = process.argv[3]

const client = createPublicClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }), transport: http() })
const conditions = [eq("workspace", WORKSPACE), eq("arkiv.schema", `voxmesh.${kind}.v1`), ...(status ? [eq("status", status)] : [])]
const res = await client
  .select({ $key: true, $owner: true, $expiresAt: true, $attributes: true, payload: true })
  .where(and(...conditions))
  .ownedBy(OWNER)
  .limit(10)
  .fetch()

console.log(`voxmesh.${kind}.v1 entities owned by ${OWNER} in workspace "${WORKSPACE}"${status ? ` with status=${status}` : ""}: ${res.entities.length} shown\n`)
for (const raw of res.entities as unknown as Record<string, any>[]) {
  const attrs = Object.fromEntries(Object.entries(raw.$attributes ?? {}).map(([k, v]: [string, any]) => [k, String(v?.value ?? v)]))
  let summary = ""
  try {
    const record = JSON.parse(hexToString(raw.payload.value))
    summary = record.intent ? `intent=${record.intent} status=${record.status}` : record.status ? `status=${record.status}` : ""
  } catch {}
  console.log(`${raw.$key}  expiresAtBlock=${raw.$expiresAt}  ${summary || JSON.stringify(attrs)}`)
}
