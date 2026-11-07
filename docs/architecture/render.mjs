// Renders architecture.html to 4K PNGs (dark + light). Usage: node docs/architecture/render.mjs
import { chromium } from "playwright"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const page_url = pathToFileURL(join(here, "architecture.html")).href
let browser
try {
  browser = await chromium.launch()
} catch {
  browser = await chromium.launch({ channel: "chrome" })
}
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
for (const theme of ["dark", "light"]) {
  await page.goto(`${page_url}?theme=${theme}`)
  await page.evaluate(() => document.fonts.ready)
  const out = join(here, `voxmesh-architecture-${theme}.png`)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1920, height: 1080 } })
  console.log("wrote", out)
}
await browser.close()
