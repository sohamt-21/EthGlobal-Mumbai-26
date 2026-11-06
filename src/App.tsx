import { useRef, useState } from "react"
import {
  Activity, AudioLines, Bot, Check, ChevronDown, ChevronRight, Circle,
  CircleCheck, Clock3, Command, Cpu, Database, FileCode2, Fingerprint,
  GitBranch, Layers3, ListChecks, Mic2, Network, Play, Plus, RefreshCw,
  Settings2, ShieldCheck, Square, Terminal, Workflow, Zap,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type AgentStatus = "Idle" | "Working" | "Done"
type StepStatus = "queued" | "active" | "complete"
type ViewName = "Runtime" | "Tasks" | "Agents" | "Integrations"
type Agent = {
  id: string
  name: string
  role: string
  handle: string
  color: "lime" | "mint" | "orange"
  status: AgentStatus
  icon: typeof Bot
}
type RunEvent = {
  id: number
  title: string
  detail: string
  time: string
  agent: string
  kind: "system" | "agent" | "storage" | "complete"
}

const samplePrompt = "Review this token contract for privileged roles, suspicious transfer controls, and the highest-risk findings. Return a prioritized security brief."
const initialAgents: Agent[] = [
  { id: "supervisor", name: "Supervisor", role: "Planner & coordinator", handle: "supervisor.voxmesh.eth", color: "lime", status: "Idle", icon: Workflow },
  { id: "research", name: "Research Agent", role: "Contract analysis", handle: "research.voxmesh.eth", color: "mint", status: "Idle", icon: FileCode2 },
  { id: "security", name: "Security Agent", role: "Risk assessment", handle: "security.voxmesh.eth", color: "orange", status: "Idle", icon: ShieldCheck },
]
const initialSteps = [
  { label: "Interpret request", agent: "Supervisor", status: "queued" as StepStatus },
  { label: "Inspect source material", agent: "Research", status: "queued" as StepStatus },
  { label: "Assess security risks", agent: "Security", status: "queued" as StepStatus },
  { label: "Synthesize report", agent: "Supervisor", status: "queued" as StepStatus },
]
const initialEvents: RunEvent[] = [{ id: 1, title: "Demo runtime ready", detail: "Waiting for a task to execute", time: "NOW", agent: "SYSTEM", kind: "system" }]
const navItems: { label: ViewName; icon: typeof Workflow }[] = [
  { label: "Runtime", icon: Workflow }, { label: "Tasks", icon: ListChecks },
  { label: "Agents", icon: Bot }, { label: "Integrations", icon: Layers3 },
]
const integrations = [
  { name: "0G Private Computer", category: "INFERENCE", icon: Cpu, color: "lime", state: "Demo mode" },
  { name: "Arkiv", category: "COORDINATION", icon: Database, color: "mint", state: "Demo mode" },
  { name: "World ID", category: "AUTHORIZATION", icon: Fingerprint, color: "orange", state: "Not connected" },
]

function formatTime() {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date())
}
function delay(duration: number) { return new Promise((resolve) => window.setTimeout(resolve, duration)) }

