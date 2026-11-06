import { createApp } from "./api/app"
import { loadConfig } from "./config"
import { createRuntime } from "./runtime/container"

async function main() {
  const cfg = loadConfig()
  const rt = await createRuntime(cfg)
  const app = createApp(rt)
  app.listen(cfg.API_PORT, () => {
    const [inf, store, id] = [rt.inference.mode, rt.store.mode, rt.identity.mode]
    console.log(`[voxmesh] API listening on http://localhost:${cfg.API_PORT}`)
    console.log(`[voxmesh] inference=${inf === "live" ? `0G (${rt.inference.model})` : "MOCK (set ZG_API_KEY)"}`)
    console.log(`[voxmesh] store=${store === "live" ? `Arkiv Rabdi, signer ${rt.store.ownerAddress}` : "LOCAL MEMORY (set ARKIV_PRIVATE_KEY)"}`)
    console.log(`[voxmesh] identity=${id}`)
  })
}

main().catch((error) => {
  console.error("[voxmesh] failed to start:", error instanceof Error ? error.message : error)
  process.exit(1)
})
