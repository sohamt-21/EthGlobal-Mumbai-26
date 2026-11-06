I would change the direction quite significantly.

If your objective is to build something highly technical, architecture-heavy and capable of competing across multiple ETHGlobal bounty tracks in just 24 hours, I would not build a conventional voice-controlled Web3 wallet.

I would turn the idea into a voice-driven, multi-agent execution and coordination framework.

The voice interface becomes just the entry point. The actual project is the underlying infrastructure:
- Autonomous agent orchestration.
- Cryptographically verifiable agent identities.
- Agent-to-agent communication.
- Persistent agent memory and shared state.
- LLM-powered planning and tool selection.
- Blockchain-aware tool execution.
- Transaction authorization and execution tracing.
This gives you a much more technically interesting hackathon project, and it can demonstrate several infrastructure tracks without needing to solve a large real-world consumer problem.
1. Repositioning the project
VoxMesh
A Voice-Driven Multi-Agent Web3 Runtime







pandascodingschool.com


Problem statement

Current AI agents are largely isolated, centrally orchestrated and difficult to coordinate across decentralised systems. They lack interoperable identity, verifiable delegation, persistent shared state and transparent execution histories.

Proposed solution

VoxMesh is a modular multi-agent runtime where users can initiate complex tasks through voice or text, and autonomous agents collaborate through identity-aware communication, shared memory, LLM-based planning and verifiable tool execution.

The objective is not to build a wallet or a DeFi product.

The objective is to demonstrate how a decentralised ecosystem of specialised AI agents can operate together.

Core technical thesis:

"Every agent has an identity, every task has a trace, every delegation has context, and every execution has an auditable outcome."

2. ETHGlobal Mumbai — bounty opportunities
I checked the ETHGlobal Mumbai 2026 prize information and the available sponsor tracks.

There is a useful distinction here: some tracks reward consumer applications, while others reward infrastructure, agent systems, identity, payments and developer tooling.

For VoxMesh, I would prioritise the latter.

Research based on the ETHGlobal Mumbai 2026 prize listings available on November 6, 2026.
Bounties worth targeting









1. 0G
Excellent fit
$15,000
AI inference, verifiable model execution, private compute and agent infrastructure.

Particularly relevant: 0G Private Computer, which provides an OpenAI-compatible interface to 100+ models and supports verified runs with request IDs. 
EthGlobal


Potential integration: Every specialist agent performs inference through 0G, with verifiable execution records.
Official 0G bounty details











2. World
Excellent fit
$12,500
World ID Agent Pass and IDKit.

Potential integration: Give each human a verified identity and use it to establish ownership, permissions and delegation for AI agents.

Potential demo: Only an authenticated user can authorise a particular agent to execute a task.
Official World bounty details











3. Hedera
Excellent fit
$15,000
AI agents that pay through x402, including agent-to-agent payments.

Potential integration: Agents discover another agent's service, negotiate a task and pay for execution.

Potential demo: A supervisor pays a specialist agent for a task using x402.
Official Hedera bounty details











4. ENS
Excellent fit
$10,000
ENSv2 and agent-readable identity/naming.

Potential integration: Give agents human-readable names and resolve their identity, service endpoints and associated records.

Potential demo: wallet-agent.eth and security-agent.eth resolve to their respective agent endpoints.
Official ENS bounty details











5. Arkiv
Strong technical fit
Prize pool: $15,000

Persistent, decentralised application data infrastructure.

Potential integration: Store agent state, task histories, execution events and shared knowledge in a decentralised data layer.
Official Arkiv bounty details











6. Ethereum Foundation
Advanced infrastructure
Prize pool: $15,000

Anon-RPC, Frame Transaction alternative mempool and CROPS applications.

Potential integration: Explore private RPC and alternative transaction submission as part of agent execution.
Official Ethereum Foundation bounty details


Other sponsors worth considering include Arc, Uniswap, 1inch, Chainlink, Definitive and Whitechain. However, I would not dilute the project by integrating all of them.

The prize listings and sponsor pool figures are also not the same as a guaranteed award for an individual project. Each bounty has separate qualification criteria. 
Coindaro+1

3. The best project concept: VoxMesh — Agent Infrastructure Runtime
I would combine four technical capabilities into one demonstrable system.
VoxMesh
A decentralised runtime for identity-aware, collaborative and economically autonomous AI agents.
Agent intelligence

LLM-powered planning and reasoning


Agent identity

Verifiable identity and delegation


Shared agent memory

Decentralised coordination state


Agent economy

Autonomous service payments




The four technical pillars
Pillar 1 — Agent identity and trust
Every agent should have an identity independent of the user operating it.

For example:
Agent	Identity
Supervisor	supervisor.voxmesh.eth
Research Agent	research.voxmesh.eth
Security Agent	security.voxmesh.eth
Execution Agent	executor.voxmesh.eth