function App() {
  const [view, setView] = useState<ViewName>("Runtime")
  const [prompt, setPrompt] = useState(samplePrompt)
  const [agents, setAgents] = useState(initialAgents)
  const [steps, setSteps] = useState(initialSteps)
  const [events, setEvents] = useState(initialEvents)
  const [isRunning, setIsRunning] = useState(false)
  const [taskStatus, setTaskStatus] = useState("Ready")
  const [runCount, setRunCount] = useState(0)
  const [taskId, setTaskId] = useState("VX-DEMO-001")
  const [report, setReport] = useState("")
  const [voicePreview, setVoicePreview] = useState(false)
  const [activeEventTab, setActiveEventTab] = useState("activity")
  const runToken = useRef(0)
  const completedSteps = steps.filter((step) => step.status === "complete").length

  function addEvent(event: Omit<RunEvent, "id" | "time">) {
    setEvents((current) => [{ ...event, id: Date.now() + Math.random(), time: formatTime() }, ...current])
  }
  function patchStep(index: number, status: StepStatus) {
    setSteps((current) => current.map((step, i) => i === index ? { ...step, status } : step))
  }
  function patchAgent(agentId: string, status: AgentStatus) {
    setAgents((current) => current.map((agent) => agent.id === agentId ? { ...agent, status } : agent))
  }

  async function runWorkflow() {
    if (isRunning || !prompt.trim()) return
    const token = ++runToken.current
    const nextNumber = runCount + 1
    setRunCount(nextNumber)
    setTaskId(`VX-DEMO-${String(nextNumber).padStart(3, "0")}`)
    setIsRunning(true)
    setTaskStatus("Planning")
    setReport("")
    setSteps(initialSteps.map((step) => ({ ...step, status: "queued" })))
    setAgents(initialAgents)
    addEvent({ title: "Task accepted", detail: "Supervisor received the request", agent: "SUPERVISOR", kind: "system" })

    const stages = [
      { step: 0, agentId: "supervisor", agent: "SUPERVISOR", title: "Execution plan validated", detail: "4-step plan checked against registered capabilities", kind: "system" as const },
      { step: 1, agentId: "research", agent: "RESEARCH AGENT", title: "Source inspection complete", detail: "Findings prepared for downstream security review", kind: "agent" as const },
      { step: 2, agentId: "security", agent: "SECURITY AGENT", title: "Risk assessment complete", detail: "Potential privileged controls ranked by severity", kind: "agent" as const },
      { step: 3, agentId: "supervisor", agent: "SUPERVISOR", title: "Report synthesized", detail: "Research and security outputs combined", kind: "complete" as const },
    ]
    for (const stage of stages) {
      if (runToken.current !== token) return
      setTaskStatus(stage.step === 0 ? "Planning" : "Executing")
      patchStep(stage.step, "active")
      patchAgent(stage.agentId, "Working")
      await delay(850)
      if (runToken.current !== token) return
      patchStep(stage.step, "complete")
      patchAgent(stage.agentId, "Done")
      addEvent({ title: stage.title, detail: stage.detail, agent: stage.agent, kind: stage.kind })
    }
    setTaskStatus("Completed")
    setReport("Demo report: review owner-only permissions and transfer restrictions first. Confirm whether privileged roles can pause transfers, blacklist addresses, or change fees. This simulated result is placeholder content, not a contract audit.")
    setIsRunning(false)
  }

  function stopWorkflow() {
    runToken.current += 1
    setIsRunning(false)
    setTaskStatus("Paused")
    setAgents((current) => current.map((agent) => agent.status === "Working" ? { ...agent, status: "Idle" } : agent))
    addEvent({ title: "Demo run paused", detail: "Execution stopped by user", agent: "SYSTEM", kind: "system" })
  }
  function resetWorkflow() {
    runToken.current += 1
    setIsRunning(false)
    setTaskStatus("Ready")
    setTaskId("VX-DEMO-001")
    setRunCount(0)
    setPrompt(samplePrompt)
    setAgents(initialAgents)
    setSteps(initialSteps)
    setEvents(initialEvents)
    setReport("")
    setVoicePreview(false)
    setActiveEventTab("activity")
  }
  function insertVoiceSample() {
    setPrompt("Review a token contract for privileged roles and summarize the highest-risk findings.")
    setVoicePreview(true)
    addEvent({ title: "Sample voice transcript inserted", detail: "Preview only; speech recognition is not connected", agent: "INPUT", kind: "system" })
  }

  return (
    <TooltipProvider>
      <div className="app-shell dark">
        <aside className="sidebar">
          <div className="brand-lockup">
            <div className="brand-mark"><Network size={18} strokeWidth={2.3} /></div>
            <div><div className="brand-name">voxmesh<span>.</span></div><div className="brand-caption">AGENT RUNTIME</div></div>
          </div>
          <div className="workspace-picker"><div className="workspace-avatar">V</div><div className="workspace-copy"><span>Workspace</span><strong>VoxMesh / Local</strong></div><ChevronDown size={14} className="workspace-chevron" /></div>
          <div className="nav-section-label">WORKSPACE</div>
          <nav className="primary-nav" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon
              return <button className={`nav-item${view === item.label ? " selected" : ""}`} key={item.label} onClick={() => setView(item.label)} type="button"><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.label === "Tasks" && <span className="nav-count">{runCount}</span>}</button>
            })}
          </nav>
          <div className="nav-section-label tools-label">TOOLS</div>
          <div className="tool-nav-row"><Terminal size={16} /><span>Event explorer</span><span className="soon-mark">SOON</span></div>
          <div className="tool-nav-row"><GitBranch size={16} /><span>Delegation rules</span><span className="soon-mark">SOON</span></div>
          <div className="sidebar-spacer" />
          <div className="network-status"><div className="network-status-top"><span className="pulse-dot" />LOCAL SIMULATION</div><div className="network-status-copy">Providers are not connected</div><div className="network-status-footer"><span>Runtime v0.1</span><span>●</span></div></div>
          <button className="profile-row" type="button" onClick={() => setView("Integrations")}><Avatar className="profile-avatar"><AvatarFallback>DV</AvatarFallback></Avatar><span className="profile-copy"><strong>Demo operator</strong><small>Local session</small></span><Settings2 size={16} /></button>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <div className="mobile-brand"><span className="brand-mark"><Network size={17} /></span><b>voxmesh<span>.</span></b></div>
            <div className="breadcrumbs"><span>WORKSPACE</span><ChevronRight size={13} /><strong>{view.toUpperCase()}</strong></div>
            <div className="topbar-right"><Badge variant="outline" className="demo-badge"><span className="demo-dot" />DEMO ENVIRONMENT</Badge><Separator orientation="vertical" className="top-separator" /><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon" className="top-icon" aria-label="Reset demo" onClick={resetWorkflow} />}><RefreshCw size={16} /></TooltipTrigger><TooltipContent>Reset demo state</TooltipContent></Tooltip><Button variant="outline" className="operator-button"><span className="operator-dot" />Operator <ChevronDown size={14} /></Button></div>
          </header>
          <div className="page-content">
            {view === "Runtime" && <RuntimeView activeEventTab={activeEventTab} agents={agents} completedSteps={completedSteps} events={events} insertVoiceSample={insertVoiceSample} isRunning={isRunning} openAgents={() => setView("Agents")} openIntegrations={() => setView("Integrations")} prompt={prompt} report={report} runWorkflow={runWorkflow} setActiveEventTab={setActiveEventTab} setPrompt={setPrompt} steps={steps} stopWorkflow={stopWorkflow} taskId={taskId} taskStatus={taskStatus} voicePreview={voicePreview} />}
            {view === "Tasks" && <TasksView events={events} isRunning={isRunning} taskId={taskId} taskStatus={taskStatus} />}
            {view === "Agents" && <AgentsView agents={agents} />}
            {view === "Integrations" && <IntegrationsView />}
            <footer className="page-footer"><span><Command size={13} /> VOXMESH LOCAL PREVIEW</span><span>All activity shown here is simulated</span></footer>
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}

