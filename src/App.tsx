import { useEffect, useState } from "react"
import { NAV, Shell, type PageId } from "@/components/Shell"
import { RuntimeProvider, useRuntime } from "@/lib/runtime"
import { AgentsPage } from "@/pages/Agents"
import { CommandPage } from "@/pages/Command"
import { DashboardPage } from "@/pages/Dashboard"
import { ExplorerPage } from "@/pages/Explorer"
import { IdentityPage } from "@/pages/Identity"
import { TracePage } from "@/pages/Trace"

function pageFromHash(): PageId {
  const id = window.location.hash.replace(/^#\/?/, "") as PageId
  return NAV.some((n) => n.id === id) ? id : "dashboard"
}

function Routes() {
  const [page, setPage] = useState<PageId>(pageFromHash)
  const { selectWorkflow } = useRuntime()

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = (p: PageId) => {
    window.location.hash = `/${p}`
    setPage(p)
  }
  const openTrace = (id: string) => {
    selectWorkflow(id)
    navigate("trace")
  }

  return (
    <Shell page={page} onNavigate={navigate}>
      {page === "dashboard" && <DashboardPage onRun={() => navigate("command")} onOpenTrace={openTrace} />}
      {page === "command" && <CommandPage onOpenTrace={openTrace} />}
      {page === "trace" && <TracePage />}
      {page === "agents" && <AgentsPage />}
      {page === "explorer" && <ExplorerPage />}
      {page === "identity" && <IdentityPage />}
    </Shell>
  )
}

export default function App() {
  return (
    <RuntimeProvider>
      <Routes />
    </RuntimeProvider>
  )
}
