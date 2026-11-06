import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Identity, IntegrationStatus, RuntimeEvent, RuntimeStats, Workflow } from "../../shared/schemas"
import { API_BASE, api, ApiError, sessionToken, type AgentView, type IdentityConfig } from "./api"

type RuntimeState = {
  online: boolean | null
  stats: RuntimeStats | null
  agents: AgentView[]
  integrations: IntegrationStatus[]
  workflows: Workflow[]
  identity: Identity | null
  identityConfig: IdentityConfig | null
  streamConnected: boolean
  selectedWorkflowId: string | null
  selectWorkflow: (id: string | null) => void
  refresh: () => Promise<void>
  refreshIntegrations: () => Promise<void>
  setSession: (token: string, identity: Identity) => void
  logout: () => Promise<void>
  upsertWorkflow: (wf: Workflow) => void
}

const Ctx = createContext<RuntimeState | null>(null)

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean | null>(null)
  const [stats, setStats] = useState<RuntimeStats | null>(null)
  const [agents, setAgents] = useState<AgentView[]>([])
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [identityConfig, setIdentityConfig] = useState<IdentityConfig | null>(null)
  const [streamConnected, setStreamConnected] = useState(false)
  const [selectedWorkflowId, selectWorkflow] = useState<string | null>(null)
  const statsTimer = useRef<number | undefined>(undefined)

  const upsertWorkflow = useCallback((wf: Workflow) => {
    setWorkflows((cur) => {
      const i = cur.findIndex((w) => w.id === wf.id)
      if (i === -1) return [wf, ...cur]
      const next = [...cur]
      next[i] = wf
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [s, a, w] = await Promise.all([api.stats(), api.agents(), api.workflows()])
      setStats(s)
      setAgents(a)
      setWorkflows(w)
      setOnline(true)
    } catch {
      setOnline(false)
    }
  }, [])

  const refreshIntegrations = useCallback(async () => {
    try {
      setIntegrations(await api.integrations(true))
    } catch {
      /* surfaced by `online` */
    }
  }, [])

  const loadIdentity = useCallback(async () => {
    try {
      setIdentityConfig(await api.identityConfig())
      const { identity } = await api.identityStatus()
      setIdentity(identity)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        sessionToken.clear()
        setIdentity(null)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    void loadIdentity()
    api.integrations().then(setIntegrations).catch(() => undefined)
    const t = window.setInterval(() => void refresh(), 15_000)
    return () => window.clearInterval(t)
  }, [refresh, loadIdentity])

  // While the API is unreachable (e.g. still booting), retry quickly.
  useEffect(() => {
    if (online !== false) return
    const t = window.setInterval(() => {
      void refresh()
      void loadIdentity()
      api.integrations().then(setIntegrations).catch(() => undefined)
    }, 3000)
    return () => window.clearInterval(t)
  }, [online, refresh, loadIdentity])

  // Live runtime events (SSE). Workflow snapshots replace local state; stats refresh is debounced.
  useEffect(() => {
    let es: EventSource | null = null
    let retry: number | undefined
    const connect = () => {
      es = new EventSource(`${API_BASE}/api/events`)
      es.addEventListener("ready", () => setStreamConnected(true))
      es.addEventListener("workflow", (ev) => {
        const e = JSON.parse((ev as MessageEvent<string>).data) as RuntimeEvent
        if (e.workflow) upsertWorkflow(e.workflow)
        window.clearTimeout(statsTimer.current)
        statsTimer.current = window.setTimeout(() => {
          api.stats().then(setStats).catch(() => undefined)
          api.agents().then(setAgents).catch(() => undefined)
        }, 400)
      })
      es.onerror = () => {
        setStreamConnected(false)
        es?.close()
        retry = window.setTimeout(connect, 3000)
      }
    }
    connect()
    return () => {
      es?.close()
      window.clearTimeout(retry)
    }
  }, [upsertWorkflow])

  const setSession = useCallback((token: string, id: Identity) => {
    sessionToken.set(token)
    setIdentity(id)
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined)
    sessionToken.clear()
    setIdentity(null)
  }, [])

  const value = useMemo<RuntimeState>(
    () => ({
      online,
      stats,
      agents,
      integrations,
      workflows,
      identity,
      identityConfig,
      streamConnected,
      selectedWorkflowId,
      selectWorkflow,
      refresh,
      refreshIntegrations,
      setSession,
      logout,
      upsertWorkflow,
    }),
    [online, stats, agents, integrations, workflows, identity, identityConfig, streamConnected, selectedWorkflowId, refresh, refreshIntegrations, setSession, logout, upsertWorkflow],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRuntime() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useRuntime outside RuntimeProvider")
  return v
}

export function useIntegration(name: string) {
  return useRuntime().integrations.find((i) => i.name === name) ?? null
}
