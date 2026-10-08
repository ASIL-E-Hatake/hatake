#!/usr/bin/env node
// 手引きの画像を撮る（code-server を puppeteer で操作する）。tool/shots.sh から呼ぶ。
//
//   node shots.e2e.mjs <code-server の URL> <作業場> <画像の置き場> <版>
//
// 撮るだけでなく、**撮れたもの自体を確かめる**（ツリーに画面が並ぶか・タブが開くか・行が
// 光るか…）。撮れていない画像を手引きに貼らないため。

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const [BASE, PROJECT, OUT, VERSION] = process.argv.slice(2);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "OK  " : "NG  "} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860 });

/** code-server が立ち上がるまで待つ（拡張機能を入れてから起動するので少しかかる）。 */
async function open() {
  for (let i = 0; i < 60; i++) {
    try {
      await page.goto(`${BASE}/?folder=/home/coder/project`, { waitUntil: "networkidle2", timeout: 15_000 });
      await page.waitForSelector(".monaco-workbench", { timeout: 15_000 });
      await sleep(4000);
      return;
    } catch {
      await sleep(3000);
    }
  }
  throw new Error("code-server が立ち上がりませんでした。");
}

/** キー入力を VS Code に戻す（Webview の中に吸われないように、横の欄の見出しを押す）。 */
const focus = async () => {
  await page.mouse.click(150, 52);
  await sleep(300);
};

const key = async (...keys) => {
  for (const one of keys.slice(0, -1)) await page.keyboard.down(one);
  await page.keyboard.press(keys[keys.length - 1]);
  for (const one of keys.slice(0, -1).reverse()) await page.keyboard.up(one);
  await sleep(400);
};

/** コマンドを名前で呼ぶ（F1 → 名前 → Enter）。 */
async function command(title) {
  await focus();
  await key("F1");
  await page.keyboard.type(title, { delay: 15 });
  await sleep(700);
  await key("Enter");
  await sleep(1500);
}

/** ファイルを開く（Ctrl+P → 名前 → Enter）。 */
async function file(name) {
  await focus();
  await key("Control", "p");
  await page.keyboard.type(name, { delay: 15 });
  await sleep(800);
  await key("Enter");
  await sleep(2000);
}

async function closeAll() {
  await command("View: Close All Editors");
  await key("Escape");
}

/**
 * 左の欄の行を、字で探して押す（ツリー）。ツリーは見えている行しか作らないので、
 * 見つからなければ下へ（それでも無ければ上へ）転がして探す。
 */
async function tree(label) {
  for (let i = 0; i < 30; i++) {
    if (i > 0) {
      await page.mouse.move(200, 260);
      await page.mouse.wheel({ deltaY: i < 15 ? 220 : -220 });
      await sleep(300);
    }
    const rows = await page.$$(".sidebar .monaco-list-row");
    for (const row of rows) {
      const text = await row.evaluate((el) => el.querySelector(".label-name, .monaco-highlighted-label")?.textContent ?? "");
      if (text.trim() === label) {
        await row.click();
        await sleep(1500);
        // 押すとコマンドが走るが、開閉はしないことがある。閉じたままなら開く。
        if ((await row.evaluate((el) => el.getAttribute("aria-expanded"))) === "false") {
          await (await row.$(".monaco-tl-twistie"))?.click();
          await sleep(800);
        }
        return true;
      }
    }
    await sleep(500);
  }
  return false;
}

/** Webview の中（入れ子の iframe）を、目印の要素で探す。 */
async function frameWith(selector) {
  for (let i = 0; i < 20; i++) {
    for (const frame of page.frames()) {
      const found = await frame.$(selector).catch(() => null);
      if (found !== null) return frame;
    }
    await sleep(500);
  }
  return null;
}