Identity should include:
- Unique agent identifier.
- Owner or creator.
- Agent capabilities.
- Public endpoint.
- Supported protocols.
- Delegation permissions.
- Reputation or execution history.
Technology integrations:
- ENS for human-readable agent names and records.
- World ID Agent Pass for verifying the human who owns or authorises an agent.
- Optionally ERC-8004-compatible agent identity and reputation concepts if you have time.
Important distinction: ENS names identify agents, whereas World ID verifies a human credential. They solve different trust problems.
Pillar 2 — Agent intelligence and orchestration
Use an LLM-based supervisor that dynamically determines which agents need to participate.

For example:

User says:

"Research this smart contract, ask the security agent to review it, and prepare a summary."

The supervisor generates a plan:
{
  "task": "contract_analysis",
  "steps": [
    {
      "agent": "research",
      "action": "inspect_contract"
    },
    {
      "agent": "security",
      "action": "audit_contract"
    },
    {
      "agent": "supervisor",
      "action": "combine_results"
    }
  ]
}


The agents execute independently and return structured outputs.

Technology: 0G Private Computer for the actual inference calls, using its OpenAI-compatible API.

A particularly important demo element is capturing the inference request IDs and showing which model generated each agent's output.

This is more than simply connecting an LLM API. Your project should demonstrate how the execution infrastructure contributes to the agent runtime. 
EthGlobal+1

Pillar 3 — Decentralised agent coordination database
This is where I would use Arkiv.

Instead of keeping all agent state in PostgreSQL, use Arkiv for the shared, queryable coordination layer.

Consider these entities:
Entity	Example data
AgentRegistry	Agent ID, owner, capabilities, endpoint
TaskRegistry	Task ID, assigned agent, status
AgentMessages	Sender, receiver, message reference
ExecutionTrace	Agent, action, result, timestamp
AgentReputation	Completed tasks, failures, ratings

The particularly interesting feature is that Arkiv entities have ownership and configurable expiration.

For example:
- A task can expire after 30 minutes.
- An agent can claim a task.
- Other agents can query active tasks.
- A completed task can have a permanent reference in your audit history, if you choose an appropriate retention policy.
Arkiv's bounty explicitly identifies ephemeral agent coordination state, tasks, bids and claims as a promising use case.
Strong database bounty alignment
But remember: you must actually write entities to Arkiv and demonstrate a user-facing feature that reads and queries them. Merely storing logs there is insufficient. 
EthGlobal

Pillar 4 — Agent-to-agent economy
This is an opportunity to make your framework much more technically impressive.

Imagine that agents can discover other agents and pay them for services.

Example:
- Supervisor needs a security audit.
- It discovers the Security Agent's endpoint.
- The endpoint requires payment.
- Supervisor makes a payment through x402.
- Security Agent executes the task.
- Result is returned to the supervisor.
For this, investigate Hedera's x402 bounty.

The official track requires a paid endpoint settled on Hedera, an agent/client that discovers the endpoint and completes a paid request without human approval, and a verifiable transaction ID.

Extra points are available for agent spending controls, identity/reputation, tamper-evident audit logs and multi-agent negotiation. 
EthGlobal

Strong additional bounty opportunity

4. Final system design — VoxMesh
This is the architecture I would actually implement.
#chatgpt-mermaid-_r_1lr_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_1lr_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_1lr_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_1lr_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_1lr_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-_r_1lr_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_1lr_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_1lr_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_1lr_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_1lr_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_1lr_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_1lr_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_1lr_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_1lr_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-_r_1lr_ p{margin:0;}#chatgpt-mermaid-_r_1lr_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_1lr_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_1lr_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_1lr_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-_r_1lr_ .label text,#chatgpt-mermaid-_r_1lr_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_1lr_ .node rect,#chatgpt-mermaid-_r_1lr_ .node circle,#chatgpt-mermaid-_r_1lr_ .node ellipse,#chatgpt-mermaid-_r_1lr_ .node polygon,#chatgpt-mermaid-_r_1lr_ .node path{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-_r_1lr_ .rough-node .label text,#chatgpt-mermaid-_r_1lr_ .node .label text,#chatgpt-mermaid-_r_1lr_ .image-shape .label,#chatgpt-mermaid-_r_1lr_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-_r_1lr_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-_r_1lr_ .rough-node .label,#chatgpt-mermaid-_r_1lr_ .node .label,#chatgpt-mermaid-_r_1lr_ .image-shape .label,#chatgpt-mermaid-_r_1lr_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-_r_1lr_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-_r_1lr_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_1lr_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-_r_1lr_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-_r_1lr_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-_r_1lr_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-_r_1lr_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-_r_1lr_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-_r_1lr_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-_r_1lr_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-_r_1lr_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_1lr_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_1lr_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-_r_1lr_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_1lr_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-_r_1lr_ .icon-shape,#chatgpt-mermaid-_r_1lr_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-_r_1lr_ .icon-shape p,#chatgpt-mermaid-_r_1lr_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-_r_1lr_ .icon-shape .label rect,#chatgpt-mermaid-_r_1lr_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-_r_1lr_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-_r_1lr_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-_r_1lr_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_1lr_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_1lr_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_1lr_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_1lr_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_1lr_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_1lr_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1lr_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_1lr_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1lr_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(153, 206, 255);}#chatgpt-mermaid-_r_1lr_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(153, 206, 255);}#chatgpt-mermaid-_r_1lr_ .node tspan[font-weight="normal"],#chatgpt-mermaid-_r_1lr_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-_r_1lr_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-width:1px;}#chatgpt-mermaid-_r_1lr_ .node rect,#chatgpt-mermaid-_r_1lr_ .node circle,#chatgpt-mermaid-_r_1lr_ .node ellipse,#chatgpt-mermaid-_r_1lr_ .node polygon,#chatgpt-mermaid-_r_1lr_ .node path{fill:rgb(0, 40, 77);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_1lr_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-_r_1lr_ .mermaid-decision .label-container{fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-dasharray:2,2;}#chatgpt-mermaid-_r_1lr_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-_r_1lr_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_1lr_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Agent EconomyDecentralised CoordinationLLM InfrastructureMulti-Agent RuntimeIdentity & Trust LayerVoice / InteractionService Discoveryx402 Payment ClientPaid Agent EndpointHedera NetworkArkiv Entity StoreTask RegistryAgent Shared StateExecution Records0G Private ComputerInference Request IDsSupervisor AgentLLM Task PlannerAgent Message BusResearch AgentSecurity AgentExecution AgentENS Agent NamesWorld ID Agent PassAgent Identity RegistryVoice InputSpeech to TextAgent Control DashboardText to SpeechUser