type RuntimeViewProps = {
  activeEventTab: string
  agents: Agent[]
  completedSteps: number
  events: RunEvent[]
  insertVoiceSample: () => void
  isRunning: boolean
  openAgents: () => void
  openIntegrations: () => void
  prompt: string
  report: string
  runWorkflow: () => void
  setActiveEventTab: (tab: string) => void
  setPrompt: (value: string) => void
  steps: typeof initialSteps
  stopWorkflow: () => void
  taskId: string
  taskStatus: string
  voicePreview: boolean
}

function RuntimeView(props: RuntimeViewProps) {
  const { activeEventTab, agents, completedSteps, events, insertVoiceSample, isRunning, openAgents, openIntegrations, prompt, report, runWorkflow, setActiveEventTab, setPrompt, steps, stopWorkflow, taskId, taskStatus, voicePreview } = props
  const progress = Math.round((completedSteps / steps.length) * 100)
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> CONTROL PLANE <span className="eyebrow-slash">/</span> OVERVIEW</div><h1>Agent runtime</h1><p>Coordinate specialist agents. Inspect every step.</p></div><div className="heading-actions"><span className="last-sync"><span className="pulse-dot" />LOCAL SIMULATION ACTIVE</span><Button variant="outline" className="outline-action" onClick={() => document.getElementById("task-prompt")?.focus()}><Plus size={15} /> New task</Button></div></div>
    <section className="metric-strip" aria-label="Runtime overview"><Metric icon={Bot} label="REGISTERED AGENTS" value="03" detail="all available" tone="lime" /><Metric icon={Activity} label="ACTIVE TASKS" value={isRunning ? "01" : "00"} detail={isRunning ? "executing now" : "queue clear"} tone="mint" /><Metric icon={Zap} label="INFERENCE CALLS" value={isRunning ? String(completedSteps + 1).padStart(2, "0") : "00"} detail="demo receipts only" tone="orange" /><Metric icon={Database} label="COORDINATION" value="LOCAL" detail="Arkiv not connected" tone="blue" /></section>
    <div className="runtime-grid">
      <div className="runtime-main-column">
        <Card className="task-composer panel-card"><CardHeader className="panel-header"><div className="panel-heading-group"><div className="panel-icon lime-icon"><Command size={17} /></div><div><CardTitle>Start a workflow</CardTitle><p className="panel-subtitle">Describe a task for your agent network</p></div></div><Badge variant="outline" className="subtle-badge"><span className="tiny-status-dot" />TEXT INPUT</Badge></CardHeader>
          <CardContent className="composer-content"><div className="input-wrap"><Textarea id="task-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a task for your agent network..." className="task-textarea" maxLength={1200} aria-label="Workflow request" /><span className="input-counter">{prompt.length}/1200</span></div><div className="composer-bottom"><div className="composer-hints"><Tooltip><TooltipTrigger render={<Button variant="outline" size="sm" className={`mic-button${voicePreview ? " voice-used" : ""}`} onClick={insertVoiceSample} aria-label="Insert sample voice transcript" />}><Mic2 size={15} /><span>{voicePreview ? "Transcript added" : "Voice preview"}</span></TooltipTrigger><TooltipContent>Insert a sample transcript; speech recognition is not connected</TooltipContent></Tooltip><span className="shortcut-hint">Safe mode <span className="shortcut-key">ON</span></span></div><div className="run-controls">{isRunning && <Button variant="outline" size="sm" className="stop-button" onClick={stopWorkflow}><Square size={13} fill="currentColor" /> Stop</Button>}<Button className="run-button" onClick={runWorkflow} disabled={isRunning || !prompt.trim()}>{isRunning ? <><AudioLines size={15} className="audio-pulse" /> Running</> : <><Play size={14} fill="currentColor" /> Run workflow <span className="run-arrow">↗</span></>}</Button></div></div></CardContent>
        </Card>

        <Card className="pipeline-card panel-card"><CardHeader className="panel-header pipeline-heading"><div className="panel-heading-group"><div className="panel-icon mint-icon"><GitBranch size={17} /></div><div><CardTitle>Execution plan</CardTitle><p className="panel-subtitle"><span className="mono-label">{taskId}</span><span className="separator-dot">·</span>{taskStatus}</p></div></div><div className="progress-meta"><span>{completedSteps}/{steps.length} STEPS</span><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div></CardHeader><CardContent className="pipeline-content">{steps.map((step, index) => {
          const statusClass = step.status === "complete" ? "step-complete" : step.status === "active" ? "step-active" : "step-queued"
          return <div className={`plan-step ${statusClass}`} key={step.label}><div className="step-number">{step.status === "complete" ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</div>{index < steps.length - 1 && <div className="step-connector" />}<div className="step-copy"><strong>{step.label}</strong><span>{step.agent} agent</span></div><span className="step-state">{step.status === "complete" ? "DONE" : step.status === "active" ? "RUNNING" : "QUEUED"}</span><ChevronRight size={15} className="step-chevron" /></div>
        })}{report && <div className="demo-report"><div className="report-label"><CircleCheck size={14} /> DEMO OUTPUT</div><p>{report}</p></div>}</CardContent></Card>

        <Card className="agent-roster panel-card"><CardHeader className="panel-header compact-header"><div className="panel-heading-group"><div className="panel-icon orange-icon"><Network size={17} /></div><div><CardTitle>Agent registry</CardTitle><p className="panel-subtitle">Identity and runtime status</p></div></div><Button variant="ghost" size="sm" className="text-action" onClick={openAgents}>View agents <ChevronRight size={14} /></Button></CardHeader><CardContent className="roster-content">{agents.map((agent) => <AgentRow agent={agent} key={agent.id} />)}</CardContent></Card>
      </div>
      <div className="runtime-side-column">
        <Card className="activity-card panel-card"><CardHeader className="activity-header"><div className="activity-title-row"><div><CardTitle>Execution trace</CardTitle><p className="panel-subtitle">Ordered runtime events</p></div><span className="live-indicator"><span />PREVIEW</span></div><Tabs value={activeEventTab} onValueChange={setActiveEventTab}><TabsList className="trace-tabs"><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="receipts">Receipts</TabsTrigger></TabsList></Tabs></CardHeader><CardContent className="trace-content">{activeEventTab === "activity" ? <ScrollArea className="trace-scroll"><div className="trace-list">{events.map((event) => <TraceEvent event={event} key={event.id} />)}</div></ScrollArea> : <div className="receipt-list"><div className="receipt-empty-icon"><Cpu size={18} /></div><strong>{isRunning ? "Demo receipts generated" : "No live inference receipts"}</strong><p>Real 0G request IDs will appear here after provider setup. Demo activity is not sent to 0G.</p>{isRunning && <Badge variant="outline" className="simulated-receipt">SIMULATED RECEIPT</Badge>}</div>}</CardContent><div className="trace-footer"><span><span className="tiny-status-dot" />LOCAL TRACE</span><span>{events.length} EVENTS</span></div></Card>
        <Card className="connections-card panel-card"><CardHeader className="connections-header"><div><CardTitle>Provider connections</CardTitle><p className="panel-subtitle">Integration readiness</p></div><Button variant="ghost" size="icon-sm" aria-label="Provider settings" onClick={openIntegrations}><Settings2 size={16} /></Button></CardHeader><CardContent className="connections-content">{integrations.map((integration) => <IntegrationRow integration={integration} key={integration.name} />)}</CardContent><div className="connect-note"><Circle size={12} /> No external services are connected</div></Card>
        <div className="runtime-note"><ShieldCheck size={16} /><span><strong>Safe preview</strong> No transactions, external requests, or identity checks are performed.</span></div>
      </div>
    </div>
  </>
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Bot; label: string; value: string; detail: string; tone: string }) {
  return <div className="metric-cell"><div className={`metric-icon ${tone}-tone`}><Icon size={16} /></div><div className="metric-copy"><span className="metric-label">{label}</span><div className="metric-value-row"><strong>{value}</strong><span>{detail}</span></div></div></div>
}
function AgentRow({ agent }: { agent: Agent }) {
  const Icon = agent.icon
  return <div className="agent-row"><div className={`agent-avatar ${agent.color}`}><Icon size={17} /></div><div className="agent-row-copy"><strong>{agent.name}</strong><span>{agent.handle}</span></div><div className="agent-role">{agent.role}</div><span className={`agent-status ${agent.status.toLowerCase()}`}><i />{agent.status}</span><ChevronRight size={15} className="agent-chevron" /></div>
}
function TraceEvent({ event }: { event: RunEvent }) {
  const Icon = event.kind === "storage" ? Database : event.kind === "complete" ? CircleCheck : event.kind === "agent" ? Bot : Activity
  return <div className={`trace-event ${event.kind}`}><div className="trace-icon"><Icon size={14} /></div><div className="trace-event-copy"><div className="trace-event-heading"><strong>{event.title}</strong><time>{event.time}</time></div><p>{event.detail}</p><span className="trace-agent">{event.agent}</span></div></div>
}
function IntegrationRow({ integration }: { integration: (typeof integrations)[number] }) {
  const Icon = integration.icon
  return <div className="integration-row"><div className={`integration-icon ${integration.color}`}><Icon size={16} /></div><div className="integration-copy"><strong>{integration.name}</strong><span>{integration.category}</span></div><Badge variant="outline" className={`integration-state ${integration.state === "Demo mode" ? "demo-state" : ""}`}>{integration.state}</Badge></div>
}
function ViewHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div className="page-heading secondary-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{kicker}</div><h1>{title}</h1><p>{description}</p></div></div>
}
function TasksView({ events, isRunning, taskId, taskStatus }: { events: RunEvent[]; isRunning: boolean; taskId: string; taskStatus: string }) {
  return <><ViewHeading kicker="WORKSPACE / TASKS" title="Task history" description="Review recent workflows and their execution state." /><Card className="panel-card history-card"><CardHeader className="panel-header"><div><CardTitle>Recent tasks</CardTitle><p className="panel-subtitle">Local demo sessions</p></div><Badge variant="outline" className="subtle-badge">SIMULATED DATA</Badge></CardHeader><CardContent className="history-list"><div className="history-row history-head"><span>TASK</span><span>STATUS</span><span>EVENTS</span><span>MODE</span></div><div className="history-row"><div className="history-task"><span className="history-task-icon"><ListChecks size={15} /></span><div><strong>{taskId}</strong><small>Contract risk review</small></div></div><Badge variant="outline" className={`status-pill ${isRunning ? "status-running" : taskStatus === "Completed" ? "status-done" : ""}`}>{taskStatus}</Badge><span className="history-value">{events.length} events</span><span className="history-value">Local simulation</span></div><div className="history-empty"><Clock3 size={18} /><span>Completed demo sessions will appear here as you run workflows.</span></div></CardContent></Card><div className="view-callout"><Activity size={17} /><span>This preview keeps task state in memory only. Refreshing resets the session.</span></div></>
}
function AgentsView({ agents }: { agents: Agent[] }) {
  return <><ViewHeading kicker="WORKSPACE / AGENTS" title="Agent registry" description="Three specialist processes are configured for the preview runtime." /><div className="agents-grid">{agents.map((agent) => {
    const Icon = agent.icon
    return <Card className="agent-detail-card panel-card" key={agent.id}><CardHeader className="agent-detail-header"><div className={`agent-avatar large ${agent.color}`}><Icon size={20} /></div><Badge variant="outline" className={`agent-status-badge ${agent.status.toLowerCase()}`}><i />{agent.status}</Badge></CardHeader><CardContent><div className="agent-detail-name">{agent.name}</div><div className="agent-detail-handle">{agent.handle}</div><Separator className="detail-divider" /><div className="agent-meta-row"><span>ROLE</span><strong>{agent.role}</strong></div><div className="agent-meta-row"><span>IDENTITY</span><strong>Demo registry entry</strong></div><div className="agent-meta-row"><span>CAPABILITIES</span><strong>{agent.id === "supervisor" ? "Planning · routing · synthesis" : agent.id === "research" ? "Source inspection · findings" : "Risk review · severity ranking"}</strong></div></CardContent></Card>
  })}</div><div className="view-callout"><Fingerprint size={17} /><span>ENS labels shown here are illustrative. No on-chain name records are resolved.</span></div></>
}
function IntegrationsView() {
  return <><ViewHeading kicker="WORKSPACE / PROVIDERS" title="Integrations" description="Connect providers as each development step is implemented." /><div className="provider-grid">{[...integrations, { name: "Hedera x402", category: "AGENT ECONOMY", icon: Zap, color: "blue", state: "Optional" }].map((integration) => {
    const Icon = integration.icon
    return <Card className={`provider-card panel-card${integration.name.startsWith("Hedera") ? " optional-provider" : ""}`} key={integration.name}><CardHeader className="provider-card-header"><div className={`integration-icon large-icon ${integration.color}`}><Icon size={19} /></div><Badge variant="outline" className={`integration-state ${integration.state === "Demo mode" ? "demo-state" : ""}`}>{integration.state}</Badge></CardHeader><CardContent><span className="provider-category">{integration.category}</span><h2>{integration.name}</h2><p>{integration.name.startsWith("0G") ? "Language-model inference for planning and specialist-agent reasoning." : integration.name === "Arkiv" ? "Queryable shared state for tasks, agent profiles, and execution events." : integration.name === "World ID" ? "Backend-verified human authorization for protected runtime actions." : "Paid agent-to-agent service calls with a verifiable testnet settlement."}</p><Separator className="detail-divider" /><div className="provider-footer"><span><Circle size={12} /> No credentials configured</span><Button variant="outline" size="sm" disabled>Configure later</Button></div></CardContent></Card>
  })}</div></>
}

export default App