const shot = async (name, clip) => {
  await page.screenshot({ path: join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
  console.log(`撮りました: ${name}.png`);
};

try {
  await open();

  // ── ツリーから開く ──────────────────────────────────────
  // 1. hatake の欄 → 画面を選ぶと、エディタ領域に画面（既定のタブ）
  await page.click('.activitybar [aria-label^="hatake"]');
  await sleep(2500);
  check(await tree("顧客マスタ"), "ツリーに定義が並び、画面を選べる");
  let view = await frameWith('[data-hatake="view-tabs"]');
  check(
    view !== null && (await view.$$('#app [data-hatake^="row:"]')).length > 0 && (await view.$eval(".is-active", (el) => el.textContent)).startsWith("画面"),
    "画面のタブが開き、作り物の行が並ぶ",
  );
  await shot("01-ツリーと画面");

  // 2. 入力欄の1つを選ぶ → 項目のタブで光る
  await tree("入力欄（4）");
  check(await tree("備考"), "入力欄の項目を選べる");
  view = await frameWith('[data-hatake="view-tabs"]');
  check(view !== null && (await view.$('[data-hatake="view-row:field:note"].hatake-view-hit')) !== null, "項目のタブで、選んだ行が光る");
  await shot("02-項目のタブ");

  // 3. app の画面の操作を選ぶ → 操作のタブで光る
  await tree("社員照会");
  await tree("操作（4）");
  check(await tree("昇給を一括承認"), "app の画面の操作を選べる");
  view = await frameWith('[data-hatake="view-tabs"]');
  check(view !== null && (await view.$('[data-hatake="view-row:action:approveRaise"].hatake-view-hit')) !== null, "操作のタブで、選んだ行が光る");
  await shot("03-操作のタブ");

  // 4. 権限のタブ（役割ごとに見える・押せる）
  if (view !== null) {
    await view.click('[data-hatake="view-tab:roles"]');
    await sleep(800);
  }
  check(view !== null && (await view.$$eval(".hatake-view-matrix td", (all) => all.map((td) => td.textContent))).includes("－"), "権限のタブに見える・見えないの表");
  await shot("04-権限のタブ");

  // 5. 人が決めることを選ぶ → 確認のタブで光る
  // 「人が決めること」の欄の最初の行（問いのアイコンの付いた行）を押す。
  const asks = await page.$$(".sidebar .monaco-list-row");
  for (const row of asks) {
    if ((await row.$(".codicon-question")) !== null) {
      await row.click();
      await sleep(1500);
      break;
    }
  }
  view = await frameWith('[data-hatake="view-tabs"]');
  check(view !== null && (await view.$(".hatake-view-question .hatake-view-hit")) !== null, "人が決めることを選ぶと、確認のタブで光る");
  await shot("05-確認のタブ");

  // 6. app の根を選ぶ → app ぜんぶ（メニューつき）。役割を切り替える
  await tree("人事管理");
  view = await frameWith('[data-hatake="preview-role"]');
  if (view !== null) {
    await view.select('[data-hatake="preview-role"]', "hr");
    await sleep(1500);
  }
  check(view !== null && (await view.$eval('[data-hatake="preview-role"]', (el) => el.value)) === "hr", "画面のタブで役割を hr に切り替えられる");
  await shot("06-役割の切り替え");

  // 7. 最初に開くタブの設定
  await command("Preferences: Open Settings (UI)");
  await sleep(1500);
  await page.keyboard.type("hatake.view.defaultTab", { delay: 15 });
  await sleep(2000);
  const setting = await page.$('.settings-editor [data-key="hatake.view.defaultTab"], .settings-editor .setting-item-contents');
  check(setting !== null, "設定に「最初に開くタブ」が出る");
  await shot("07-最初に開くタブの設定");

  // ── YAML の横で見る ─────────────────────────────────────
  // 8. プレビュー（YAML の横）
  await closeAll();
  await file("customer_master.yaml");
  await command("hatake: プレビューを開く（YAML の横）");
  let frame = await frameWith('[data-hatake="preview-bar"]');
  check(frame !== null && (await frame.$$('[data-hatake^="row:"]')).length > 0, "YAML の横のプレビューに作り物の行が並ぶ");
  await sleep(1000);
  await shot("08-YAMLの横のプレビュー");

  // 9. 問題の一覧（AI と同じ紙）
  await closeAll();
  await file("order_cancel.yaml");
  await sleep(2500);
  await key("Control", "Shift", "m");
  await sleep(1500);
  const problems = await page.$$eval(".markers-panel .monaco-tl-row", (rows) => rows.map((row) => row.textContent ?? ""));
  check(problems.some((one) => one.includes("hatake")), `問題の一覧に hatake の行が出る（${problems.length} 行）`);
  check(problems.some((one) => one.includes("人が決めること")), "人が決めることも一覧に載る（ヒントにすると消える）");
  await shot("09-問題の一覧");

  // 10. ホバー（キーの説明）
  await key("Control", "Shift", "m");
  await page.mouse.click(620, 300);
  await key("Control", "g");
  await page.keyboard.type("8", { delay: 15 }); // rowActions: の行（キーで始まる行）
  await key("Enter");
  await key("Home");
  await key("Control", "k");
  await key("Control", "i");
  await sleep(1500);
  check((await page.$(".monaco-hover:not(.hidden)")) !== null, "キーの説明（ホバー）が出る");
  await shot("10-ホバー");

  // 11. 読み返し（AI と同じ文）
  await key("Escape");
  await command("hatake: 読み返しを開く");
  await sleep(1500);
  const tabs = await page.$$eval(".tab", (all) => all.map((one) => one.textContent ?? ""));
  check(
    tabs.some((one) => one.includes("の読み返し")) && !tabs.some((one) => one.includes("Untitled")),
    "読み返しは読むだけの文書で開く（保存していないファイルにしない）",
  );
  await shot("11-読み返し");

  // 12. 書き間違い（白い画面にしない）
  await closeAll();
  await file("typo.yaml");
  await command("hatake: プレビューを開く（YAML の横）");
  frame = await frameWith('[data-hatake="preview-bar"]');
  const said = frame === null ? "" : await frame.$eval('[data-hatake="boot-error"]', (el) => el.textContent).catch(() => "");
  check(said.includes("tabel"), "書き間違えると、プレビューに理由が出る");
  await shot("12-書き間違い");

  // 13. スニペット（hatake new と同じ雛形）
  await closeAll();
  await file("new_page.yaml");
  await page.keyboard.type("hatake-crud", { delay: 30 });
  await key("Control", "Space");
  await sleep(1500);
  check((await page.$(".suggest-widget.visible")) !== null, "スニペットの候補が出る");
  await shot("13-スニペット");
  await key("Escape");
  await key("Control", "a");
  await key("Delete");
  await key("Control", "s");

  // 14. 版のずれ（案件の固定した版と違えば、状態バーで言う）
  writeFileSync(join(PROJECT, "hatake.version"), "v0.9.0\n");
  await command("Developer: Reload Window");
  await sleep(6000);
  await file("customer_master.yaml");
  await sleep(2500);
  const bar = await page.$$eval(".statusbar-item", (all) => all.map((one) => one.textContent ?? ""));
  check(bar.some((one) => one.includes(`hatake ${VERSION}`) && one.includes("0.9.0")), `状態バーに版のずれが出る（${bar.find((one) => one.includes("hatake")) ?? "出ない"}）`);
  await shot("14-版のずれ", { x: 700, y: 836, width: 740, height: 24 });
  writeFileSync(join(PROJECT, "hatake.version"), `v${VERSION}\n`);
} catch (error) {
  await page.screenshot({ path: join(OUT, "_failed.png") }).catch(() => undefined);
  failures.push(String(error?.message ?? error));
  console.error(error);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} 件が期待と違います（_failed.png を見てください）。`);
  process.exit(1);
}
console.log("\nすべて撮れました。");