This architecture gives you five externally visible technical integrations:
Layer	Technology	Purpose
Identity	ENS + World ID	Agent naming and human authorisation
Intelligence	0G Private Computer	LLM inference
Coordination	Arkiv	Shared agent state
Communication	Agent message bus	Agent-to-agent task delegation
Economy	Hedera x402	Paid agent-to-agent service calls

Note that the message bus is your own runtime component; you do not need a separate distributed messaging infrastructure in 24 hours.
5. Bounty strategy — what to target
For a 24-hour build, I would target three primary bounties and one optional bounty.
Priority	Sponsor / track	Bounty	What you demonstrate
P0	0G Private Computer	$5,000	Actual agent inference with request IDs
P0	Arkiv — Build from scratch	$4,000	Queryable decentralised agent coordination
P1	World ID Agent Pass	$5,000	Human-authorised agent actions
P2	Hedera — Agents that pay	$6,500	Autonomous x402 agent-to-agent payments

These are individual prize categories, not guaranteed winnings. The sponsor pools are larger and include multiple prizes. 
EthGlobal+2

Why I would prioritise these
0G + Arkiv + World is the best combination for your original technical concept.
- 0G demonstrates the intelligence infrastructure.
- Arkiv demonstrates decentralised agent state and coordination.
- World demonstrates identity and trust.
Hedera adds an entirely new dimension: an economic relationship between agents.

I would not implement Hedera until the first three integrations work.
Bounty-specific implementation details
0G — Non-negotiable implementation
Primary target
1. Make real inference calls through 0G Private Computer.
2. Use it in the main agent execution flow.
3. Store request IDs for each agent inference.
4. Show the model and corresponding request ID in the dashboard.
5. Demonstrate what would break if 0G were removed.
Avoid a generic chatbot that just happens to use 0G.

Official qualification: 0G Mumbai prize page

Arkiv — Non-negotiable implementation
Primary target
1. Register agent profiles as Arkiv entities.
2. Write tasks and task status to Arkiv.
3. Have agents query active tasks from Arkiv.
4. Demonstrate task claiming and completion.
5. Include entity schema, ownership and expiration in the repository.
Most importantly, show the UI retrieving active tasks from Arkiv, not merely writing data.

Official qualification: Arkiv Mumbai prize page

World — Identity implementation
Primary target
1. Integrate the official World ID Agent Pass.
2. Verify the credential on your backend.
3. Protect a meaningful agent action with that verification.
4. Show both successful and rejected/expired verification paths.
For example, an agent can prepare a task independently, but only an authorised human can approve a sensitive delegation.

Important: A normal wallet connection or login does not satisfy this bounty. Official World prize page

Hedera — Advanced implementation
Stretch target
1. Create a paid agent endpoint.
2. Protect it with x402.
3. Have another agent discover and call it.
4. Complete an actual payment on Hedera testnet.
5. Show the settlement transaction in HashScan.
A simulated payment will not satisfy the qualification. Official ETHGlobal prize listings

What about ENS?

I would use ENS names in the architecture if you can implement them quickly. It adds a very nice identity and discovery layer. But I would not make ENS registration a dependency for your main demo when you already have World ID as a primary identity target.
6. The 24-hour implementation plan
This is where I would be strict about scope.

You do not need seven agents, ten smart contracts or a sophisticated distributed network. You need a working multi-agent runtime that demonstrates the technical integrations convincingly.
MVP scope
Build only these three agents:
Agent	Responsibility	LLM required?
Supervisor	Understands commands and orchestrates agents	Yes
Research Agent	Analyses supplied content and generates findings	Yes
Security Agent	Reviews the findings and generates a risk assessment	Yes

