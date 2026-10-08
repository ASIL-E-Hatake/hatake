#!/usr/bin/env node
// プレビューを本物のブラウザで描いて確かめる（2段目。puppeteer の部屋で動く）。
//
//   docker run --rm -v "<リポジトリ>/vscode:/x" ghcr.io/puppeteer/puppeteer:latest \
//     sh -c "cp /x/test/preview.e2e.mjs . && node preview.e2e.mjs /x/dist"
//
// 器（dist/preview-harness.html）は Webview と同じ関数で作ったもの。中身は
// tool/preview-cases.mjs が拡張機能と同じ作り方で作ったもの。渡す口も同じ（postMessage）。
// 見るのは `data-hatake` の印だけ（Renderer の中は読まない）。

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import puppeteer from "puppeteer";

const DIST = process.argv[2] ?? "dist";
/** 渡されたら、1件ずつ画面を撮って置く（見た目を目で確かめる用）。 */
const SHOTS = process.argv[3];
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

const cases = JSON.parse(readFileSync(join(DIST, "preview-cases.json"), "utf8"));
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
    await page.goto(`${base}/preview-harness.html`, { waitUntil: "load" });
    await page.evaluate((message) => window.postMessage(message, "*"), one.message);
    await new Promise((done) => setTimeout(done, 1200));

    const boot = await page.$eval('[data-hatake="boot-error"]', (el) => el.textContent).catch(() => null);
    if (one.expect.error !== undefined) {
      check(boot !== null && boot.includes(one.expect.error), `${one.name}: 理由が出る（${(boot ?? "出ない").slice(0, 60)}）`);
    } else {
      check(boot === null, `${one.name}: 読めて描ける${boot ? `（${boot.slice(0, 80)}）` : ""}`);
    }
    if (one.expect.rows) {
      const rows = (await page.$$('[data-hatake^="row:"]')).length;
      check(rows > 0, `${one.name}: 作り物の行が並ぶ（${rows} 行）`);
    }
    if (one.expect.menu) {
      const menu = (await page.$$('[data-hatake^="menu:"], nav a, nav button')).length;
      check(menu > 0, `${one.name}: メニューが出る（${menu} 件）`);
    }
    if (one.expect.roles !== undefined) {
      const options = await page.$$eval('[data-hatake="preview-role"] option', (all) => all.map((o) => o.value).filter(Boolean));
      check(JSON.stringify(options) === JSON.stringify(one.expect.roles), `${one.name}: 役割を切り替えられる（${options.join(", ")}）`);
    }
    const label = await page.$eval('[data-hatake="preview-data"]', (el) => el.textContent).catch(() => "");
    if (one.expect.error === undefined) check(label.includes("作り物"), `${one.name}: データの出どころが出る（${label}）`);
    check(errors.length === 0, `${one.name}: ブラウザのエラーが無い${errors.length ? `（${errors[0].slice(0, 80)}）` : ""}`);
    if (SHOTS !== undefined) {
      await page.setViewport({ width: 1200, height: 760 });
      await page.screenshot({ path: join(SHOTS, `${cases.indexOf(one) + 1}.png`) });
    }
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
