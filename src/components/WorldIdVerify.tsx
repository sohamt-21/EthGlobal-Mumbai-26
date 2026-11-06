import { lazy, Suspense, useState } from "react"
import { AlertTriangle, Fingerprint, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api, ApiError, type RpContext } from "@/lib/api"
import { useRuntime } from "@/lib/runtime"

/** IDKit is loaded lazily so the dashboard does not pay for it until verification starts. */
const IDKitWidget = lazy(async () => {
  const mod = await import("@worldcoin/idkit")
  return {
    default: function Widget(props: {
      open: boolean
      onOpenChange: (o: boolean) => void
      appId: `app_${string}`
      action: string
      environment: "production" | "staging" | "sandbox"
      rpContext: RpContext
      onVerify: (result: unknown) => Promise<void>
      onError: (code: string) => void
      onSuccess: () => void
    }) {
      return (
        <mod.IDKitRequestWidget
          open={props.open}
          onOpenChange={props.onOpenChange}
          app_id={props.appId}
          action={props.action}
          environment={props.environment}
          rp_context={props.rpContext}
          allow_legacy_proofs={true}
          preset={mod.deviceLegacy({ signal: "voxmesh:authorize-agents" })}
          handleVerify={props.onVerify}
          onSuccess={props.onSuccess}
          onError={(code) => props.onError(String(code))}
        />
      )
    },
  }
})

export function WorldIdVerify({ compact = false }: { compact?: boolean }) {
  const { identityConfig, identity, setSession, logout } = useRuntime()
  const [rp, setRp] = useState<RpContext | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (identity) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-200">
          <ShieldCheck className="size-4" />
          {identity.verificationProvider === "world-id" ? "Verified with World ID" : "DEV BYPASS session (not World ID)"}
        </div>
        {!compact && (
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            End session
          </Button>
        )}
      </div>
    )
  }

  const mode = identityConfig?.mode ?? "disabled"

  async function start() {
    setError(null)
    setBusy(true)
    try {
      setRp(await api.rpContext())
      setOpen(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start verification")
    } finally {
      setBusy(false)
    }
  }

  async function devBypass() {
    setBusy(true)
    setError(null)
    try {
      const s = await api.devBypass()
      setSession(s.token, s.identity)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Dev bypass failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {mode === "live" && (
          <Button onClick={() => void start()} disabled={busy} className="bg-white text-black hover:bg-white/90">
            {busy ? <Loader2 className="animate-spin" /> : <Fingerprint />} Verify with World ID
          </Button>
        )}
        {mode === "dev-bypass" && (
          <Button variant="outline" onClick={() => void devBypass()} disabled={busy} className="border-amber-400/30 text-amber-200">
            <AlertTriangle /> Dev bypass (not World ID)
          </Button>
        )}
        {mode === "disabled" && (
          <span className="text-[12px] text-muted-foreground">World ID is not configured on the server (WORLD_APP_ID, WORLD_RP_ID, WORLD_RP_SIGNING_KEY).</span>
        )}
      </div>
      {error && <div className="text-[12px] text-red-300">{error}</div>}
      {mode === "live" && rp && identityConfig?.appId && (
        <Suspense fallback={null}>
          <IDKitWidget
            open={open}
            onOpenChange={setOpen}
            appId={identityConfig.appId as `app_${string}`}
            action={identityConfig.action}
            environment={identityConfig.environment}
            rpContext={rp}
            onVerify={async (result) => {
              const s = await api.verify(result)
              setSession(s.token, s.identity)
            }}
            onSuccess={() => setOpen(false)}
            onError={(code) => setError(`World ID verification failed: ${code}`)}
          />
        </Suspense>
      )}
    </div>
  )
}