Add one deterministic execution service for identity verification, Arkiv persistence and task status updates.
24-hour schedule
Build schedule
1. Hours 0–2: Foundation
   - Create React + TypeScript frontend.
   - Create Node.js backend.
   - Configure 0G API access.
   - Initialise Arkiv SDK.
   - Create repository and environment configuration.
2. Hours 2–6: Multi-agent runtime
   - Implement Supervisor Agent.
   - Implement Research Agent.
   - Implement Security Agent.
   - Create common agent interface.
   - Implement agent router and shared context.
   - Make actual 0G inference calls.
3. Hours 6–10: Arkiv integration
   - Register agents.
   - Create task entities.
   - Persist agent messages or message references.
   - Implement task claiming.
   - Query active tasks from Arkiv.
   - Show task lifecycle in UI.
4. Hours 10–14: Identity integration
   - Integrate World ID Agent Pass.
   - Implement backend verification.
   - Associate verified human authorisation with the agent.
   - Restrict a protected action to authorised users.
5. Hours 14–18: Frontend and voice
   - Build voice input.
   - Add live agent execution status.
   - Show agent-to-agent communication.
   - Display inference request IDs.
   - Show Arkiv task records.
   - Add identity verification state.
6. Hours 18–21: Testing and optional bounty
   - Test complete multi-agent workflow.
   - Handle agent failures and timeouts.
   - Verify Arkiv data retrieval.
   - Attempt Hedera x402 integration if the core system works.
7. Hours 21–24: Submission
   - Deploy frontend and backend.
   - Record a demo.
   - Complete README and architecture documentation.
   - Prepare bounty-specific explanations.
   - Verify all external links, transaction IDs and request IDs.

7. What the final demo should look like
I would make the demonstration technical rather than product-oriented.







dev.to


Imagine opening VoxMesh and seeing three agents registered.
Agent Runtime Dashboard
NETWORK STATUS
3 agents online



Supervisor Agent

supervisor.voxmesh.eth

Orchestrating


Research Agent

research.voxmesh.eth

Available


Security Agent

security.voxmesh.eth

Available


Execution trace
Task ID

VX-2026-001

Inference provider

0G Private Computer

Coordination storage

Arkiv

Identity

World ID

Task status
Completed


Agent activity
1. Supervisor received voice command
2. Research Agent invoked through 0G
3. Research Agent published result to Arkiv
4. Security Agent retrieved task from Arkiv
5. Security Agent generated risk assessment
6. Supervisor combined results
Execution completed
Illustrative dashboard state, not live execution data.

The actual voice demo
Say:

"VoxMesh, initiate a multi-agent workflow. Ask the research agent to analyse this smart contract, ask the security agent to review the research, and return a combined report."

The system should then visibly demonstrate:
1. Voice gets converted to text.
2. Supervisor creates an execution plan using 0G.
3. Supervisor identifies the agents.
4. Task is written to Arkiv.
5. Research Agent claims and executes the task.
6. Research results are stored in Arkiv.
7. Security Agent retrieves the task and performs its analysis.
8. Results are aggregated.
9. Dashboard displays inference IDs, agent identities and Arkiv entity references.
This is a much better technical demonstration than simply showing an AI agent sending cryptocurrency.
8. Suggested team division
If you have four people, I would divide responsibilities like this:
Person	Ownership
Developer 1	Supervisor, agent orchestration, 0G
Developer 2	Arkiv database, agent state, coordination
Developer 3	World ID, ENS, identity and trust
Developer 4	React frontend, voice interface, integration

One person should own end-to-end integration from the beginning. Don't wait until hour 18 to connect everything.
9. Final recommendation: What to build and what to skip
My recommended final scope
Build these
- Supervisor-based multi-agent runtime.
- Three specialised agents.
- Real 0G inference calls.
- Arkiv-based shared task coordination.
- World ID Agent Pass verification.
- Voice-driven execution.
- Execution observability dashboard.

Only if time permits
- ENS agent naming.
- Hedera x402 payments.
- ERC-8004 agent identity.
- Agent reputation system.
- Multi-chain execution.
- MCP server exposure.
  
  Don't build in 24 hours
- Seven or more independent LLM agents.
- A custom blockchain.
- A complete DeFi application.
- A general-purpose agent marketplace.
- A production-grade distributed messaging network.
- Complex smart contracts that aren't necessary for the demo.

10. One architectural decision I want you to consider
There is an even more interesting technical direction here.

Instead of thinking of VoxMesh as a multi-agent application, think of it as a miniature operating system for AI agents.
Operating system concept	VoxMesh equivalent
Process	Agent
Process scheduler	Supervisor
Process identity	Agent identity
Inter-process communication	Agent message bus
Shared memory	Arkiv
CPU / execution engine	LLM inference through 0G
Permissions	World ID + delegation policies
Resource allocation	Agent budgets
Process logs	Execution traces
Inter-process payments	x402

