// Accessibility audit (WCAG 2.1 A/AA rules of axe-core) for the main pages, in light and dark themes.
// Usage: node e2e/a11y.cjs [base-url]   (needs playwright and axe-core installed)
const { chromium } = require("playwright");
const axePath = require.resolve("axe-core/axe.min.js");

const BASE = process.argv[2] ?? "http://localhost:3000";
const PAGES = ["/", "/catalog", "/models", "/models/Toyota/Camry", "/cars/toyota-camry-xv70", "/compare", "/tco", "/customs",
  "/rating", "/check", "/assistant", "/account"];

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    for (const path of PAGES) {
      const page = await ctx.newPage();
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.addScriptTag({ path: axePath });
      const res = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n")[1]) , count: v.nodes.length }));
      });
      for (const v of res) problems.push({ scheme, path, ...v });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  if (problems.length) {
    for (const p of problems) console.log(`[${p.scheme}] ${p.path} — ${p.id} (${p.impact}, ${p.count}): ${p.help}\n    ${p.nodes.join("\n    ")}`);
    process.exit(1);
  }
  console.log(`Accessibility audit passed: ${PAGES.length} pages × 2 themes`);
})();
