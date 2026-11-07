import { z } from "zod"

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1")

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined))

const optionalLocalEndpoint = optionalString.pipe(
  z.string().url().optional().refine(
    (value) => !value || (new URL(value).protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname)),
    "must be a localhost HTTP endpoint",
  ),
)

const ConfigSchema = z.object({
  API_PORT: z.coerce.number().int().default(8787),
  /** Interface for the main API. Keep it on loopback; phones use the paired HTTPS listener instead. */
  API_HOST: z.string().default("127.0.0.1"),
  /** Serve the paired phone page on the LAN over HTTPS (self-signed certificate). */
  PHONE_ACCESS_ENABLED: bool,
  PHONE_HTTPS_PORT: z.coerce.number().int().min(1).max(65535).default(5443),
  /** Holds the phone pairing token and certificate; defaults to ~/.voxmesh/phone. */
  PHONE_STATE_DIR: optionalString,
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  AGENT_API_KEY: optionalString,
  WORKFLOW_REQUIRES_HUMAN: bool,
  MAX_AGENT_CALLS_PER_WORKFLOW: z.coerce.number().int().min(1).max(20).default(6),
  MAX_DELEGATION_DEPTH: z.coerce.number().int().min(1).max(5).default(2),
  AGENT_TASK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90_000),
  AGENT_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  METAMASK_EXTENSION_PATH: optionalString,
  METAMASK_PROFILE_PATH: optionalString,
  METAMASK_CDP_ENDPOINT: optionalLocalEndpoint,
  METAMASK_CONFIRMATION_TIMEOUT_MS: z.coerce.number().int().min(30_000).default(300_000),
  MINARA_API_KEY: optionalString,

  INFERENCE_MODE: z.enum(["auto", "zerog", "mock"]).default("auto"),
  ZG_API_KEY: optionalString,
  ZG_BASE_URL: z.string().url().default("https://router-api.0g.ai/v1"),
  ZG_MODEL: z.string().default("glm-5.2"),
  ZG_TRUST_MODE: optionalString,
  ZG_VERIFY_TEE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  ZG_DISABLE_THINKING: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  ZG_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60_000),

  ARKIV_MODE: z.enum(["auto", "arkiv", "memory"]).default("auto"),
  ARKIV_ACCESS_KEY: z.string().optional().default(""),
  ARKIV_PRIVATE_KEY: optionalString,
  ARKIV_WORKSPACE: z
    .string()
    .regex(/^[a-z0-9-]{3,64}$/)
    .default("voxmesh-ethglobal-mumbai"),
  ARKIV_TASK_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24),
  ARKIV_AGENT_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),

  WORLD_APP_ID: optionalString,
  WORLD_RP_ID: optionalString,
  WORLD_RP_SIGNING_KEY: optionalString,
  WORLD_ACTION: z.string().default("authorize-voxmesh-agents"),
  WORLD_ENVIRONMENT: z.enum(["production", "staging", "sandbox"]).default("production"),
  WORLD_VERIFY_BASE_URL: z.string().url().default("https://developer.worldcoin.org/api/v4/verify"),
  WORLD_ID_DEV_BYPASS: bool,
  IDENTITY_SESSION_TTL_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(60),
})

export type AppConfig = z.infer<typeof ConfigSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    throw new Error(`Invalid configuration: ${issues}`)
  }
  return parsed.data
}

/** Config for tests: mocks + in-memory store, no external calls. */
export function testConfig(overrides: Partial<Record<keyof AppConfig, string>> = {}): AppConfig {
  return loadConfig({
    INFERENCE_MODE: "mock",
    ARKIV_MODE: "memory",
    AGENT_API_KEY: "test-agent-key",
    AGENT_TASK_TIMEOUT_MS: "5000",
    ...overrides,
  } as NodeJS.ProcessEnv)
}