This gives you a much stronger technical narrative for judges.

My preferred positioning:

"VoxMesh is an identity-aware, decentralised runtime for autonomous AI agents, combining verifiable inference, persistent shared state, dynamic orchestration and programmable agent-to-agent communication."

One final point: I would make the agent runtime itself the core intellectual contribution. Integrations with 0G, Arkiv and World should be meaningful parts of that runtime, not separate sponsor logos added to the frontend.

That is the direction I would take for a 24-hour ETHGlobal build.

11. Implementation plan — coding VoxMesh end to end

This section turns the concept into a sequence of small, testable implementation steps. Build one vertical slice first: submit a text task, create a validated plan, run the Research and Security agents through 0G, persist/query task state through Arkiv, and render the resulting trace. Add voice and World authorization around that working path; treat Hedera payments and ENS as stretch work.

Development roadmap — build one step at a time

We will follow these project steps in order. At the end of each step, run its acceptance check before moving on. The detailed engineering checklist below expands these steps.

Step 1: Set up the project
- Create the TypeScript workspace with the web app, API, shared types, environment configuration, and development scripts.
- Start both apps locally and confirm the web app can reach the API health endpoint.
- Keep sponsor credentials in the API environment, never in frontend code.
- Acceptance check: a clean install starts both apps and the health check succeeds without sponsor credentials.

Step 2: Integrate 0G LLM inference
- Verify access to the current 0G Private Computer API and make one real inference request.
- Add a server-side 0G provider adapter that returns the model and request ID with the response.
- Add a clearly labeled fake provider for automated tests and offline development.
- Note: 0G is used here for language-model inference and agent reasoning; voice transcription is a separate feature in Step 8.
- Acceptance check: a test prompt reaches 0G from the API and the response model/request ID can be displayed.

Step 3: Build the three agents
- Define the shared agent input/output contract and validate structured outputs.
- Implement the Supervisor, Research, and Security agents using 0G.
- Restrict each agent to registered capabilities and known actions; do not execute arbitrary model-generated code or tools.
- Acceptance check: each agent returns schema-valid output through the common agent interface.

Step 4: Implement orchestration and execution trace
- Have the Supervisor create a plan, then validate it before running any step.
- Run Research, then Security, then Supervisor synthesis; record task and step state transitions.
- Emit ordered execution events with agent, status, timestamp, and inference receipt details.
- Acceptance check: an automated end-to-end test completes the workflow and reports useful partial results on a simulated failure.

Step 5: Integrate Arkiv coordination storage
- Register agent profiles and persist tasks, plans, status changes, and safe execution-event references.
- Query active tasks and task traces back from Arkiv; the app must display queried data, not only locally cached writes.
- Choose entity expiry and ownership rules, and never write secrets, World proofs, or sensitive raw prompts to public entities.
- Acceptance check: create a task, read it back from Arkiv, and show its lifecycle in the app.

Step 6: Add World ID authorization
- Integrate the official World ID Agent Pass flow and verify the result on the backend.
- Require authorization for approving a sensitive delegation or starting a protected execution.
- Show verified, rejected, expired, and unavailable states; do not treat wallet connection as World verification.
- Acceptance check: the API rejects an unverified protected action and accepts a valid backend-verified authorization.

Step 7: Build the API and runtime dashboard
- Add task, agent, authorization, execution, status, and trace endpoints with request/response validation.
- Show agents, task plan/status, live activity, final report, 0G request IDs, Arkiv entity references, and World authorization state.
- Include loading, empty, completed, and failure states. Keep text task entry as the baseline interaction.
- Acceptance check: a user can create, approve, execute, and inspect a complete task from the dashboard.

Step 8: Add voice input
- Add speech-to-text using browser speech recognition or a separately selected speech provider after checking browser/provider support.
- Show the recognized transcript for editing and confirmation before creating a task.
- Keep text entry fully usable; add text-to-speech only after speech input and the workflow are reliable.
- Acceptance check: voice and text create equivalent task requests, and unsupported browsers can still complete the workflow with text.

Step 9: Add ENS naming (optional)
- Resolve configured ENS names for agent display/discovery if the target network and records are available.
- Keep ENS naming separate from human authorization and allow the app to work when ENS is unavailable.
- Acceptance check: a configured name resolves to the expected agent metadata, with a graceful fallback on failure.

Step 10: Add Hedera x402 payments (stretch)
- Only after Steps 1–8 work, implement a real paid specialist endpoint and x402 client on Hedera testnet.
- Enforce a backend spending limit and human-approved budget; record the verified settlement transaction ID.
- Acceptance check: the agent completes a real testnet payment and the transaction can be verified in the explorer. A simulated payment does not pass this step.

Step 11: Test, deploy, and prepare the demo
- Run unit, integration, and browser workflow checks; verify real provider evidence and failure paths.
- Review secret handling, Arkiv data exposure, API limits, and mobile/keyboard usability.
- Document setup and architecture, deploy the working version, and prepare a repeatable demo runbook.
- Acceptance check: a fresh environment can reproduce the core flow and every sponsor integration shown in the demo has verifiable evidence.

