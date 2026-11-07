import { useState } from "react"
import { Eye, EyeOff, Loader2, RefreshCw, Smartphone } from "lucide-react"
import { Panel } from "@/components/common"
import { api, ApiError, type PhonePairing as Pairing } from "@/lib/api"

/** Shows the pairing QR (which contains the phone secret) only on demand. */
export function PhonePairing() {
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(rotate = false) {
    setBusy(true)
    setError(null)
    try {
      setPairing(rotate ? await api.rotatePhonePairing() : await api.phonePairing())
      setOpen(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load phone pairing")
    } finally {
      setBusy(false)
    }
  }

  const actions = open ? (
    <button onClick={() => setOpen(false)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
      <EyeOff className="size-3.5" /> Hide
    </button>
  ) : (
    <button onClick={() => void load()} disabled={busy} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />} Pair a phone
    </button>
  )

  return (
    <Panel title="Phone" icon={<Smartphone />} actions={actions}>
      {!open ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Send voice or text commands from your phone on the same Wi-Fi; they run here on the laptop. {error && <span className="text-amber-200">{error}</span>}
        </p>
      ) : !pairing?.enabled ? (
        <div className="grid gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
          <p>Phone access is off.</p>
          <p>
            Add <code className="vx-mono text-foreground">PHONE_ACCESS_ENABLED=true</code> to <code className="vx-mono text-foreground">.env</code> and restart <code className="vx-mono text-foreground">npm run dev</code>.
          </p>
        </div>
      ) : !pairing.qrSvg ? (
        <p className="text-[12px] text-amber-200">No Wi-Fi address found on this laptop. Connect to the same network as your phone, then restart the server.</p>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-start gap-3">
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(pairing.qrSvg)}`}
              alt="Phone pairing QR code"
              className="size-36 shrink-0 rounded-lg bg-white p-1.5"
            />
            <ol className="grid list-decimal gap-1 pl-4 text-[11.5px] leading-relaxed text-muted-foreground">
              <li>Join the same Wi-Fi as this laptop.</li>
              <li>Scan with the phone camera and open the link.</li>
              <li>
                Accept the one-time certificate warning (<em>Advanced → Proceed</em> on Android, <em>Show Details → visit this website</em> on iPhone).
              </li>
              <li>Tap the mic and allow microphone access.</li>
            </ol>
          </div>
          <div className="vx-mono break-all rounded-md bg-black/25 px-2 py-1.5 text-[10px] text-muted-foreground">
            {pairing.urls.join("  ·  ")}
            <br />
            cert SHA-256 {pairing.certFingerprint?.slice(0, 23)}…
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Keep this QR private — it is the phone's key. Wallet prompts still need approval on this laptop.</span>
            <button onClick={() => void load(true)} disabled={busy} className="flex shrink-0 items-center gap-1 hover:text-foreground">
              <RefreshCw className="size-3" /> Reset
            </button>
          </div>
        </div>
      )}
    </Panel>
  )
}
