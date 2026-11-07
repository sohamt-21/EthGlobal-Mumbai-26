// Exports the VoxMesh logo set to PNG. Usage: node docs/brand/export.mjs
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium } from "playwright"

const here = dirname(fileURLToPath(import.meta.url))
const url = (f) => pathToFileURL(join(here, f)).href
let browser
try { browser = await chromium.launch() } catch { browser = await chromium.launch({ channel: "chrome" }) }
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })

// Square assets: render each SVG at 1024px on a transparent page.
for (const [svg, png] of [
  ["voxmesh-mark.svg", "voxmesh-mark-1024.png"],
  ["voxmesh-mark-on-light.svg", "voxmesh-mark-on-light-1024.png"],
  ["voxmesh-icon-dark.svg", "voxmesh-icon-dark-1024.png"],
  ["voxmesh-icon-light.svg", "voxmesh-icon-light-1024.png"],
]) {
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${url(svg)}" width="1024" height="1024" style="display:block"></body></html>`)
  await page.waitForLoadState("load")
  await page.screenshot({ path: join(here, png), omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } })
  console.log("wrote", png)
}

// Horizontal lockups (mark + wordmark) with transparent background.
await page.setViewportSize({ width: 2000, height: 600 })
for (const on of ["dark", "light"]) {
  await page.goto(`${url("lockup.html")}?on=${on}`)
  await page.evaluate(() => document.fonts.ready)
  const box = await page.locator("#lock").boundingBox()
  await page.screenshot({ path: join(here, `voxmesh-logo-on-${on}.png`), omitBackground: true, clip: box })
  console.log("wrote", `voxmesh-logo-on-${on}.png`, Math.round(box.width), "x", Math.round(box.height))
}
await browser.close()
