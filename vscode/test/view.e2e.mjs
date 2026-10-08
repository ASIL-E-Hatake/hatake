#!/usr/bin/env node
// ツリーから開く画面（タブ付き）を本物のブラウザで描いて確かめる（puppeteer の部屋で動く）。
//
//   docker run --rm -v "<リポジトリ>/vscode:/x" ghcr.io/puppeteer/puppeteer:latest \
//     sh -c "cp /x/test/view.e2e.mjs . && node view.e2e.mjs /x/dist"
//
// 器（dist/view-harness.html）は Webview と同じ関数で作ったもの。中身は tool/preview-cases.mjs
// が view.ts と同じ作り方で作ったもの。渡す口も同じ（postMessage の show）。

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import puppeteer from "puppeteer";

const DIST = process.argv[2] ?? "dist";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((req, res) => {
  try {
    const path = join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
    const body = readFileSync(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const cases = JSON.parse(readFileSync(join(DIST, "view-cases.json"), "utf8"));
const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "OK  " : "NG  "} ${what}`);
  if (!ok) failures.push(what);
};

try {
  for (const one of cases) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${base}/view-harness.html`, { waitUntil: "load" });
    await page.evaluate((message) => window.postMessage(message, "*"), one.message);
    await new Promise((done) => setTimeout(done, 1200));

    const title = await page.$eval('[data-hatake="view-title"]', (el) => el.textContent);
    check(title === one.message.title, `${one.name}: 題名が出る（${title}）`);
    const active = await page.$eval(".hatake-view-tabs .is-active", (el) => el.getAttribute("data-hatake"));
    check(active === `view-tab:${one.expect.tab}`, `${one.name}: 開くタブ（${active}）`);
    const visible = await page.$eval(`[data-hatake="view-pane:${one.expect.tab}"]`, (el) => !el.hidden);
    check(visible, `${one.name}: そのタブの中身が見える`);
    if (one.expect.rows) {
      const rows = (await page.$$('#app [data-hatake^="row:"]')).length;
      check(rows > 0, `${one.name}: 画面のタブに作り物の行が並ぶ（${rows} 行）`);
    }
    if (one.expect.hit !== undefined) {
      const hit = await page.$(`[data-hatake="${one.expect.hit}"].hatake-view-hit`);
      check(hit !== null, `${one.name}: 選んだ行が光る（${one.expect.hit}）`);
    }
    if (one.expect.matrix) {
      const cells = await page.$$eval(".hatake-view-matrix td", (all) => all.map((td) => td.textContent));
      check(cells.includes("○") && cells.includes("－"), `${one.name}: 見える・見えないの表が出る`);
    }
    // どの前書きで見た紙かを言う（前書きが無ければ、無いと言う）。
    const said = await page.$eval('[data-hatake="view-project"]', (el) => el.textContent ?? "");
    check(
      one.expect.project === undefined ? said.includes("ありません") : said.includes(one.expect.project) && said.includes("答え済み"),
      `${one.name}: 前書きの行（${said.slice(0, 50)}）`,
    );
    if (one.expect.gone !== undefined) {
      check((await page.$(`[data-hatake="${one.expect.gone}"]`)) === null, `${one.name}: 前書きで答えた問いは出ない（${one.expect.gone}）`);
    }
    // どのタブにも数が付き、確認のタブは AI と同じ紙の数。
    const tabs = await page.$$eval(".hatake-view-tabs button", (all) => all.map((b) => b.textContent));
    check(tabs.length === 5 && tabs.some((t) => t.startsWith("確認 ⚠")), `${one.name}: 5つのタブ（${tabs.join(" / ")}）`);
    check(errors.length === 0, `${one.name}: ブラウザのエラーが無い${errors.length ? `（${errors[0].slice(0, 80)}）` : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} 件が期待と違います。`);
  process.exit(1);
}
console.log("\nすべて期待どおり。");
