import { createServer } from "node:https"
import { createApp } from "./api/app"
import { loadConfig } from "./config"
import { createPhoneApp, PhoneAccess } from "./phone/access"
import { createRuntime } from "./runtime/container"

async function main() {
  const cfg = loadConfig()
  const rt = await createRuntime(cfg)
  const phone = cfg.PHONE_ACCESS_ENABLED ? await PhoneAccess.load(cfg) : null
  const app = createApp(rt, phone)
  app.listen(cfg.API_PORT, cfg.API_HOST, () => {
    const [inf, store, id] = [rt.inference.mode, rt.store.mode, rt.identity.mode]
    console.log(`[voxmesh] API listening on http://${cfg.API_HOST}:${cfg.API_PORT}`)
    console.log(`[voxmesh] inference=${inf === "live" ? `0G (${rt.inference.model})` : "MOCK (set ZG_API_KEY)"}`)
    console.log(`[voxmesh] store=${store === "live" ? `Arkiv Rabdi, signer ${rt.store.ownerAddress}` : "LOCAL MEMORY (set ARKIV_PRIVATE_KEY)"}`)
    console.log(`[voxmesh] identity=${id}`)
  })
  if (phone) {
    createServer(phone.tls(), createPhoneApp(rt, phone)).listen(cfg.PHONE_HTTPS_PORT, "0.0.0.0", async () => {
      const { urls } = await phone.pairing()
      console.log(`[voxmesh] phone access on ${urls.join(", ") || `port ${cfg.PHONE_HTTPS_PORT} (no LAN address found)`} — pair from Command → Phone`)
    })
  }
}

main().catch((error) => {
  console.error("[voxmesh] failed to start:", error instanceof Error ? error.message : error)
  process.exit(1)
})
