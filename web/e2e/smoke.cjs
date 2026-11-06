// Browser smoke test: every page opens without script errors and keeps its key controls.
// Usage: node e2e/smoke.cjs [base-url]   (API and site must be running; Playwright must be installed)
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const PAGES = {
  "/": ["#smartQ", "#q-brand", "#q-model", "#q-year", "#qBody", "#qFuel", "#qTrans", "#qBudget"],
  "/catalog": ["#f-q", "#f-brand", "#f-model", "#f-year", "#f-body", "#f-fuel", "#f-trans", "#f-drive", "#f-max", "#f-sort", ".car"],
  "/models": [".model-tile"],
  "/models/Toyota/Camry": [".tl-bar", ".car"],
  "/models/Fiat": [".model-tile"],
  "/models/Fiat/Panda": [".car"],
  "/cars/toyota-camry-xv70": ["#car-year", ".year-bars", ".spec-grid", "svg[aria-label^='Вартість через 3 роки']", "h3:text('Відгуки власників')"],
  "/compare": ["table.cmp", "select[aria-label^='Рік випуску']"],
  "/tco": ["#e-km", "#e-petrol", "#e-rate", "select[aria-label^='Рік випуску']", "#sc-car"],
  "/rating": ["#rt-brand", "#rt-model", "#rt-year", "#rt-trans", "#rt-drive", "#rt-fuel", "#rt-body", ".rank-item"],
  "/check": ["#c-id", "#c-year", "#c-km", "#c-price", "#c-vin"],
  "/assistant": ["input[aria-label='Ваше запитання']"],
  "/customs": ["#cu-price", "#cu-year", "#cu-fuel", "#cu-cc", ".stats"],
  "/account": ["#a-email", "#a-pass"],
};

(async () => {
const browser = await chromium.launch();
const failures = [];
for (const [path, selectors] of Object.entries(PAGES)) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  for (const sel of selectors) {
    try {
      await page.locator(sel).first().waitFor({ timeout: 5000 });
    } catch {
      failures.push(`${path}: не знайдено ${sel}`);
    }
  }
  errors.forEach((e) => failures.push(`${path}: помилка скрипту: ${e}`));
  await page.close();
}

// The model filter must narrow the catalogue (regression: filters disappearing or not applying).
const page = await browser.newPage();
await page.goto(BASE + "/catalog", { waitUntil: "networkidle" });
// typed in Cyrillic, as people do: the suggestion picks Toyota Camry
await page.fill("#f-model", "камрі");
await page.waitForSelector("[role=option]:has-text('Camry')");
await page.keyboard.press("Enter");
await page.waitForTimeout(1000);
const titles = await page.locator(".car .crumb").allTextContents();
if (!titles.length || titles.some((t) => !t.includes("Camry"))) failures.push(`/catalog: фільтр моделі не спрацював (${titles.length} карток)`);
await browser.close();

if (failures.length) {
  console.error("Smoke test failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Smoke test passed: ${Object.keys(PAGES).length} pages`);
})();
