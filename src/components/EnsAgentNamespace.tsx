import { useState } from "react"
import { Check, Fingerprint, KeyRound, Loader2, Network, Wallet } from "lucide-react"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import type { EnsChainId } from "@/lib/ensv2"
import type { AgentView } from "@/lib/api"

type EnsResult = { account: Address; parentName: string; namespaceName: string; agentNames: Record<string, string>; agentEndpoints: Record<string, string>; resolverAddress: Address | null }

export function EnsAgentNamespace({ agents, onNames }: { agents: AgentView[]; onNames: (names: Record<string, string>) => void }) {
  const [chainId, setChainId] = useState<EnsChainId>(11155111)
  const [parentName, setParentName] = useState(() => localStorage.getItem("voxmesh.ens.parent") ?? "")
  const [account, setAccount] = useState<string | null>(null)
  const [expiry, setExpiry] = useState<"year" | "forever">("year")
  const [transferable, setTransferable] = useState(false)
  const [result, setResult] = useState<EnsResult | null>(null)
  const [editor, setEditor] = useState("")
  const [endpointValue, setEndpointValue] = useState("")
  const [selectedAgent, setSelectedAgent] = useState("research")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chainName = chainId === 1 ? "Ethereum Mainnet" : "Sepolia"
  const agentInputs = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities,
    endpoint: agent.endpoint,
  }))

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      const { connectEnsWallet } = await import("@/lib/ensv2")
      setAccount(await connectEnsWallet(chainId))
      setMessage(`Wallet connected on ${chainName}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect wallet")
    } finally {
      setBusy(false)
    }
  }

  async function inspect() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { readEnsAgentHierarchy } = await import("@/lib/ensv2")
      const current = await readEnsAgentHierarchy(chainId, parentName, agentInputs)
      setAccount(current.account)
      setResult(current)
      onNames(current.agentNames)
      setEndpointValue(current.agentEndpoints[selectedAgent] ?? "")
      localStorage.setItem("voxmesh.ens.parent", current.parentName)
      setMessage(Object.keys(current.agentNames).length ? "ENSv2 agent names resolved from chain." : "No VoxMesh agent names found under this parent yet.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read ENSv2 names")
    } finally {
      setBusy(false)
    }
  }

  async function createOrSync() {
    setBusy(true)
    setError(null)
    setMessage("Confirm the ENSv2 transactions in your wallet. Setup can take several transactions.")
    try {
      const { syncEnsAgentHierarchy } = await import("@/lib/ensv2")
      const created = await syncEnsAgentHierarchy(chainId, parentName, agentInputs, { expiry, transferable })
      setAccount(created.account)
      setResult(created)
      onNames(created.agentNames)
      setEndpointValue(created.agentEndpoints[selectedAgent] ?? "")
      localStorage.setItem("voxmesh.ens.parent", created.parentName)
      setMessage(`ENSv2 names registered and records verified on ${chainName}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ENSv2 setup failed")
    } finally {
      setBusy(false)
    }
  }

  async function delegateEndpoint() {
    if (!result?.resolverAddress) return
    setBusy(true)
    setError(null)
    try {
      const { grantAgentEndpointEditor } = await import("@/lib/ensv2")
      const grant = await grantAgentEndpointEditor(chainId, result.resolverAddress, selectedAgent, editor)
      setMessage(`Granted ${grant.editor} permission to edit only ${grant.key}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not grant ENS resolver role")
    } finally {
      setBusy(false)
    }
  }

  async function updateEndpoint() {
    if (!result?.resolverAddress || !result.agentNames[selectedAgent]) return
    setBusy(true)
    setError(null)
    try {
      const { updateAgentEndpoint } = await import("@/lib/ensv2")
      const endpoint = await updateAgentEndpoint(chainId, result.resolverAddress, result.agentNames[selectedAgent], selectedAgent, endpointValue)
      setResult({ ...result, agentEndpoints: { ...result.agentEndpoints, [selectedAgent]: endpoint } })
      setMessage(`Updated the ${selectedAgent} endpoint record on ENSv2.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update ENS endpoint")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="vx-panel grid gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
            <Network className="size-4" />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold">ENSv2 agent namespace</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">
              Create real Permissioned Registry subnames and resolver records. Your wallet signs every transaction; the connected account must own the parent or have the required ENSv2 registry role.
            </p>
          </div>
        </div>
        <span className="vx-mono rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-muted-foreground">{chainName}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-[150px_minmax(180px,1fr)_150px_auto] md:items-end">
        <label className="grid gap-1.5 text-[11px] text-muted-foreground">
          Network
          <select
            value={chainId}
            onChange={(event) => {
              setChainId(Number(event.target.value) as EnsChainId)
              setAccount(null)
              setResult(null)
              onNames({})
            }}
            className="h-9 rounded-md border border-white/[0.1] bg-black/30 px-2 text-[12px] text-foreground outline-none focus:border-emerald-300/40"
          >
            <option value={11155111}>Sepolia</option>
            <option value={1}>Ethereum Mainnet</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-[11px] text-muted-foreground">
          ENSv2 parent name
          <input
            value={parentName}
            onChange={(event) => setParentName(event.target.value)}
            placeholder="alice.eth"
            autoCapitalize="none"
            spellCheck={false}
            className="vx-mono h-9 rounded-md border border-white/[0.1] bg-black/30 px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-emerald-300/40"
          />
        </label>
        <label className="grid gap-1.5 text-[11px] text-muted-foreground">
          Name expiry
          <select
            value={expiry}
            onChange={(event) => setExpiry(event.target.value as "year" | "forever")}
            className="h-9 rounded-md border border-white/[0.1] bg-black/30 px-2 text-[12px] text-foreground outline-none focus:border-emerald-300/40"
          >
            <option value="year">1 year</option>
            <option value="forever">No expiry</option>
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 rounded-md border border-white/[0.08] px-2 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={transferable} onChange={(event) => setTransferable(event.target.checked)} />
          Transferable
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void connect()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Wallet />} Connect wallet
        </Button>
        <Button size="sm" variant="outline" onClick={() => void inspect()} disabled={busy || !parentName.trim()}>
          <Fingerprint /> Inspect names
        </Button>
        <Button size="sm" onClick={() => void createOrSync()} disabled={busy || !parentName.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Register / sync hierarchy
        </Button>
        {account && <span className="vx-mono text-[10px] text-muted-foreground">{account.slice(0, 8)}…{account.slice(-6)}</span>}
      </div>

      <div className="grid gap-1 text-[11px] leading-relaxed text-muted-foreground">
        <p>Parent must already exist on ENSv2. The connected account must own it or have permission to attach or register subnames. The tree is parent name → voxmesh namespace → supervisor → research and security.</p>
        <p>Names are non-transferable by default, revocable by their registry owner, and expire after one year unless “No expiry” is selected. Existing names keep their original expiry and transfer settings.</p>
        <p>Each agent has separate records. Resolver permissions are delegated by text key, so a worker can be limited to its own endpoint key. Transactions require network gas.</p>
      </div>

      {result && Object.keys(result.agentNames).length > 0 && (
        <div className="grid gap-3 border-t border-white/[0.07] pt-3">
          <div className="grid gap-1 text-[11px]">
            <div className="flex items-center gap-2 text-foreground/80"><Network className="size-3.5 text-emerald-300" />{result.namespaceName}</div>
            {agents.map((agent) => result.agentNames[agent.id] && (
              <div key={agent.id} className="flex flex-wrap items-center justify-between gap-2 pl-5">
                <span className="vx-mono text-foreground">{agent.id}: {result.agentNames[agent.id]}</span>
              </div>
            ))}
          </div>
          {result.resolverAddress && (
            <div className="grid gap-2 border-t border-white/[0.06] pt-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <label className="grid gap-1.5 text-[11px] text-muted-foreground">
                Editor wallet address
                <input value={editor} onChange={(event) => setEditor(event.target.value)} placeholder="0x…" className="vx-mono h-9 rounded-md border border-white/[0.1] bg-black/30 px-2 text-[12px] text-foreground outline-none focus:border-emerald-300/40" />
              </label>
              <label className="grid gap-1.5 text-[11px] text-muted-foreground">
                Agent endpoint key
                <select
                  value={selectedAgent}
                  onChange={(event) => {
                    const id = event.target.value
                    setSelectedAgent(id)
                    setEndpointValue(result.agentEndpoints[id] ?? agents.find((agent) => agent.id === id)?.endpoint ?? "")
                  }}
                  className="h-9 rounded-md border border-white/[0.1] bg-black/30 px-2 text-[12px] text-foreground outline-none focus:border-emerald-300/40"
                >
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </label>
              <Button size="sm" variant="outline" onClick={() => void delegateEndpoint()} disabled={busy || !editor.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Grant key role
              </Button>
            </div>
          )}
          {result.resolverAddress && (
            <div className="grid gap-2 border-t border-white/[0.06] pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="grid gap-1.5 text-[11px] text-muted-foreground">
                {selectedAgent} ENS endpoint record
                <input
                  type="url"
                  value={endpointValue}
                  onChange={(event) => setEndpointValue(event.target.value)}
                  placeholder="https://agent.example/api"
                  className="vx-mono h-9 rounded-md border border-white/[0.1] bg-black/30 px-2 text-[12px] text-foreground outline-none focus:border-emerald-300/40"
                />
              </label>
              <Button size="sm" variant="outline" onClick={() => void updateEndpoint()} disabled={busy || !result.agentNames[selectedAgent] || !endpointValue.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Write endpoint record
              </Button>
            </div>
          )}
        </div>
      )}

      {message && <p role="status" className="text-[11px] text-emerald-200">{message}</p>}
      {error && <p role="alert" className="text-[11px] text-red-300">{error}</p>}
    </section>
  )
}