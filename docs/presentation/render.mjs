// Renders every slide-*.html in this folder to 4K PNGs (dark + light).
// Usage: node docs/presentation/render.mjs
import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium } from "playwright"

const here = dirname(fileURLToPath(import.meta.url))
const slides = readdirSync(here).filter((f) => /^slide-.*\.html$/.test(f)).sort()
let browser
try {
  browser = await chromium.launch()
} catch {
  browser = await chromium.launch({ channel: "chrome" })
}
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
for (const slide of slides) {
  for (const theme of ["dark", "light"]) {
    await page.goto(`${pathToFileURL(join(here, slide)).href}?theme=${theme}`)
    await page.evaluate(() => document.fonts.ready)
    const out = join(here, slide.replace(/\.html$/, `-${theme}.png`))
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1920, height: 1080 } })
    console.log("wrote", out)
  }
}
await browser.close()