The first development task is Step 1 only. Do not begin Step 2 until both apps run locally and the health check passes.

Implementation assumptions
- Use a TypeScript monorepo with a React + Vite frontend and a Node.js API. Prefer the team's familiar server framework; Fastify is a good default for typed request validation.
- Use pnpm workspaces, shared TypeScript types, Zod for runtime validation, and Vitest for unit/integration tests. Add Playwright only for the final browser workflow.
- Keep provider SDKs behind small adapters. Verify the current 0G, Arkiv, and World SDK/API requirements in the first milestone; do not let unverified SDK assumptions leak into agent logic.
- The API is the sole coordinator for the 24-hour demo. Agents are logical workers invoked by the runtime, not separate deployed services. This keeps task ordering and error handling visible and debuggable.
- Do not put secrets, World credentials, private prompts, or sensitive user data in browser code or public Arkiv entities. Persist only data safe to make public, or a content reference and integrity hash where appropriate.

Suggested repository layout
```text
apps/
   web/                       # React dashboard, task form, voice input
   api/                       # HTTP API, auth, workflow runtime
packages/
   contracts/                 # Zod schemas and shared API/domain types
   agent-runtime/             # planner, registry, orchestrator, event model
   providers/                 # 0G, Arkiv, World, ENS, Hedera adapters
   config/                    # shared lint/TypeScript configuration if useful
docs/
   architecture.md
   demo-runbook.md
```

Keep this layout lean: do not create a package unless it establishes a real ownership boundary. The API owns orchestration and provider credentials; the browser owns interaction and visualization.

Step 0 — Establish the runnable skeleton (hours 0–1)
1. Initialize the workspace, package scripts, formatter/linter, TypeScript configuration, and `.env.example`.
2. Create the web app and API health endpoint. Confirm both run locally and the browser can reach the API.
3. Define a shared error format, request ID/correlation ID, and environment validation that fails fast when a required configuration value is missing.
4. Add a short README with install, run, test, and required environment variable instructions.

Done when: a clean clone can install dependencies, start both apps, call the health endpoint, and run the test command without sponsor credentials.

Step 1 — Validate sponsor integration surfaces early (hours 1–2)
1. Create small provider spikes before building the main workflow: one 0G inference request, one Arkiv entity create/query round-trip, and one World Agent Pass verification round-trip using the current official SDK/API.
2. Record exact endpoint/network, required environment variables, response shape, request/entity IDs, rate limits, and any signature or callback requirements in `docs/architecture.md`.
3. Add interface contracts with a real adapter and a deterministic fake adapter for each provider. The fake mode must be explicit and visibly identified in the UI; it must never be presented as a real sponsor integration.
4. Set a short timeout on each spike. If a service is blocked by credentials/network/setup, continue the core application with the adapter boundary and surface the integration as unavailable rather than faking qualification evidence.

Done when: 0G request IDs and Arkiv entity IDs can be captured from real responses in the development environment, and World verification's backend contract is understood. If not, the rest of the project can still be developed against test adapters without claiming the unavailable integration works.

Step 2 — Define domain types and state transitions (hours 2–3)
Create shared schemas before writing UI-specific payloads.

Core records:
- `Agent`: stable ID, display name, optional ENS name, role, capabilities, endpoint/protocol metadata, status, and owner reference. Never include private keys.
- `Task`: ID, owner/session reference, user request, status, created/updated timestamps, expiry, ordered plan, current step, result reference, and error summary.
- `PlanStep`: step ID, agent ID, allowlisted action, input references, dependencies, and status.
- `AgentMessage`: task ID, sender/recipient agent IDs, message type, structured payload or safe reference, timestamp.
- `ExecutionEvent`: task ID, sequence, agent, event type, timestamp, safe summary, provider/model, inference request ID, and Arkiv entity ID when present.
- `InferenceReceipt`: provider, model, request ID, start/end time, and outcome. Do not store API keys or raw sensitive prompts in receipts.

Use explicit task states: `queued -> planning -> planned -> running -> completed`, with terminal `failed` and `cancelled` states. Each plan step moves `pending -> running -> completed|failed|skipped`. Validate every transition in one domain function; reject invalid transitions and duplicate completion.

Done when: schemas reject malformed plans, unregistered agent IDs, unsupported actions, and invalid state transitions in unit tests.

Step 3 — Build the 0G inference adapter and agent contract (hours 3–5)
1. Define an `InferenceProvider` interface with a structured chat/generation method that returns output, model name, provider, request ID, and timing metadata.
2. Implement the 0G adapter using the currently supported OpenAI-compatible API/SDK. Keep its API key server-side and redact request content from logs.
3. Implement `Agent.run(input, context)` with a typed input/output schema. Create the Supervisor, Research, and Security agents as separate prompt/configuration modules sharing this contract.
4. Require JSON-structured outputs for plans and agent results. Parse and validate them with Zod; retry a malformed response once with a repair instruction, then fail the step clearly.
5. Add timeouts, bounded retries for transient errors, and a configurable maximum output size. Preserve the provider request ID on success and on errors whenever returned.
6. Add fake inference responses for deterministic tests, but use real 0G calls in the actual demo path.

