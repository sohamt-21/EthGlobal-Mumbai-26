import { EventEmitter } from "node:events"
import type { AgentMessage, MessageType, RuntimeEvent } from "../../shared/schemas"
import { newId, nowIso } from "../lib/async"
import { forbidden } from "../lib/errors"

/**
 * Supervisor–Worker message bus. Specialists may only address the Supervisor; the Supervisor may
 * address any registered agent. Every message carries a correlation id (the delegation it belongs to).
 */
export class AgentMessageBus {
  private readonly emitter = new EventEmitter()

  constructor(private readonly supervisorId = "supervisor") {
    this.emitter.setMaxListeners(200)
  }

  create(input: {
    workflowId: string
    taskId: string
    correlationId: string
    from: string
    to: string
    type: MessageType
    payload: Record<string, unknown>
  }): AgentMessage {
    if (input.from !== this.supervisorId && input.to !== this.supervisorId) {
      throw forbidden(`Direct agent-to-agent messages are not allowed (${input.from} → ${input.to}); route through the Supervisor`)
    }
    return {
      id: newId("msg"),
      correlationId: input.correlationId,
      workflowId: input.workflowId,
      taskId: input.taskId,
      senderAgentId: input.from,
      receiverAgentId: input.to,
      messageType: input.type,
      payload: input.payload,
      timestamp: nowIso(),
    }
  }

  publish(message: AgentMessage) {
    this.emit({ id: newId("evt"), workflowId: message.workflowId, type: "message", message, timestamp: nowIso() })
  }

  emit(event: RuntimeEvent) {
    this.emitter.emit("event", event)
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.emitter.on("event", listener)
    return () => this.emitter.off("event", listener)
  }
}
