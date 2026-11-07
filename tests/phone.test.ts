import { X509Certificate } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import { createApp } from "../server/api/app"
import { testConfig } from "../server/config"
import { createPhoneApp, isLoopback, PHONE_TOKEN_HEADER, PhoneAccess } from "../server/phone/access"
import { makeRuntime } from "./helpers"

const dirs: string[] = []
async function stateDir() {
  const dir = await mkdtemp(join(tmpdir(), "voxmesh-phone-"))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function setup(cfg: Record<string, string> = {}) {
  const dir = await stateDir()
  const access = await PhoneAccess.load(testConfig({ PHONE_STATE_DIR: dir, ...cfg }), ["192.168.1.20"])
  const { rt } = await makeRuntime({ cfg })
  const token = new URL((await access.pairing()).url!).hash.replace("#pair=", "")
  return { dir, access, rt, token, phone: createPhoneApp(rt, access) }
}

describe("phone pairing state", () => {
  it("creates a persistent token and a certificate for the LAN address", async () => {
    const { dir, token } = await setup()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const again = await PhoneAccess.load(testConfig({ PHONE_STATE_DIR: dir }), ["192.168.1.20"])
    const info = await again.pairing()
    expect(info.url).toBe(`https://192.168.1.20:5443/phone#pair=${token}`)
    expect(info.qrSvg).toMatch(/^<svg/)
    const cert = new X509Certificate(again.tls().cert)
    expect(cert.subjectAltName).toContain("IP Address:192.168.1.20")
    expect(info.certFingerprint).toBe(cert.fingerprint256)
  })

  it("rotates the token and reissues the certificate when the LAN address changes", async () => {
    const { dir, access, token } = await setup()
    await access.rotate()
    expect(access.verify(token)).toBe(false)
    const moved = await PhoneAccess.load(testConfig({ PHONE_STATE_DIR: dir }), ["10.0.0.5"])
    expect(new X509Certificate(moved.tls().cert).subjectAltName).toContain("IP Address:10.0.0.5")
  })
})

describe("phone listener", () => {
  it("serves the page without a token but gates every API route", async () => {
    const { phone, token } = await setup()
    const page = await request(phone).get("/phone")
    expect(page.status).toBe(200)
    expect(page.headers["content-security-policy"]).toMatch(/default-src 'none'/)
    expect(page.text).toContain("Tap to speak")
    expect(page.text).not.toContain(token)

    expect((await request(phone).get("/api/health")).status).toBe(401)
    expect((await request(phone).get("/api/health").set(PHONE_TOKEN_HEADER, "x".repeat(43))).status).toBe(401)
    expect((await request(phone).get("/api/health").set(PHONE_TOKEN_HEADER, token)).body.data.paired).toBe(true)
  })

  it("exposes only the allowlisted routes", async () => {
    const { phone, token } = await setup()
    for (const path of ["/api/agents", "/api/identity/status", "/api/phone/pairing", "/api/integrations/status"]) {
      expect((await request(phone).get(path).set(PHONE_TOKEN_HEADER, token)).status, path).toBe(404)
    }
    expect((await request(phone).post("/api/agents/register").set(PHONE_TOKEN_HEADER, token).send({ id: "research" })).status).toBe(404)
    expect((await request(phone).get("/api/samples").set(PHONE_TOKEN_HEADER, token)).body.data.length).toBeGreaterThan(0)
  })

  it("starts a workflow attributed to the paired phone and lets the phone poll it", async () => {
    const { phone, token } = await setup()
    const started = await request(phone)
      .post("/api/orchestrator/execute")
      .set(PHONE_TOKEN_HEADER, token)
      .send({ command: "hello, what can you do?", channel: "voice", contractSource: "ignored" })
    expect(started.status).toBe(202)
    expect(started.body.data.initiatedBy).toMatchObject({ subject: "paired-phone", verified: false })
    const polled = await request(phone).get(`/api/executions/${started.body.data.id}`).set(PHONE_TOKEN_HEADER, token)
    expect(polled.status).toBe(200)
    expect(polled.body.data.command).toBe("hello, what can you do?")
  })

  it("refuses phone workflows when the server requires a verified human", async () => {
    const { phone, token } = await setup({ WORKFLOW_REQUIRES_HUMAN: "true" })
    const res = await request(phone).post("/api/orchestrator/execute").set(PHONE_TOKEN_HEADER, token).send({ command: "hello there", channel: "text" })
    expect(res.status).toBe(403)
  })
})

describe("laptop pairing endpoint", () => {
  it("returns the QR only to loopback callers", async () => {
    const { rt, access } = await setup()
    const res = await request(createApp(rt, access)).get("/api/phone/pairing")
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ enabled: true, urls: ["https://192.168.1.20:5443/phone"] })
    expect((await request(createApp(rt, null)).get("/api/phone/pairing")).body.data.enabled).toBe(false)
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true)
    expect(isLoopback("192.168.1.30")).toBe(false)
  })
})
