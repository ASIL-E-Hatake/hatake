#!/usr/bin/env node
// プレビューの試験に渡す中身を作る（1段目。Node で動く）。
//
//   node tool/preview-cases.mjs   … dist/preview-cases.json を書く
//
// 拡張機能（extension.ts）と**同じ作り方**で作る: 定義が要求している Repository を
// hatake_refs で引き、previewModel で作り物のデータと役割を起こす。2段目
// （test/preview.e2e.mjs）が puppeteer で器を開いて、同じ口（postMessage）で渡す。

import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hatakeTools } from "@hatake-fw/api/tools";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = resolve(HERE, "..", "spec");

// previewData.ts（TypeScript）を、その場で JS にして読む。枠組みは固めずに外に出す
// （枠組みの中の YAML 読みは CommonJS なので、固めると require が使えなくなる）。
const compiled = join(HERE, "dist", ".preview-data.mjs");
await build({
  stdin: {
    contents: 'export * from "./src/previewData"; export * from "./src/outline"; export * from "./src/viewModel";',
    resolveDir: HERE,
    loader: "ts",
  },
  bundle: true,
  packages: "external",
  format: "esm",
  platform: "node",
  outfile: compiled,
  logLevel: "warning",
});
const { previewModel, outlineOf, viewTables, tabFor } = await import(pathToFileURL(compiled).href);

const tools = hatakeTools({ specDir: SPEC, readFile: (path) => readFileSync(path, "utf8") });
const refs = tools.find((one) => one.name === "hatake_refs");

/** 見るもの: 何の定義で、描けたら何が見えるはずか。 */
const CASES = [
  { name: "1画面（crud）", file: "examples/customer_master.yaml", expect: { rows: true } },
  { name: "app（メニューで束ねる）", file: "examples/sales_app.yaml", expect: { menu: true } },
  { name: "役割が出てくる app", file: "examples/roles_app.yaml", expect: { roles: ["executive", "hr", "manager"] } },
  {
    name: "書き間違い（白い画面にしない）",
    source: "page:\n  type: crud\n  id: x\n  title: X\n  repository: r\n  key: id\n  tabel: {}\n",
    expect: { error: "tabel" },
  },
];

const cases = CASES.map((one) => {
  const source = one.source ?? readFileSync(join(SPEC, one.file), "utf8");
  let model = { kind: /^\s*app\s*:/m.test(source) ? "app" : "page", repositories: {}, roles: [] };
  try {
    const names = JSON.parse(refs.run({ source })).all?.repositories ?? [];
    model = previewModel(source, names);
  } catch {
    // 拡張機能と同じ: 読めない定義は描く側が理由を出す。
  }
  return { name: one.name, message: { type: "render", file: one.file ?? "broken.yaml", source, model }, expect: one.expect };
});

writeFileSync(join(HERE, "dist", "preview-cases.json"), `${JSON.stringify(cases, null, 2)}\n`);

// ツリーから開く画面（タブ付き）。view.ts と同じ作り方: 画面の作り物・その画面に絞った紙・読み返し。
const explain = tools.find((one) => one.name === "hatake_explain");
const check = tools.find((one) => one.name === "hatake_check");
const VIEW_CASES = [
  { name: "1画面を選ぶ（既定の画面のタブ）", file: "examples/customer_master.yaml", expect: { tab: "screen", rows: true } },
  {
    name: "入力欄の1つを選ぶ（項目のタブで光る）",
    file: "examples/customer_master.yaml",
    kind: "field",
    key: "note",
    expect: { tab: "fields", hit: "view-row:field:note" },
  },
  {
    name: "app の1画面の操作を選ぶ（操作のタブで光る）",
    file: "examples/roles_app.yaml",
    page: "employee_search",
    kind: "action",
    key: "approveRaise",
    expect: { tab: "actions", hit: "view-row:action:approveRaise" },
  },
  { name: "役割の表（給与は hr だけ）", file: "examples/roles_app.yaml", page: "employee_search", tab: "roles", expect: { tab: "roles", matrix: true } },
  {
    name: "人が決めることを選ぶ（確認のタブで光る）",
    file: "examples/customer_master.yaml",
    kind: "question",
    key: "concurrency",
    expect: { tab: "check", hit: "view-note:question:concurrency" },
  },
];
const views = VIEW_CASES.map((one) => {
  const source = readFileSync(join(SPEC, one.file), "utf8");
  const outline = outlineOf(source);
  const page = outline.pages.find((p) => p.id === one.page) ?? outline.pages[0];
  const isApp = outline.kind === "app";
  const names = JSON.parse(refs.run({ source })).all?.repositories ?? [];
  const screen = previewModel(source, names);
  const sheet = JSON.parse(check.run(isApp ? { source, page: page.id, explain: false } : { source, explain: false }));
  const readback = explain.run(isApp ? { source, page: page.id } : { source });
  return {
    name: one.name,
    message: {
      type: "show",
      file: one.file,
      title: page.title,
      subtitle: one.file,
      path: page.path,
      source,
      screen,
      ...(isApp ? { page: page.id } : {}),
      tab: one.tab ?? tabFor(one.kind, "screen"),
      ...(one.key === undefined ? {} : { highlight: { kind: one.kind, key: one.key } }),
      tables: viewTables(outline, page, screen.roles, sheet, readback),
    },
    expect: one.expect,
  };
});
writeFileSync(join(HERE, "dist", "view-cases.json"), `${JSON.stringify(views, null, 2)}\n`);
console.log(`書きました: dist/preview-cases.json（${cases.length} 件）・dist/view-cases.json（${views.length} 件）`);