Supervisor planning policy:
- Ask the model for a plan, then validate it against the registered agents, allowed actions, maximum step count, and supported dependency rules.
- The model proposes work; application code decides whether it is permitted. Never execute arbitrary generated code, URLs, shell commands, or unregistered tools.
- Start with the fixed, reviewable sequence `research -> security -> supervisor synthesis`. Support dynamic selection only among those registered capabilities.

Done when: one request produces a validated plan and each real 0G call exposes provider/model/request ID to the caller; tests cover malformed output, timeout, and provider failure.

Step 4 — Implement the workflow runtime and trace (hours 5–7)
1. Implement `createTask`, `planTask`, `runStep`, `completeTask`, `failTask`, and `cancelTask` as explicit runtime operations.
2. Orchestrate the MVP sequence: Supervisor plans; Research analyzes the supplied contract/text; Security reviews the research and original input; Supervisor synthesizes the report.
3. Emit an `ExecutionEvent` before and after every meaningful operation, including provider calls, Arkiv writes/queries, authorization checks, and failures.
4. Attach task and correlation IDs to logs and provider calls. Return partial results and failed-step details when a later step fails; do not erase successful work.
5. Prevent concurrent duplicate execution for the same task in the single API process. Treat Arkiv task claims as coordination records, not as a distributed lock, unless the current Arkiv API provides and the implementation verifies atomic conditional updates.
`
Done when: a fake-provider end-to-end test runs the whole workflow, produces a stable ordered trace, and verifies failure recovery without involving the frontend.

Step 5 — Persist coordination state in Arkiv (hours 6–9)
1. Document the exact Arkiv entity schema, ownership model, query keys, and expiration policy. Include schema version and task/agent IDs in each entity.
2. Register the three agent profiles as entities at startup or through an explicit seed/registration command. Make registration idempotent.
3. Write task creation, plan, claims/step status, messages or safe message references, and completion/failure events as entities. Use short expiry for ephemeral tasks where supported; retain only the minimum audit record needed for the demo.
4. Implement `CoordinationStore` operations for create, update/append event, query active tasks, query task trace, and read agent profiles. Keep Arkiv SDK calls inside the adapter.
5. Make the dashboard's active-task list and task detail view read from Arkiv. Show entity IDs and timestamps so the integration is inspectable.
6. Handle network errors and eventual consistency explicitly: distinguish pending persistence from confirmed persistence, retry bounded transient failures, and report partial state instead of claiming a write succeeded when it did not.
7. Never store World ID proof material, credentials, secrets, or unredacted private data in public coordination entities. Use hashes and safe references for large/sensitive outputs.

Done when: an integration test creates a task, queries it back from Arkiv, observes its lifecycle, and the UI reads the returned task/trace rather than a hard-coded fixture.

Step 6 — Add human authorization with World ID (hours 8–11)
1. Integrate the official World ID Agent Pass / IDKit client flow using the current documented integration path.
2. Create a backend verification endpoint. The backend validates the proof/credential using the official verification mechanism and checks the configured app/action/audience fields; the browser's success callback alone is not authorization.
3. Bind successful verification to a short-lived server-side authorization record and the current user/session. Store only the minimum verification result/reference required; do not persist reusable proof material.
4. Protect a meaningful operation: approving the planned sensitive delegation or starting an execution that can incur cost. Read-only planning and demo browsing can remain available without verification.
5. Add clear verified, rejected, expired, and unavailable states. Provide a development-only test adapter that cannot be mistaken for verified production behavior.
6. Add tests for invalid proof, expired authorization, wrong action/audience, replay where applicable, and success.

Done when: an unverified request is rejected by the API, a valid verified session can approve the protected action, and the UI displays both outcomes. A wallet connection alone does not count as World verification.

Step 7 — Build the API surface and live dashboard (hours 9–13)

Suggested API contract (adapt paths to the chosen framework):
- `GET /api/health`: service and configured-provider readiness, without exposing secrets.
- `GET /api/agents`: registered agent profiles and capability/status metadata.
- `POST /api/tasks`: validate input, create the task, and return its ID.
- `POST /api/tasks/:id/plan`: create and persist a validated plan.
- `POST /api/tasks/:id/authorize`: verify/record the World authorization for the protected action.
- `POST /api/tasks/:id/run`: execute the approved task; stream events or return an execution handle.
- `GET /api/tasks?status=active`: query active tasks from Arkiv.
- `GET /api/tasks/:id`: return task, plan, results, and persisted trace.
- `POST /api/tasks/:id/cancel`: cancel a task that has not completed.

1. Validate every request and response at the API boundary. Apply payload size limits, rate limits for expensive operations, CORS allowlists, and consistent error responses.
2. Use Server-Sent Events for the live execution trace if time allows; otherwise poll the task detail endpoint at a modest interval. Persist events before broadcasting where practical.
3. Build a compact runtime dashboard: agent registry/status, task input form, task status/plan, ordered activity trace, final report, 0G receipts, Arkiv entity references, and World authorization state.
4. Clearly label provider connectivity and demo/fake mode. Never render fabricated request IDs, entity IDs, verification status, or payment transactions as live evidence.
5. Add empty, loading, partial-failure, retry, and completed states. Include a plain text task input before voice so the workflow remains usable when browser speech APIs are unsupported.

Done when: a user can create, inspect, approve, run, and review a task through the UI, with trace updates and real provider identifiers shown where available.

Step 8 — Add voice input and optional identity naming (hours 12–15)
1. Add browser speech-to-text behind a small `SpeechInput` component. Treat speech as an input convenience only: show the recognized transcript and let the user edit/confirm it before submission.
2. Keep the text input as the compatibility and accessibility path. Do not make the core workflow depend on speech recognition or text-to-speech.
3. Add optional text-to-speech for the final summary only if it does not delay the working trace/dashboard.
4. Add ENS resolution for configured agent names only if the relevant network and records are available. A display name is not proof of ownership or authorization; keep it independent from World verification.

Done when: a supported browser can dictate a task, the user can correct it, and the resulting task is identical to a text-submitted task. ENS is optional and must fail gracefully.

Step 9 — Add Hedera x402 as a stretch integration (hours 15–19, only after core passes)
1. Recheck the current ETHGlobal track requirements and official x402/Hedera libraries before implementation.
2. Make the Security Agent (or another specialist) a real paid endpoint with a documented service descriptor and price on Hedera testnet.
3. Have the Supervisor discover that endpoint and complete a paid request through x402 without a manual payment click in the agent flow, within a server-enforced per-task and per-session spend limit.
4. Require human approval for enabling a budget or raising its limit. Never expose signing keys in the browser; use a testnet-only backend signer and the official settlement flow.
5. Persist the payment intent, settlement result, and verifiable transaction ID in the task trace. Link to the appropriate explorer only after confirming the transaction exists.
6. Test rejected/over-budget requests and failed settlement. Do not substitute a simulated payment and describe it as a completed integration.

Stop this stretch if the core demo is not stable by hour 15. ENS, ERC-8004, reputation, and extra agents remain lower-priority than a reliable x402 path.

Step 10 — Verify the whole system and prepare submission (hours 19–24)
1. Run unit tests for schemas, state transitions, planner validation, authorization policy, retry behavior, and provider adapters.
2. Run integration tests for the complete workflow against fakes, then smoke-test real 0G and Arkiv. Verify actual World rejection and success paths where credentials permit.
3. Run the browser flow at desktop and mobile sizes. Check transcript editing, long outputs, loading states, partial failures, keyboard operation, and visible real-versus-demo provider states.
4. Check logs and UI for secrets, proofs, private prompts, personal data, and misleading fabricated identifiers. Confirm no private key is bundled into frontend assets.
5. Write `docs/architecture.md` with a component diagram, entity schemas, task state machine, trust boundaries, environment setup, and known limitations. Write `docs/demo-runbook.md` with a resettable, timed demo sequence.
6. Deploy only after environment variables, CORS, API URL, provider networks, and testnet links are verified. Keep a local fallback demo using explicitly labeled fake adapters if venue connectivity fails.
7. Capture evidence for each integration: 0G model/request IDs, Arkiv entity IDs queried by the UI, World backend verification result, and Hedera transaction ID if implemented.

Final acceptance checklist
- A text task can run through Supervisor, Research, and Security and return a combined report.
- The plan is validated against registered agents and allowlisted actions before execution.
- Every task has a visible, ordered execution trace and actionable failure state.
- Real 0G inference participates in the main flow and its model/request IDs are visible.
- Task/agent coordination is written to and read back from Arkiv; the dashboard queries that data.
- A protected action is enforced by backend-verified World authorization, with failure paths demonstrated.
- Voice is an optional input path; text input remains fully functional.
- No secrets or proof material are exposed to the browser or written to public entities.
- Hedera x402 is claimed only if a real Hedera testnet settlement and verifiable transaction ID are present.
- The repository includes reproducible setup, tests, architecture notes, and a demo runbook.

24-hour critical path
```text
Runnable skeleton
   -> verified provider spikes
   -> typed domain/state machine
   -> 0G agents + workflow trace
   -> Arkiv persistence and query
   -> dashboard vertical slice
   -> World-protected action
   -> voice input and polish
   -> Hedera x402 stretch
   -> tests, deployment, submission evidence
```

If the schedule slips, cut in this order: text-to-speech, ENS, extra agent capabilities, advanced planner dynamics, then Hedera. Do not cut backend authorization, real 0G inference, Arkiv read-after-write in the UI, or a complete trace; those are the core proof points.